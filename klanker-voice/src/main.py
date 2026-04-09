"""
Klanker Voice — main entry point.

Orchestrates wake word detection, speech-to-text, LLM streaming,
and the floating widget. Runs in the system tray.

Usage:
    python -m klanker_voice            # Full mode (wake word + mic)
    python -m klanker_voice --demo     # Demo mode (skip audio, use fake text)
"""

import asyncio
import argparse
import logging
import sys
import threading

from PyQt6.QtCore import QObject, QThread, Qt, pyqtSignal, pyqtSlot, QTimer
from PyQt6.QtGui import QAction, QColor, QIcon, QPixmap, QPainter
from PyQt6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from .db import get_connection, create_conversation, add_message, update_message
from .llm import chat_completion, fetch_models
from .widget import KlankerWidget, WidgetState

log = logging.getLogger(__name__)

DISMISS_WORDS = {"thanks", "thank you", "mulțumesc", "mulțumim", "mersi"}


def _create_tray_icon() -> QIcon:
    px = QPixmap(32, 32)
    px.fill(QColor(0, 0, 0, 0))
    painter = QPainter(px)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setBrush(QColor("#5e6ad2"))
    painter.setPen(QColor("#7170ff"))
    painter.drawEllipse(4, 4, 24, 24)
    painter.end()
    return QIcon(px)


# ---------------------------------------------------------------------------
# Worker: LLM streaming on a QThread
# ---------------------------------------------------------------------------
class LLMWorker(QObject):
    token_received = pyqtSignal(str)
    search_started = pyqtSignal(str)
    finished = pyqtSignal(str)
    error = pyqtSignal(str)

    def __init__(self, model_id: str, messages: list[dict]):
        super().__init__()
        self._model_id = model_id
        self._messages = messages

    @pyqtSlot()
    def run(self):
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(self._stream())
        except Exception as e:
            self.error.emit(str(e))
        finally:
            loop.close()

    async def _stream(self):
        full_text = ""
        async for token in chat_completion(self._model_id, self._messages):
            if token.type == "content":
                full_text += token.text
                self.token_received.emit(token.text)
            elif token.type == "search":
                self.search_started.emit(token.text)
                full_text = ""  # reset — search will re-prompt
        self.finished.emit(full_text)


# ---------------------------------------------------------------------------
# Worker: fetch models on a QThread
# ---------------------------------------------------------------------------
class ModelsWorker(QObject):
    finished = pyqtSignal(list)
    error = pyqtSignal(str)

    @pyqtSlot()
    def run(self):
        loop = asyncio.new_event_loop()
        try:
            models = loop.run_until_complete(fetch_models())
            self.finished.emit(models)
        except Exception as e:
            self.error.emit(str(e))
        finally:
            loop.close()


# ---------------------------------------------------------------------------
# Worker: record + transcribe on a QThread (proper Qt signals)
# ---------------------------------------------------------------------------
class TranscribeWorker(QObject):
    transcript_ready = pyqtSignal(str)
    no_speech = pyqtSignal()
    error = pyqtSignal(str)

    def __init__(self, transcriber):
        super().__init__()
        self._transcriber = transcriber

    @pyqtSlot()
    def run(self):
        try:
            result = self._transcriber.record_and_transcribe()
            if not result or not result.text.strip():
                self.no_speech.emit()
            else:
                self.transcript_ready.emit(result.text.strip())
        except Exception as e:
            log.exception("Transcription error")
            self.error.emit(str(e))


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
class KlankerApp(QObject):
    wake_triggered = pyqtSignal()

    def __init__(self, demo: bool = False):
        super().__init__()
        self._demo = demo
        self._db = get_connection()
        self._model_id = ""
        self._current_conv_id = ""
        self._assistant_msg_id = None
        self._wake_listener = None
        self._transcriber = None

        self._widget = KlankerWidget()
        self._widget.close_requested.connect(self._dismiss)
        self._widget.dismiss_requested.connect(self._dismiss)

        self.wake_triggered.connect(self._on_wake, type=Qt.ConnectionType.QueuedConnection)

        self._load_models()

    def _load_models(self):
        self._models_thread = QThread()
        self._models_worker = ModelsWorker()
        self._models_worker.moveToThread(self._models_thread)
        self._models_thread.started.connect(self._models_worker.run)
        self._models_worker.finished.connect(self._on_models_loaded)
        self._models_worker.error.connect(self._on_models_error)
        self._models_worker.finished.connect(self._models_thread.quit)
        self._models_worker.error.connect(self._models_thread.quit)
        self._models_thread.start()

    def _on_models_loaded(self, models: list):
        if models:
            self._model_id = models[0].get("id", "")
            log.info("Model loaded: %s", self._model_id)
        if not self._demo:
            self._start_wake_listener()
            self._preload_transcriber()
        log.info("Klanker Voice ready — %s", "demo mode" if self._demo else "listening for wake word")

    def _on_models_error(self, err: str):
        log.error("Failed to load models: %s", err)

    def _start_wake_listener(self):
        from .wake import WakeWordListener
        self._wake_listener = WakeWordListener(
            on_wake=lambda: self.wake_triggered.emit()
        )
        self._wake_listener.start()

    def _preload_transcriber(self):
        def _load():
            self._start_transcriber()
            self._transcriber.preload()
        threading.Thread(target=_load, daemon=True).start()

    def _start_transcriber(self):
        if self._transcriber is None:
            from .transcribe import Transcriber
            self._transcriber = Transcriber()

    # ---------------------------------------------------------------------------
    # Wake → Record → Transcribe → LLM flow
    # ---------------------------------------------------------------------------

    @pyqtSlot()
    def _on_wake(self):
        log.info("Wake word detected — showing widget")

        # CRITICAL: Stop wake word listener to release the mic
        if self._wake_listener and self._wake_listener.is_running:
            log.info("Pausing wake word listener for recording")
            self._wake_listener.stop()

        self._widget.set_state(WidgetState.LISTENING)
        self._widget.fade_in()

        if self._demo:
            QTimer.singleShot(500, self._demo_flow)
        else:
            # Small delay to let the mic be fully released by wake listener
            QTimer.singleShot(300, self._start_recording)

    def _start_recording(self):
        """Start recording on a proper QThread with signal-based callbacks."""
        self._start_transcriber()

        self._transcribe_thread = QThread()
        self._transcribe_worker = TranscribeWorker(self._transcriber)
        self._transcribe_worker.moveToThread(self._transcribe_thread)

        self._transcribe_thread.started.connect(self._transcribe_worker.run)
        self._transcribe_worker.transcript_ready.connect(self._on_transcript)
        self._transcribe_worker.no_speech.connect(self._on_no_speech)
        self._transcribe_worker.error.connect(self._on_transcribe_error)
        self._transcribe_worker.transcript_ready.connect(self._transcribe_thread.quit)
        self._transcribe_worker.no_speech.connect(self._transcribe_thread.quit)
        self._transcribe_worker.error.connect(self._transcribe_thread.quit)

        self._transcribe_thread.start()
        log.info("Recording thread started")

    def _demo_flow(self):
        demo_text = "What is the capital of Romania?"
        self._widget.set_user_text(demo_text)
        self._widget.set_state(WidgetState.THINKING)
        self._process_query(demo_text)

    @pyqtSlot(str)
    def _on_transcript(self, text: str):
        log.info("Transcript received on main thread: '%s'", text)

        if self._is_dismiss_phrase(text):
            log.info("Dismiss phrase detected: '%s'", text)
            self._dismiss()
            self._resume_wake_listener()
            return

        self._widget.set_user_text(text)
        self._widget.set_state(WidgetState.THINKING)
        self._process_query(text)

    @pyqtSlot()
    def _on_no_speech(self):
        log.info("No speech detected")
        if self._widget.state == WidgetState.DONE:
            log.info("No follow-up, closing widget and resuming wake listener")
            self._dismiss()
            self._resume_wake_listener()
        else:
            log.info("No speech during initial listen, dismissing")
            self._dismiss()
            self._resume_wake_listener()

    @pyqtSlot(str)
    def _on_transcribe_error(self, err: str):
        log.error("Transcription error: %s", err)
        self._widget.set_error_text(f"Recording failed: {err}")
        self._resume_wake_listener()

    def _process_query(self, text: str):
        conv = create_conversation(self._db, title=text[:50])
        self._current_conv_id = conv["id"]

        add_message(self._db, conv["id"], "user", text)
        self._assistant_msg_id = add_message(self._db, conv["id"], "assistant", "")

        messages = [{"role": "user", "content": text}]
        self._start_llm_stream(messages)

    def _start_llm_stream(self, messages: list[dict]):
        self._llm_thread = QThread()
        self._llm_worker = LLMWorker(self._model_id, messages)
        self._llm_worker.moveToThread(self._llm_thread)

        self._llm_thread.started.connect(self._llm_worker.run)
        self._llm_worker.token_received.connect(self._on_token)
        self._llm_worker.search_started.connect(self._on_search)
        self._llm_worker.finished.connect(self._on_llm_done)
        self._llm_worker.error.connect(self._on_llm_error)
        self._llm_worker.finished.connect(self._llm_thread.quit)
        self._llm_worker.error.connect(self._llm_thread.quit)

        self._widget.set_state(WidgetState.RESPONDING)
        self._llm_thread.start()
        log.info("LLM stream started")

    @pyqtSlot(str)
    def _on_token(self, text: str):
        self._widget.append_response_text(text)

    @pyqtSlot(str)
    def _on_search(self, query: str):
        log.info("Searching: '%s'", query)
        self._widget.set_response_text("")
        self._widget._status.setText(f"Searching: {query}")
        self._widget._status.show()
        self._widget.set_state(WidgetState.THINKING)

    @pyqtSlot(str)
    def _on_llm_done(self, full_text: str):
        log.info("LLM response complete (%d chars)", len(full_text))
        if self._assistant_msg_id:
            update_message(self._db, self._assistant_msg_id, content=full_text)
        self._widget.set_state(WidgetState.DONE)

        # Auto-listen for follow-up instead of requiring wake word again
        if not self._demo:
            log.info("Auto-listening for follow-up or dismiss...")
            QTimer.singleShot(500, self._start_recording)

    @pyqtSlot(str)
    def _on_llm_error(self, err: str):
        log.error("LLM error: %s", err)
        self._widget.set_error_text(f"Could not connect to LM Studio:\n{err}")
        self._resume_wake_listener()

    def _resume_wake_listener(self):
        if not self._demo and self._wake_listener and not self._wake_listener.is_running:
            log.info("Resuming wake word listener")
            self._wake_listener.start()

    def _dismiss(self):
        self._widget.fade_out()
        self._widget.set_response_text("")
        self._widget.set_user_text("")
        self._resume_wake_listener()

    def _is_dismiss_phrase(self, text: str) -> bool:
        normalized = text.lower().strip().rstrip(".")
        return normalized in DISMISS_WORDS

    def show_widget(self):
        self._on_wake()

    def quit(self):
        if self._wake_listener:
            self._wake_listener.stop()
        self._db.close()
        QApplication.instance().quit()


def main():
    parser = argparse.ArgumentParser(description="Klanker Voice Assistant")
    parser.add_argument("--demo", action="store_true", help="Demo mode — skip audio, use fake text")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    klanker = KlankerApp(demo=args.demo)

    tray = QSystemTrayIcon(_create_tray_icon(), app)
    tray.setToolTip("Klanker Voice")

    menu = QMenu()
    show_action = QAction("Show Klanker", app)
    show_action.triggered.connect(klanker.show_widget)
    menu.addAction(show_action)
    menu.addSeparator()
    quit_action = QAction("Quit", app)
    quit_action.triggered.connect(klanker.quit)
    menu.addAction(quit_action)

    tray.setContextMenu(menu)
    tray.activated.connect(lambda reason: (
        klanker.show_widget() if reason == QSystemTrayIcon.ActivationReason.DoubleClick else None
    ))
    tray.show()

    if args.demo:
        QTimer.singleShot(500, klanker.show_widget)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
