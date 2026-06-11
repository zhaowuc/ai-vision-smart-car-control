#pragma once

#include <QMap>
#include <QPoint>
#include <QString>
#include <QQueue>
#include "constants.h"

// ============================================================
// 行动结果
// ============================================================
struct LineResult {
    QString action;     // "W" / "WA" / "WD" / "WS" / "TURN_LEFT" / "TURN_RIGHT"
    int turnMs = 0;     // 转向时长 ms
};

struct ColorResult {
    QString moveKey;    // "W" / "A" / "S" / "D" / "" (空=已对齐)
    bool aligned = false;
    int alignCount = 0;
};

// ============================================================
// ① 视觉循迹 —— PID 控制器 + 状态机
// ============================================================
class LineTracker {
public:
    LineTracker() = default;

    LineResult process(const QMap<QString, int>& line);
    void reset();
    void finishTurn();

    bool isTurning() const { return m_turning; }

private:
    bool m_turning          = false;
    QString m_pendingTurnDir;
    int m_cornerSeenCount   = 0;
    int m_cornerLostCount   = 0;

    // PID 历史
    QQueue<double> m_errHist;
    QQueue<double> m_widthHist;
    double m_pidI   = 0.0;
    double m_pidPrev = 0.0;
};

// ============================================================
// ② 色块对齐器
// ============================================================
class ColorAligner {
public:
    ColorAligner() = default;

    ColorResult process(const QMap<QString, QPoint>& colors,
                        const QString& targetColor);
    void reset();

private:
    int m_alignCount = 0;
};
