"""
Klanker Voice widget — solid dark window with animated orb.

No translucent window hacks. One solid dark rounded panel:
  - Top section: animated orb + status text
  - Bottom section (expands): user text + streamed response
  - All states smoothly animated at 60fps
"""

import logging
import math
from enum import Enum, auto

from PyQt6.QtCore import QPointF, QRectF, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QPainter,
    QPainterPath,
    QPen,
    QRadialGradient,
)
from PyQt6.QtWidgets import (
    QApplication,
    QGraphicsDropShadowEffect,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

log = logging.getLogger(__name__)

# Design tokens
ACCENT = QColor("#5e6ad2")
ACCENT_BRIGHT = QColor("#7170ff")
ACCENT_GLOW = QColor("#828fff")
SUCCESS = QColor("#00d47b")
ERROR_COLOR = QColor("#ff4444")
BG = "#0f1011"
BG_CARD = "#191a1b"
TEXT_PRIMARY = "#f7f8f8"
TEXT_SECONDARY = "#d0d6e0"
TEXT_TERTIARY = "#8a8f98"
FONT = "Roboto, Segoe UI, sans-serif"

WIDGET_W = 380
ORB_DRAW_SIZE = 64


class WidgetState(Enum):
    LISTENING = auto()
    THINKING = auto()
    RESPONDING = auto()
    DONE = auto()
    ERROR = auto()


class OrbCanvas(QWidget):
    """Fixed-size canvas that paints the animated orb."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._r = ORB_DRAW_SIZE / 2
        self._phase = 0.0
        self._pulse = 0.0
        self._ring_angle = 0.0
        self._state = WidgetState.LISTENING
        self._color = ACCENT

        # Smooth color transition targets
        self._target_r = ACCENT.redF()
        self._target_g = ACCENT.greenF()
        self._target_b = ACCENT.blueF()
        self._cur_r = self._target_r
        self._cur_g = self._target_g
        self._cur_b = self._target_b

        self.setFixedSize(WIDGET_W, 110)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.setInterval(16)
        self._timer.start()

    def set_state(self, state: WidgetState):
        self._state = state
        targets = {
            WidgetState.LISTENING: ACCENT,
            WidgetState.THINKING: ACCENT_BRIGHT,
            WidgetState.RESPONDING: SUCCESS,
            WidgetState.DONE: SUCCESS,
            WidgetState.ERROR: ERROR_COLOR,
        }
        c = targets.get(state, ACCENT)
        self._target_r = c.redF()
        self._target_g = c.greenF()
        self._target_b = c.blueF()

    def stop(self):
        self._timer.stop()

    def _tick(self):
        self._phase += 0.035
        self._pulse = (math.sin(self._phase) + 1.0) / 2.0
        self._ring_angle = (self._ring_angle + 3.0) % 360.0

        # Smooth color lerp
        speed = 0.06
        self._cur_r += (self._target_r - self._cur_r) * speed
        self._cur_g += (self._target_g - self._cur_g) * speed
        self._cur_b += (self._target_b - self._cur_b) * speed
        self._color = QColor.fromRgbF(self._cur_r, self._cur_g, self._cur_b)

        self.update()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        cx, cy = self.width() / 2, self.height() / 2
        r = self._r
        pulse = self._pulse

        # Outer glow
        glow_r = r + 18 + 8 * pulse
        g = QRadialGradient(QPointF(cx, cy), glow_r)
        gc = QColor(self._color)
        gc.setAlphaF(0.22 + 0.12 * pulse)
        g.setColorAt(0.0, gc)
        gc2 = QColor(self._color)
        gc2.setAlphaF(0.0)
        g.setColorAt(1.0, gc2)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(g))
        p.drawEllipse(QPointF(cx, cy), glow_r, glow_r)

        # Orb body
        breath = 2.0 * pulse
        orb_r = r + breath
        body = QRadialGradient(QPointF(cx - r * 0.25, cy - r * 0.3), orb_r * 1.8)
        light = QColor(self._color).lighter(140)
        light.setAlphaF(0.95)
        body.setColorAt(0.0, light)
        body.setColorAt(0.45, self._color)
        dark = QColor(self._color).darker(200)
        dark.setAlphaF(0.98)
        body.setColorAt(1.0, dark)
        p.setBrush(QBrush(body))
        p.setPen(QPen(QColor(255, 255, 255, 18), 1.0))
        p.drawEllipse(QPointF(cx, cy), orb_r, orb_r)

        # Specular highlight
        sr = orb_r * 0.38
        sx, sy = cx - orb_r * 0.2, cy - orb_r * 0.25
        spec = QRadialGradient(QPointF(sx, sy), sr)
        spec.setColorAt(0.0, QColor(255, 255, 255, int(80 + 35 * pulse)))
        spec.setColorAt(0.6, QColor(255, 255, 255, 10))
        spec.setColorAt(1.0, QColor(255, 255, 255, 0))
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(spec))
        p.drawEllipse(QPointF(sx, sy), sr, sr)

        # Orbiting arcs — always present, more intense when thinking
        ring_r = orb_r + 8
        rect = QRectF(cx - ring_r, cy - ring_r, ring_r * 2, ring_r * 2)
        is_thinking = self._state == WidgetState.THINKING

        for i, (span, width) in enumerate([(90, 2.2), (60, 1.6), (40, 1.0)]):
            base_alpha = 180 if is_thinking else 30
            fade = base_alpha - i * 50 if is_thinking else base_alpha - i * 8
            alpha = max(fade, 0)
            if alpha == 0:
                continue
            ac = QColor(ACCENT_GLOW.red(), ACCENT_GLOW.green(), ACCENT_GLOW.blue(), alpha)
            pen = QPen(ac)
            pen.setWidthF(width)
            pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            p.setPen(pen)
            p.setBrush(Qt.BrushStyle.NoBrush)
            path = QPainterPath()
            offset = self._ring_angle + i * 120
            path.arcMoveTo(rect, offset)
            path.arcTo(rect, offset, span)
            p.drawPath(path)

        # Center content
        if self._state == WidgetState.THINKING:
            # Animated dots
            for i in range(3):
                dp = self._phase + i * 0.8
                alpha = int(100 + 155 * ((math.sin(dp * 2.5) + 1) / 2))
                dx = cx + (i - 1) * 11
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QColor(255, 255, 255, alpha))
                p.drawEllipse(QPointF(dx, cy + 1), 2.5, 2.5)
        elif self._state == WidgetState.LISTENING:
            # Mic-like bars
            for i in range(5):
                bar_phase = self._phase + i * 0.5
                h = 6 + 10 * ((math.sin(bar_phase * 1.8) + 1) / 2)
                bx = cx + (i - 2) * 7
                by = cy - h / 2
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QColor(255, 255, 255, 180))
                p.drawRoundedRect(QRectF(bx - 1.5, by, 3, h), 1.5, 1.5)
        elif self._state == WidgetState.DONE:
            p.setPen(QColor(255, 255, 255, 200))
            font = QFont(FONT, 16)
            font.setWeight(QFont.Weight.Medium)
            p.setFont(font)
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "✓")
        elif self._state == WidgetState.ERROR:
            p.setPen(QColor(255, 255, 255, 200))
            font = QFont(FONT, 16)
            font.setWeight(QFont.Weight.Medium)
            p.setFont(font)
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "✕")

        p.end()


class KlankerWidget(QWidget):
    close_requested = pyqtSignal()
    dismiss_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._state = WidgetState.LISTENING
        self._panel_shown = False
        self._setup()
        self._build()

    def _setup(self):
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setFixedWidth(WIDGET_W)
        self.setStyleSheet(f"""
            KlankerWidget {{
                background: {BG};
                border-radius: 20px;
                border: 1px solid rgba(255,255,255,0.06);
            }}
        """)
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(40)
        shadow.setColor(QColor(0, 0, 0, 180))
        shadow.setOffset(0, 6)
        self.setGraphicsEffect(shadow)

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Orb area
        self._orb = OrbCanvas()
        root.addWidget(self._orb)

        # Status text under orb
        self._status = QLabel("Listening...")
        self._status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._status.setStyleSheet(f"""
            font-family: {FONT}; font-size: 12px; font-weight: 500;
            color: {TEXT_TERTIARY}; padding: 0 0 12px 0;
            letter-spacing: 0.5px;
        """)
        root.addWidget(self._status)

        # Expandable response panel
        self._panel = QWidget()
        self._panel.setStyleSheet(f"""
            QWidget {{
                background: {BG_CARD};
                border-top: 1px solid rgba(255,255,255,0.04);
            }}
        """)
        self._panel.hide()
        panel_layout = QVBoxLayout(self._panel)
        panel_layout.setContentsMargins(20, 14, 20, 14)
        panel_layout.setSpacing(10)

        # User text
        self._user_label = QLabel("")
        self._user_label.setWordWrap(True)
        self._user_label.setStyleSheet(f"""
            font-family: {FONT}; font-size: 13px; font-weight: 500;
            color: {TEXT_PRIMARY}; background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 10px; padding: 10px 14px;
        """)
        self._user_label.hide()
        panel_layout.addWidget(self._user_label)

        # Response
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setStyleSheet("""
            QScrollArea { background: transparent; border: none; }
            QScrollBar:vertical {
                width: 3px; background: transparent;
            }
            QScrollBar::handle:vertical {
                background: rgba(255,255,255,0.08);
                border-radius: 1px; min-height: 20px;
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical,
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {
                height: 0; background: transparent;
            }
        """)
        self._scroll.setMaximumHeight(250)

        self._response = QLabel("")
        self._response.setWordWrap(True)
        self._response.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self._response.setStyleSheet(f"""
            font-family: {FONT}; font-size: 14px; font-weight: 400;
            color: {TEXT_SECONDARY}; background: transparent; padding: 0;
            line-height: 22px;
        """)
        self._response.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Minimum)
        self._scroll.setWidget(self._response)
        panel_layout.addWidget(self._scroll)

        # Hint
        self._hint = QLabel('Say "Thanks" to dismiss')
        self._hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._hint.setStyleSheet(f"""
            font-family: {FONT}; font-size: 10px; font-weight: 400;
            color: {TEXT_TERTIARY}; padding-top: 4px;
        """)
        self._hint.hide()
        panel_layout.addWidget(self._hint)

        root.addWidget(self._panel)

        # Close button overlaid top-right
        self._close_btn = QPushButton("✕", self)
        self._close_btn.setFixedSize(28, 28)
        self._close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._close_btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent; color: {TEXT_TERTIARY};
                font-size: 14px; font-family: {FONT};
                border: none; border-radius: 6px;
            }}
            QPushButton:hover {{ color: {TEXT_PRIMARY}; }}
        """)
        self._close_btn.move(WIDGET_W - 36, 8)
        self._close_btn.clicked.connect(self.close_requested.emit)

    # -- State machine --

    def set_state(self, state: WidgetState):
        self._state = state
        self._orb.set_state(state)

        if state == WidgetState.LISTENING:
            self._status.setText("Listening...")
            self._status.setStyleSheet(f"""
                font-family: {FONT}; font-size: 12px; font-weight: 500;
                color: {ACCENT_BRIGHT.name()}; padding: 0 0 12px 0;
                letter-spacing: 0.5px;
            """)
            self._panel.hide()
            self._panel_shown = False
            self.adjustSize()

        elif state == WidgetState.THINKING:
            self._status.setText("Thinking...")
            self._status.setStyleSheet(f"""
                font-family: {FONT}; font-size: 12px; font-weight: 500;
                color: {TEXT_TERTIARY}; padding: 0 0 12px 0;
                letter-spacing: 0.5px;
            """)

        elif state == WidgetState.RESPONDING:
            self._status.setText("")
            self._panel.show()
            self._panel_shown = True
            self._hint.hide()
            self.adjustSize()
            self._reposition()

        elif state == WidgetState.DONE:
            self._status.setText("")
            self._hint.show()

        elif state == WidgetState.ERROR:
            self._status.setText("Error")
            self._status.setStyleSheet(f"""
                font-family: {FONT}; font-size: 12px; font-weight: 500;
                color: {ERROR_COLOR.name()}; padding: 0 0 12px 0;
                letter-spacing: 0.5px;
            """)
            self._panel.show()
            self._panel_shown = True
            self.adjustSize()
            self._reposition()

    @property
    def state(self) -> WidgetState:
        return self._state

    def set_user_text(self, text: str):
        self._user_label.setText(text)
        self._user_label.show()
        if not self._panel_shown:
            self._panel.show()
            self._panel_shown = True
        self.adjustSize()
        self._reposition()

    def set_response_text(self, text: str):
        self._response.setText(text)
        vbar = self._scroll.verticalScrollBar()
        vbar.setValue(vbar.maximum())

    def append_response_text(self, text: str):
        self._response.setText(self._response.text() + text)
        vbar = self._scroll.verticalScrollBar()
        QTimer.singleShot(10, lambda: vbar.setValue(vbar.maximum()))

    def set_error_text(self, text: str):
        self.set_state(WidgetState.ERROR)
        self._response.setText(text)
        self._response.setStyleSheet(f"""
            font-family: {FONT}; font-size: 14px; font-weight: 400;
            color: {ERROR_COLOR.name()}; background: transparent; padding: 0;
        """)

    # -- Positioning --

    def _reposition(self):
        screen = QApplication.primaryScreen()
        if not screen:
            return
        geo = screen.availableGeometry()
        self.move(geo.center().x() - self.width() // 2, geo.top() + 50)

    def show_centered_top(self):
        self._panel.hide()
        self._panel_shown = False
        self._user_label.hide()
        self._user_label.setText("")
        self._response.setText("")
        self._response.setStyleSheet(f"""
            font-family: {FONT}; font-size: 14px; font-weight: 400;
            color: {TEXT_SECONDARY}; background: transparent; padding: 0;
            line-height: 22px;
        """)
        self._hint.hide()
        self.adjustSize()
        self._reposition()
        self.show()
        self.raise_()
        self.activateWindow()

    def fade_in(self, duration: int = 200):
        self.show_centered_top()

    def fade_out(self, duration: int = 200):
        self._orb.stop()
        QTimer.singleShot(duration, self.hide)

    # -- Dragging --

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.MouseButton.LeftButton and hasattr(self, "_drag_pos"):
            self.move(event.globalPosition().toPoint() - self._drag_pos)
            event.accept()

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.close_requested.emit()
        super().keyPressEvent(event)
