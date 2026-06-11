#pragma once

#include <QMainWindow>
#include <QLabel>
#include <QPushButton>
#include <QLineEdit>
#include <QComboBox>
#include <QTextEdit>
#include <QGroupBox>
#include <QSlider>
#include <QTimer>
#include <QVector>
#include <QMap>
#include <QList>

#include "appstate.h"
#include "settings.h"
#include "dashboard.h"
#include "videowidget.h"
#include "networkmanager.h"
#include "tracker.h"

// ============================================================
// 主窗口 —— 智能小车 · 视觉与操控平台 (C++ Qt 复刻)
// ============================================================
class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);
    ~MainWindow() override;

protected:
    bool eventFilter(QObject* watched, QEvent* event) override;
    void keyPressEvent(QKeyEvent* event) override;
    void keyReleaseEvent(QKeyEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;
    void mousePressEvent(QMouseEvent* event) override;
    void closeEvent(QCloseEvent* event) override;

private:
    // --- UI 构建 ---
    void buildUI();
    void applyStyleSheet();
    void setupInteractiveEffects();
    void animatePanelEntrance(const QList<QWidget*>& panels);
    void refreshStyle(QWidget* widget);

    // --- 组件创建 ---
    QWidget* createSidebar();       // 左侧仪表盘
    QWidget* createCenterPanel();   // 中间视频
    QWidget* createTopBar();        // 顶栏模式按钮
    QWidget* createBottomBar();     // 底栏连接设置

    // --- 线程管理 ---
    void startThreads();
    void stopThreads();

    // --- 控制逻辑 ---
    void switchMode(const QString& mode);
    void connectESP32();
    void startStream();
    void setSpeed(int mode);
    void sendDriveCmd();
    QVector<int> driveFromKey(const QString& key);
    QVector<int> mixMecanum(double strafe, double forward, double rotate);
    void driveOverride(const QString& key);
    void driveFor(const QString& key, int ms);
    void microMove(const QString& key);

    // --- 机械臂 ---
    void sendGrab();
    void sendLedColor(int r, int g, int b);
    void sendArm(const QString& cmd);
    void sendArmServo(int s0, int s3, int s5, int t = 80);
    void toggleAlign();
    void toggleAutoPick();
    void stopAuto();
    void stopLine();
    void stopAll();

    // --- 回调 ---
    void onFrame(const QImage& rgb);
    void onColorData(const QMap<QString, QPoint>& colors, int area);
    void onLineData(const QMap<QString, int>& fields);
    void onCmd(const QString& cmd);
    void onEspLink(bool ok, int latency, int rssi);
    void onCamLink(bool ok, int latency, int rssi);
    void onMouseDelta(double dx, double dy);
    void onSensitivityChanged(int value);
    void finishTurn();
    void updateDashboard();

    // --- 日志 ---
    void log(const QString& msg);

    // --- 组件 ---
    Dashboard*    m_dashboard   = nullptr;
    VideoWidget*  m_video       = nullptr;
    QTextEdit*    m_logBox      = nullptr;
    QLabel*       m_statusLabel = nullptr;
    QLabel*       m_espLinkLabel = nullptr;
    QLabel*       m_camLinkLabel = nullptr;
    QLabel*       m_sensLabel   = nullptr;
    QSlider*      m_sensSlider  = nullptr;
    QLineEdit*    m_ipInput     = nullptr;
    QLineEdit*    m_espInput    = nullptr;
    QComboBox*    m_colorSelect = nullptr;
    bool          m_reduceMotion = false;

    // --- 状态 ---
    AppState  m_state;
    Settings& m_settings;
    QMap<QString, bool> m_keyState;

    // --- 算法 ---
    LineTracker   m_lineTracker;
    ColorAligner  m_colorAligner;

    // --- 网络 ---
    UdpController*  m_ctrl         = nullptr;
    CommandQueue*   m_cmdQueue     = nullptr;
    LinkMonitor*    m_espMonitor   = nullptr;
    LinkMonitor*    m_camMonitor   = nullptr;
    VideoReceiver*  m_videoThread  = nullptr;
    SensorReceiver* m_sensorThread = nullptr;
    CmdListener*    m_cmdListener  = nullptr;

    // --- 定时器 ---
    QTimer* m_ctrlTimer = nullptr;
    QTimer* m_dashTimer = nullptr;

    // --- 颜色按钮 ---
    struct ColorPreset { QString label; int r, g, b; };
    QVector<ColorPreset> m_colorPresets;
};
