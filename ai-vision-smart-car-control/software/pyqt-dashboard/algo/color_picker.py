from core.constants import TARGET_X, TARGET_Y, ALIGN_TOL

class ColorAligner:
    def __init__(self):
        self.align_count = 0

    def reset(self):
        self.align_count = 0

    def process(self, colors, target_color):
        if target_color not in colors:
            return {"move_key": None, "aligned": False, "count": 0}
        cx, cy, _ = colors[target_color]
        dx = cx - TARGET_X
        dy = cy - TARGET_Y

        if abs(dx) <= ALIGN_TOL and abs(dy) <= ALIGN_TOL:
            self.align_count += 1
            return {"move_key": None, "aligned": True, "count": self.align_count}

        self.align_count = 0
        move_key = "A" if dx < -ALIGN_TOL else "D" if dx > ALIGN_TOL else "W" if dy < -ALIGN_TOL else "S"
        return {"move_key": move_key, "aligned": False, "count": 0}
