// ============================================================
// 智能小车 · 视觉与操控平台 (C++ Qt 复刻版)
// 入口文件
// ============================================================
#include <QApplication>
#include "mainwindow.h"

int main(int argc, char* argv[]) {
    // 高DPI 支持
#if QT_VERSION < QT_VERSION_CHECK(6, 0, 0)
    QApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
    QApplication::setAttribute(Qt::AA_UseHighDpiPixmaps);
#endif

    QApplication app(argc, argv);
    app.setApplicationName("SmartCar");
    app.setApplicationVersion("2.0.0");
    app.setOrganizationName("SmartCarCtrl");

    // 全局默认字体
    QFont defaultFont("Microsoft YaHei", 10);
    defaultFont.setStyleStrategy(QFont::PreferAntialias);
    app.setFont(defaultFont);

    MainWindow window;
    window.show();

    return app.exec();
}
