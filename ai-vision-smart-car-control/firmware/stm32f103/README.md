# STM32F103 Firmware

STM32F103 负责底盘执行控制，包括四轮电机、RGB LED 和蜂鸣器。

## Build

```bash
pio run
pio run --target upload
```

## Debug Notes

如果某个轮子方向反了，修改 `src/STM32_CAR.cpp` 中的 `motor_dir[4]`。
