# AI Vision Smart Car Control

## 项目简介

本项目是一套面向智能小车的视觉感知与运动控制系统，覆盖上位机操控、ESP32-S3 网络网关、STM32F103 底盘控制、MaixVision 视觉识别与机械臂动作控制。系统支持键盘麦轮运动、视频流监控、色块识别自动对齐、视觉循迹、灯光控制、机械臂抓取，以及通过 ESP32-S3 接入 MCP/WebSocket 的语音/工具调用控制。

## 应用场景

- 机器人竞赛或课程设计中的智能车综合控制平台
- 视觉循迹、色块抓取、机械臂联动的工程验证
- 多 MCU 分层控制架构演示
- 面试作品集中展示嵌入式、Qt 上位机、视觉算法和网络通信能力

## 核心功能

- Qt/C++ 上位机：实时视频显示、连接状态监控、键盘控制、模式切换、日志与仪表盘。
- ESP32-S3 网关：WiFi 接入、UDP 指令转发、串口桥接 STM32 与机械臂控制板、WebSocket/MCP 工具调用。
- STM32F103 底盘：四路电机驱动、速度档位、RGB 灯、蜂鸣器、串口指令解析。
- MaixVision 视觉端：TCP JPEG 视频流、UDP 模式切换、色块坐标和循迹黑线信息输出。
- 旧版 PyQt 上位机：保留为早期实现，用于对比和快速调试。

## 技术栈

- 嵌入式：ESP32-S3、STM32F103C8T6、Arduino Framework、PlatformIO
- 上位机：C++17、Qt Widgets、Qt Network、CMake
- 视觉端：MaixPy、TCP/UDP Socket、JPEG Stream、颜色阈值/黑线检测
- 通信协议：UDP 指令、TCP 视频流、TCP 坐标流、UART 串口桥接、WebSocket over TLS
- 控制算法：麦轮运动混控、视觉循迹 PID、色块对齐、自动拾取状态机

## 系统架构

```text
Qt/PyQt Dashboard
  | UDP command / ping
  v
ESP32-S3 WiFi Gateway
  | UART                  | UART
  v                       v
STM32F103 Chassis     Arm Servo Controller

MaixVision Camera
  | TCP JPEG stream
  | TCP color/line data
  | UDP mode command
  v
Qt Dashboard

MCP/WebSocket Service
  |
  v
ESP32-S3 -> Qt Dashboard -> Chassis / Arm / LED
```

## 硬件组成

- ESP32-S3 开发板：负责 WiFi、UDP、WebSocket、OLED 状态显示和串口桥接。
- STM32F103C8T6 Bluepill：负责底盘电机、RGB 灯和蜂鸣器。
- MaixVision/ MaixPy 摄像头：负责图像采集、色块检测、黑线识别和视频推流。
- 四轮麦克纳姆底盘：支持前后、横移和旋转。
- 机械臂与舵机控制板：通过串口接收动作组命令。

## 软件模块说明

```text
firmware/
  esp32-s3/       ESP32-S3 PlatformIO 工程，作为网络网关与 MCP 工具端
  stm32f103/      STM32F103 PlatformIO 工程，作为底盘执行控制器

software/
  qt-dashboard/   Qt/C++ 上位机主实现
  pyqt-dashboard/ 旧版 PyQt 上位机，便于调试和对照

vision/
  maixvision.py   MaixVision 视觉端脚本

tools/
  servo-config/   舵机动作组配置示例
```

## 快速启动

### 1. 配置 ESP32-S3 私密参数

```bash
cd firmware/esp32-s3/include
cp config.example.h config.h
```

编辑 `config.h`：

```cpp
#define WIFI_SSID "<YOUR_WIFI_SSID>"
#define WIFI_PASS "<YOUR_WIFI_PASSWORD>"
#define MCP_HOST "<YOUR_MCP_SERVER_HOST>"
#define MCP_PORT 443
#define MCP_PATH "/mcp/?token=<YOUR_API_TOKEN>"
```

`config.h` 已加入 `.gitignore`，不要提交真实 WiFi、Token 或服务器地址。

### 2. 编译 ESP32-S3 固件

```bash
cd firmware/esp32-s3
pio run
pio run --target upload
```

### 3. 编译 STM32F103 固件

```bash
cd firmware/stm32f103
pio run
pio run --target upload
```

### 4. 运行 MaixVision 视觉端

将 `vision/maixvision.py` 放入 MaixPy/MaixVision 环境运行。默认端口：

| 端口 | 协议 | 用途 |
|---|---|---|
| 9000 | TCP | JPEG 视频流 |
| 9001 | UDP | 模式切换控制 |
| 9002 | TCP | 色块/循迹坐标数据 |

### 5. 编译 Qt 上位机

```bash
cd software/qt-dashboard
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

Windows 可设置 `QT_DIR` 后运行：

```powershell
$env:QT_DIR="<YOUR_QT_INSTALL_DIR>"
.\build.ps1
```

启动上位机后，在界面中填写 ESP32 与 MaixVision 的实际设备地址。

## 配置说明

- ESP32-S3 私密配置：`firmware/esp32-s3/include/config.h`，由 `config.example.h` 复制生成。
- Qt 上位机地址：通过界面输入并保存在本机应用数据目录，不提交到仓库。
- `.env.example`：用于记录本地部署参数模板，真实 `.env` 已加入 `.gitignore`。
- 舵机动作组：`tools/servo-config/config.example.ini` 是公开示例，按实际机械结构调整后再部署。

## 运行效果

演示图片可放在 `images/`。当前保留了上位机 UI 预览图：

![Qt dashboard preview](images/ui-preview-final.png)

## 我的职责

- 设计 ESP32-S3、STM32、MaixVision 与桌面上位机之间的分层通信架构。
- 完成 Qt/C++ 上位机的 UI、网络线程、视频解码、状态监控与控制逻辑。
- 实现底盘串口协议、麦轮混控、速度档位、RGB 灯和蜂鸣器控制。
- 实现色块识别、视觉循迹、自动对齐和自动拾取流程。
- 完成 WiFi、UDP/TCP、WebSocket、UART 多链路联调，并整理可上传 GitHub 的安全配置方案。

## 遇到的问题与解决方案

- 视频流延迟：采用定长帧头、读取超时、帧率节流和旧帧丢弃策略，保证上位机显示稳定。
- 多线程 UI 更新：Qt 网络线程通过 signal/slot 向主线程传递图像、日志和连接状态，避免 UI 阻塞。
- 设备地址变化：上位机不再硬编码地址，改为启动后手动输入并本地保存。
- 私密配置泄漏风险：WiFi、Token、MCP 地址全部移入 `config.h`，仓库只保留模板。
- 麦轮方向不一致：STM32 固件保留 `motor_dir` 校正数组，便于现场调试。

## 后续优化方向

- 为 Qt 上位机增加配置导入/导出功能。
- 将端口、PID 和舵机参数进一步抽象为配置文件。
- 增加硬件在环测试脚本和通信协议自动化测试。
- 将视觉阈值调参界面化，支持保存多套场景参数。
- 补充 RViz/Gazebo 或数字孪生仿真视图，用于离线演示。
