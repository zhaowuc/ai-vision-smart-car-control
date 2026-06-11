import socket
from PyQt5.QtCore import QThread, pyqtSignal
from core.constants import ESP32_UDP_PORT

class CmdThread(QThread):
    cmd_received = pyqtSignal(str)
    def __init__(self, port):
        super().__init__()
        self.port = port
        self._running = True
    def stop(self):
        self._running = False
    def run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind(("0.0.0.0", self.port))
        while self._running:
            try:
                data, _ = sock.recvfrom(512)
                self.cmd_received.emit(data.decode().strip())
            except Exception:
                pass

class PingThread(QThread):
    status = pyqtSignal(bool)
    def __init__(self, get_ip):
        super().__init__()
        self.get_ip = get_ip
        self._running = True
        self.ok_count = 0
        self.fail_count = 0
    def stop(self):
        self._running = False
    def run(self):
        while self._running:
            ip = self.get_ip()
            if ip:
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    sock.settimeout(0.4)
                    sock.sendto(b"PING", (ip, ESP32_UDP_PORT))
                    data, _ = sock.recvfrom(16)
                    if data == b"PONG":
                        self.ok_count += 1
                        self.fail_count = 0
                    else:
                        self.fail_count += 1
                        self.ok_count = 0
                    sock.close()
                except Exception:
                    self.fail_count += 1
                    self.ok_count = 0
            else:
                self.fail_count += 1
                self.ok_count = 0

            if self.ok_count >= 3:
                self.status.emit(True)
                self.ok_count = 0
            if self.fail_count >= 3:
                self.status.emit(False)
                self.fail_count = 0

            self.msleep(500)

class UdpController:
    def __init__(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def send(self, ip, msg):
        if not ip:
            return
        self.sock.sendto(msg.encode(), (ip, ESP32_UDP_PORT))

    def send_speed(self, ip, mode):
        self.send(ip, f"S {mode}")

    def send_led(self, ip, r, g, b):
        self.send(ip, f"STM LED {r} {g} {b}")

    def send_arm(self, ip, cmd):
        self.send(ip, f"ARM {cmd}")

    def send_drv(self, ip, m):
        self.send(ip, f"DRV {m[0]} {m[1]} {m[2]} {m[3]}")

    def send_beep(self, ip, on):
        self.send(ip, f"BEEP {1 if on else 0}")

    def register_gui(self, ip, port):
        self.send(ip, f"GUIREG {port}")
