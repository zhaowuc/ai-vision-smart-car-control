#pragma once

// ESP32-S3 private configuration template.
// Copy to firmware/esp32-s3/include/config.h before building.

#define WIFI_SSID "<YOUR_WIFI_SSID>"
#define WIFI_PASS "<YOUR_WIFI_PASSWORD>"

#define MCP_HOST "<YOUR_MCP_SERVER_HOST>"
#define MCP_PORT 443
#define MCP_PATH "/mcp/?token=<YOUR_API_TOKEN>"
