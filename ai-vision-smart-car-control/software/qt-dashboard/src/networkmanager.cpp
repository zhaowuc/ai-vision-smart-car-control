#include "networkmanager.h"
#include "appstate.h"

#include <QDateTime>
#include <QElapsedTimer>
#include <QHostAddress>
#include <QNetworkProxy>
#include <QDebug>

namespace {
constexpr int VIDEO_HEADER_TIMEOUT_MS = 1200;
constexpr int VIDEO_MIN_FRAME_TIMEOUT_MS = 1800;
constexpr int VIDEO_MAX_FRAME_TIMEOUT_MS = 6000;
constexpr int VIDEO_TARGET_FRAME_INTERVAL_MS = 33;
constexpr int VIDEO_STATS_INTERVAL_MS = 5000;
constexpr quint32 VIDEO_MAX_FRAME_BYTES = 5 * 1024 * 1024;
}

// ============================================================
// ① CommandQueue
// ============================================================
CommandQueue::CommandQueue(std::function<QString()> espIpGetter,
                           std::function<QString()> camIpGetter,
                           QObject* parent)
    : QThread(parent), m_espIpGetter(espIpGetter), m_camIpGetter(camIpGetter)
{
}

CommandQueue::~CommandQueue() {
    stop();
    wait(2000);
}

void CommandQueue::stop() {
    QMutexLocker lk(&m_mutex);
    m_running = false;
    m_cond.wakeAll();
}

void CommandQueue::enqueue(const QString& target, const QString& msg) {
    QMutexLocker lk(&m_mutex);
    m_queue.enqueue({target, msg});
    m_cond.wakeOne();
}

void CommandQueue::run() {
    while (true) {
        QPair<QString,QString> item;
        {
            QMutexLocker lk(&m_mutex);
            while (m_running && m_queue.isEmpty())
                m_cond.wait(&m_mutex, 200);
            if (!m_running && m_queue.isEmpty())
                return;
            if (!m_queue.isEmpty())
                item = m_queue.dequeue();
            else
                continue;
        }

        QString target = item.first;
        QString msg = item.second;
        QByteArray data = msg.toUtf8();

        if (target == "ESP32") {
            QString ip = m_espIpGetter();
            if (!ip.isEmpty())
                m_espSock.writeDatagram(data, QHostAddress(ip), ESP32_UDP_PORT);
        } else if (target == "CAM") {
            QString ip = m_camIpGetter();
            if (!ip.isEmpty())
                m_camSock.writeDatagram(data, QHostAddress(ip), CTRL_PORT);
        }
    }
}

// ============================================================
// ② LinkMonitor
// ============================================================
LinkMonitor::LinkMonitor(std::function<QString()> ipGetter, int port, QObject* parent)
    : QThread(parent), m_ipGetter(ipGetter), m_port(port)
{
}

LinkMonitor::~LinkMonitor() {
    stop();
    wait(3000);
}

void LinkMonitor::stop() {
    m_running = false;
}

void LinkMonitor::run() {
    QUdpSocket sock;
    while (m_running) {
        QString ip = m_ipGetter();
        if (ip.isEmpty()) {
            emit update(false, -1, -1);
            msleep(5000);
            continue;
        }

        sock.connectToHost(ip, m_port);
        if (!sock.waitForConnected(500)) {
            emit update(false, -1, -1);
            msleep(5000);
            continue;
        }

        qint64 ts = QDateTime::currentMSecsSinceEpoch();
        QString ping = QString("PING %1").arg(ts);
        sock.write(ping.toUtf8());

        if (sock.waitForReadyRead(1000)) {
            QByteArray resp = sock.readAll();
            QString text = QString::fromUtf8(resp).trimmed();
            if (text.startsWith("PONG ")) {
                QStringList parts = text.split(' ');
                if (parts.size() >= 3) {
                    qint64 recvTs = parts[1].toLongLong();
                    int rssi = parts[2].toInt();
                    int latency = qMax(0LL, QDateTime::currentMSecsSinceEpoch() - recvTs);
                    emit update(true, latency, rssi);
                } else {
                    emit update(true, -1, -1);
                }
            } else {
                emit update(false, -1, -1);
            }
        } else {
            emit update(false, -1, -1);
        }

        sock.disconnectFromHost();
        msleep(5000);
    }
}

// ============================================================
// ③ VideoReceiver
// ============================================================
VideoReceiver::VideoReceiver(const QString& ip, QObject* parent)
    : QThread(parent), m_ip(ip)
{
}

VideoReceiver::~VideoReceiver() {
    stop();
    wait(3000);
}

void VideoReceiver::stop() {
    m_running.store(false);
}

QByteArray VideoReceiver::recvExact(QTcpSocket* sock, int size, int timeoutMs) {
    QByteArray data;
    data.reserve(size);

    QElapsedTimer timer;
    timer.start();

    while (m_running.load() && data.size() < size) {
        if (sock->state() != QAbstractSocket::ConnectedState)
            return {};

        if (sock->bytesAvailable() <= 0) {
            int remaining = timeoutMs - static_cast<int>(timer.elapsed());
            if (remaining <= 0)
                return {};

            if (!sock->waitForReadyRead(qMin(160, remaining))) {
                if (timer.elapsed() >= timeoutMs)
                    return {};
                continue;
            }
        }

        QByteArray chunk = sock->read(size - data.size());
        if (chunk.isEmpty()) {
            if (timer.elapsed() >= timeoutMs)
                return {};
            continue;
        }
        data.append(chunk);
    }

    return data.size() == size ? data : QByteArray();
}

void VideoReceiver::run() {
    emit logMessage(QString("视频线程启动, 目标: %1:%2").arg(m_ip).arg(VIDEO_PORT));

    while (m_running.load()) {
        QTcpSocket sock;
        sock.setProxy(QNetworkProxy::NoProxy);  // 禁用系统代理，直连摄像头

        emit logMessage("正在连接视频流...");
        sock.connectToHost(m_ip, VIDEO_PORT);

        if (!sock.waitForConnected(3000)) {
            emit logMessage(QString("连接失败: %1").arg(sock.errorString()));
            msleep(1000);
            continue;
        }

        emit logMessage("视频流已连接, 开始接收帧...");
        sock.setSocketOption(QAbstractSocket::LowDelayOption, 1);  // 禁用 Nagle，降低延迟
        sock.setReadBufferSize(2 * 1024 * 1024);

        int frameCount = 0;
        int emittedCount = 0;
        int droppedCount = 0;
        int decodeFailCount = 0;
        int intervalFrames = 0;
        int intervalEmitted = 0;
        int intervalDropped = 0;
        QElapsedTimer streamTimer;
        streamTimer.start();
        qint64 lastEmitMs = -VIDEO_TARGET_FRAME_INTERVAL_MS;
        qint64 lastStatsMs = 0;

        while (m_running.load()) {
            QByteArray lenBytes = recvExact(&sock, 4, VIDEO_HEADER_TIMEOUT_MS);
            if (lenBytes.isEmpty()) {
                if (m_running.load())
                    emit logMessage(QString("读取长度头超时 (已收%1帧), 重连...").arg(frameCount));
                break;
            }

            quint32 length = ((quint8)lenBytes[0] << 24) |
                             ((quint8)lenBytes[1] << 16) |
                             ((quint8)lenBytes[2] << 8)  |
                             ((quint8)lenBytes[3]);

            if (length == 0 || length > VIDEO_MAX_FRAME_BYTES) {
                emit logMessage(QString("非法帧长度: %1, 重连...").arg(length));
                break;
            }

            int frameTimeoutMs = qBound(VIDEO_MIN_FRAME_TIMEOUT_MS,
                                        1200 + static_cast<int>(length / 1024) * 6,
                                        VIDEO_MAX_FRAME_TIMEOUT_MS);
            QByteArray jpgData = recvExact(&sock, length, frameTimeoutMs);
            if (jpgData.isEmpty()) {
                if (m_running.load())
                    emit logMessage(QString("读取帧数据超时 (长度=%1), 重连...").arg(length));
                break;
            }

            frameCount++;
            intervalFrames++;

            qint64 nowMs = streamTimer.elapsed();
            if (nowMs - lastEmitMs < VIDEO_TARGET_FRAME_INTERVAL_MS) {
                droppedCount++;
                intervalDropped++;
                continue;
            }

            QImage img;
            if (!img.loadFromData(jpgData)) {
                decodeFailCount++;
                if (decodeFailCount <= 3 || decodeFailCount % 30 == 0)
                    emit logMessage(QString("JPEG解码失败 (累计%1次, 数据%2字节)")
                                    .arg(decodeFailCount).arg(jpgData.size()));
                continue;
            }

            if (!img.isNull()) {
                if (img.format() != QImage::Format_RGB32)
                    img = img.convertToFormat(QImage::Format_RGB32);

                emit frameReceived(img);
                emittedCount++;
                intervalEmitted++;
                lastEmitMs = nowMs;
            }

            if (nowMs - lastStatsMs >= VIDEO_STATS_INTERVAL_MS) {
                double seconds = qMax(0.001, (nowMs - lastStatsMs) / 1000.0);
                emit logMessage(QString("视频状态: 接收 %1 fps, 显示 %2 fps, 丢弃旧帧 %3")
                                .arg(qRound(intervalFrames / seconds))
                                .arg(qRound(intervalEmitted / seconds))
                                .arg(intervalDropped));
                lastStatsMs = nowMs;
                intervalFrames = 0;
                intervalEmitted = 0;
                intervalDropped = 0;
            }
        }

        sock.disconnectFromHost();
        if (m_running.load()) {
            emit logMessage(QString("视频连接断开, 2秒后重连... (接收%1帧, 显示%2帧, 丢弃%3帧)")
                            .arg(frameCount).arg(emittedCount).arg(droppedCount));
        }
        for (int i = 0; i < 20 && m_running.load(); i++)
            msleep(100);
    }
    emit logMessage("视频线程结束");
}

// ============================================================
// ④ SensorReceiver (颜色 + 循迹)
// ============================================================
SensorReceiver::SensorReceiver(std::function<QString()> ipGetter, QObject* parent)
    : QThread(parent), m_ipGetter(ipGetter)
{
}

SensorReceiver::~SensorReceiver() {
    stop();
    wait(3000);
}

void SensorReceiver::stop() {
    m_running = false;
}

void SensorReceiver::run() {
    while (m_running) {
        QString ip = m_ipGetter();
        if (ip.isEmpty()) {
            msleep(500);
            continue;
        }

        QTcpSocket sock;
        sock.connectToHost(ip, COLOR_PORT);
        if (!sock.waitForConnected(2000)) {
            msleep(500);
            continue;
        }

        QByteArray buf;
        while (m_running) {
            if (!sock.waitForReadyRead(2000)) break;

            buf.append(sock.readAll());
            while (buf.contains('\n')) {
                int idx = buf.indexOf('\n');
                QByteArray line = buf.left(idx).trimmed();
                buf = buf.mid(idx + 1);

                QString text = QString::fromUtf8(line);

                if (text.startsWith("COLORS ")) {
                    QString payload = text.mid(7);
                    QMap<QString, QPoint> colors;
                    int maxArea = 0;
                    if (payload != "NONE") {
                        for (const QString& item : payload.split('|')) {
                            QStringList parts = item.split(',');
                            if (parts.size() >= 4) {
                                QString name = parts[0];
                                int cx = parts[1].toInt();
                                int cy = parts[2].toInt();
                                int area = parts[3].toInt();
                                colors[name] = QPoint(cx, cy);
                                if (area > maxArea) maxArea = area;
                            }
                        }
                    }
                    emit colorData(colors, maxArea);
                }
                else if (text.startsWith("LINE ")) {
                    QStringList parts = text.split(' ');
                    if (parts.size() >= 16) {
                        QMap<QString, int> fields;
                        fields["bcx"] = parts[1].toInt();
                        fields["bcy"] = parts[2].toInt();
                        fields["bl"]  = parts[3].toInt();
                        fields["br"]  = parts[4].toInt();
                        fields["mcx"] = parts[5].toInt();
                        fields["mcy"] = parts[6].toInt();
                        fields["ml"]  = parts[7].toInt();
                        fields["mr"]  = parts[8].toInt();
                        fields["tcx"] = parts[9].toInt();
                        fields["tcy"] = parts[10].toInt();
                        fields["tl"]  = parts[11].toInt();
                        fields["tr"]  = parts[12].toInt();
                        fields["bf"]  = parts[13].toInt();
                        fields["mf"]  = parts[14].toInt();
                        fields["tf"]  = parts[15].toInt();
                        emit lineData(fields);
                    }
                }
            }
        }
        sock.disconnectFromHost();
        msleep(500);
    }
}

// ============================================================
// ⑤ UdpController
// ============================================================
UdpController::UdpController(QObject* parent) : QObject(parent) {}

void UdpController::send(const QString& ip, const QString& msg) {
    if (ip.isEmpty()) return;
    m_sock.writeDatagram(msg.toUtf8(), QHostAddress(ip), ESP32_UDP_PORT);
}

void UdpController::sendSpeed(const QString& ip, int mode) {
    send(ip, QString("S %1").arg(mode));
}

void UdpController::sendLed(const QString& ip, int r, int g, int b) {
    send(ip, QString("STM LED %1 %2 %3").arg(r).arg(g).arg(b));
}

void UdpController::sendArm(const QString& ip, const QString& cmd) {
    send(ip, QString("ARM %1").arg(cmd));
}

void UdpController::sendDrive(const QString& ip, const QVector<int>& motors) {
    send(ip, QString("DRV %1 %2 %3 %4")
             .arg(motors.value(0, 0))
             .arg(motors.value(1, 0))
             .arg(motors.value(2, 0))
             .arg(motors.value(3, 0)));
}

void UdpController::sendBeep(const QString& ip, bool on) {
    send(ip, QString("BEEP %1").arg(on ? 1 : 0));
}

void UdpController::sendGuiReg(const QString& ip, int port) {
    send(ip, QString("GUIREG %1").arg(port));
}

// ============================================================
// ⑥ CmdListener
// ============================================================
CmdListener::CmdListener(int port, QObject* parent)
    : QThread(parent), m_port(port)
{
}

CmdListener::~CmdListener() {
    stop();
    wait(2000);
}

void CmdListener::stop() {
    m_running = false;
}

void CmdListener::run() {
    QUdpSocket sock;
    if (!sock.bind(QHostAddress::Any, m_port)) {
        qWarning() << "CmdListener: 无法绑定端口" << m_port;
        return;
    }
    while (m_running) {
        if (sock.waitForReadyRead(500)) {
            while (sock.hasPendingDatagrams()) {
                QByteArray data;
                data.resize(sock.pendingDatagramSize());
                sock.readDatagram(data.data(), data.size());
                emit commandReceived(QString::fromUtf8(data).trimmed());
            }
        }
    }
}
