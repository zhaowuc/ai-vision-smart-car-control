#pragma once

// ============================================================
// 网络端口定义
// ============================================================
constexpr int VIDEO_PORT   = 9000;   // MaixVision 视频流 TCP
constexpr int CTRL_PORT    = 9001;   // MaixVision 控制 UDP
constexpr int COLOR_PORT   = 9002;   // 颜色/循迹数据 TCP
constexpr int ESP32_UDP_PORT = 6000; // ESP32 指令 UDP
constexpr int GUI_CMD_PORT = 6001;   // 本机监听 UDP 指令

// ============================================================
// 色块对齐参数
// ============================================================
constexpr int TARGET_X = 143;
constexpr int TARGET_Y = 114;
constexpr int ALIGN_TOL = 3;

// ============================================================
// 机械臂指令
// ============================================================
constexpr const char* ARM_ACTION_STREAM  = "$DGS:1!";
constexpr const char* ARM_ACTION_TRACK   = "$DGS:2!";
constexpr const char* ARM_GRAB           = "$DGT:3-5,1!";
constexpr const char* ARM_WAVE           = "$DGT:6-10,1!";
constexpr const char* ARM_WAVE_BACK      = "$DGS:6!";

// ============================================================
// 速度档位
// ============================================================
constexpr int SPEED_LOW   = 0;
constexpr int SPEED_HIGH  = 1;
constexpr int SPEED_MICRO = 2;
constexpr int SPEED_MED   = 3;

// ============================================================
// 舵机 PWM 范围
// ============================================================
constexpr int S0_MIN = 500,  S0_MAX = 2500;
constexpr int S3_MIN = 500,  S3_MAX = 1600;
constexpr int S5_MIN = 860,  S5_MAX = 1900;

// ============================================================
// 循迹参数
// ============================================================
constexpr int LINE_FRAME_W      = 320;
constexpr int LINE_TOL          = 20;
constexpr int LINE_TOL_STRONG   = 35;
constexpr double LINE_CORNER_T  = 0.35;
constexpr int LINE_TURN_MS      = 650;
constexpr int LINE_ERR_WIN      = 5;
constexpr int LINE_WIDTH_MIN    = 25;
constexpr int LINE_WIDTH_MAX    = 220;
constexpr int LINE_TURN_CONFIRM = 3;
constexpr int LINE_LOST_CONFIRM = 3;
constexpr int LINE_SPEED_MODE   = SPEED_LOW;

// PID 参数
constexpr double PID_KP      = 0.6;
constexpr double PID_KI      = 0.015;
constexpr double PID_KD      = 0.12;
constexpr double PID_OUT_MAX = 40.0;

// ============================================================
// 鼠标云台参数
// ============================================================
constexpr double MOUSE_SMOOTH_ALPHA = 0.35;
constexpr double MOUSE_MAX_STEP     = 18.0;
constexpr double MOUSE_SEND_HZ      = 45.0;
constexpr double MOUSE_MIN_STEP     = 1.0;

// ============================================================
// 设置文件
// ============================================================
#define SETTINGS_FILE_NAME "smartcar_settings.json"
