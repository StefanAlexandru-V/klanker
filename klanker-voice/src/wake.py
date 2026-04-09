"""
Wake word detection using OpenWakeWord.

Listens to the microphone continuously with low CPU usage.
When "Hey Klanker" is detected, fires a callback.

Uses a custom-trained model if available, otherwise falls
back to the built-in "hey_jarvis" model as a placeholder.
"""

import logging
import threading
from pathlib import Path

import numpy as np
import sounddevice as sd

log = logging.getLogger(__name__)

SAMPLE_RATE = 16000
CHUNK_DURATION = 0.08  # 80ms chunks — OpenWakeWord expects ~1280 samples at 16kHz
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION)
DETECTION_THRESHOLD = 0.5

_ASSETS = Path(__file__).parent.parent / "assets"
_CUSTOM_MODEL = _ASSETS / "hey_clanker.onnx"
_FALLBACK_MODEL = _ASSETS / "winston.onnx"


class WakeWordListener:
    """Continuously listens for the wake word on a background thread."""

    def __init__(self, on_wake: callable, threshold: float = DETECTION_THRESHOLD):
        self._on_wake = on_wake
        self._threshold = threshold
        self._running = False
        self._thread: threading.Thread | None = None
        self._model = None

    def _load_model(self):
        from openwakeword.model import Model
        import openwakeword

        if _CUSTOM_MODEL.exists():
            log.info("Loading custom wake word model: %s", _CUSTOM_MODEL)
            self._model = Model(
                wakeword_models=[str(_CUSTOM_MODEL)],
                inference_framework="onnx",
            )
        elif _FALLBACK_MODEL.exists():
            log.info("Using fallback wake word: winston.onnx (say 'Winston')")
            self._model = Model(
                wakeword_models=[str(_FALLBACK_MODEL)],
                inference_framework="onnx",
            )
        else:
            log.info("No local models found, downloading built-in models...")
            openwakeword.utils.download_models()
            log.info("Using built-in 'hey_jarvis' as fallback")
            self._model = Model(
                wakeword_models=["hey_jarvis_v0.1"],
                inference_framework="onnx",
            )

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        log.info("Wake word listener started")

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None
        log.info("Wake word listener stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    def _listen_loop(self) -> None:
        try:
            self._load_model()
        except Exception:
            log.exception("Failed to load wake word model")
            self._running = False
            return

        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                blocksize=CHUNK_SAMPLES,
            ) as stream:
                while self._running:
                    audio, _ = stream.read(CHUNK_SAMPLES)
                    audio_flat = audio.flatten().astype(np.int16)

                    predictions = self._model.predict(audio_flat)
                    for name, score in predictions.items():
                        if score >= self._threshold:
                            log.info("Wake word detected: %s (score=%.3f)", name, score)
                            self._model.reset()
                            self._on_wake()
                            break
        except Exception:
            log.exception("Wake word listener error")
        finally:
            self._running = False
