#pragma once

#include <QString>
#include <QJsonObject>
#include <QPair>
#include "constants.h"

// ============================================================
// JSON 设置读写
// ============================================================
class Settings {
public:
    static Settings& instance();

    // 加载/保存
    void load();
    void save();

    // 存取器
    double mouseSens() const;
    void setMouseSens(double val);

    QPair<int,int> ledColor() const; // (r,g,b 三元组,第三项存 b*256)
    void setLedColor(int r, int g, int b);
    int ledR() const, ledG() const, ledB() const;

    QString espIp() const;
    void setEspIp(const QString& ip);

    QString camIp() const;
    void setCamIp(const QString& ip);

    QString filePath() const;

private:
    Settings() = default;
    QJsonObject m_data;
};
