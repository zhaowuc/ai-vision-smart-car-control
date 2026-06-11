#pragma once

#include <QWidget>
#include <QString>

class QTimer;

// ============================================================
// 高性能仪表盘组件 —— 速度弧 / 挡位 / 方向 / 信号 / 舵机
// 深色科技风, 毛玻璃材质, 自绘渲染
// ============================================================
class Dashboard : public QWidget {
    Q_OBJECT

public:
    explicit Dashboard(QWidget* parent = nullptr);
    ~Dashboard() override = default;

    // ----- 数据更新接口 -----
    void setSpeed(int kmh);          // 0-100
    void setGear(const QString& gear);
    void setDirection(const QString& dir);
    void setMode(const QString& mode);
    void setSignal(int rssi);        // dBm, 负值
    void setLatency(int ms);
    void setServos(int s0, int s3, int s5);
    void setConnectionStatus(bool espOk, bool camOk);

protected:
    void paintEvent(QPaintEvent* event) override;
    void resizeEvent(QResizeEvent* event) override;

private:
    void drawSpeedArc(class QPainter& p, const QRect& rect);
    void drawGearBadge(class QPainter& p, const QRect& rect);
    void drawDirectionCross(class QPainter& p, const QRect& rect);
    void drawSignalBars(class QPainter& p, const QRect& rect);
    void drawInfoPanel(class QPainter& p, const QRect& rect);

    // 数据
    int     m_speed    = 0;
    QString m_gear     = "低速";
    QString m_dir      = "停止";
    QString m_mode     = "未进入";
    int     m_rssi     = -100;
    int     m_latency  = -1;
    int     m_s0 = 1500, m_s3 = 1100, m_s5 = 1100;
    bool    m_espOk = false, m_camOk = false;

    // 动画渐变
    double m_animSpeed = 0.0; // 平滑过渡
    double m_animPhase = 0.0;
    QTimer* m_animTimer = nullptr;
};
