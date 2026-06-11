#pragma once

#include <QString>
#include <QMap>
#include "constants.h"

// ============================================================
// 应用全局状态
// ============================================================
struct AppState {
    // ----- 连接状态 -----
    bool driveEnabled  = false;
    bool espConnected  = false;
    QString espIp;
    QString camIp;

    // ----- 自动化 -----
    bool autoAlign  = false;
    bool autoPick   = false;
    bool lineEnabled = false;

    // ----- 速度 -----
    int speedMode    = SPEED_LOW;
    int microStepMs  = 60;

    // ----- 舵机 -----
    int s0Pwm = 1500;
    int s3Pwm = 1100;
    int s5Pwm = 1100;

    // ----- 鼠标 -----
    bool mouseLook = false;
    bool mouseLock = true;

    // ----- 方向盘 -----
    double mouseDxFilt    = 0.0;
    double mouseDyFilt    = 0.0;
    double mouseLastSend  = 0.0;
    double mouseAccumX    = 0.0;
    double mouseAccumY    = 0.0;
    QString lastDriveKey;

    // ----- 原地旋转提速 -----
    bool rotationBoosted       = false;
    int  savedSpeedBeforeRotate = SPEED_LOW;

    // ----- 链路信息 -----
    int espLatency = -1;
    int espRssi    = 0;
    int camLatency = -1;
    int camRssi    = 0;

    // ----- 速度/挡位显示 -----
    int  currentSpeed   = 0;      // 模拟车速 0-100
    QString currentGear  = "低速"; // 文字挡位
    QString currentDir   = "停止"; // 方向文字
    QString currentMode  = "未进入"; // 模式
};

// 速度档位名称查询
inline QString speedName(int mode) {
    switch (mode) {
    case SPEED_HIGH:  return "高速";
    case SPEED_MICRO: return "微调";
    case SPEED_MED:   return "中速";
    default:          return "低速";
    }
}
