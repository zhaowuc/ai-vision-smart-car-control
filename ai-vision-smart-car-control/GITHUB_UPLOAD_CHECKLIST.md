# GitHub 上传前检查清单

| 检查项 | 状态 |
|---|---|
| README 是否完整 | 已完成 |
| 是否存在真实 IP | 未发现 |
| 是否存在真实 token | 未发现 |
| 是否存在 MQTT 密码 | 未发现 MQTT 配置 |
| 是否存在 WiFi 密码 | 已替换为 `<YOUR_WIFI_PASSWORD>` |
| 是否存在数据库密码 | 未发现 |
| 是否存在私人路径 | 未发现 |
| 是否能正常编译/运行 | 未在当前环境完整编译，需接入 Qt、PlatformIO 与硬件后验证 |
| 是否已添加 `.gitignore` | 已完成 |
| 是否禁止上传 `build/`、`install/`、`log/`、`.env`、`config.h` | 已完成 |
| 是否生成 `config.example.h` | 已完成 |
| 是否生成安全审查报告 | 已完成 |
| 是否生成最终评审文件 | 已完成 |

## 上传前手动操作

1. 不要提交真实 `firmware/esp32-s3/include/config.h`。
2. 不要提交真实 `.env`。
3. 接入硬件后分别验证 ESP32、STM32、MaixVision 和 Qt 上位机。
4. 若新增截图，请确认截图中没有真实设备地址、姓名、账号或路径。
