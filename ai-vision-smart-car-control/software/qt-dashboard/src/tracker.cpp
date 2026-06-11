#include "tracker.h"
#include <QtMath>
#include <algorithm>

// ============================================================
// LineTracker
// ============================================================

void LineTracker::reset() {
    m_turning = false;
    m_pendingTurnDir.clear();
    m_cornerSeenCount = 0;
    m_cornerLostCount = 0;
    m_errHist.clear();
    m_widthHist.clear();
    m_pidI = 0.0;
    m_pidPrev = 0.0;
}

void LineTracker::finishTurn() {
    m_turning = false;
    m_pendingTurnDir.clear();
    m_cornerSeenCount = 0;
    m_cornerLostCount = 0;
}

LineResult LineTracker::process(const QMap<QString, int>& line) {
    if (m_turning)
        return {"", 0};

    int bf = line.value("bf", 0);
    int mf = line.value("mf", 0);
    int tf = line.value("tf", 0);

    int bcx = line.value("bcx", -1);
    int bl  = line.value("bl", -1);
    int br  = line.value("br", -1);
    int tcx = line.value("tcx", -1);

    int center = LINE_FRAME_W / 2;
    int cornerThresh = static_cast<int>(LINE_FRAME_W * LINE_CORNER_T);

    // 转弯检测: 顶部检测到线段但中间没有 → 可能是弯道
    if (tf && !mf) {
        if (tcx < center - cornerThresh) {
            m_cornerSeenCount++;
            m_pendingTurnDir = "LEFT";
        } else if (tcx > center + cornerThresh) {
            m_cornerSeenCount++;
            m_pendingTurnDir = "RIGHT";
        }
    } else {
        m_cornerSeenCount = qMax(0, m_cornerSeenCount - 1);
    }

    // 确认转弯
    if (!m_pendingTurnDir.isEmpty() &&
        m_cornerSeenCount >= LINE_TURN_CONFIRM &&
        !bf && !mf)
    {
        m_cornerLostCount++;
        if (m_cornerLostCount >= LINE_LOST_CONFIRM) {
            m_turning = true;
            QString act = (m_pendingTurnDir == "LEFT") ? "TURN_LEFT" : "TURN_RIGHT";
            return {act, LINE_TURN_MS};
        }
    } else {
        m_cornerLostCount = 0;
    }

    // 底部线丢失 → 停止
    if (!bf)
        return {"WS", 0};

    // PID 循迹
    double width = br - bl;
    m_widthHist.enqueue(width);
    double smoothWidth = 0;
    for (int i = 0; i < m_widthHist.size(); i++)
        smoothWidth += m_widthHist.at(i);
    smoothWidth /= m_widthHist.size();
    if (m_widthHist.size() > LINE_ERR_WIN)
        m_widthHist.dequeue();

    if (smoothWidth < LINE_WIDTH_MIN || smoothWidth > LINE_WIDTH_MAX)
        return {"WS", 0};

    double err = bcx - center;
    m_errHist.enqueue(err);
    double smoothErr = 0;
    for (int i = 0; i < m_errHist.size(); i++)
        smoothErr += m_errHist.at(i);
    smoothErr /= m_errHist.size();
    if (m_errHist.size() > LINE_ERR_WIN)
        m_errHist.dequeue();

    m_pidI += smoothErr;
    double d = smoothErr - m_pidPrev;
    double out = PID_KP * smoothErr + PID_KI * m_pidI + PID_KD * d;
    m_pidPrev = smoothErr;
    out = qBound(-PID_OUT_MAX, out, PID_OUT_MAX);

    if (qAbs(out) <= LINE_TOL)
        return {"W", 0};
    else if (out > 0)
        return {qAbs(out) >= LINE_TOL_STRONG ? "WD" : "W", 0};
    else
        return {qAbs(out) >= LINE_TOL_STRONG ? "WA" : "W", 0};
}

// ============================================================
// ColorAligner
// ============================================================

void ColorAligner::reset() {
    m_alignCount = 0;
}

ColorResult ColorAligner::process(const QMap<QString, QPoint>& colors,
                                   const QString& targetColor)
{
    if (!colors.contains(targetColor)) {
        m_alignCount = 0;
        return {"", false, 0};
    }

    QPoint pos = colors[targetColor];
    int dx = -(pos.x() - TARGET_X);
    int dy = pos.y() - TARGET_Y;

    if (qAbs(dx) <= ALIGN_TOL && qAbs(dy) <= ALIGN_TOL) {
        m_alignCount++;
        return {"", true, m_alignCount};
    }

    m_alignCount = 0;
    QString move;
    if (dx < -ALIGN_TOL)       move = "A";
    else if (dx > ALIGN_TOL)   move = "D";
    else if (dy < -ALIGN_TOL)  move = "W";
    else                       move = "S";

    return {move, false, 0};
}
