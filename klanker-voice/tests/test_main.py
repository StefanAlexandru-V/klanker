"""Tests for dismiss phrase detection — no PyQt6 dependency."""

import pytest


DISMISS_WORDS = {"thanks", "thank you", "mulțumesc", "mulțumim", "mersi"}


def _is_dismiss_phrase(text: str) -> bool:
    normalized = text.lower().strip().rstrip(".")
    return normalized in DISMISS_WORDS


class TestDismissPhrases:
    def test_english_thanks(self):
        assert _is_dismiss_phrase("thanks")
        assert _is_dismiss_phrase("Thank you")
        assert _is_dismiss_phrase("  thanks  ")
        assert _is_dismiss_phrase("thanks.")

    def test_romanian_dismiss(self):
        assert _is_dismiss_phrase("mulțumesc")
        assert _is_dismiss_phrase("mersi")
        assert _is_dismiss_phrase("Mersi")

    def test_non_dismiss(self):
        assert not _is_dismiss_phrase("hello")
        assert not _is_dismiss_phrase("what is python")
        assert not _is_dismiss_phrase("")

    def test_case_insensitive(self):
        assert _is_dismiss_phrase("THANKS")
        assert _is_dismiss_phrase("Thank You")
        assert _is_dismiss_phrase("MERSI")

    def test_trailing_punctuation(self):
        assert _is_dismiss_phrase("thanks.")
        assert _is_dismiss_phrase("mersi.")
        assert _is_dismiss_phrase("mulțumesc.")
