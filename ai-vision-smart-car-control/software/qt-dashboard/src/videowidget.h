#pragma once

#include <QWidget>
#include <QImage>
#include <QPixmap>
#include <QPoint>
#include <QElapsedTimer>

class QTimer;

// ============================================================
// 视频显示组件 —— 支持鼠标视角控制
// ============================================================
class VideoWidget : public QWidget {
    Q_OBJECT

public:
    explicit VideoWidget(QWidget* parent = nullptr);

    // 设置帧画面
    void setFrame(const QImage& rgb);
    void clearFrame();

    // 鼠标视角
    void setMouseLook(bool enabled);
    void setMouseLock(bool locked);
    void toggleMouseLock();
    bool isMouseLocked() const { return m_mouseLock; }

    // 获取相对位移 (供外部发送舵机指令)
    struct MouseDelta { double dx; double dy; };
    MouseDelta mouseDelta() const { return {m_dx, m_dy}; }
    void resetMouseDelta() { m_dx = 0.0; m_dy = 0.0; }

signals:
    void mouseDeltaChanged(double dx, double dy);

protected:
    void paintEvent(QPaintEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
#if QT_VERSION >= QT_VERSION_CHECK(6, 0, 0)
    void enterEvent(QEnterEvent* event) override;
#else
    void enterEvent(QEvent* event) override;
#endif
    void leaveEvent(QEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;

private:
    void centerCursor();
    void rebuildScaledFrame();
    void drawFrameOverlay(class QPainter& p, const QRect& frameRect);
    void drawNoSignal(class QPainter& p);

    QPixmap m_pixmap;
    QPixmap m_scaledPixmap;
    QSize   m_scaledForSize;
    QSize   m_scaledSourceSize;
    QRect   m_frameRect;
    bool    m_hasFrame    = false;
    bool    m_mouseLook   = false;
    bool    m_mouseLock   = true;
    double  m_dx          = 0.0;
    double  m_dy          = 0.0;
    double  m_fps         = 0.0;
    int     m_fpsFrames   = 0;
    QElapsedTimer m_frameAge;
    QElapsedTimer m_fpsClock;
    QTimer* m_staleTimer = nullptr;
    QTimer* m_animTimer = nullptr;
    double  m_animPhase = 0.0;
};
