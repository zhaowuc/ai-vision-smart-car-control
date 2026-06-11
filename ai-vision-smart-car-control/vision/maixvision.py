from maix import camera, image
import time
import socket
import threading

STREAM_W, STREAM_H = 480, 320
LINE_W, LINE_H = 240, 180
TARGET_FPS = 30

VIDEO_PORT = 9000
CTRL_PORT  = 9001
COLOR_PORT = 9002

red_threshold   = [0, 80,  30,  90, -128, 127]
green_threshold = [0, 80, -70, -30, -128, 127]
blue_threshold  = [20, 60, -23, 7, -38, -8]
black_threshold = [0, 30, -128, 127, -128, 127]

colors = [
    {"name": "Red",   "threshold": red_threshold,   "color_const": image.COLOR_RED},
    {"name": "Green", "threshold": green_threshold, "color_const": image.COLOR_GREEN},
    {"name": "Blue",  "threshold": blue_threshold,  "color_const": image.COLOR_BLUE}
]

mode = "IDLE"
cam = None
coord_conn = None

def open_camera(w, h):
    global cam
    if cam:
        cam.close()
        cam = None
    cam = camera.Camera(w, h)
    print(f"[CAM] 打开相机 {w}x{h}")

def udp_control_server():
    global mode
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", CTRL_PORT))
    print(f"[CTRL] UDP 控制端口: {CTRL_PORT}")
    while True:
        data, addr = sock.recvfrom(1024)
        cmd = data.decode().strip().upper()

        if cmd.startswith("PING "):
            ts = cmd.split(" ", 1)[1]
            sock.sendto(f"PONG {ts} -1".encode(), addr)
            continue

        if cmd.startswith("MODE:"):
            new_mode = cmd.split(":", 1)[1]
            if new_mode in ("STREAM", "COLOR", "LINE", "IDLE"):
                mode = new_mode
                if mode == "STREAM":
                    open_camera(STREAM_W, STREAM_H)
                else:
                    open_camera(LINE_W, LINE_H)
                print(f"[CTRL] 模式切换为: {mode} 来自 {addr}")

def coord_server():
    global coord_conn
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", COLOR_PORT))
    srv.listen(1)
    print(f"[COLOR] TCP 坐标端口: {COLOR_PORT}")

    while True:
        conn, addr = srv.accept()
        print(f"[COLOR] 坐标连接来自: {addr}")
        coord_conn = conn

def encode_jpeg_bytes(img):
    return img.to_jpeg(quality=85).to_bytes()

def find_line_info(img):
    w, h = img.width(), img.height()
    roi_h = h // 3
    rois = [
        (0, h - roi_h, w, roi_h),
        (0, h//3, w, roi_h),
        (0, 0, w, roi_h)
    ]

    def find_roi(roi):
        blobs = img.find_blobs([black_threshold], roi=roi, pixels_threshold=200, area_threshold=200, merge=True)
        if blobs:
            b = max(blobs, key=lambda x: x.area())
            return b.cx(), b.cy(), b.x(), b.x() + b.w(), 1
        return -1, -1, -1, -1, 0

    bcx, bcy, bl, br, bf = find_roi(rois[0])
    mcx, mcy, ml, mr, mf = find_roi(rois[1])
    tcx, tcy, tl, tr, tf = find_roi(rois[2])

    return (bcx, bcy, bl, br, mcx, mcy, ml, mr, tcx, tcy, tl, tr, bf, mf, tf)

def send_frames_tcp():
    global cam, coord_conn
    open_camera(LINE_W, LINE_H)

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", VIDEO_PORT))
    srv.listen(1)
    print(f"[VIDEO] TCP 视频端口: {VIDEO_PORT}")

    last_color_send = time.time()
    last_line_send = time.time()

    while True:
        conn, addr = srv.accept()
        print(f"[VIDEO] 连接来自: {addr}")
        try:
            while True:
                img = cam.read()
                img.gaussian(1)

                frame_blobs = []

                if mode in ("COLOR", "LINE"):
                    for color_info in colors:
                        blobs = img.find_blobs(
                            [color_info["threshold"]],
                            pixels_threshold=150,
                            area_threshold=300,
                            merge=True
                        )
                        if blobs:
                            b = max(blobs, key=lambda x: x.area())
                            frame_blobs.append({
                                "name": color_info["name"],
                                "cx": b.cx(),
                                "cy": b.cy(),
                                "area": b.area()
                            })
                            img.draw_rect(b.x(), b.y(), b.w(), b.h(),
                                          color=color_info["color_const"], thickness=1)

                if mode == "LINE":
                    bcx, bcy, bl, br, mcx, mcy, ml, mr, tcx, tcy, tl, tr, bf, mf, tf = find_line_info(img)
                    now = time.time()
                    if coord_conn and (now - last_line_send) >= 0.1:
                        try:
                            msg = f"LINE {bcx} {bcy} {bl} {br} {mcx} {mcy} {ml} {mr} {tcx} {tcy} {tl} {tr} {bf} {mf} {tf}\n"
                            coord_conn.sendall(msg.encode())
                        except Exception:
                            coord_conn = None
                        last_line_send = now

                now = time.time()
                if coord_conn and (now - last_color_send) >= 0.2:
                    try:
                        if frame_blobs:
                            parts = []
                            for b in frame_blobs:
                                parts.append(f"{b['name']},{b['cx']},{b['cy']},{b['area']}")
                            msg = "COLORS " + "|".join(parts) + "\n"
                        else:
                            msg = "COLORS NONE\n"
                        coord_conn.sendall(msg.encode())
                    except Exception:
                        coord_conn = None
                    last_color_send = now

                jpg_bytes = encode_jpeg_bytes(img)
                conn.sendall(len(jpg_bytes).to_bytes(4, 'big'))
                conn.sendall(jpg_bytes)
                time.sleep(1.0 / TARGET_FPS)
        except Exception as e:
            print(f"[VIDEO] 连接断开: {e}")
        finally:
            conn.close()

if __name__ == "__main__":
    threading.Thread(target=udp_control_server, daemon=True).start()
    threading.Thread(target=coord_server, daemon=True).start()
    send_frames_tcp()