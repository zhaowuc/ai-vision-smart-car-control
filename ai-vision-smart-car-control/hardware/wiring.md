# Wiring

## ESP32-S3

| 功能 | 引脚 |
|---|---|
| STM32 UART RX | GPIO 2 |
| STM32 UART TX | GPIO 1 |
| Arm UART RX | GPIO 20 |
| Arm UART TX | GPIO 19 |
| OLED SDA | GPIO 36 |
| OLED SCL | GPIO 35 |
| OLED I2C 地址 | 0x3C |

## STM32F103C8T6

| 功能 | 引脚 |
|---|---|
| M1 PWM / IN1 / IN2 | PA0 / PA6 / PA5 |
| M2 PWM / IN1 / IN2 | PA1 / PB0 / PB1 |
| M3 PWM / IN1 / IN2 | PA2 / PB12 / PB13 |
| M4 PWM / IN1 / IN2 | PA3 / PB14 / PB15 |
| TB6612 STBY1 / STBY2 | PA4 / PB11 |
| RGB LED | PB8 |
| Buzzer | PA15 |

接线前请结合实际驱动板、电源和电机方向复核。
