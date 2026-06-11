from collections import deque
from core.constants import (
    LINE_FRAME_W, LINE_TOL, LINE_TOL_STRONG, LINE_CORNER_T, LINE_TURN_MS,
    LINE_ERR_WIN, LINE_WIDTH_MIN, LINE_WIDTH_MAX, LINE_TURN_CONFIRM, LINE_LOST_CONFIRM,
    PID_KP, PID_KI, PID_KD, PID_OUT_MAX
)

class LineTracker:
    def __init__(self):
        self.turning = False
        self.pending_turn_dir = None
        self.corner_seen_count = 0
        self.corner_lost_count = 0

        self.err_hist = deque(maxlen=LINE_ERR_WIN)
        self.width_hist = deque(maxlen=LINE_ERR_WIN)
        self.pid_i = 0
        self.pid_prev = 0

    def reset(self):
        self.turning = False
        self.pending_turn_dir = None
        self.corner_seen_count = 0
        self.corner_lost_count = 0
        self.err_hist.clear()
        self.width_hist.clear()
        self.pid_i = 0
        self.pid_prev = 0

    def finish_turn(self):
        self.turning = False
        self.pending_turn_dir = None
        self.corner_seen_count = 0
        self.corner_lost_count = 0

    def process(self, line):
        if self.turning:
            return {"action": None}

        b_found = line.get("bf", 0)
        m_found = line.get("mf", 0)
        t_found = line.get("tf", 0)

        bcx = line.get("bcx", -1)
        bl = line.get("bl", -1)
        br = line.get("br", -1)
        tcx = line.get("tcx", -1)

        center = LINE_FRAME_W // 2
        corner_thresh = int(LINE_FRAME_W * LINE_CORNER_T)

        if t_found and not m_found:
            if tcx < center - corner_thresh:
                self.corner_seen_count += 1
                self.pending_turn_dir = "LEFT"
            elif tcx > center + corner_thresh:
                self.corner_seen_count += 1
                self.pending_turn_dir = "RIGHT"
        else:
            self.corner_seen_count = max(0, self.corner_seen_count - 1)

        if self.pending_turn_dir and self.corner_seen_count >= LINE_TURN_CONFIRM and (not b_found and not m_found):
            self.corner_lost_count += 1
            if self.corner_lost_count >= LINE_LOST_CONFIRM:
                self.turning = True
                return {
                    "action": "TURN_LEFT" if self.pending_turn_dir == "LEFT" else "TURN_RIGHT",
                    "turn_ms": LINE_TURN_MS
                }
        else:
            self.corner_lost_count = 0

        if not b_found:
            return {"action": "WS"}

        width = br - bl
        self.width_hist.append(width)
        smooth_width = sum(self.width_hist) / len(self.width_hist)
        if smooth_width < LINE_WIDTH_MIN or smooth_width > LINE_WIDTH_MAX:
            return {"action": "WS"}

        err = bcx - center
        self.err_hist.append(err)
        smooth_err = sum(self.err_hist) / len(self.err_hist)

        self.pid_i += smooth_err
        d = smooth_err - self.pid_prev
        out = PID_KP * smooth_err + PID_KI * self.pid_i + PID_KD * d
        self.pid_prev = smooth_err
        out = max(-PID_OUT_MAX, min(PID_OUT_MAX, out))

        if abs(out) <= LINE_TOL:
            return {"action": "W"}
        elif out > 0:
            return {"action": "WD" if abs(out) >= LINE_TOL_STRONG else "W"}
        else:
            return {"action": "WA" if abs(out) >= LINE_TOL_STRONG else "W"}
