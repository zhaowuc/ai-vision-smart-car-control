# 软件设计

## Qt Dashboard

Qt 上位机由以下模块组成：

- `mainwindow.*`：主窗口、交互逻辑、模式切换、键盘控制。
- `networkmanager.*`：UDP/TCP 网络线程、视频接收、链路监测、命令监听。
- `tracker.*`：循迹 PID、弯道检测和色块对齐逻辑。
- `dashboard.*`：仪表盘自绘组件。
- `settings.*`：本机设置持久化，不提交真实设备地址。

## ESP32-S3 Firmware

ESP32-S3 承担网关角色：

- 连接 WiFi。
- 监听上位机 UDP 指令。
- 通过 UART 转发 STM32 和机械臂命令。
- 连接 MCP/WebSocket 服务，将工具调用转换为小车动作。
- OLED 显示本机 IP 和 MCP 状态。

## STM32 Firmware

STM32 负责确定性执行：

- 解析串口命令。
- 控制四路电机方向和 PWM。
- 控制 RGB LED 与蜂鸣器。
- 提供电机方向校正数组，降低机械装配误差带来的调试成本。

## MaixVision Script

MaixVision 脚本负责：

- 根据模式切换采集分辨率。
- 检测 Red/Green/Blue 色块。
- 检测黑线 ROI 并输出多段中心点。
- 通过 TCP 推送 JPEG 帧和结构化视觉结果。
