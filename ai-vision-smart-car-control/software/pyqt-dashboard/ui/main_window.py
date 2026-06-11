import time
import socket
from PyQt5.QtWidgets import (
    QWidget, QLabel, QPushButton, QVBoxLayout,
    QHBoxLayout, QLineEdit, QComboBox,
    QTextEdit, QMessageBox, QGroupBox
)
from PyQt5.QtCore import Qt, QTimer, QEvent
from PyQt5.QtGui import QImage, QPixmap, QCursor

from core.constants import *
from core.state import AppState
from control.udp_client import UdpController, CmdThread, PingThread
from video.streams import VideoThread, ColorThread
from algo.line_tracker import LineTracker
from algo.color_picker import ColorAligner

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("智能小车 · 视觉与操控平台")
        self.setGeometry(140, 60, 1260, 880)

        self.state = AppState()
        self.ctrl = UdpController()

        self.line_tracker = LineTracker()
        self.color_aligner = ColorAligner()

        self.build_ui()
        self.setup_threads()
        self.setup_timers()

    def build_ui(self):
        self.status_label = QLabel("模式：未进入 | ESC 退出")
        self.speed_badge = QLabel("速度档：低速")
        self.esp_status = QLabel("ESP32：未连接")

        self.video_label = QLabel("等待视频流…")
        self.video_label.setAlignment(Qt.AlignCenter)
        self.video_label.setMouseTracking(True)
        self.video_label.installEventFilter(self)

        self.btn_mode1 = QPushButton("自由驾驶")
        self.btn_mode2 = QPushButton("色块识别")
        self.btn_mode3 = QPushButton("视觉循迹")

        self.btn_keymap = QPushButton("按键动作设置")
        self.btn_beep = QPushButton("喇叭")

        self.btn_grab = QPushButton("向前抓取")
        self.btn_align = QPushButton("自动对齐")
        self.btn_autopick = QPushButton("自动拾取")
        self.btn_stop_auto = QPushButton("停止自动")
        self.btn_stop_line = QPushButton("停止循迹")
        self.btn_stop_all = QPushButton("停止全部")

        self.color_select = QComboBox()
        self.color_select.addItems(["Red", "Green", "Blue"])

        self.btn_mode1.clicked.connect(lambda: self.switch_mode("STREAM"))
        self.btn_mode2.clicked.connect(lambda: self.switch_mode("COLOR"))
        self.btn_mode3.clicked.connect(lambda: self.switch_mode("LINE"))

        self.btn_keymap.clicked.connect(self.open_keymap)
        self.btn_beep.clicked.connect(self.click_beep)

        self.btn_grab.clicked.connect(self.send_grab)
        self.btn_align.clicked.connect(self.toggle_align)
        self.btn_autopick.clicked.connect(self.toggle_autopick)
        self.btn_stop_auto.clicked.connect(self.stop_auto)
        self.btn_stop_line.clicked.connect(self.stop_line)
        self.btn_stop_all.clicked.connect(self.stop_all)

        self.ip_input = QLineEdit("")
        self.ip_input.setPlaceholderText("<YOUR_CAMERA_IP>")
        self.btn_connect = QPushButton("连接视频流")
        self.btn_connect.clicked.connect(self.start_stream)

        self.esp_input = QLineEdit("")
        self.esp_input.setPlaceholderText("<YOUR_DEVICE_IP>")
        self.btn_esp_connect = QPushButton("连接ESP32")
        self.btn_esp_connect.clicked.connect(self.connect_esp32)

        self.log_box = QTextEdit()
        self.log_box.setReadOnly(True)
        self.log_box.setFixedHeight(170)

        self.color_bar = QHBoxLayout()
        self.color_bar.addWidget(QLabel("目标颜色"))
        self.color_bar.addWidget(self.color_select)
        self.color_bar.addWidget(self.btn_grab)
        self.color_bar.addWidget(self.btn_align)
        self.color_bar.addWidget(self.btn_autopick)
        self.color_bar.addWidget(self.btn_stop_auto)
        self.color_bar.addWidget(self.btn_stop_line)
        self.color_bar.addWidget(self.btn_stop_all)
        self.color_bar.addStretch()

        top_bar = QHBoxLayout()
        top_bar.addWidget(self.btn_mode1)
        top_bar.addWidget(self.btn_mode2)
        top_bar.addWidget(self.btn_mode3)
        top_bar.addWidget(self.btn_keymap)
        top_bar.addWidget(self.btn_beep)
        top_bar.addStretch()
        top_bar.addWidget(self.speed_badge)
        top_bar.addWidget(self.esp_status)

        conn_bar = QHBoxLayout()
        conn_bar.addWidget(QLabel("视频流地址"))
        conn_bar.addWidget(self.ip_input)
        conn_bar.addWidget(self.btn_connect)
        conn_bar.addSpacing(20)
        conn_bar.addWidget(QLabel("ESP32 地址"))
        conn_bar.addWidget(self.esp_input)
        conn_bar.addWidget(self.btn_esp_connect)

        color_panel = QGroupBox("七彩灯颜色")
        color_layout = QHBoxLayout()
        self.add_color_btn(color_layout, "白", (255,255,255))
        self.add_color_btn(color_layout, "红", (255,0,0))
        self.add_color_btn(color_layout, "绿", (0,255,0))
        self.add_color_btn(color_layout, "蓝", (0,0,255))
        self.add_color_btn(color_layout, "黄", (255,255,0))
        self.add_color_btn(color_layout, "青", (0,255,255))
        self.add_color_btn(color_layout, "紫", (255,0,255))
        self.add_color_btn(color_layout, "关", (0,0,0))
        color_panel.setLayout(color_layout)

        video_group = QGroupBox("视频画面")
        video_layout = QVBoxLayout()
        video_layout.addWidget(self.video_label)
        video_group.setLayout(video_layout)

        main_layout = QVBoxLayout()
        main_layout.addLayout(top_bar)
        main_layout.addWidget(self.status_label)
        main_layout.addLayout(self.color_bar)
        main_layout.addWidget(color_panel)
        main_layout.addWidget(video_group, stretch=1)
        main_layout.addLayout(conn_bar)
        main_layout.addWidget(self.log_box)
        self.setLayout(main_layout)

        self.key_state = {"W": False, "A": False, "S": False, "D": False}
        self.key_map = {
            "W":  [ 1,  1,  1,  1],
            "S":  [-1, -1, -1, -1],
            "A":  [-1,  1,  1, -1],
            "D":  [ 1, -1, -1,  1],
            "WA": [-1,  1, -1,  1],
            "WD": [ 1, -1,  1, -1],
            "SA": [-1,  0,  0, -1],
            "SD": [ 0, -1, -1,  0],
            "WS": [ 0,  0,  0,  0],
        }

        self.setStyleSheet("""
            QWidget { background: #0b0f14; color: #e6edf3; font-size: 13px; }
            QGroupBox { border: 1px solid #30363d; border-radius: 10px; margin-top: 6px; padding: 6px; }
            QGroupBox::title { subcontrol-origin: margin; left: 12px; padding: 0 6px; color: #58a6ff; }
            QPushButton { background: #1f2937; border: 1px solid #30363d; padding: 6px 12px; border-radius: 8px; }
            QPushButton:hover { background: #2d3748; }
            QPushButton:pressed { background: #111827; }
            QLineEdit { background: #0b0f14; border: 1px solid #30363d; padding: 4px 6px; border-radius: 8px; }
            QTextEdit { background: #0b0f14; border: 1px solid #30363d; }
        """)

    def setup_threads(self):
        self.video_thread = None
        self.color_thread = ColorThread(lambda: self.ip_input.text().strip())
        self.color_thread.color_received.connect(self.on_color_data)
        self.color_thread.line_received.connect(self.on_line_data)
        self.color_thread.start()

        self.cmd_thread = CmdThread(GUI_CMD_PORT)
        self.cmd_thread.cmd_received.connect(self.on_cmd)
        self.cmd_thread.start()

        self.ping_thread = PingThread(lambda: self.state.esp_ip)
        self.ping_thread.status.connect(self.set_esp_status)
        self.ping_thread.start()

    def setup_timers(self):
        self.ctrl_timer = QTimer()
        self.ctrl_timer.timeout.connect(self.send_drive_cmd)
        self.ctrl_timer.start(25)

    def add_color_btn(self, layout, text, rgb):
        btn = QPushButton(text)
        btn.clicked.connect(lambda: self.send_led_color(*rgb))
        layout.addWidget(btn)

    def log(self, msg):
        ts = time.strftime("%H:%M:%S")
        self.log_box.append(f"[{ts}] {msg}")

    def set_speed(self, mode):
        if not self.state.esp_connected or not self.state.esp_ip:
            return
        if mode == self.state.speed_mode:
            return
        self.ctrl.send_speed(self.state.esp_ip, mode)
        self.state.speed_mode = mode
        if mode == SPEED_HIGH:
            self.speed_badge.setText("速度档：高速")
        elif mode == SPEED_MICRO:
            self.speed_badge.setText("速度档：微调")
        elif mode == SPEED_MED:
            self.speed_badge.setText("速度档：中档")
        else:
            self.speed_badge.setText("速度档：低速")

    def send_led_color(self, r, g, b):
        if not self.state.esp_connected or not self.state.esp_ip:
            return
        self.ctrl.send_led(self.state.esp_ip, r, g, b)

    def send_arm(self, cmd):
        if not self.state.esp_connected or not self.state.esp_ip:
            return
        self.ctrl.send_arm(self.state.esp_ip, cmd)
        self.log(f"UART> {cmd}")

    def send_arm_servo(self, s0=None, s3=None, s5=None, t=80):
        parts = []
        if s0 is not None:
            parts.append(f"#000P{s0:04d}T{t:04d}!")
        if s3 is not None:
            parts.append(f"#003P{s3:04d}T{t:04d}!")
        if s5 is not None:
            parts.append(f"#005P{s5:04d}T{t:04d}!")
        if not parts:
            return
        self.send_arm("{" + "".join(parts) + "}")

    def enable_mouse_look(self, enable: bool):
        self.state.mouse_look = enable
        if enable:
            self.video_label.setCursor(Qt.BlankCursor)
            self.center_cursor()
        else:
            self.video_label.unsetCursor()

    def toggle_mouse_lock(self):
        self.state.mouse_lock = not self.state.mouse_lock
        if not self.state.mouse_lock:
            self.video_label.unsetCursor()
        else:
            self.video_label.setCursor(Qt.BlankCursor)
            self.center_cursor()

    def center_cursor(self):
        center = self.video_label.rect().center()
        global_pos = self.video_label.mapToGlobal(center)
        QCursor.setPos(global_pos)

    def eventFilter(self, obj, event):
        if obj == self.video_label and event.type() == QEvent.MouseMove:
            if not self.state.mouse_look or not self.state.drive_enabled or self.state.auto_pick or self.state.auto_align:
                return False
            if not self.state.mouse_lock:
                return False
            center = self.video_label.rect().center()
            cur = event.pos()

            # 方向翻转
            dx = -(cur.x() - center.x())
            dy = -(cur.y() - center.y())

            if dx != 0 or dy != 0:
                self.state.s0_pwm = max(S0_MIN, min(S0_MAX, self.state.s0_pwm + dx * MOUSE_SENS))
                self.state.s3_pwm = max(S3_MIN, min(S3_MAX, self.state.s3_pwm - dy * MOUSE_SENS))
                self.send_arm_servo(int(self.state.s0_pwm), int(self.state.s3_pwm), None, t=60)
                self.center_cursor()
            return True
        return super().eventFilter(obj, event)

    def wheelEvent(self, event):
        if not self.state.drive_enabled:
            return
        delta = event.angleDelta().y()
        step = 10 if delta > 0 else -10
        self.state.s5_pwm = max(S5_MIN, min(S5_MAX, self.state.s5_pwm + step))
        self.send_arm_servo(s5=self.state.s5_pwm, t=60)

    def mousePressEvent(self, event):
        if event.button() == Qt.MiddleButton:
            self.toggle_mouse_lock()

    def click_beep(self):
        if not self.state.esp_connected or not self.state.esp_ip:
            return
        self.ctrl.send_beep(self.state.esp_ip, True)
        QTimer.singleShot(200, lambda: self.ctrl.send_beep(self.state.esp_ip, False))

    def send_grab(self):
        self.send_arm(ARM_GRAB)
        QMessageBox.information(self, "提示", "已执行一次向前抓取")

    def toggle_align(self):
        self.state.auto_align = not self.state.auto_align
        self.log("自动对齐已开启" if self.state.auto_align else "自动对齐已关闭")

    def toggle_autopick(self):
        self.state.auto_pick = not self.state.auto_pick
        self.color_aligner.reset()
        if self.state.auto_pick:
            self.state.auto_align = True
            self.set_speed(SPEED_MICRO)
            self.log("自动拾取已开启（微调对齐）")
        else:
            self.state.auto_align = False
            self.set_speed(SPEED_LOW)
            self.log("自动拾取已关闭")

    def stop_auto(self):
        self.state.auto_align = False
        self.state.auto_pick = False
        self.color_aligner.reset()
        self.set_speed(SPEED_LOW)
        self.log("已停止自动拾取/对齐")

    def stop_line(self):
        self.state.line_enabled = False
        self.line_tracker.reset()
        self.drive_override("WS")
        self.log("已停止循迹")

    def stop_all(self):
        self.stop_line()
        self.stop_auto()
        self.drive_override("WS")
        self.set_speed(SPEED_LOW)
        self.log("已停止全部动作")

    def micro_move(self, key):
        if not self.state.esp_connected or not self.state.esp_ip:
            return
        m = self.key_map.get(key, [0,0,0,0])
        self.ctrl.send_drv(self.state.esp_ip, m)
        QTimer.singleShot(self.state.micro_step_ms, lambda: self.ctrl.send_drv(self.state.esp_ip, [0,0,0,0]))

    def on_color_data(self, data, raw):
        if self.state.auto_align or self.state.auto_pick:
            result = self.color_aligner.process(data, self.color_select.currentText())
            if result["aligned"]:
                if self.state.auto_pick and result["count"] >= 3:
                    self.send_arm(ARM_GRAB)
                    self.state.auto_pick = False
                    self.state.auto_align = False
                    self.color_aligner.reset()
                    self.set_speed(SPEED_LOW)
                    QMessageBox.information(self, "提示", "自动拾取完成")
            else:
                if self.state.auto_pick and result["move_key"]:
                    self.micro_move(result["move_key"])

    def on_line_data(self, data, raw):
        if self.state.line_enabled:
            result = self.line_tracker.process(data)
            action = result.get("action")
            if action == "TURN_LEFT":
                self.drive_override("A")
                QTimer.singleShot(result["turn_ms"], self.finish_turn)
            elif action == "TURN_RIGHT":
                self.drive_override("D")
                QTimer.singleShot(result["turn_ms"], self.finish_turn)
            elif action:
                self.drive_override(action)

    def finish_turn(self):
        self.line_tracker.finish_turn()
        self.drive_override("WS")

    def drive_override(self, key):
        if not self.state.esp_connected or not self.state.esp_ip:
            return
        m = self.key_map.get(key, [0,0,0,0])
        self.ctrl.send_drv(self.state.esp_ip, m)

    def drive_for(self, key, ms):
        self.drive_override(key)
        QTimer.singleShot(ms, lambda: self.drive_override("WS"))

    def set_esp_status(self, ok):
        self.state.esp_connected = ok
        self.esp_status.setText("ESP32：已连接" if ok else "ESP32：未连接")

    def connect_esp32(self):
        self.state.esp_ip = self.esp_input.text().strip()
        self.set_speed(SPEED_LOW)
        self.ctrl.register_gui(self.state.esp_ip, GUI_CMD_PORT)

    def start_stream(self):
        ip = self.ip_input.text().strip()
        if not ip:
            return
        if self.video_thread:
            self.video_thread.stop()
        self.video_thread = VideoThread(ip)
        self.video_thread.frame_received.connect(self.update_frame)
        self.video_thread.start()

    def update_frame(self, rgb):
        h, w, ch = rgb.shape
        qimg = QImage(rgb.data, w, h, ch * w, QImage.Format_RGB888)
        self.video_label.setPixmap(QPixmap.fromImage(qimg).scaled(
            self.video_label.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation))

    def open_keymap(self):
        QMessageBox.information(self, "提示", "按键映射功能保持原逻辑未改动")

    def switch_mode(self, mode):
        self.state.drive_enabled = (mode == "STREAM")
        self.status_label.setText("模式：自由驾驶" if self.state.drive_enabled else ("模式：视觉循迹" if mode == "LINE" else "模式：色块识别"))

        if mode == "STREAM":
            self.send_udp(self.ip_input.text().strip(), "MODE:STREAM")
            self.send_arm(ARM_INIT_STREAM)
            self.enable_mouse_look(True)
            self.state.line_enabled = False
        elif mode == "COLOR":
            self.send_udp(self.ip_input.text().strip(), "MODE:COLOR")
            self.send_arm(ARM_INIT_COLOR)
            self.enable_mouse_look(False)
            self.state.line_enabled = False
        elif mode == "LINE":
            self.send_udp(self.ip_input.text().strip(), "MODE:LINE")
            self.enable_mouse_look(False)
            self.state.line_enabled = True
            self.set_speed(LINE_SPEED_MODE)

        self.drive_override("WS")

    def send_udp(self, ip, msg):
        if not ip:
            return
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(msg.encode(), (ip, CTRL_PORT))
        sock.close()

    def keyPressEvent(self, event):
        if event.isAutoRepeat():
            return
        if event.key() == Qt.Key_Shift and not self.state.auto_pick:
            self.set_speed(SPEED_HIGH)
        if self.state.auto_align or self.state.auto_pick or self.state.line_enabled:
            return
        if event.key() == Qt.Key_W: self.key_state["W"] = True
        if event.key() == Qt.Key_A: self.key_state["A"] = True
        if event.key() == Qt.Key_S: self.key_state["S"] = True
        if event.key() == Qt.Key_D: self.key_state["D"] = True

    def keyReleaseEvent(self, event):
        if event.isAutoRepeat():
            return
        if event.key() == Qt.Key_Shift and not self.state.auto_pick:
            self.set_speed(SPEED_LOW)
        if self.state.auto_align or self.state.auto_pick or self.state.line_enabled:
            return
        if event.key() == Qt.Key_W: self.key_state["W"] = False
        if event.key() == Qt.Key_A: self.key_state["A"] = False
        if event.key() == Qt.Key_S: self.key_state["S"] = False
        if event.key() == Qt.Key_D: self.key_state["D"] = False

    def send_drive_cmd(self):
        if not self.state.drive_enabled or not self.state.esp_connected:
            return
        if self.state.auto_align or self.state.auto_pick or self.state.line_enabled:
            return
        w,a,s,d = self.key_state["W"], self.key_state["A"], self.key_state["S"], self.key_state["D"]
        if w and s: key="WS"
        elif w and a: key="WA"
        elif w and d: key="WD"
        elif s and a: key="SA"
        elif s and d: key="SD"
        elif w: key="W"
        elif s: key="S"
        elif a: key="A"
        elif d: key="D"
        else: key="WS"
        self.drive_override(key)

    def on_cmd(self, cmd):
        if cmd.startswith("CMD "):
            parts = cmd.split()
            if len(parts) < 3:
                return
            t = parts[1]
            if t == "MOVE":
                direction = parts[2]
                duration = int(parts[3]) if len(parts) >= 4 else 1500
                if direction == "FWD":
                    self.drive_for("W", duration)
                elif direction == "BACK":
                    self.drive_for("S", duration)
                elif direction == "STOP":
                    self.drive_override("WS")
            elif t == "ARM":
                v = " ".join(parts[2:])
                if v == "GRAB": self.send_arm(ARM_GRAB)
                elif v == "WAVE":
                    self.send_arm(ARM_WAVE)
                    QTimer.singleShot(4000, lambda: self.send_arm(ARM_WAVE_BACK))
            elif t == "LED":
                v = " ".join(parts[2:])
                if v == "OFF":
                    self.send_led_color(0,0,0)
                else:
                    try:
                        r, g, b = map(int, parts[2:5])
                        self.send_led_color(r,g,b)
                    except Exception:
                        pass
            elif t == "MODE":
                v = " ".join(parts[2:])
                if v == "STREAM": self.switch_mode("STREAM")
                elif v == "COLOR": self.switch_mode("COLOR")
                elif v == "LINE": self.switch_mode("LINE")
            elif t == "AUTOPICK":
                v = " ".join(parts[2:])
                if v == "START": self.toggle_autopick()
                elif v == "STOP": self.stop_auto()
            elif t == "LINE":
                v = " ".join(parts[2:])
                if v == "START": self.switch_mode("LINE")
                elif v == "STOP": self.stop_line()
