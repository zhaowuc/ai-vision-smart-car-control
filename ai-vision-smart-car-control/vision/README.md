# MaixVision Script

`maixvision.py` 运行在 MaixPy/MaixVision 环境中，负责视频流、色块检测和视觉循迹数据输出。

## Ports

- TCP 9000：JPEG 视频流
- UDP 9001：模式控制
- TCP 9002：色块和循迹坐标

如需修改端口，请同步更新上位机和 ESP32 相关常量。
