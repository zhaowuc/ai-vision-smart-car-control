# 通信协议

## 端口定义

| 名称 | 端口 | 协议 | 说明 |
|---|---:|---|---|
| VIDEO_PORT | 9000 | TCP | MaixVision JPEG 视频流 |
| CTRL_PORT | 9001 | UDP | MaixVision 模式切换 |
| COLOR_PORT | 9002 | TCP | 色块/循迹数据 |
| ESP32_UDP_PORT | 6000 | UDP | 上位机到 ESP32 指令 |
| GUI_CMD_PORT | 6001 | UDP | ESP32 到上位机指令 |

端口本身不是敏感信息，可按实际网络环境修改。

## UDP 指令

| 指令 | 说明 |
|---|---|
| `S <mode>` | 切换速度档位 |
| `DRV <lf> <rf> <lr> <rr>` | 四轮方向控制 |
| `STM LED <r> <g> <b>` | 设置 STM32 RGB 灯 |
| `ARM <servo-command>` | 转发机械臂动作组 |
| `GUIREG <port>` | 上位机注册命令监听端口 |
| `PING <timestamp>` | 链路检测 |

## MaixVision 数据

色块数据：

```text
COLORS Red,120,80,3000|Blue,90,70,1800
COLORS NONE
```

循迹数据：

```text
LINE bcx bcy bl br mcx mcy ml mr tcx tcy tl tr bf mf tf
```

## 私密配置

WiFi、MCP Host、MCP Token 不属于协议定义，必须放入 `config.h` 或本地环境配置，不得提交到 GitHub。
