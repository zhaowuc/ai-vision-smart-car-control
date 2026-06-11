#include "settings.h"
#include <QFile>
#include <QJsonDocument>
#include <QStandardPaths>
#include <QDir>
#include <QDebug>

Settings& Settings::instance() {
    static Settings s;
    return s;
}

QString Settings::filePath() const {
    QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    return dir + "/" SETTINGS_FILE_NAME;
}

void Settings::load() {
    QFile f(filePath());
    if (!f.open(QIODevice::ReadOnly)) {
        // 默认值
        m_data["mouse_sens"] = 1.0;
        m_data["led_r"] = 255;
        m_data["led_g"] = 255;
        m_data["led_b"] = 255;
        m_data["esp_ip"] = "";
        m_data["cam_ip"] = "";
        return;
    }
    QJsonDocument doc = QJsonDocument::fromJson(f.readAll());
    m_data = doc.object();
    f.close();
}

void Settings::save() {
    QFile f(filePath());
    if (f.open(QIODevice::WriteOnly)) {
        f.write(QJsonDocument(m_data).toJson());
        f.close();
    }
}

double Settings::mouseSens() const {
    return m_data.value("mouse_sens").toDouble(1.0);
}

void Settings::setMouseSens(double val) {
    m_data["mouse_sens"] = val;
    save();
}

QPair<int,int> Settings::ledColor() const {
    int r = m_data.value("led_r").toInt(255);
    int g = m_data.value("led_g").toInt(255);
    int b = m_data.value("led_b").toInt(255);
    return {r, (g << 16) | (b & 0xFFFF)};
}

void Settings::setLedColor(int r, int g, int b) {
    m_data["led_r"] = r;
    m_data["led_g"] = g;
    m_data["led_b"] = b;
    save();
}

int Settings::ledR() const { return m_data.value("led_r").toInt(255); }
int Settings::ledG() const { return m_data.value("led_g").toInt(255); }
int Settings::ledB() const { return m_data.value("led_b").toInt(255); }

QString Settings::espIp() const { return m_data.value("esp_ip").toString(""); }
void Settings::setEspIp(const QString& ip) { m_data["esp_ip"] = ip; save(); }

QString Settings::camIp() const { return m_data.value("cam_ip").toString(""); }
void Settings::setCamIp(const QString& ip) { m_data["cam_ip"] = ip; save(); }
