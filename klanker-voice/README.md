# Klanker Voice Assistant

Voice-activated floating widget that listens for "Hey Clanker", transcribes your speech, sends it to LM Studio, and displays the response. Supports web search via SearXNG. Shares conversations with the Klanker web app via SQLite.

## How It Works

```
System tray daemon (always running)
  └─ OpenWakeWord listener → "Hey Clanker" detected
       └─ Pause wake listener, release mic
            └─ Record audio (adaptive silence detection)
                 └─ faster-whisper transcription (~0.3s)
                      ├─ "Thanks" / "Mersi" → dismiss
                      └─ Query → LLM stream (with search loop)
                           └─ Response in widget → auto-listen for follow-up
```

## Setup (Windows)

### 1. Install Python 3.12
Download [Python 3.12.x](https://www.python.org/downloads/release/python-3129/) — check "Add to PATH". Python 3.14 is too new for some dependencies.

### 2. Install dependencies
```powershell
cd klanker-voice
pip install -r requirements.txt
```

### 3. Run
```powershell
# Full mode — wake word + voice
python -m src --debug

# Demo mode — no mic, fake text, real LM Studio
python -m src --demo --debug
```

## Wake Words

The app checks for models in this order:

| Priority | File | Trigger |
|----------|------|---------|
| 1 | `assets/hey_clanker.onnx` | Say **"Hey Clanker"** |
| 2 | `assets/winston.onnx` | Say **"Winston"** |
| 3 | Built-in (downloaded) | Say **"Hey Jarvis"** |

### Training a Custom Wake Word

Use `train/train_on_gpu.bat` on a Windows machine with an NVIDIA GPU and Docker Desktop. Or see `train/COLAB_GUIDE.md` for Google Colab (flaky but free).

## Features

- **Voice activation** — "Hey Clanker" wake word via OpenWakeWord
- **Multilingual STT** — English and Romanian via faster-whisper (auto-detected)
- **LLM streaming** — Real-time token streaming from LM Studio
- **Web search** — Model can search via SearXNG when it needs current info
- **Auto-listen** — After responding, listens for follow-up without wake word
- **Dismiss by voice** — Say "Thanks", "Thank you", "Mulțumesc", or "Mersi"
- **Animated UI** — Orb with breathing glow, orbiting arcs, audio bars, state-based colors
- **Shared conversations** — SQLite database shared with Klanker web app

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `KLANKER_API_BASE` | `http://10.3.58.20:1234/v1` | LM Studio API URL |
| `KLANKER_DB_PATH` | `%APPDATA%/klanker/conversations.db` | SQLite database path |
| `KLANKER_SEARCH_URL` | `http://localhost:8888/search` | SearXNG endpoint |

## Testing

```bash
# In WSL (Python 3.12)
cd klanker-voice
python3 -m pytest tests/ -v
```

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `test_db.py` | 15 | SQLite CRUD, JSON fields, cascading deletes |
| `test_llm.py` | 4 | SSE streaming, split chunks, system prompt |
| `test_main.py` | 5 | Dismiss phrases (EN + RO) |

## Project Structure

```
klanker-voice/
  src/
    __init__.py
    __main__.py            # python -m entry point
    main.py                # App orchestration, system tray, QThread workers
    widget.py              # PyQt6 floating overlay — animated orb + response panel
    db.py                  # Shared SQLite persistence
    llm.py                 # LM Studio streaming + [SEARCH:] loop
    search.py              # SearXNG web search client
    wake.py                # OpenWakeWord listener (Hey Clanker / Winston / Hey Jarvis)
    transcribe.py          # faster-whisper STT with adaptive noise calibration
  assets/
    hey_clanker.onnx       # Custom wake word model
    winston.onnx           # Fallback wake word
  train/
    train_on_gpu.bat       # One-click GPU training script (Windows + NVIDIA)
    COLAB_GUIDE.md         # Google Colab training guide
    openwakeword-training/ # CoreWorxLab Docker trainer (CPU Dockerfile patched)
  tests/
    test_db.py
    test_llm.py
    test_main.py
  requirements.txt
  pyproject.toml
  README.md
```

## Technical Notes

- **Runs on Windows, developed in WSL** — Python source is cross-platform
- **PyQt6** with solid dark background — no `WA_TranslucentBackground` (ghost windows on Win)
- **faster-whisper** tiny model, int8, beam_size=1 — ~0.3s transcription on 9800X3D
- **QThread + Qt signals** for all cross-thread comms — no QTimer from bg threads
- **httpx** async SSE with `break` not `return` — avoids dangling coroutine warnings
- **Adaptive silence detection** — calibrates from 0.5s ambient noise, threshold = max(3x floor, 0.005)
- **Wake listener pauses during recording** — same mic, can't share. 300ms release delay.
