#pragma once

#include <QObject>
#include <QThread>
#include <QUdpSocket>
#include <QTcpSocket>
#include <QQueue>
#include <QPair>
#include <QMap>
#include <QPoint>
#include <QMutex>
#include <QWaitCondition>
#include <QImage>
#include <functional>
#include <atomic>

#include "constants.h"

// ============================================================
// 前置声明
// ============================================================
struct AppState;

// ============================================================
// ① 指令队列线程 —— 线程安全 FIFO
// ============================================================
class CommandQueue : public QThread {
    Q_OBJECT
public:
    CommandQueue(std::function<QString()> espIpGetter,
                 std::function<QString()> camIpGetter,
                 QObject* parent = nullptr);
    ~CommandQueue() override;

    void enqueue(const QString& target, const QString& msg); // target: "ESP32" | "CAM"
    void stop();

protected:
    void run() override;

private:
    std::function<QString()> m_espIpGetter;
    std::function<QString()> m_camIpGetter;
    QQueue<QPair<QString,QString>> m_queue;
    QMutex m_mutex;
    QWaitCondition m_cond;
    bool m_running = true;
    QUdpSocket m_espSock;
    QUdpSocket m_camSock;
};

// ============================================================
// ② 链路监测线程 —— PING/PONG 延迟 + RSSI
// ============================================================
class LinkMonitor : public QThread {
    Q_OBJECT
public:
    LinkMonitor(std::function<QString()> ipGetter, int port, QObject* parent = nullptr);
    ~LinkMonitor() override;

    void stop();

signals:
    void update(bool connected, int latencyMs, int rssiDbm);

protected:
    void run() override;

private:
    std::function<QString()> m_ipGetter;
    int m_port;
    bool m_running = true;
};

// ============================================================
// ③ 视频流线程 —— TCP 接收 JPEG, 解码为 QImage
// ============================================================
class VideoReceiver : public QThread {
    Q_OBJECT
public:
    VideoReceiver(const QString& ip, QObject* parent = nullptr);
    ~VideoReceiver() override;

    void stop();

signals:
    void frameReceived(const QImage& rgb);
    void logMessage(const QString& msg);

protected:
    void run() override;

private:
    QByteArray recvExact(QTcpSocket* sock, int size, int timeoutMs);
    QString m_ip;
    std::atomic_bool m_running{true};
};

// ============================================================
// ④ 颜色/循迹数据线程 —— TCP 接收结构数据
// ============================================================
class SensorReceiver : public QThread {
    Q_OBJECT
public:
    SensorReceiver(std::function<QString()> ipGetter, QObject* parent = nullptr);
    ~SensorReceiver() override;

    void stop();

signals:
    void colorData(const QMap<QString, QPoint>& colors, int area);
    void lineData(const QMap<QString, int>& lineFields);

protected:
    void run() override;

private:
    std::function<QString()> m_ipGetter;
    bool m_running = true;
};

// ============================================================
// ⑤ UDP 控制器 —— 快速发送指令到 ESP32
// ============================================================
class UdpController : public QObject {
    Q_OBJECT
public:
    explicit UdpController(QObject* parent = nullptr);

    void send(const QString& ip, const QString& msg);
    void sendSpeed(const QString& ip, int mode);
    void sendLed(const QString& ip, int r, int g, int b);
    void sendArm(const QString& ip, const QString& cmd);
    void sendDrive(const QString& ip, const QVector<int>& motors);
    void sendBeep(const QString& ip, bool on);
    void sendGuiReg(const QString& ip, int port);

private:
    QUdpSocket m_sock;
};

// ============================================================
// ⑥ 指令监听线程 —— UDP 接收外部指令 (语音等)
// ============================================================
class CmdListener : public QThread {
    Q_OBJECT
public:
    explicit CmdListener(int port, QObject* parent = nullptr);
    ~CmdListener() override;

    void stop();

signals:
    void commandReceived(const QString& cmd);

protected:
    void run() override;

private:
    int m_port;
    bool m_running = true;
};
