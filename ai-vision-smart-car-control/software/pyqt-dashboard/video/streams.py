import socket
import struct
import cv2
import numpy as np
import time
from PyQt5.QtCore import QThread, pyqtSignal
from core.constants import VIDEO_PORT, COLOR_PORT

class VideoThread(QThread):
    frame_received = pyqtSignal(object)
    def __init__(self, ip):
        super().__init__()
        self.ip = ip
        self._running = True
    def stop(self):
        self._running = False
        self.wait(1000)
    def run(self):
        while self._running:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.connect((self.ip, VIDEO_PORT))
                sock.settimeout(2.0)
                while self._running:
                    length_bytes = self._recv_exact(sock, 4)
                    if not length_bytes:
                        break
                    length = struct.unpack(">I", length_bytes)[0]
                    jpg_data = self._recv_exact(sock, length)
                    if not jpg_data:
                        break
                    np_arr = np.frombuffer(jpg_data, dtype=np.uint8)
                    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                    if frame is None:
                        continue
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    self.frame_received.emit(rgb)
            except Exception:
                pass
            try:
                sock.close()
            except:
                pass
            for _ in range(10):
                if not self._running:
                    return
                self.msleep(100)
    def _recv_exact(self, sock, size):
        data = b''
        while len(data) < size:
            chunk = sock.recv(size - len(data))
            if not chunk:
                return None
            data += chunk
        return data

class ColorThread(QThread):
    color_received = pyqtSignal(dict, str)
    line_received = pyqtSignal(dict, str)
    def __init__(self, ip_getter):
        super().__init__()
        self.get_ip = ip_getter
        self._running = True
    def stop(self):
        self._running = False
    def run(self):
        while self._running:
            ip = self.get_ip()
            if not ip:
                time.sleep(0.5)
                continue
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.connect((ip, COLOR_PORT))
                sock.settimeout(2.0)
                buf = b""
                while self._running:
                    data = sock.recv(256)
                    if not data:
                        break
                    buf += data
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        line = line.decode().strip()
                        if line.startswith("COLORS "):
                            parsed = {}
                            payload = line.replace("COLORS ", "")
                            if payload != "NONE":
                                for item in payload.split("|"):
                                    name, cx, cy, area = item.split(",")
                                    parsed[name] = (int(cx), int(cy), int(area))
                            self.color_received.emit(parsed, line)
                        elif line.startswith("LINE "):
                            parts = line.split()
                            if len(parts) >= 16:
                                data = {
                                    "bcx": int(parts[1]), "bcy": int(parts[2]),
                                    "bl": int(parts[3]), "br": int(parts[4]),
                                    "mcx": int(parts[5]), "mcy": int(parts[6]),
                                    "ml": int(parts[7]), "mr": int(parts[8]),
                                    "tcx": int(parts[9]), "tcy": int(parts[10]),
                                    "tl": int(parts[11]), "tr": int(parts[12]),
                                    "bf": int(parts[13]), "mf": int(parts[14]), "tf": int(parts[15]),
                                }
                                self.line_received.emit(data, line)
            except Exception:
                pass
            time.sleep(0.5)
