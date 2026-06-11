# ESP32-S3 Firmware

ESP32-S3 作为网络网关运行，负责 WiFi、UDP 指令、串口桥接、OLED 状态显示和 MCP/WebSocket 工具调用。

## Private Config

```bash
cd include
cp config.example.h config.h
```

在 `config.h` 中填写：

- `WIFI_SSID`
- `WIFI_PASS`
- `MCP_HOST`
- `MCP_PORT`
- `MCP_PATH`

`config.h` 不要提交到 GitHub。

## Build

```bash
pio run
pio run --target upload
```
