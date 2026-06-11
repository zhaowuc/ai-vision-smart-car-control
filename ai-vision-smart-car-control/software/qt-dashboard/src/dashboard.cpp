#include "dashboard.h"

#include <QPainter>
#include <QPaintEvent>
#include <QPainterPath>
#include <QLinearGradient>
#include <QRadialGradient>
#include <QConicalGradient>
#include <QTimer>
#include <QtMath>

// ============================================================
// 毛玻璃高端配色 —— 冰霜质感
// ============================================================
namespace Color {
    const QColor bgMain(2, 6, 23);
    const QColor bgCard(15, 23, 42);
    const QColor bgPanel(11, 17, 32);
    const QColor accentBlue(56, 189, 248);
    const QColor accentCyan(34, 211, 238);
    const QColor accentViolet(167, 139, 250);
    const QColor textPrimary(248, 250, 252);
    const QColor textSecondary(203, 213, 225);
    const QColor textMuted(100, 116, 139);
    const QColor green(34, 197, 94);
    const QColor yellow(250, 204, 21);
    const QColor orange(249, 115, 22);
    const QColor red(248, 113, 113);
    const QColor border(30, 41, 59);
    const QColor cardShadow(0, 0, 0, 80);
    const QColor glowBlue(56, 189, 248, 38);
}

Dashboard::Dashboard(QWidget* parent)
    : QWidget(parent)
{
    setMinimumWidth(280);
    setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Expanding);
    setAttribute(Qt::WA_StyledBackground, false);

    m_animTimer = new QTimer(this);
    m_animTimer->setInterval(33);
    connect(m_animTimer, &QTimer::timeout, this, [this] {
        m_animPhase += 0.045;
        if (m_animPhase > M_PI * 2.0)
            m_animPhase -= M_PI * 2.0;

        double next = m_animSpeed + (m_speed - m_animSpeed) * 0.14;
        if (qAbs(next - m_speed) < 0.05)
            next = m_speed;

        bool speedChanged = !qFuzzyCompare(next + 1.0, m_animSpeed + 1.0);
        m_animSpeed = next;

        if (speedChanged || m_espOk || m_camOk)
            update();
    });
    m_animTimer->start();
}

void Dashboard::resizeEvent(QResizeEvent* event) { QWidget::resizeEvent(event); update(); }

void Dashboard::setSpeed(int kmh)       { kmh = qBound(0, kmh, 100); if (m_speed != kmh) { m_speed = kmh; update(); } }
void Dashboard::setGear(const QString& g) { if (m_gear != g) { m_gear = g; update(); } }
void Dashboard::setDirection(const QString& d) { if (m_dir != d) { m_dir = d; update(); } }
void Dashboard::setMode(const QString& m) { if (m_mode != m) { m_mode = m; update(); } }
void Dashboard::setSignal(int rssi)     { if (m_rssi != rssi) { m_rssi = rssi; update(); } }
void Dashboard::setLatency(int ms)      { if (m_latency != ms) { m_latency = ms; update(); } }
void Dashboard::setServos(int s0, int s3, int s5) {
    if (m_s0 == s0 && m_s3 == s3 && m_s5 == s5)
        return;
    m_s0 = s0;
    m_s3 = s3;
    m_s5 = s5;
    update();
}
void Dashboard::setConnectionStatus(bool e, bool c) {
    if (m_espOk == e && m_camOk == c)
        return;
    m_espOk = e;
    m_camOk = c;
    update();
}

// ============================================================
// 主绘制入口
// ============================================================
void Dashboard::paintEvent(QPaintEvent*) {
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing);

    QRect r = rect().adjusted(4, 4, -4, -4);

    // 控制舱暗色面板
    QPainterPath card;
    card.addRoundedRect(QRectF(r), 8, 8);

    p.setPen(Qt::NoPen);
    p.setBrush(Color::cardShadow);
    p.drawRoundedRect(QRectF(r).translated(0, 3).adjusted(-1, -1, 1, 1), 10, 10);

    QLinearGradient glassGrad(r.topLeft(), r.bottomRight());
    glassGrad.setColorAt(0.0, QColor(15, 23, 42));
    glassGrad.setColorAt(0.48, QColor(11, 17, 32));
    glassGrad.setColorAt(1.0, QColor(2, 6, 23));
    p.fillPath(card, glassGrad);

    p.setPen(QPen(Color::border, 1.0));
    p.drawPath(card);

    QFont titleFont;
    titleFont.setPixelSize(12);
    titleFont.setBold(true);
    p.setFont(titleFont);
    p.setPen(Color::textMuted);
    p.drawText(QRect(18, 14, width() - 36, 18), Qt::AlignLeft | Qt::AlignVCenter, "TELEMETRY");

    int pulse = 80 + static_cast<int>(45 * (0.5 + 0.5 * qSin(m_animPhase)));
    p.setPen(Qt::NoPen);
    p.setBrush(QColor(Color::green.red(), Color::green.green(), Color::green.blue(), m_espOk ? pulse : 35));
    p.drawEllipse(QPointF(width() - 22, 23), 4, 4);

    int w = width();
    int y = 34;

    // ① 速度弧
    int arcH = qMin(250, (height() - 50) / 2);
    QRect arcRect(16, y, w - 32, arcH + 20);
    drawSpeedArc(p, arcRect);
    y += arcH + 8;

    // ② 挡位徽章
    QRect gearRect(w / 2 - 48, y, 96, 32);
    drawGearBadge(p, gearRect);
    y += 44;

    // ③ 方向十字
    int dirSize = qMin(96, height() - y - 130);
    QRect dirRect(w / 2 - dirSize / 2, y, dirSize, dirSize);
    drawDirectionCross(p, dirRect);
    y += dirSize + 8;

    // ④ 信号 + 延迟
    QRect sigRect(12, y, w - 24, 46);
    drawSignalBars(p, sigRect);
    y += 52;

    // ⑤ 信息面板
    QRect infoRect(12, y, w - 24, height() - y - 10);
    drawInfoPanel(p, infoRect);
}

// ============================================================
// ① 速度弧
// ============================================================
void Dashboard::drawSpeedArc(QPainter& p, const QRect& rect) {
    int r = qMin(rect.width(), rect.height() * 2) / 2;
    QPointF center(rect.center().x(), rect.bottom() + r * 0.18);

    // 灰色背景弧 (270°)
    QPen arcBg(QColor(30, 41, 59), 14.0, Qt::SolidLine, Qt::RoundCap);
    p.setPen(arcBg);
    p.drawArc(QRectF(center.x() - r, center.y() - r, r * 2, r * 2), 135 * 16, 270 * 16);

    // 彩色活动弧
    double shownSpeed = qBound(0.0, m_animSpeed, 100.0);
    double ratio = qBound(0.0, shownSpeed / 100.0, 1.0);
    int span = static_cast<int>(270 * ratio * 16);

    QColor speedColor = Color::green;
    if (shownSpeed > 80)      speedColor = Color::red;
    else if (shownSpeed > 60) speedColor = Color::orange;
    else if (shownSpeed > 30) speedColor = Color::yellow;

    QConicalGradient grad(center, 225);
    grad.setColorAt(0.0, speedColor.lighter(140));
    grad.setColorAt(0.5, speedColor);
    grad.setColorAt(1.0, speedColor.darker(120));
    QPen activePen(QBrush(grad), 14.0, Qt::SolidLine, Qt::RoundCap);
    p.setPen(activePen);
    p.drawArc(QRectF(center.x() - r, center.y() - r, r * 2, r * 2), 135 * 16, span);

    p.setPen(QPen(QColor(speedColor.red(), speedColor.green(), speedColor.blue(), 35), 24.0, Qt::SolidLine, Qt::RoundCap));
    p.drawArc(QRectF(center.x() - r, center.y() - r, r * 2, r * 2), 135 * 16, span);

    if (ratio > 0.01) {
        double glowAng = (225.0 - 270.0 * ratio) * M_PI / 180.0;
        QPointF glow(center.x() + (r - 5) * cos(glowAng), center.y() - (r - 5) * sin(glowAng));
        QRadialGradient dotGrad(glow, 12);
        dotGrad.setColorAt(0.0, QColor(speedColor.red(), speedColor.green(), speedColor.blue(), 230));
        dotGrad.setColorAt(1.0, QColor(speedColor.red(), speedColor.green(), speedColor.blue(), 0));
        p.setPen(Qt::NoPen);
        p.setBrush(dotGrad);
        p.drawEllipse(glow, 12, 12);
    }

    // 刻度线
    p.setPen(QPen(Color::textMuted, 1.0));
    QFont tf; tf.setPixelSize(9); p.setFont(tf);
    for (int v = 0; v <= 100; v += 10) {
        double ang = (225.0 - 270.0 * v / 100.0) * M_PI / 180.0;
        double inner = r - 24, outer = v % 20 == 0 ? r - 10 : r - 18;
        QPointF p1(center.x() + inner * cos(ang), center.y() - inner * sin(ang));
        QPointF p2(center.x() + outer * cos(ang), center.y() - outer * sin(ang));
        p.drawLine(p1, p2);
        if (v % 20 == 0) {
            QPointF tp(center.x() + (r - 38) * cos(ang), center.y() - (r - 38) * sin(ang));
            p.setPen(Color::textSecondary);
            p.drawText(QRectF(tp.x() - 14, tp.y() - 7, 28, 14), Qt::AlignCenter, QString::number(v));
            p.setPen(QPen(Color::textMuted, 1.0));
        }
    }

    // 指针
    double needleAng = (225.0 - 270.0 * ratio) * M_PI / 180.0;
    double needleLen = r * 0.70;
    QPointF needleTip(center.x() + needleLen * cos(needleAng), center.y() - needleLen * sin(needleAng));
    QPen needlePen(speedColor.darker(120), 2.5, Qt::SolidLine, Qt::RoundCap);
    p.setPen(needlePen);
    p.drawLine(center, needleTip);

    // 中心圆
    p.setBrush(Color::bgPanel);
    p.setPen(QPen(speedColor, 2.0));
    p.drawEllipse(center, 9, 9);
    QRadialGradient cg(center, 5);
    cg.setColorAt(0, speedColor);
    cg.setColorAt(1, Color::bgPanel);
    p.setBrush(cg);
    p.setPen(Qt::NoPen);
    p.drawEllipse(center, 4, 4);

    // 数字
    QFont sf; sf.setPixelSize(qMin(44, r / 3)); sf.setBold(true);
    p.setFont(sf);
    p.setPen(Color::textPrimary);
    p.drawText(QRectF(center.x() - 80, center.y() - r + 40, 160, 50),
               Qt::AlignCenter, QString::number(static_cast<int>(qRound(shownSpeed))));

    QFont uf; uf.setPixelSize(12);
    p.setFont(uf);
    p.setPen(Color::textMuted);
    p.drawText(QRectF(center.x() - 80, center.y() - r + 82, 160, 18), Qt::AlignCenter, "km/h");
}

// ============================================================
// ② 挡位徽章
// ============================================================
void Dashboard::drawGearBadge(QPainter& p, const QRect& rect) {
    QColor c;
    if (m_gear == "高速")      c = Color::red;
    else if (m_gear == "中速") c = Color::orange;
    else if (m_gear == "微调") c = Color::accentViolet;
    else                       c = Color::green;

    QPainterPath path;
    path.addRoundedRect(QRectF(rect), 16, 16);
    int alpha = 24 + static_cast<int>(12 * (0.5 + 0.5 * qSin(m_animPhase * 1.8)));
    p.fillPath(path, QColor(c.red(), c.green(), c.blue(), alpha));
    p.setPen(QPen(c, 1.5));
    p.drawPath(path);

    QFont gf; gf.setPixelSize(15); gf.setBold(true);
    p.setFont(gf);
    p.setPen(c.darker(110));
    p.drawText(rect, Qt::AlignCenter, m_gear);
}

// ============================================================
// ③ 方向十字
// ============================================================
void Dashboard::drawDirectionCross(QPainter& p, const QRect& rect) {
    int cx = rect.center().x(), cy = rect.center().y();
    int s = qMin(rect.width(), rect.height()) / 2 - 4;

    auto arr = [&](int dx, int dy, const QString& label, bool active) {
        QColor c = active ? Color::accentBlue : Color::textMuted;
        double ax = cx + dx * s, ay = cy + dy * s, sz = 12.0;

        if (active) {
            int alpha = 28 + static_cast<int>(18 * (0.5 + 0.5 * qSin(m_animPhase * 2.0)));
            p.setBrush(QColor(56, 189, 248, alpha));
            p.setPen(Qt::NoPen);
            p.drawEllipse(QPointF(ax, ay), sz + 5, sz + 5);
        }
        p.setPen(QPen(c, 2.0, Qt::SolidLine, Qt::RoundCap));
        p.setBrush(active ? c : QColor(255, 255, 255, 0));

        QPointF tri[3];
        if (dx == 0 && dy == -1) {
            tri[0] = QPointF(ax, ay - sz);
            tri[1] = QPointF(ax - sz * 0.7, ay + sz * 0.5);
            tri[2] = QPointF(ax + sz * 0.7, ay + sz * 0.5);
        } else if (dx == 0 && dy == 1) {
            tri[0] = QPointF(ax, ay + sz);
            tri[1] = QPointF(ax - sz * 0.7, ay - sz * 0.5);
            tri[2] = QPointF(ax + sz * 0.7, ay - sz * 0.5);
        } else if (dx == -1 && dy == 0) {
            tri[0] = QPointF(ax - sz, ay);
            tri[1] = QPointF(ax + sz * 0.5, ay - sz * 0.7);
            tri[2] = QPointF(ax + sz * 0.5, ay + sz * 0.7);
        } else {
            tri[0] = QPointF(ax + sz, ay);
            tri[1] = QPointF(ax - sz * 0.5, ay - sz * 0.7);
            tri[2] = QPointF(ax - sz * 0.5, ay + sz * 0.7);
        }
        p.drawConvexPolygon(tri, 3);

        QFont lf; lf.setPixelSize(9);
        p.setFont(lf);
        p.setPen(active ? Color::accentBlue : Color::textMuted);
        p.drawText(QRectF(ax - 18, ay + sz + 1, 36, 14), Qt::AlignCenter, label);
    };

    p.setBrush(Color::bgPanel);
    p.setPen(QPen(Color::border, 1.0));
    p.drawEllipse(QPointF(cx, cy), 7, 7);
    if (m_dir != "停止" && !m_dir.isEmpty()) {
        p.setBrush(Color::green);
        p.setPen(Qt::NoPen);
        p.drawEllipse(QPointF(cx, cy), 3, 3);
    }

    arr(0, -1, "前进", m_dir.contains("前进") || m_dir == "前进");
    arr(0, 1, "后退",  m_dir.contains("后退") || m_dir == "后退");
    arr(-1, 0, "左转", m_dir.contains("左"));
    arr(1, 0, "右转",  m_dir.contains("右"));

    p.setPen(QPen(Color::textMuted, 0.5, Qt::DotLine));
    p.drawLine(cx, cy - 3, cx, cy - s + 8);
    p.drawLine(cx, cy + 3, cx, cy + s - 8);
    p.drawLine(cx - 3, cy, cx - s + 8, cy);
    p.drawLine(cx + 3, cy, cx + s - 8, cy);
}

// ============================================================
// ④ 信号 + 延迟
// ============================================================
void Dashboard::drawSignalBars(QPainter& p, const QRect& rect) {
    int bars = 0;
    if (m_rssi > -50)      bars = 5;
    else if (m_rssi > -60) bars = 4;
    else if (m_rssi > -70) bars = 3;
    else if (m_rssi > -80) bars = 2;
    else if (m_rssi > -90) bars = 1;

    int bx = rect.left() + 6, bb = rect.bottom() - 10;

    QFont sf; sf.setPixelSize(11); p.setFont(sf);
    p.setPen(Color::textSecondary);
    p.drawText(QRectF(bx, rect.top(), 110, 14), Qt::AlignLeft | Qt::AlignVCenter,
               m_espOk ? "ESP32 在线" : "ESP32 离线");

    for (int i = 0; i < 5; i++) {
        int h = 5 + i * 5;
        QColor barC = i < bars
            ? (bars >= 4 ? Color::green : bars >= 2 ? Color::yellow : Color::red)
            : Color::textMuted;
        QRectF bar(bx + i * 12.0, bb - h, 9, h);
        p.fillRect(bar, QColor(barC.red(), barC.green(), barC.blue(), i < bars ? 200 : 30));
    }

    p.setPen(Color::textSecondary);
    p.drawText(QRectF(bx + 70, rect.top(), 70, 14), Qt::AlignLeft | Qt::AlignVCenter,
               m_espOk ? QString("%1 dBm").arg(m_rssi) : "--");

    int lx = rect.right() - 110;
    p.setPen(Color::accentCyan);
    QFont lf; lf.setPixelSize(11); p.setFont(lf);
    QString lt = m_latency >= 0 ? QString("%1 ms").arg(m_latency) : "-- ms";
    p.drawText(QRectF(lx, rect.top(), 110, 14), Qt::AlignRight | Qt::AlignVCenter, "延迟 " + lt);

    QColor latC = m_latency < 0 ? Color::textMuted :
                  m_latency < 20 ? Color::green :
                  m_latency < 50 ? Color::yellow : Color::red;
    p.setBrush(latC); p.setPen(Qt::NoPen);
    double pulseR = (m_latency >= 0) ? 4.0 + 1.3 * (0.5 + 0.5 * qSin(m_animPhase * 2.2)) : 4.0;
    p.drawEllipse(QPointF(lx - 14, rect.top() + 7), pulseR, pulseR);
}

// ============================================================
// ⑤ 底部信息面板
// ============================================================
void Dashboard::drawInfoPanel(QPainter& p, const QRect& rect) {
    int y = rect.top();
    QFont f; f.setPixelSize(11);

    p.setPen(Color::textMuted); p.setFont(f);
    p.drawText(QRectF(rect.left(), y, 48, 18), Qt::AlignLeft, "模式");
    p.setPen(Color::accentBlue);
    p.drawText(QRectF(rect.left() + 50, y, rect.width() - 50, 18), Qt::AlignLeft, m_mode);
    y += 22;

    p.setPen(QPen(Color::border, 0.5));
    p.drawLine(rect.left(), y, rect.right(), y);
    y += 6;

    p.setPen(Color::textMuted);
    p.drawText(QRectF(rect.left(), y, 48, 16), Qt::AlignLeft, "视频流");
    p.setPen(m_camOk ? Color::green : Color::red);
    p.drawText(QRectF(rect.left() + 50, y, 40, 16), Qt::AlignLeft, m_camOk ? "在线" : "离线");
    y += 20;

    auto drawServo = [&](const QString& name, int val, int vmin, int vmax, int& yy) {
        p.setPen(Color::textMuted);
        p.drawText(QRectF(rect.left(), yy, 28, 16), Qt::AlignLeft, name);
        int valueW = 42;
        int barX = rect.left() + 30;
        int barW = rect.width() - 30 - valueW - 6;
        QRectF bg(barX, yy + 4, barW, 8);
        QPainterPath bgPath; bgPath.addRoundedRect(bg, 4, 4);
        p.fillPath(bgPath, QColor(30, 41, 59));
        p.setPen(QPen(Color::border, 0.5)); p.drawPath(bgPath);
        double ratio = qBound(0.0, (double)(val - vmin) / (vmax - vmin), 1.0);
        QRectF fillR(barX, yy + 4, barW * ratio, 8);
        QPainterPath fillPath; fillPath.addRoundedRect(fillR, 4, 4);
        QLinearGradient fillGrad(fillR.topLeft(), fillR.bottomRight());
        fillGrad.setColorAt(0, Color::green.lighter(105));
        fillGrad.setColorAt(1, Color::accentCyan);
        p.fillPath(fillPath, fillGrad);
        p.setPen(Color::textSecondary);
        p.drawText(QRectF(rect.right() - valueW, yy, valueW, 16), Qt::AlignRight, QString::number(val));
        yy += 20;
    };

    drawServo("S0", m_s0, 500, 2500, y);
    drawServo("S3", m_s3, 500, 1600, y);
    drawServo("S5", m_s5, 860, 1900, y);
}
