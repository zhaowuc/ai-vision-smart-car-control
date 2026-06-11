#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <deque>
#include <vector>
#include <algorithm>
#include "config.h"

WiFiUDP Udp;
const uint16_t UDP_PORT = 6000;
const uint16_t GUI_CMD_PORT = 6001;

#define STM32_RX 2
#define STM32_TX 1

#define ARM_RX 20
#define ARM_TX 19
#define ARM_BAUD 115200

#define OLED_SDA 36
#define OLED_SCL 35
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(128, 64, &Wire, -1);

const char* mcpHost = MCP_HOST;
const uint16_t mcpPort = MCP_PORT;
const char* mcpPath = MCP_PATH;

WebSocketsClient webSocket;
bool mcpConnected = false;

IPAddress guiIp;
uint16_t guiPort = 0;

IPAddress DNS1(8, 8, 8, 8);
IPAddress DNS2(1, 1, 1, 1);
IPAddress mcpIp;
uint32_t lastMcpTry = 0;
uint32_t lastGuiReq = 0;

const int MS_PER_METER = 1000;
const int MAX_MOVE_MS = 8000;

struct MoveAction {
  String cmd;
  uint32_t wait_ms;
};

std::deque<MoveAction> moveQueue;
uint32_t nextMoveAt = 0;
SemaphoreHandle_t moveMutex;

void sendGuiCmd(const String &cmd) {
  if (guiPort == 0) {
    Serial.println("[GUI] 未注册，无法发送命令");
    return;
  }
  Udp.beginPacket(guiIp, guiPort);
  Udp.print(cmd);
  Udp.endPacket();
  Serial.println("[GUI] CMD -> " + cmd);
}

void bindGuiFromPacket() {
  if (guiPort == 0) {
    guiIp = Udp.remoteIP();
    guiPort = GUI_CMD_PORT;
    Udp.beginPacket(guiIp, guiPort);
    Udp.print("GUIOK");
    Udp.endPacket();
    Serial.println("[GUI] 自动绑定 GUI IP/端口");
  }
}

void sendGuiReq() {
  if (guiPort != 0) return;
  if (millis() - lastGuiReq < 3000) return;
  lastGuiReq = millis();
  IPAddress broadcastIp(255, 255, 255, 255);
  Udp.beginPacket(broadcastIp, GUI_CMD_PORT);
  Udp.print("GUIREQ");
  Udp.endPacket();
  Serial.println("[GUI] 广播 GUIREQ");
}

void oledShowStatus() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("IP: ");
  display.println(WiFi.localIP());
  display.setCursor(0, 16);
  display.print("MCP: ");
  display.println(mcpConnected ? "OK" : "--");
  display.display();
}

void sendJsonResult(int callId) {
  DynamicJsonDocument doc(256);
  doc["jsonrpc"] = "2.0";
  doc["id"] = callId;
  JsonObject result = doc.createNestedObject("result");
  result.createNestedArray("content");
  String resp;
  serializeJson(doc, resp);
  webSocket.sendTXT(resp);
}

float parseChineseNumber(const String &s) {
  if (s.indexOf("十") >= 0) {
    int tens = 1;
    int ones = 0;

    if (s.indexOf("二") >= 0 || s.indexOf("两") >= 0) tens = 2;
    else if (s.indexOf("三") >= 0) tens = 3;
    else if (s.indexOf("四") >= 0) tens = 4;
    else if (s.indexOf("五") >= 0) tens = 5;
    else if (s.indexOf("六") >= 0) tens = 6;
    else if (s.indexOf("七") >= 0) tens = 7;
    else if (s.indexOf("八") >= 0) tens = 8;
    else if (s.indexOf("九") >= 0) tens = 9;

    if (s.indexOf("一") >= 0) ones = 1;
    else if (s.indexOf("二") >= 0 || s.indexOf("两") >= 0) ones = 2;
    else if (s.indexOf("三") >= 0) ones = 3;
    else if (s.indexOf("四") >= 0) ones = 4;
    else if (s.indexOf("五") >= 0) ones = 5;
    else if (s.indexOf("六") >= 0) ones = 6;
    else if (s.indexOf("七") >= 0) ones = 7;
    else if (s.indexOf("八") >= 0) ones = 8;
    else if (s.indexOf("九") >= 0) ones = 9;

    return tens * 10 + ones;
  }

  if (s.indexOf("半") >= 0) return 0.5;
  if (s.indexOf("一") >= 0) return 1;
  if (s.indexOf("二") >= 0 || s.indexOf("两") >= 0) return 2;
  if (s.indexOf("三") >= 0) return 3;
  if (s.indexOf("四") >= 0) return 4;
  if (s.indexOf("五") >= 0) return 5;
  if (s.indexOf("六") >= 0) return 6;
  if (s.indexOf("七") >= 0) return 7;
  if (s.indexOf("八") >= 0) return 8;
  if (s.indexOf("九") >= 0) return 9;

  return -1;
}

float parseMeters(const String &text) {
  String num = "";
  for (int i = 0; i < text.length(); i++) {
    char c = text.charAt(i);
    if ((c >= '0' && c <= '9') || c == '.') {
      num += c;
    }
  }
  if (num.length() > 0) return num.toFloat();

  float cn = parseChineseNumber(text);
  if (cn > 0) return cn;

  return 1.0;
}

bool hasDistanceHint(const String &text) {
  for (int i = 0; i < text.length(); i++) {
    char c = text.charAt(i);
    if ((c >= '0' && c <= '9') || c == '.') return true;
  }
  if (text.indexOf("米") >= 0) return true;
  if (text.indexOf("一") >= 0 || text.indexOf("二") >= 0 || text.indexOf("三") >= 0 ||
      text.indexOf("四") >= 0 || text.indexOf("五") >= 0 || text.indexOf("六") >= 0 ||
      text.indexOf("七") >= 0 || text.indexOf("八") >= 0 || text.indexOf("九") >= 0 ||
      text.indexOf("十") >= 0 || text.indexOf("半") >= 0) return true;
  return false;
}

void enqueueMove(const String &direction, int duration) {
  String cmd = "CMD MOVE " + direction + " " + String(duration);
  if (moveMutex && xSemaphoreTake(moveMutex, pdMS_TO_TICKS(50))) {
    moveQueue.push_back({cmd, (uint32_t)duration + 2000});
    xSemaphoreGive(moveMutex);
  }
}

void processMoveQueue() {
  if (!moveMutex) return;
  if (xSemaphoreTake(moveMutex, pdMS_TO_TICKS(10))) {
    if (!moveQueue.empty()) {
      uint32_t now = millis();
      if (now >= nextMoveAt) {
        MoveAction act = moveQueue.front();
        moveQueue.pop_front();
        sendGuiCmd(act.cmd);
        nextMoveAt = now + act.wait_ms;
      }
    }
    xSemaphoreGive(moveMutex);
  }
}

std::vector<String> splitVoiceSegments(const String &input) {
  String s = input;
  s.replace("，", ",");
  s.replace("。", ",");
  s.replace("然后", ",");
  s.replace("再", ",");
  s.replace("接着", ",");
  s.replace("并且", ",");
  s.replace("以及", ",");

  std::vector<String> parts;
  if (s.indexOf(",") >= 0) {
    int start = 0;
    while (start < s.length()) {
      int idx = s.indexOf(",", start);
      String seg = (idx < 0) ? s.substring(start) : s.substring(start, idx);
      seg.trim();
      if (seg.length() > 0) parts.push_back(seg);
      if (idx < 0) break;
      start = idx + 1;
    }
    return parts;
  }

  const char* keys[] = {"向前", "前进", "往前", "直行", "向后", "后退", "往后", "向左", "左移", "左转", "向右", "右移", "右转"};
  std::vector<int> pos;
  for (auto k : keys) {
    int start = 0;
    while (true) {
      int idx = s.indexOf(k, start);
      if (idx < 0) break;
      pos.push_back(idx);
      start = idx + strlen(k);
    }
  }
  if (pos.empty()) {
    parts.push_back(s);
    return parts;
  }
  std::sort(pos.begin(), pos.end());
  pos.erase(std::unique(pos.begin(), pos.end()), pos.end());

  for (size_t i = 0; i < pos.size(); i++) {
    int start = pos[i];
    int end = (i + 1 < pos.size()) ? pos[i + 1] : s.length();
    String seg = s.substring(start, end);
    seg.trim();
    if (seg.length() > 0) parts.push_back(seg);
  }
  return parts;
}

void handleVoiceCommand(const String &text, int callId) {
  String cmd = text;
  cmd.trim();

  if (cmd.indexOf("自动拾取") >= 0) {
    sendGuiCmd("CMD AUTOPICK START VOICE");
    sendJsonResult(callId);
    return;
  }
  if (cmd.indexOf("停止自动拾取") >= 0) {
    sendGuiCmd("CMD AUTOPICK STOP VOICE");
    sendJsonResult(callId);
    return;
  }
  if (cmd.indexOf("停") >= 0) {
    if (moveMutex && xSemaphoreTake(moveMutex, pdMS_TO_TICKS(50))) {
      moveQueue.clear();
      xSemaphoreGive(moveMutex);
    }
    sendGuiCmd("CMD MOVE STOP");
    sendJsonResult(callId);
    return;
  }

  std::vector<String> segments = splitVoiceSegments(cmd);
  for (auto &seg : segments) {
    int duration = 1000;
    if (hasDistanceHint(seg)) {
      float meters = parseMeters(seg);
      duration = (int)(meters * MS_PER_METER);
    }
    if (duration < 200) duration = 200;
    if (duration > MAX_MOVE_MS) duration = MAX_MOVE_MS;

    if (seg.indexOf("向前") >= 0 || seg.indexOf("前进") >= 0 || seg.indexOf("往前") >= 0 || seg.indexOf("直行") >= 0) {
      enqueueMove("FWD", duration);
    } else if (seg.indexOf("向后") >= 0 || seg.indexOf("后退") >= 0 || seg.indexOf("往后") >= 0) {
      enqueueMove("BACK", duration);
    } else if (seg.indexOf("向左") >= 0 || seg.indexOf("左移") >= 0 || seg.indexOf("左转") >= 0) {
      enqueueMove("LEFT", duration);
    } else if (seg.indexOf("向右") >= 0 || seg.indexOf("右移") >= 0 || seg.indexOf("右转") >= 0) {
      enqueueMove("RIGHT", duration);
    }
  }

  sendJsonResult(callId);
}

void executeWave(int callId) {
  sendGuiCmd("CMD ARM WAVE");
  sendJsonResult(callId);
}

void executeToolCmd(const char* cmd, int callId) {
  sendGuiCmd(cmd);
  sendJsonResult(callId);
}

JsonVariant getArgs(DynamicJsonDocument &doc) {
  if (doc["params"].containsKey("arguments")) return doc["params"]["arguments"];
  if (doc["params"].containsKey("input")) return doc["params"]["input"];
  if (doc["params"].containsKey("args")) return doc["params"]["args"];
  return JsonVariant();
}

void tryConnectMcp() {
  if (millis() - lastMcpTry < 5000) return;
  lastMcpTry = millis();
  if (WiFi.hostByName(mcpHost, mcpIp)) {
    webSocket.beginSSL(mcpHost, mcpPort, mcpPath);
  }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      mcpConnected = false;
      break;
    case WStype_CONNECTED:
      mcpConnected = true;
      break;
    case WStype_TEXT: {
      DynamicJsonDocument doc(2048);
      DeserializationError error = deserializeJson(doc, payload, length);
      if (error) return;

      const char* method = doc["method"];
      int id = doc["id"] | -1;

      if (method && strcmp(method, "initialize") == 0) {
        DynamicJsonDocument response(512);
        response["jsonrpc"] = "2.0";
        response["id"] = id;
        JsonObject result = response.createNestedObject("result");
        result["protocolVersion"] = "2024-11-05";
        JsonObject capabilities = result.createNestedObject("capabilities");
        capabilities["tools"] = true;
        capabilities["sampling"] = JsonObject();
        JsonObject serverInfo = result.createNestedObject("serverInfo");
        serverInfo["name"] = "esp32-s3-mcp";
        serverInfo["version"] = "1.0.0";
        String resp;
        serializeJson(response, resp);
        webSocket.sendTXT(resp);
        return;
      }

      if (method && strcmp(method, "tools/list") == 0) {
        DynamicJsonDocument response(4096);
        response["jsonrpc"] = "2.0";
        response["id"] = id;
        JsonObject result = response.createNestedObject("result");
        JsonArray tools = result.createNestedArray("tools");

        auto addTool = [&](const char* name, const char* desc, bool withRGB=false, bool withText=false) {
          JsonObject tool = tools.createNestedObject();
          tool["name"] = name;
          tool["description"] = desc;
          JsonObject schema = tool.createNestedObject("inputSchema");
          schema["type"] = "object";
          JsonObject props = schema.createNestedObject("properties");
          if (withRGB) {
            JsonObject r = props.createNestedObject("r");
            r["type"] = "integer";
            JsonObject g = props.createNestedObject("g");
            g["type"] = "integer";
            JsonObject b = props.createNestedObject("b");
            b["type"] = "integer";
            JsonArray req = schema.createNestedArray("required");
            req.add("r"); req.add("g"); req.add("b");
          } else if (withText) {
            JsonObject t = props.createNestedObject("text");
            t["type"] = "string";
            JsonArray req = schema.createNestedArray("required");
            req.add("text");
          } else {
            schema.createNestedArray("required");
          }
        };

        addTool("向前移动", "向前移动");
        addTool("向后移动", "向后移动");
        addTool("向左移动", "向左移动");
        addTool("向右移动", "向右移动");
        addTool("停止移动", "停止移动");
        addTool("机械臂抓取", "机械臂向前抓取");
        addTool("机械臂挥手", "机械臂挥手");
        addTool("打开灯光", "打开LED白光");
        addTool("关闭灯光", "关闭LED");
        addTool("设置灯光颜色", "设置LED颜色", true);
        addTool("启动循迹", "开启循迹模式");
        addTool("停止循迹", "停止循迹模式");
        addTool("启动自动拾取", "开启自动拾取");
        addTool("停止自动拾取", "停止自动拾取");
        addTool("切换自由模式", "切换到自由模式");
        addTool("切换色块识别", "切换到色块识别模式");
        addTool("语音指令", "执行书面语指令，如：向前移动1米向右移动2米", false, true);

        addTool("car_forward", "Move forward");
        addTool("car_backward", "Move backward");
        addTool("car_stop", "Stop");
        addTool("arm_grab", "Arm grab");
        addTool("arm_wave", "Arm wave");
        addTool("led_on", "LED on");
        addTool("led_off", "LED off");
        addTool("led_color", "Set LED color", true);
        addTool("line_track_start", "Start line");
        addTool("line_track_stop", "Stop line");
        addTool("color_pick_start", "Start pick");
        addTool("color_pick_stop", "Stop pick");
        addTool("mode_stream", "Mode stream");
        addTool("mode_color", "Mode color");
        addTool("voice_command", "Voice command", false, true);

        String resp;
        serializeJson(response, resp);
        webSocket.sendTXT(resp);
        return;
      }

      if (method && strcmp(method, "tools/call") == 0) {
        const char* toolName = doc["params"]["name"];
        JsonVariant args = getArgs(doc);

        if (!toolName) return;
        String tn = String(toolName);

        if (tn == "向前移动" || tn == "car_forward") executeToolCmd("CMD MOVE FWD", id);
        else if (tn == "向后移动" || tn == "car_backward") executeToolCmd("CMD MOVE BACK", id);
        else if (tn == "向左移动") executeToolCmd("CMD MOVE LEFT", id);
        else if (tn == "向右移动") executeToolCmd("CMD MOVE RIGHT", id);
        else if (tn == "停止移动" || tn == "car_stop") executeToolCmd("CMD MOVE STOP", id);
        else if (tn == "机械臂抓取" || tn == "arm_grab") executeToolCmd("CMD ARM GRAB", id);
        else if (tn == "机械臂挥手" || tn == "arm_wave") executeWave(id);
        else if (tn == "打开灯光" || tn == "led_on") executeToolCmd("CMD LED 255 255 255", id);
        else if (tn == "关闭灯光" || tn == "led_off") executeToolCmd("CMD LED OFF", id);
        else if (tn == "设置灯光颜色" || tn == "led_color") {
          int r = args["r"] | 0;
          int g = args["g"] | 0;
          int b = args["b"] | 0;
          String cmd = "CMD LED " + String(r) + " " + String(g) + " " + String(b);
          executeToolCmd(cmd.c_str(), id);
        }
        else if (tn == "启动循迹" || tn == "line_track_start") executeToolCmd("CMD LINE START", id);
        else if (tn == "停止循迹" || tn == "line_track_stop") executeToolCmd("CMD LINE STOP", id);
        else if (tn == "启动自动拾取" || tn == "color_pick_start") executeToolCmd("CMD AUTOPICK START VOICE", id);
        else if (tn == "停止自动拾取" || tn == "color_pick_stop") executeToolCmd("CMD AUTOPICK STOP VOICE", id);
        else if (tn == "切换自由模式" || tn == "mode_stream") executeToolCmd("CMD MODE STREAM", id);
        else if (tn == "切换色块识别" || tn == "mode_color") executeToolCmd("CMD MODE COLOR", id);
        else if (tn == "语音指令" || tn == "voice_command") {
          const char* text = args["text"] | "";
          handleVoiceCommand(String(text), id);
        } else {
          DynamicJsonDocument err(256);
          err["jsonrpc"] = "2.0";
          err["id"] = id;
          err["error"]["code"] = -32601;
          err["error"]["message"] = "Tool not found";
          String errStr;
          serializeJson(err, errStr);
          webSocket.sendTXT(errStr);
        }
      }
    } break;
    default: break;
  }
}

void taskMcp(void* pv) {
  while (true) {
    webSocket.loop();
    if (!mcpConnected) {
      tryConnectMcp();
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void taskUdp(void* pv) {
  while (true) {
    int packetSize = Udp.parsePacket();
    if (packetSize > 0) {
      char buf[256];
      int len = Udp.read(buf, sizeof(buf) - 1);
      if (len > 0) {
        buf[len] = '\0';
        bindGuiFromPacket();

        if (strncmp(buf, "GUIREG", 6) == 0) {
          guiIp = Udp.remoteIP();
          guiPort = atoi(buf + 7);
          Udp.beginPacket(guiIp, guiPort);
          Udp.print("GUIOK");
          Udp.endPacket();
        }

        if (strncmp(buf, "PING ", 5) == 0) {
          int rssi = WiFi.RSSI();
          Udp.beginPacket(Udp.remoteIP(), Udp.remotePort());
          Udp.printf("PONG %s %d", buf + 5, rssi);
          Udp.endPacket();
          continue;
        }

        if (strncmp(buf, "ARM ", 4) == 0) {
          Serial2.print(buf + 4);
          continue;
        }

        if (strncmp(buf, "STM ", 4) == 0) {
          Serial1.println(buf + 4);
          continue;
        }

        Serial1.println(buf);
      }
    }
    sendGuiReq();
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

void taskMove(void* pv) {
  while (true) {
    processMoveQueue();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void taskOled(void* pv) {
  while (true) {
    oledShowStatus();
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

void setup() {
  Serial.begin(115200);

  Serial1.begin(115200, SERIAL_8N1, STM32_RX, STM32_TX);
  Serial2.begin(ARM_BAUD, SERIAL_8N1, ARM_RX, ARM_TX);

  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, DNS1, DNS2);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.setSleep(false);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  Udp.begin(UDP_PORT);

  Wire.begin(OLED_SDA, OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);

  moveMutex = xSemaphoreCreateMutex();
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  tryConnectMcp();

  xTaskCreatePinnedToCore(taskMcp, "taskMcp", 8192, nullptr, 3, nullptr, 0);
  xTaskCreatePinnedToCore(taskUdp, "taskUdp", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(taskMove, "taskMove", 4096, nullptr, 1, nullptr, 1);
  xTaskCreatePinnedToCore(taskOled, "taskOled", 2048, nullptr, 1, nullptr, 1);
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
