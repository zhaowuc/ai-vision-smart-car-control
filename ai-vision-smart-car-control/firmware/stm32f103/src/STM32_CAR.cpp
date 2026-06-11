#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

// =========================
// Motor pins
// 顺序固定:
// M1 = 左前
// M2 = 右前
// M3 = 左后
// M4 = 右后
// =========================

#define M1_PWM PA0
#define M1_IN1 PA6
#define M1_IN2 PA5

#define M2_PWM PA1
#define M2_IN1 PB0
#define M2_IN2 PB1
#define STBY1  PA4

#define M3_PWM PA2
#define M3_IN1 PB12
#define M3_IN2 PB13

#define M4_PWM PA3
#define M4_IN1 PB14
#define M4_IN2 PB15
#define STBY2  PB11

// =========================
// RGB LED
// =========================

#define LED_PIN   PB8
#define LED_COUNT 3
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// =========================
// Buzzer
// =========================

#define BUZZER_PIN PA15

// =========================
// Speed presets
// =========================

int SPEED_LOW   = 100;
int SPEED_HIGH  = 200;
int SPEED_MICRO = 60;
int SPEED_MED   = 160;
int currentSpeed = SPEED_LOW;

// =========================
// 电机方向校正
// 顺序:
// [左前, 右前, 左后, 右后]
//
// 默认先都设为 1。
// 如果某个轮子方向反了，把对应位置改成 -1。
// 例如左前反了:
// {-1, 1, 1, 1}
// =========================

int motor_dir[4] = { 1, 1, 1, 1 };

// =========================
// LED current color cache
// =========================

uint8_t led_r = 255, led_g = 255, led_b = 255;

// =========================
// Helpers
// =========================

void motorWrite(int pwmPin, int in1, int in2, int dir) {
  if (dir > 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, LOW);
    analogWrite(pwmPin, currentSpeed);
  } else if (dir < 0) {
    digitalWrite(in1, LOW);
    digitalWrite(in2, HIGH);
    analogWrite(pwmPin, currentSpeed);
  } else {
    // TB6612 short brake
    digitalWrite(in1, HIGH);
    digitalWrite(in2, HIGH);
    analogWrite(pwmPin, 0);
  }
}

void setLED(uint8_t r, uint8_t g, uint8_t b) {
  for (int i = 0; i < LED_COUNT; i++) {
    strip.setPixelColor(i, strip.Color(r, g, b));
  }
  strip.show();
}

void driveRaw(int lf, int rf, int lr, int rr) {
  motorWrite(M1_PWM, M1_IN1, M1_IN2, lf * motor_dir[0]);
  motorWrite(M2_PWM, M2_IN1, M2_IN2, rf * motor_dir[1]);
  motorWrite(M3_PWM, M3_IN1, M3_IN2, lr * motor_dir[2]);
  motorWrite(M4_PWM, M4_IN1, M4_IN2, rr * motor_dir[3]);
}

void stopAllMotors() {
  driveRaw(0, 0, 0, 0);
}

// 调试用：串口打印当前四轮命令
void debugDrive(int lf, int rf, int lr, int rr) {
  Serial.print("[DRV] LF=");
  Serial.print(lf);
  Serial.print(" RF=");
  Serial.print(rf);
  Serial.print(" LR=");
  Serial.print(lr);
  Serial.print(" RR=");
  Serial.println(rr);
}

// =========================
// Setup
// =========================

void setup() {
  Serial.begin(115200);

  pinMode(M1_IN1, OUTPUT); pinMode(M1_IN2, OUTPUT); pinMode(M1_PWM, OUTPUT);
  pinMode(M2_IN1, OUTPUT); pinMode(M2_IN2, OUTPUT); pinMode(M2_PWM, OUTPUT);
  pinMode(M3_IN1, OUTPUT); pinMode(M3_IN2, OUTPUT); pinMode(M3_PWM, OUTPUT);
  pinMode(M4_IN1, OUTPUT); pinMode(M4_IN2, OUTPUT); pinMode(M4_PWM, OUTPUT);

  pinMode(STBY1, OUTPUT);
  pinMode(STBY2, OUTPUT);
  digitalWrite(STBY1, HIGH);
  digitalWrite(STBY2, HIGH);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  strip.begin();
  strip.show();
  setLED(255, 255, 255);

  stopAllMotors();

  Serial.println("[STM32] Ready");
  Serial.println("[STM32] Motor order: M1=LF, M2=RF, M3=LR, M4=RR");
}

// =========================
// Main loop
// 支持命令:
// S mode
// LED r g b
// BEEP x
// DRV m1 m2 m3 m4
// =========================

void loop() {
  if (!Serial.available()) {
    return;
  }

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd.length() == 0) {
    return;
  }

  // -------------------------
  // Speed mode
  // -------------------------
  if (cmd.startsWith("S ")) {
    int mode = cmd.substring(2).toInt();

    if (mode == 1) currentSpeed = SPEED_HIGH;
    else if (mode == 2) currentSpeed = SPEED_MICRO;
    else if (mode == 3) currentSpeed = SPEED_MED;
    else currentSpeed = SPEED_LOW;

    Serial.print("[SPEED] mode=");
    Serial.print(mode);
    Serial.print(" pwm=");
    Serial.println(currentSpeed);
    return;
  }

  // -------------------------
  // LED
  // -------------------------
  if (cmd.startsWith("LED ")) {
    int r, g, b;
    if (sscanf(cmd.c_str(), "LED %d %d %d", &r, &g, &b) == 3) {
      led_r = (uint8_t)r;
      led_g = (uint8_t)g;
      led_b = (uint8_t)b;
      setLED(led_r, led_g, led_b);

      Serial.print("[LED] ");
      Serial.print(led_r);
      Serial.print(",");
      Serial.print(led_g);
      Serial.print(",");
      Serial.println(led_b);
    }
    return;
  }

  // -------------------------
  // Buzzer
  // -------------------------
  if (cmd.startsWith("BEEP")) {
    int v = cmd.substring(5).toInt();
    digitalWrite(BUZZER_PIN, v ? HIGH : LOW);

    Serial.print("[BEEP] ");
    Serial.println(v ? "ON" : "OFF");
    return;
  }

  // -------------------------
  // Drive:
  // DRV lf rf lr rr
  // 顺序必须匹配 gui.py
  // [左前, 右前, 左后, 右后]
  // -------------------------
  if (cmd.startsWith("DRV")) {
    int lf, rf, lr, rr;
    if (sscanf(cmd.c_str(), "DRV %d %d %d %d", &lf, &rf, &lr, &rr) == 4) {
      debugDrive(lf, rf, lr, rr);
      driveRaw(lf, rf, lr, rr);
    }
    return;
  }
}