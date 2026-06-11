#include "videowidget.h"

#include <QPainter>
#include <QPainterPath>
#include <QPaintEvent>
#include <QMouseEvent>
#include <QCursor>
#include <QLinearGradient>
#include <QTimer>
#include <QtMath>
#if QT_VERSION >= QT_VERSION_CHECK(6, 0, 0)
#include <QEnterEvent>
#endif

VideoWidget::VideoWidget(QWidget* parent)
    : QWidget(parent)
{
    setMouseTracking(true);
    setMinimumSize(320, 240);
    setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Expanding);
    setAttribute(Qt::WA_OpaquePaintEvent);

    m_fpsClock.start();

    m_staleTimer = new QTimer(this);
    m_staleTimer->setInterval(500);
    connect(m_staleTimer, &QTimer::timeout, this, [this] {
        if (m_hasFrame && m_frameAge.isValid() && m_frameAge.elapsed() > 1400)
            update();
    });
    m_staleTimer->start();

    m_animTimer = new QTimer(this);
    m_animTimer->setInterval(33);
    connect(m_animTimer, &QTimer::timeout, this, [this] {
        m_animPhase += 0.035;
        if (m_animPhase > M_PI * 2.0)
            m_animPhase -= M_PI * 2.0;
        if (!m_hasFrame || (m_frameAge.isValid() && m_frameAge.elapsed() > 1200) || m_mouseLook)
            update();
    });
    m_animTimer->start();
}

void VideoWidget::setFrame(const QImage& rgb) {
    QPixmap next = QPixmap::fromImage(rgb);
    if (next.isNull())
        return;

    m_pixmap = next;
    m_scaledPixmap = QPixmap();
    m_scaledForSize = QSize();
    m_scaledSourceSize = m_pixmap.size();
    m_hasFrame = true;

    if (m_frameAge.isValid())
        m_frameAge.restart();
    else
        m_frameAge.start();

    m_fpsFrames++;
    if (m_fpsClock.elapsed() >= 1000) {
        m_fps = m_fpsFrames * 1000.0 / qMax<qint64>(1, m_fpsClock.elapsed());
        m_fpsFrames = 0;
        m_fpsClock.restart();
    }

    update();
}

void VideoWidget::clearFrame() {
    m_pixmap = QPixmap();
    m_scaledPixmap = QPixmap();
    m_scaledForSize = QSize();
    m_scaledSourceSize = QSize();
    m_frameRect = QRect();
    m_hasFrame = false;
    m_fps = 0.0;
    m_fpsFrames = 0;
    m_frameAge.invalidate();
    update();
}

void VideoWidget::setMouseLook(bool enabled) {
    m_mouseLook = enabled;
    if (enabled) {
        setCursor(Qt::BlankCursor);
        setMouseTracking(true);
        centerCursor();
    } else {
        unsetCursor();
        setMouseTracking(false);
    }
}

void VideoWidget::setMouseLock(bool locked) {
    m_mouseLock = locked;
    if (!locked) {
        unsetCursor();
    } else if (m_mouseLook) {
        setCursor(Qt::BlankCursor);
        centerCursor();
    }
}

void VideoWidget::toggleMouseLock() {
    setMouseLock(!m_mouseLock);
}

void VideoWidget::centerCursor() {
    QPoint center = rect().center();
    QCursor::setPos(mapToGlobal(center));
}

void VideoWidget::rebuildScaledFrame() {
    if (!m_hasFrame || m_pixmap.isNull())
        return;

    QSize target = size();
    if (target.isEmpty())
        return;

    if (!m_scaledPixmap.isNull() &&
        m_scaledForSize == target &&
        m_scaledSourceSize == m_pixmap.size()) {
        return;
    }

    m_scaledPixmap = m_pixmap.scaled(target, Qt::KeepAspectRatio, Qt::FastTransformation);
    m_scaledForSize = target;
    m_scaledSourceSize = m_pixmap.size();
    m_frameRect = QRect(QPoint((width() - m_scaledPixmap.width()) / 2,
                               (height() - m_scaledPixmap.height()) / 2),
                        m_scaledPixmap.size());
}

void VideoWidget::drawFrameOverlay(QPainter& p, const QRect& frameRect) {
    if (!frameRect.isValid())
        return;

    bool stale = m_frameAge.isValid() && m_frameAge.elapsed() > 1600;
    int pulse = 165 + static_cast<int>(55 * (0.5 + 0.5 * qSin(m_animPhase * 2.4)));
    QColor badgeBg = stale ? QColor(120, 53, 15, 210) : QColor(6, 78, 59, 210);
    QColor dot = stale ? QColor(251, 191, 36, pulse) : QColor(52, 211, 153, pulse);
    QString text = stale
        ? QString("暂停 %1s").arg(m_frameAge.elapsed() / 1000.0, 0, 'f', 1)
        : QString("%1 FPS").arg(qRound(m_fps));

    QFont badgeFont;
    badgeFont.setPixelSize(11);
    badgeFont.setBold(true);
    p.setFont(badgeFont);

    QRect badge(frameRect.left() + 12, frameRect.top() + 12, 92, 26);
    p.setPen(Qt::NoPen);
    p.setBrush(badgeBg);
    p.drawRoundedRect(badge, 6, 6);
    p.setBrush(dot);
    p.drawEllipse(QPointF(badge.left() + 14, badge.center().y()), 4, 4);
    p.setPen(QColor(248, 250, 252));
    p.drawText(badge.adjusted(26, 0, -8, 0), Qt::AlignVCenter | Qt::AlignLeft, text);

    QString sizeText = QString("%1 x %2").arg(m_pixmap.width()).arg(m_pixmap.height());
    QRect sizeBadge(frameRect.right() - 104, frameRect.top() + 12, 92, 26);
    p.setPen(Qt::NoPen);
    p.setBrush(QColor(15, 23, 42, 170));
    p.drawRoundedRect(sizeBadge, 6, 6);
    p.setPen(QColor(203, 213, 225));
    p.drawText(sizeBadge, Qt::AlignCenter, sizeText);

    if (stale) {
        QRect notice(frameRect.center().x() - 88, frameRect.center().y() - 18, 176, 36);
        p.setPen(Qt::NoPen);
        p.setBrush(QColor(15, 23, 42, 205));
        p.drawRoundedRect(notice, 8, 8);
        p.setPen(QColor(253, 230, 138));
        p.drawText(notice, Qt::AlignCenter, "视频流暂未更新");
    }
}

void VideoWidget::drawNoSignal(QPainter& p) {
    QRect r = rect();
    QLinearGradient bg(r.topLeft(), r.bottomRight());
    bg.setColorAt(0.0, QColor(12, 18, 32));
    bg.setColorAt(0.55, QColor(18, 26, 43));
    bg.setColorAt(1.0, QColor(8, 13, 24));
    p.fillRect(r, bg);

    p.setPen(QPen(QColor(34, 197, 94, 22), 1.0));
    int grid = 36;
    int offset = static_cast<int>(m_animPhase * 18) % grid;
    for (int x = -grid + offset; x < r.width(); x += grid)
        p.drawLine(x, r.top(), x, r.bottom());
    for (int y = -grid + offset; y < r.height(); y += grid)
        p.drawLine(r.left(), y, r.right(), y);

    int scanY = r.top() + static_cast<int>((0.5 + 0.5 * qSin(m_animPhase * 1.4)) * r.height());
    QLinearGradient scanGrad(r.left(), scanY - 22, r.left(), scanY + 22);
    scanGrad.setColorAt(0.0, QColor(34, 197, 94, 0));
    scanGrad.setColorAt(0.5, QColor(34, 197, 94, 34));
    scanGrad.setColorAt(1.0, QColor(34, 197, 94, 0));
    p.fillRect(QRect(r.left(), scanY - 22, r.width(), 44), scanGrad);

    QRect hintRect(r.center().x() - 150, r.center().y() - 44, 300, 88);
    hintRect = hintRect.intersected(r.adjusted(16, 16, -16, -16));

    p.setPen(Qt::NoPen);
    p.setBrush(QColor(255, 255, 255, 16));
    p.drawRoundedRect(hintRect, 8, 8);
    int borderAlpha = 70 + static_cast<int>(45 * (0.5 + 0.5 * qSin(m_animPhase * 1.8)));
    p.setPen(QPen(QColor(34, 197, 94, borderAlpha), 1.0));
    p.drawRoundedRect(hintRect.adjusted(0, 0, -1, -1), 8, 8);

    QFont title;
    title.setPixelSize(17);
    title.setBold(true);
    p.setFont(title);
    p.setPen(QColor(226, 232, 240));
    p.drawText(hintRect.adjusted(12, 12, -12, -42), Qt::AlignCenter, "等待视频流");

    QFont sub;
    sub.setPixelSize(12);
    p.setFont(sub);
    p.setPen(QColor(148, 163, 184));
    p.drawText(hintRect.adjusted(12, 44, -12, -10), Qt::AlignCenter, "连接后将显示实时画面");
}

void VideoWidget::paintEvent(QPaintEvent*) {
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing);

    QRect viewport = rect().adjusted(1, 1, -1, -1);
    QPainterPath viewportPath;
    viewportPath.addRoundedRect(QRectF(viewport), 8, 8);

    p.fillRect(rect(), QColor(8, 13, 24));
    p.save();
    p.setClipPath(viewportPath);

    if (m_hasFrame && !m_pixmap.isNull()) {
        p.fillRect(rect(), QColor(2, 6, 15));
        rebuildScaledFrame();
        if (!m_scaledPixmap.isNull())
            p.drawPixmap(m_frameRect.topLeft(), m_scaledPixmap);

        drawFrameOverlay(p, m_frameRect);

        // 十字准星
        if (m_mouseLook) {
            QPoint center = m_frameRect.isValid() ? m_frameRect.center() : rect().center();
            p.setPen(QPen(QColor(15, 23, 42, 180), 3.0));
            p.drawLine(center.x() - 18, center.y(), center.x() + 18, center.y());
            p.drawLine(center.x(), center.y() - 18, center.x(), center.y() + 18);
            p.setPen(QPen(QColor(96, 165, 250, 210), 1.2));
            p.drawLine(center.x() - 20, center.y(), center.x() + 20, center.y());
            p.drawLine(center.x(), center.y() - 20, center.x(), center.y() + 20);
            p.setPen(QPen(QColor(248, 250, 252, 200), 1.0));
            p.drawEllipse(center, 5, 5);
        }
    } else {
        drawNoSignal(p);
    }

    p.restore();
    p.setPen(QPen(QColor(148, 163, 184, 90), 1.0));
    p.drawPath(viewportPath);
}

void VideoWidget::mouseMoveEvent(QMouseEvent* event) {
    if (!m_mouseLook || !m_mouseLock) {
        QWidget::mouseMoveEvent(event);
        return;
    }

    QPoint center = rect().center();
    QPoint cur = event->pos();

    m_dx = -(cur.x() - center.x());
    m_dy = -(cur.y() - center.y());

    emit mouseDeltaChanged(m_dx, m_dy);

    // 居中光标
    centerCursor();
}

void VideoWidget::enterEvent(
#if QT_VERSION >= QT_VERSION_CHECK(6, 0, 0)
    QEnterEvent* event
#else
    QEvent* event
#endif
) {
    if (m_mouseLook && m_mouseLock) {
        setCursor(Qt::BlankCursor);
    }
    QWidget::enterEvent(event);
}

void VideoWidget::leaveEvent(QEvent* event) {
    QWidget::leaveEvent(event);
}

void VideoWidget::resizeEvent(QResizeEvent* event) {
    QWidget::resizeEvent(event);
    m_scaledPixmap = QPixmap();
    m_scaledForSize = QSize();
    if (m_mouseLook && m_mouseLock) {
        centerCursor();
    }
}
