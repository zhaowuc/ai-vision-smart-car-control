from dataclasses import dataclass
from .constants import SPEED_LOW

@dataclass
class AppState:
    drive_enabled: bool = False
    esp_connected: bool = False
    esp_ip: str = ""

    auto_align: bool = False
    auto_pick: bool = False
    line_enabled: bool = False

    speed_mode: int = SPEED_LOW
    micro_step_ms: int = 60

    s0_pwm: int = 1500
    s3_pwm: int = 1100
    s5_pwm: int = 1100

    mouse_look: bool = False
    mouse_lock: bool = True

    last_cmd: str = ""
    last_cmd_time: float = 0.0
