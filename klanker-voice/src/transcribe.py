"""
Speech-to-text using faster-whisper (CTranslate2).

Records audio from the microphone until silence is detected,
then transcribes it. Auto-detects English and Romanian.

Uses CPU mode with int8 quantization + "tiny" model for
near-instant transcription on modern CPUs (~0.5s on 9800X3D).
"""

import logging
import threading
import time
from dataclasses import dataclass

import numpy as np
import sounddevice as sd

log = logging.getLogger(__name__)

SAMPLE_RATE = 16000
SILENCE_DURATION = 1.5  # seconds of silence after speech before stopping
MIN_SPEECH_DURATION = 0.3  # minimum seconds of speech to be valid
MAX_RECORDING = 15  # max seconds to record
CHUNK_DURATION = 0.1  # 100ms chunks
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION)

_DEFAULT_MODEL = "tiny"  # tiny = fastest, good enough for short commands


@dataclass
class TranscriptResult:
    text: str
    language: str  # detected language code, e.g. 'en', 'ro'


class Transcriber:
    """faster-whisper based speech-to-text engine."""

    def __init__(self, model_name: str = _DEFAULT_MODEL):
        self._model_name = model_name
        self._model = None
        self._lock = threading.Lock()

    def preload(self):
        """Pre-load the model at startup so first transcription is instant."""
        self._ensure_model()

    def _ensure_model(self):
        if self._model is not None:
            return
        from faster_whisper import WhisperModel

        log.info("Loading Whisper model: %s (CPU/int8)", self._model_name)
        self._model = WhisperModel(
            self._model_name,
            device="cpu",
            compute_type="int8",
        )
        log.info("Whisper model loaded and ready")

    def transcribe_audio(self, audio: np.ndarray) -> TranscriptResult:
        """Transcribe a numpy audio array (float32, 16kHz mono)."""
        with self._lock:
            self._ensure_model()
            segments, info = self._model.transcribe(
                audio,
                beam_size=1,
                best_of=1,
                language=None,
            )
            text = " ".join(seg.text.strip() for seg in segments).strip()
            language = info.language or "en"
            return TranscriptResult(text=text, language=language)

    def record_and_transcribe(
        self,
        on_listening: callable | None = None,
        on_done: callable | None = None,
    ) -> TranscriptResult | None:
        """
        Record from mic until speech + silence detected, then transcribe.

        Uses adaptive threshold: samples the first 0.5s of audio to
        determine the ambient noise floor, then sets the speech threshold
        at 3x that level. This handles different mic gains automatically.
        """
        if on_listening:
            on_listening()

        log.info("Recording started — speak now")
        frames: list[np.ndarray] = []
        rms_values: list[float] = []
        recording_start = time.time()

        # Phase 1: Calibrate noise floor from first 0.5s
        noise_floor = 0.0
        calibration_frames = int(0.5 / CHUNK_DURATION)  # 5 chunks

        # Phase 2 tracking
        speech_threshold = 0.0
        got_speech = False
        speech_duration = 0.0
        silence_start = None

        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=CHUNK_SAMPLES,
            ) as stream:
                chunk_idx = 0
                while True:
                    elapsed = time.time() - recording_start
                    if elapsed > MAX_RECORDING:
                        log.info("Max recording duration reached (%.1fs)", elapsed)
                        break

                    audio, _ = stream.read(CHUNK_SAMPLES)
                    frames.append(audio.copy())
                    chunk_idx += 1

                    rms = float(np.sqrt(np.mean(audio ** 2)))
                    rms_values.append(rms)

                    # Log every 1s for diagnostics
                    if chunk_idx % 10 == 0:
                        log.debug("RMS=%.6f threshold=%.6f speech=%s elapsed=%.1fs",
                                  rms, speech_threshold, got_speech, elapsed)

                    # Phase 1: Calibrating
                    if chunk_idx <= calibration_frames:
                        if chunk_idx == calibration_frames:
                            noise_floor = np.mean(rms_values[:calibration_frames])
                            speech_threshold = max(noise_floor * 3.0, 0.005)
                            log.info("Noise floor=%.6f, speech threshold=%.6f",
                                     noise_floor, speech_threshold)
                        continue

                    # Phase 2: Detecting speech and silence
                    if rms >= speech_threshold:
                        if not got_speech:
                            log.info("Speech detected (RMS=%.6f > %.6f)", rms, speech_threshold)
                        got_speech = True
                        speech_duration += CHUNK_DURATION
                        silence_start = None
                    elif got_speech:
                        if silence_start is None:
                            silence_start = time.time()
                        elif time.time() - silence_start >= SILENCE_DURATION:
                            log.info("Silence after speech — stopping (%.1fs speech)",
                                     speech_duration)
                            break

        except Exception:
            log.exception("Recording error")
            return None

        if not frames:
            log.info("No audio frames captured")
            return None

        # Even if we didn't detect speech above threshold, still try to
        # transcribe if we have audio — Whisper handles noise well
        audio = np.concatenate(frames, axis=0).flatten()
        duration = len(audio) / SAMPLE_RATE

        if duration < 0.5:
            log.info("Recording too short (%.1fs), skipping", duration)
            return None

        if not got_speech and duration < 3.0:
            log.info("No speech detected in %.1fs, skipping", duration)
            return None

        log.info("Transcribing %.1f seconds of audio...", duration)

        if on_done:
            on_done()

        t0 = time.time()
        result = self.transcribe_audio(audio)
        log.info("Transcribed in %.2fs: '%s' (lang=%s)",
                 time.time() - t0, result.text, result.language)
        return result
