# 智能车系统功能架构图

```mermaid
flowchart TB
    User["用户 / 操作者"] --> Qt["Qt/C++ 上位机<br/>视频监控、键盘控制、模式切换、日志与仪表盘"]
    User --> Voice["语音 / 工具调用入口"]

    subgraph Interaction["交互与控制层"]
        Qt
        PyQt["PyQt 旧版上位机<br/>调试与历史版本对照"]
        Voice
    end

    subgraph Vision["视觉感知层"]
        Maix["MaixVision 摄像头<br/>图像采集、色块识别、黑线检测"]
        Video["TCP 视频流<br/>JPEG Frame Stream"]
        VisionData["TCP 视觉数据<br/>COLORS / LINE"]
    end

    subgraph Gateway["网络网关层"]
        ESP32["ESP32-S3 网关<br/>WiFi、UDP 转发、UART 桥接、OLED 状态"]
        MCP["MCP / WebSocket 服务<br/>工具调用与语音动作映射"]
    end

    subgraph Execution["执行控制层"]
        STM32["STM32F103 底盘控制<br/>四轮电机、速度档位、RGB 灯、蜂鸣器"]
        Arm["机械臂 / 舵机控制板<br/>动作组、抓取、挥手、云台舵机"]
        Chassis["麦克纳姆轮底盘<br/>前进、后退、横移、旋转"]
        LED["RGB LED / 蜂鸣器<br/>状态提示与反馈"]
    end

    subgraph Algorithms["核心算法与状态机"]
        Mecanum["麦轮运动混控"]
        LinePID["视觉循迹 PID"]
        ColorAlign["色块对齐与自动拾取"]
        LinkMonitor["链路监测与自动重连"]
    end

    Maix --> Video --> Qt
    Maix --> VisionData --> Qt
    Qt -- "UDP 控制指令 / PING" --> ESP32
    PyQt -. "UDP 调试指令" .-> ESP32
    Voice --> MCP --> ESP32

    ESP32 -- "UART: STM / DRV / LED / BEEP" --> STM32
    ESP32 -- "UART: ARM 动作组" --> Arm
    STM32 --> Chassis
    STM32 --> LED

    Qt --> Mecanum --> ESP32
    Qt --> LinePID --> ESP32
    Qt --> ColorAlign --> ESP32
    Qt --> LinkMonitor

    Qt -- "MODE: STREAM / COLOR / LINE" --> Maix
```

## 功能分层说明

| 层级 | 主要模块 | 职责 |
|---|---|---|
| 交互与控制层 | Qt/C++ 上位机、PyQt 旧版上位机、语音/工具调用入口 | 人机交互、视频显示、模式切换、键盘控制、日志和状态展示 |
| 视觉感知层 | MaixVision、TCP 视频流、TCP 视觉数据 | 采集图像、输出视频帧、识别色块、检测黑线 |
| 网络网关层 | ESP32-S3、MCP/WebSocket 服务 | WiFi 接入、UDP 指令转发、串口桥接、工具调用映射 |
| 执行控制层 | STM32F103、机械臂控制板、麦克纳姆轮底盘、RGB LED | 执行运动、灯光、蜂鸣器和机械臂动作 |
| 算法与状态机 | 麦轮混控、循迹 PID、色块对齐、链路监测 | 负责运动决策、视觉闭环和通信稳定性 |

## 关键数据流

1. 用户通过 Qt 上位机输入控制命令。
2. Qt 上位机通过 UDP 将底盘、灯光、机械臂和模式指令发送到 ESP32-S3。
3. ESP32-S3 通过 UART 将底盘命令转发给 STM32，将机械臂动作组转发给舵机控制板。
4. MaixVision 将视频帧和视觉识别结果通过 TCP 返回 Qt 上位机。
5. Qt 上位机基于视觉数据执行循迹 PID、色块对齐和自动拾取状态机。
6. MCP/WebSocket 服务可将语音或工具调用转换为 ESP32-S3 可执行的控制动作。
