# 安全审查报告

## 项目

- 原始路径：`D:\AI_CAR\AI_CAR`
- 备份路径：`D:\AI_CAR\AI_CAR_backup_before_github_clean`
- GitHub-ready 路径：`D:\GITHUBCANGKU\ai-vision-smart-car-control`
- 审查日期：2026-06-11

## 扫描范围

已扫描目标仓库中的文本源码和配置文件：

- C/C++：`.cpp`, `.c`, `.h`, `.hpp`
- Python：`.py`
- 配置与脚本：`.ini`, `.json`, `.yaml`, `.yml`, `.ps1`, `.bat`, `.conf`, `.properties`
- 文档：`.md`, `.txt`, `README`, `.gitignore`

未纳入 GitHub 仓库的内容：

- `.pio/` PlatformIO 构建缓存
- `build/` Qt 构建目录、exe、dll、obj、CMake 中间文件
- `__pycache__/` 与 `.pyc`
- 临时压缩备份文件

## 发现的敏感信息类型

| 类型 | 原始位置 | 处理结果 |
|---|---|---|
| WiFi SSID | 原始 `AI-CAR_ESP32-S3/src/ESP32_CAR.cpp:12` | 移入 `config.h`，仓库仅保留 `<YOUR_WIFI_SSID>` |
| WiFi 密码 | 原始 `AI-CAR_ESP32-S3/src/ESP32_CAR.cpp:13` | 移入 `config.h`，仓库仅保留 `<YOUR_WIFI_PASSWORD>` |
| MCP Host | 原始 `AI-CAR_ESP32-S3/src/ESP32_CAR.cpp:31` | 改为 `MCP_HOST`，在模板中使用 `<YOUR_MCP_SERVER_HOST>` |
| MCP Token/JWT | 原始 `AI-CAR_ESP32-S3/src/ESP32_CAR.cpp:33` | 改为 `MCP_PATH`，在模板中使用 `<YOUR_API_TOKEN>` |
| 上位机默认 ESP32 IP | 原始 `smartcar/src/settings.cpp:27,71` | 默认值清空，界面使用 `<YOUR_DEVICE_IP>` 占位提示 |
| 上位机默认摄像头 IP | 原始 `smartcar/src/settings.cpp:28,74` | 默认值清空，界面使用 `<YOUR_CAMERA_IP>` 占位提示 |
| PyQt 旧版默认设备 IP | 原始 `project/app/ui/main_window.py:75,79` | 默认值清空，界面使用占位提示 |
| 本机 Qt 安装路径 | 原始 `smartcar/README.md` 与 `smartcar/build.ps1` | README 重写，脚本改为读取环境变量 |

## 已替换或标准化的配置

- 新增 `firmware/esp32-s3/include/config.example.h`。
- 新增根目录 `config.example.h`，便于 GitHub 页面快速看到配置模板。
- ESP32 固件改为 `#include "config.h"`，真实 WiFi 和 MCP token 不进入仓库。
- Qt 上位机不再硬编码设备地址，启动后由用户输入。
- PyQt 旧版上位机不再硬编码设备地址。
- 构建脚本不再包含本机绝对路径。
- 舵机动作配置以 `tools/servo-config/config.example.ini` 形式保留。

## `.gitignore` 保护项

已加入以下敏感或生成文件规则：

- `.env`, `*.env`
- `config.h`, `private.h`, `private.yaml`
- `secrets.*`, `credentials.*`, `token.*`
- `*.key`, `*.pem`
- `*.log`
- `__pycache__/`, `.vscode/`, `.idea/`, `.cache/`
- `build/`, `dist/`, `install/`, `log/`
- `.pio/`, `Debug/`, `Release/`
- `*.hex`, `*.bin`, `*.elf`, `*.map`, `*.axf`
- `*.bag`, `*.db3`

## 复扫结果

已在目标仓库中复扫：

- IPv4 地址：未发现真实 IPv4。
- 原 MCP 服务域名：未发现真实域名残留。
- 原 WiFi SSID：未发现。
- 原 WiFi 密码片段：未发现。
- Windows 或 Linux/macOS 用户目录绝对路径：未发现。
- `.env`、`config.h`、`.pem`、`.key`、`.bin`、`.elf`、`.exe`、`.dll`、`.pyc`、`.zip`：未发现实际待上传文件。

仍会命中的关键词均为安全占位符、说明文字、`.gitignore` 规则或代码语言关键字：

| 文件 | 行号 | 说明 |
|---|---:|---|
| `.gitignore` | 1-9 | 私密配置忽略规则 |
| `config.example.h` | 6-11 | `<YOUR_WIFI_SSID>`, `<YOUR_WIFI_PASSWORD>`, `<YOUR_API_TOKEN>` 占位符 |
| `firmware/esp32-s3/include/config.example.h` | 6-11 | 同上，占位符 |
| `README.md` | 92-99 | 配置示例说明 |
| `docs/problem-solving.md` | 29 | 安全问题说明 |
| `firmware/esp32-s3/src/ESP32_CAR.cpp` | 567 | `WiFi.begin(WIFI_SSID, WIFI_PASS)` 使用模板配置变量 |
| `software/qt-dashboard/src/*.h` | 多处 | C++ `private:` 访问控制关键字，不是隐私数据 |

## 上传前建议人工复查

- `firmware/esp32-s3/include/config.example.h`
- `config.example.h`
- `tools/servo-config/config.example.ini`
- `README.md`
- `software/qt-dashboard/build.ps1`

结论：目标仓库未发现真实 Token、真实密码、真实 WiFi、真实公网/内网设备 IP 或个人绝对路径残留，可以作为 GitHub 上传候选版本。
