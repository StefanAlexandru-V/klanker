"""
Train a custom "Hey Klanker" wake word model using OpenWakeWord.

This uses synthetic audio generation (text-to-speech) to create
training samples, then trains an ONNX model compatible with
OpenWakeWord's detection pipeline.

Usage:
    python train/train_wake_word.py

Output:
    assets/hey_klanker.onnx
"""

import os
import sys
from pathlib import Path


def main():
    try:
        from openwakeword.train import train_model
    except ImportError:
        print("Training requires openwakeword[train]:")
        print("  pip install openwakeword[train]")
        print()
        print("If that fails, install the training extras manually:")
        print("  pip install piper-tts torch torchaudio")
        sys.exit(1)

    assets_dir = Path(__file__).parent.parent / "assets"
    assets_dir.mkdir(exist_ok=True)
    output_path = assets_dir / "hey_klanker.onnx"

    print("Training 'Hey Klanker' wake word model...")
    print("This uses synthetic TTS to generate training samples.")
    print("It may take 5-15 minutes depending on your hardware.")
    print()

    train_model(
        wake_word="hey klanker",
        output_path=str(output_path),
        n_samples=1500,
        n_negative_samples=3000,
        target_accuracy=0.95,
        epochs=100,
    )

    print(f"\nModel saved to: {output_path}")
    print("Copy this file to the assets/ directory if it isn't there already.")
    print("The wake word listener will use it automatically on next start.")


if __name__ == "__main__":
    main()
