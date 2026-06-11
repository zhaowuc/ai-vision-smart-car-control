# SmartCar Qt Dashboard

Qt/C++ 上位机主实现，负责视频显示、键盘控制、模式切换、色块对齐、视觉循迹和设备状态监控。

## Build

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

Windows 可设置 Qt 路径后运行：

```powershell
$env:QT_DIR="<YOUR_QT_INSTALL_DIR>"
.\build.ps1
```

## Configuration

设备地址不在源码中硬编码。启动后在界面输入：

- ESP32 地址：`<YOUR_DEVICE_IP>`
- MaixVision 地址：`<YOUR_CAMERA_IP>`

地址会保存在本机应用数据目录，不应提交到 GitHub。
