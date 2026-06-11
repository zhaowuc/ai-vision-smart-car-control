# SmartCar UI Design Guide

## 1. Project Positioning

- Product type: desktop engineering console for smart car video, ESP32 motion control, arm control, LED control, and sensor telemetry.
- Target users: operators, students, robotics engineers, and demo presenters.
- Default style: Industrial Console + Robotics Control.
- Keywords: dark OLED, data-dense, safe, precise, high-contrast, real-time.

## 2. Color System

- Primary: `#0F172A`
- Secondary: `#1E293B`
- Accent: `#22C55E`
- Success: `#22C55E`
- Warning: `#FACC15`
- Error: `#EF4444`
- Info: `#38BDF8`
- Background: `#020617`
- Surface: `#0B1120`
- Border: `#1E293B`
- Text primary: `#F8FAFC`
- Text secondary: `#CBD5E1`
- Muted: `#64748B`

## 3. Typography

- Display and numeric data: `Fira Code`, fallback `Consolas`, `Microsoft YaHei`.
- Body: `Fira Sans`, fallback `Microsoft YaHei`, `Segoe UI`.
- Dashboard values should use tabular or monospace styling where practical.

## 4. Spacing and Shape

- Base unit: 4px / 8px.
- Window margin: 12px.
- Panel spacing: 8px to 10px.
- Button radius: 7px.
- Panel radius: 8px.
- Use border-first depth rather than heavy shadows.

## 5. Component Rules

- Topbar: app identity, operation mode, ESP32 link, MaixVision link, and emergency stop.
- Status strip: connection status with text and color; never color alone.
- Main view: video stream receives the strongest visual priority.
- Control rail: drive controls, target color, color alignment, auto pick, line tracking stop, arm grab, and LED presets.
- Telemetry panel: speed, gear, direction, signal, latency, and servo PWM.
- Log panel: monospace terminal styling, capped history, newest entry visible.
- Do not show route planning, obstacle warning, task progress, CPU/memory/network charts, or battery/current values unless those data sources exist in code and hardware.

## 6. Interaction and Motion

- Button hover: border and glow within 150-190ms.
- Panel entrance: short staggered fade in, disabled when `SMARTCAR_REDUCED_MOTION=1`.
- Dashboard: speed arc and status indicators animate smoothly.
- Video empty state: subtle scanline and grid motion.
- Dangerous controls: static, visible, and red; no playful animation.

## 7. Safety UX

- Emergency stop must remain visible in the topbar.
- Stop actions use warning/error treatment.
- Offline status must be text-visible and not only red color.
- Real-time values include units: `ms`, `dBm`, `km/h`, PWM values.

## 8. Accessibility

- Interactive widgets use visible focus states.
- Text contrast is designed for dark mode.
- Motion can be reduced through `SMARTCAR_REDUCED_MOTION=1`.
- Keyboard order should follow the visual order: topbar, status, video controls, control rail, log.

## 9. Visual QA Checklist

- [ ] `build/SmartCar.exe` starts by double click with Qt and MinGW DLLs present.
- [ ] No raw default Qt widget appearance is visible.
- [ ] Topbar, status strip, video, control rail, and log are aligned.
- [ ] The GUI exposes only features wired to the current project: video stream, ESP32 UDP control, color/line sensor data, LED, arm, logs, and link status.
- [ ] Text does not overflow at the minimum window size.
- [ ] Focus, hover, active, danger, and selected states are visible.
- [ ] Video no-signal, stale frame, and live frame states are clear.
- [ ] Dashboard motion remains smooth and does not block controls.
