#include "mainwindow.h"
#include "constants.h"
#include "settings.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGridLayout>
#include <QKeyEvent>
#include <QWheelEvent>
#include <QMouseEvent>
#include <QCloseEvent>
#include <QMessageBox>
#include <QTimer>
#include <QDateTime>
#include <QEvent>
#include <QGraphicsDropShadowEffect>
#include <QGraphicsOpacityEffect>
#include <QPropertyAnimation>
#include <QAbstractAnimation>
#include <QEasingCurve>
#include <QStyle>
#include <QTextCursor>
#include <QTextDocument>
#include <QStringList>
#include <QVector3D>
#include <QtMath>

// ============================================================
// 构造 / 析构
// ============================================================
MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent),
      m_settings(Settings::instance())
{
    m_settings.load();
    m_reduceMotion = qEnvironmentVariableIntValue("SMARTCAR_REDUCED_MOTION") > 0;
    setWindowTitle("智能小车 · 视觉与操控平台");
    resize(1300, 860);
    setMinimumSize(1024, 640);

    // 颜色预设
    m_colorPresets = {
        {"白", 255,255,255}, {"红", 255,0,0},   {"绿", 0,255,0},
        {"蓝", 0,0,255},     {"黄", 255,255,0}, {"青", 0,255,255},
        {"紫", 255,0,255},   {"关", 0,0,0}
    };

    m_keyState = {{"W",false},{"A",false},{"S",false},{"D",false}};

    buildUI();
    applyStyleSheet();
    startThreads();

    // 恢复上次保存的 IP 和配置
    m_ipInput->setText(m_settings.camIp());
    m_espInput->setText(m_settings.espIp());
    m_sensSlider->setValue(static_cast<int>(m_settings.mouseSens() * 10));

    // 中键切换鼠标锁定
    connect(m_video, &VideoWidget::mouseDeltaChanged, this, &MainWindow::onMouseDelta);
}

MainWindow::~MainWindow() {
    stopThreads();
}

// ============================================================
// UI 构建 —— 真实能力上位机布局
// ============================================================
void MainWindow::buildUI() {
    QWidget* central = new QWidget(this);
    central->setObjectName("root");
    setCentralWidget(central);

    QVBoxLayout* root = new QVBoxLayout(central);
    root->setContentsMargins(10, 10, 10, 10);
    root->setSpacing(8);

    auto makePanel = [this](const QString& objectName, const QString& title) {
        QWidget* panel = new QWidget(this);
        panel->setObjectName(objectName);
        QVBoxLayout* layout = new QVBoxLayout(panel);
        layout->setContentsMargins(12, 10, 12, 12);
        layout->setSpacing(8);
        if (!title.isEmpty()) {
            QLabel* t = new QLabel(title, panel);
            t->setObjectName("panelTitle");
            layout->addWidget(t);
        }
        return panel;
    };

    auto panelLayout = [](QWidget* panel) {
        return qobject_cast<QVBoxLayout*>(panel->layout());
    };

    auto makeBtn = [&](const QString& text, auto slot) {
        QPushButton* btn = new QPushButton(text, this);
        btn->setMinimumHeight(34);
        btn->setCursor(Qt::PointingHandCursor);
        if (text.contains("停止"))
            btn->setProperty(text == "停止全部" ? "danger" : "secondary", true);
        connect(btn, &QPushButton::clicked, this, slot);
        return btn;
    };

    QWidget* topBar = new QWidget(this);
    topBar->setObjectName("globalTopBar");
    QHBoxLayout* topHL = new QHBoxLayout(topBar);
    topHL->setContentsMargins(14, 8, 14, 8);
    topHL->setSpacing(10);

    QLabel* appIcon = new QLabel("CAR", this);
    appIcon->setObjectName("appIcon");
    appIcon->setFixedSize(36, 30);
    topHL->addWidget(appIcon);

    QLabel* appTitle = new QLabel("智能小车 · 视觉与控制平台", this);
    appTitle->setObjectName("appTitle");
    topHL->addWidget(appTitle);
    QLabel* version = new QLabel("v2.4.0", this);
    version->setObjectName("versionBadge");
    topHL->addWidget(version);
    topHL->addStretch();

    m_statusLabel = new QLabel("模式：未进入", this);
    m_statusLabel->setObjectName("modeStatus");
    topHL->addWidget(m_statusLabel);

    m_espLinkLabel = new QLabel("ESP32 离线 | -- ms | -- dBm", this);
    m_camLinkLabel = new QLabel("MaixVision 离线 | -- ms | -- dBm", this);
    m_espLinkLabel->setObjectName("linkBadge");
    m_camLinkLabel->setObjectName("linkBadge");
    m_espLinkLabel->setProperty("online", false);
    m_camLinkLabel->setProperty("online", false);
    topHL->addWidget(m_espLinkLabel);
    topHL->addWidget(m_camLinkLabel);

    QPushButton* stopButton = new QPushButton("紧急停机", this);
    stopButton->setObjectName("stopButton");
    stopButton->setMinimumHeight(36);
    stopButton->setCursor(Qt::PointingHandCursor);
    connect(stopButton, &QPushButton::clicked, this, &MainWindow::stopAll);
    topHL->addWidget(stopButton);
    root->addWidget(topBar);

    QWidget* body = new QWidget(this);
    body->setObjectName("bodyArea");
    QHBoxLayout* bodyLayout = new QHBoxLayout(body);
    bodyLayout->setContentsMargins(0, 0, 0, 0);
    bodyLayout->setSpacing(8);

    QWidget* leftColumn = new QWidget(this);
    leftColumn->setObjectName("leftColumn");
    leftColumn->setMinimumWidth(330);
    leftColumn->setMaximumWidth(380);
    QVBoxLayout* leftLayout = new QVBoxLayout(leftColumn);
    leftLayout->setContentsMargins(0, 0, 0, 0);
    leftLayout->setSpacing(8);

    m_dashboard = new Dashboard(this);
    leftLayout->addWidget(m_dashboard, 5);

    QWidget* colorPanel = makePanel("controlCard", "LED 快捷控制");
    QGridLayout* colorGrid = new QGridLayout();
    colorGrid->setContentsMargins(0, 0, 0, 0);
    colorGrid->setHorizontalSpacing(6);
    colorGrid->setVerticalSpacing(6);
    for (int i = 0; i < m_colorPresets.size(); i++) {
        auto& cp = m_colorPresets[i];
        QPushButton* btn = new QPushButton(cp.label, this);
        btn->setProperty("compact", true);
        btn->setFixedHeight(28);
        btn->setCursor(Qt::PointingHandCursor);
        int r = cp.r, g = cp.g, b = cp.b;
        connect(btn, &QPushButton::clicked, this, [this, r, g, b]{ sendLedColor(r, g, b); });
        int luminance = static_cast<int>(0.299 * r + 0.587 * g + 0.114 * b);
        QString fg = luminance > 150 ? "#020617" : "#F8FAFC";
        btn->setStyleSheet(QString(
            "QPushButton { background:rgb(%1,%2,%3); color:%4; border:1px solid rgba(255,255,255,70); border-radius:6px; font-weight:800; }"
            "QPushButton:hover { border:1px solid #F8FAFC; }")
            .arg(r).arg(g).arg(b).arg(fg));
        if (r == 0 && g == 0 && b == 0)
            btn->setStyleSheet("QPushButton { background:#020617; color:#FCA5A5; border:1px solid #7F1D1D; border-radius:6px; font-weight:800; }");
        colorGrid->addWidget(btn, i / 4, i % 4);
    }
    panelLayout(colorPanel)->addLayout(colorGrid);
    leftLayout->addWidget(colorPanel, 1);

    QWidget* logPanel = makePanel("controlCard", "系统日志");
    m_logBox = new QTextEdit(this);
    m_logBox->setObjectName("logBox");
    m_logBox->setReadOnly(true);
    m_logBox->setMinimumHeight(170);
    panelLayout(logPanel)->addWidget(m_logBox);
    leftLayout->addWidget(logPanel, 2);

    QWidget* centerColumn = new QWidget(this);
    centerColumn->setObjectName("centerColumn");
    QVBoxLayout* centerLayout = new QVBoxLayout(centerColumn);
    centerLayout->setContentsMargins(0, 0, 0, 0);
    centerLayout->setSpacing(8);

    QWidget* modeBar = new QWidget(this);
    modeBar->setObjectName("modeBar");
    QHBoxLayout* modeLayout = new QHBoxLayout(modeBar);
    modeLayout->setContentsMargins(12, 8, 12, 8);
    modeLayout->setSpacing(12);

    auto makeModeBtn = [&](const QString& text, const QString& mode) {
        QPushButton* btn = new QPushButton(text, this);
        btn->setObjectName("modeBtn_" + mode);
        btn->setProperty("modeButton", true);
        btn->setProperty("active", false);
        btn->setMinimumHeight(34);
        btn->setCursor(Qt::PointingHandCursor);
        connect(btn, &QPushButton::clicked, this, [this, mode]{ switchMode(mode); });
        return btn;
    };
    modeLayout->addWidget(makeModeBtn("自由驾驶", "STREAM"));
    modeLayout->addWidget(makeModeBtn("色块识别", "COLOR"));
    modeLayout->addWidget(makeModeBtn("视觉循迹", "LINE"));
    modeLayout->addStretch();
    centerLayout->addWidget(modeBar);

    m_video = new VideoWidget(this);
    centerLayout->addWidget(m_video, 8);

    QWidget* rightColumn = new QWidget(this);
    rightColumn->setObjectName("rightColumn");
    rightColumn->setMinimumWidth(330);
    rightColumn->setMaximumWidth(380);
    QVBoxLayout* rightLayout = new QVBoxLayout(rightColumn);
    rightLayout->setContentsMargins(0, 0, 0, 0);
    rightLayout->setSpacing(8);

    QWidget* drivePanel = makePanel("controlCard", "驾驶与云台");
    QVBoxLayout* driveLayout = panelLayout(drivePanel);
    QLabel* driveHint = new QLabel("W/S 前后 · A/D 横移 · Shift 高速 · 中键锁定视角 · 滚轮控制 S5", drivePanel);
    driveHint->setObjectName("hintText");
    driveHint->setWordWrap(true);
    driveLayout->addWidget(driveHint);

    m_sensLabel = new QLabel(QString("鼠标灵敏度：%1").arg(m_settings.mouseSens(), 0, 'f', 1), drivePanel);
    m_sensLabel->setObjectName("mutedLabel");
    m_sensSlider = new QSlider(Qt::Horizontal, this);
    m_sensSlider->setRange(6, 30);
    m_sensSlider->setValue(static_cast<int>(m_settings.mouseSens() * 10));
    connect(m_sensSlider, &QSlider::valueChanged, this, &MainWindow::onSensitivityChanged);
    driveLayout->addWidget(m_sensLabel);
    driveLayout->addWidget(m_sensSlider);
    rightLayout->addWidget(drivePanel, 1);

    // 色块识别与机械臂控制
    QWidget* actionWidget = makePanel("controlCard", "色块识别 / 机械臂");
    QVBoxLayout* actionLayout = panelLayout(actionWidget);
    QHBoxLayout* colorBar = new QHBoxLayout();
    colorBar->setContentsMargins(0, 0, 0, 0);
    colorBar->setSpacing(8);
    colorBar->addWidget(new QLabel("目标颜色", actionWidget));
    m_colorSelect = new QComboBox(this);
    m_colorSelect->addItems({"Red", "Green", "Blue"});
    colorBar->addWidget(m_colorSelect);
    colorBar->addStretch();
    actionLayout->addLayout(colorBar);

    QGridLayout* actionGrid = new QGridLayout();
    actionGrid->setContentsMargins(0, 0, 0, 0);
    actionGrid->setHorizontalSpacing(8);
    actionGrid->setVerticalSpacing(8);
    actionGrid->addWidget(makeBtn("向前抓取", &MainWindow::sendGrab), 0, 0);
    actionGrid->addWidget(makeBtn("自动对齐", &MainWindow::toggleAlign), 0, 1);
    actionGrid->addWidget(makeBtn("自动拾取", &MainWindow::toggleAutoPick), 1, 0);
    actionGrid->addWidget(makeBtn("停止自动", &MainWindow::stopAuto), 1, 1);
    actionGrid->addWidget(makeBtn("停止循迹", &MainWindow::stopLine), 2, 0);
    actionGrid->addWidget(makeBtn("停止全部", &MainWindow::stopAll), 2, 1);
    actionLayout->addLayout(actionGrid);
    rightLayout->addWidget(actionWidget, 2);

    QWidget* helpWidget = new QWidget(this);
    helpWidget->setObjectName("helpPanel");
    QVBoxLayout* helpLayout = new QVBoxLayout(helpWidget);
    helpLayout->setContentsMargins(12, 10, 12, 10);
    helpLayout->setSpacing(6);
    QLabel* helpTitle = new QLabel("DRIVE MAP", this);
    helpTitle->setObjectName("panelTitle");
    QLabel* helpText = new QLabel("W/S 前后  A/D 横移\nShift 高速  中键锁定视角\n滚轮控制 S5  停止全部优先", this);
    helpText->setObjectName("hintText");
    helpLayout->addWidget(helpTitle);
    helpLayout->addWidget(helpText);
    rightLayout->addWidget(helpWidget, 2);

    // 连接栏
    QWidget* connWidget = new QWidget(this);
    connWidget->setObjectName("connectionStrip");
    QHBoxLayout* connBar = new QHBoxLayout(connWidget);
    connBar->setContentsMargins(10, 8, 10, 8);
    connBar->setSpacing(8);
    connBar->addWidget(new QLabel("视频流地址", this));
    m_ipInput = new QLineEdit(m_settings.camIp(), this);
    m_ipInput->setPlaceholderText("例如 <YOUR_CAMERA_IP>");
    m_ipInput->setMinimumWidth(150);
    connBar->addWidget(m_ipInput);
    QPushButton* btnStream = new QPushButton("连接视频流", this);
    btnStream->setMinimumHeight(34);
    btnStream->setCursor(Qt::PointingHandCursor);
    connect(btnStream, &QPushButton::clicked, this, &MainWindow::startStream);
    connBar->addWidget(btnStream);
    connBar->addSpacing(20);
    connBar->addWidget(new QLabel("ESP32 地址", this));
    m_espInput = new QLineEdit(m_settings.espIp(), this);
    m_espInput->setPlaceholderText("例如 <YOUR_DEVICE_IP>");
    m_espInput->setMinimumWidth(150);
    connBar->addWidget(m_espInput);
    QPushButton* btnEsp = new QPushButton("连接ESP32", this);
    btnEsp->setMinimumHeight(34);
    btnEsp->setCursor(Qt::PointingHandCursor);
    connect(btnEsp, &QPushButton::clicked, this, &MainWindow::connectESP32);
    connBar->addWidget(btnEsp);
    centerLayout->addWidget(connWidget, 1);
    rightLayout->addStretch();

    bodyLayout->addWidget(leftColumn, 2);
    bodyLayout->addWidget(centerColumn, 6);
    bodyLayout->addWidget(rightColumn, 2);
    root->addWidget(body, 1);

    setupInteractiveEffects();
    animatePanelEntrance({topBar, leftColumn, centerColumn, rightColumn});
}

void MainWindow::refreshStyle(QWidget* widget) {
    if (!widget)
        return;
    widget->style()->unpolish(widget);
    widget->style()->polish(widget);
    widget->update();
}

void MainWindow::setupInteractiveEffects() {
    const auto buttons = findChildren<QPushButton*>();
    for (QPushButton* button : buttons) {
        button->setCursor(Qt::PointingHandCursor);
        button->setFocusPolicy(Qt::StrongFocus);
        button->installEventFilter(this);

        if (!m_reduceMotion && !button->graphicsEffect()) {
            auto* glow = new QGraphicsDropShadowEffect(button);
            glow->setBlurRadius(0);
            glow->setOffset(0, 0);
            glow->setColor(QColor(34, 197, 94, 0));
            button->setGraphicsEffect(glow);
        }
    }

    const auto edits = findChildren<QLineEdit*>();
    for (QLineEdit* edit : edits)
        edit->setFocusPolicy(Qt::StrongFocus);

    if (m_colorSelect)
        m_colorSelect->setFocusPolicy(Qt::StrongFocus);
}

void MainWindow::animatePanelEntrance(const QList<QWidget*>& panels) {
    if (m_reduceMotion)
        return;

    int delayMs = 0;
    for (QWidget* panel : panels) {
        if (!panel)
            continue;

        auto* effect = new QGraphicsOpacityEffect(panel);
        effect->setOpacity(0.0);
        panel->setGraphicsEffect(effect);

        QTimer::singleShot(delayMs, this, [panel, effect] {
            auto* anim = new QPropertyAnimation(effect, "opacity", effect);
            anim->setDuration(260);
            anim->setStartValue(0.0);
            anim->setEndValue(1.0);
            anim->setEasingCurve(QEasingCurve::OutCubic);
            QObject::connect(anim, &QPropertyAnimation::finished, panel, [panel, effect] {
                if (panel->graphicsEffect() == effect)
                    panel->setGraphicsEffect(nullptr);
            });
            anim->start(QAbstractAnimation::DeleteWhenStopped);
        });
        delayMs += 55;
    }
}

bool MainWindow::eventFilter(QObject* watched, QEvent* event) {
    if (QPushButton* button = qobject_cast<QPushButton*>(watched)) {
        if (event->type() == QEvent::Enter ||
            event->type() == QEvent::Leave ||
            event->type() == QEvent::MouseButtonPress ||
            event->type() == QEvent::MouseButtonRelease ||
            event->type() == QEvent::FocusIn ||
            event->type() == QEvent::FocusOut) {

            bool hovered = event->type() == QEvent::Enter || button->underMouse();
            bool pressed = event->type() == QEvent::MouseButtonPress;
            bool focused = button->hasFocus() || event->type() == QEvent::FocusIn;

            if (event->type() == QEvent::Leave)
                hovered = false;
            if (event->type() == QEvent::MouseButtonRelease)
                pressed = false;
            if (event->type() == QEvent::FocusOut)
                focused = false;

            button->setProperty("hovered", hovered);
            button->setProperty("pressed", pressed);
            button->setProperty("focused", focused);
            refreshStyle(button);

            if (!m_reduceMotion) {
                if (auto* effect = qobject_cast<QGraphicsDropShadowEffect*>(button->graphicsEffect())) {
                    int blur = hovered || focused ? 22 : 0;
                    QColor color = button->property("danger").toBool() || button->objectName() == "stopButton"
                        ? QColor(239, 68, 68, hovered || focused ? 150 : 0)
                        : QColor(34, 197, 94, hovered || focused ? 135 : 0);

                    auto* blurAnim = new QPropertyAnimation(effect, "blurRadius", effect);
                    blurAnim->setDuration(hovered || focused ? 150 : 190);
                    blurAnim->setEndValue(blur);
                    blurAnim->setEasingCurve(QEasingCurve::OutCubic);
                    blurAnim->start(QAbstractAnimation::DeleteWhenStopped);

                    auto* colorAnim = new QPropertyAnimation(effect, "color", effect);
                    colorAnim->setDuration(hovered || focused ? 150 : 190);
                    colorAnim->setEndValue(color);
                    colorAnim->setEasingCurve(QEasingCurve::OutCubic);
                    colorAnim->start(QAbstractAnimation::DeleteWhenStopped);
                }
            }
        }
    }

    return QMainWindow::eventFilter(watched, event);
}

// ============================================================
// 深色科技风毛玻璃样式
// ============================================================
void MainWindow::applyStyleSheet() {
    setStyleSheet(R"(
        QMainWindow {
            background-color: #020617;
        }
        QWidget#root {
            background: #020617;
        }
        QWidget {
            color: #E2E8F0;
            font-family: "Fira Sans", "Microsoft YaHei", "Segoe UI", sans-serif;
            font-size: 13px;
        }

        QWidget#globalTopBar,
        QWidget#modeBar,
        QWidget#connectionStrip,
        QWidget#helpPanel,
        QWidget#controlCard {
            background: #0F172A;
            border: 1px solid #1E293B;
            border-radius: 8px;
        }
        QWidget#bodyArea,
        QWidget#leftColumn,
        QWidget#centerColumn,
        QWidget#rightColumn {
            background: transparent;
        }

        QLabel#appTitle {
            color: #F8FAFC;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
            font-size: 18px;
            font-weight: 700;
        }
        QLabel#appIcon {
            color: #E0F2FE;
            background: #0F172A;
            border: 1px solid #334155;
            border-radius: 7px;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
            font-size: 11px;
            font-weight: 800;
            qproperty-alignment: AlignCenter;
        }
        QLabel#versionBadge {
            color: #CBD5E1;
            background: #0B1120;
            border: 1px solid #334155;
            border-radius: 6px;
            padding: 3px 10px;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
        }
        QLabel#appSubtitle {
            color: #64748B;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
            font-size: 10px;
            font-weight: 600;
        }
        QLabel#panelTitle {
            color: #94A3B8;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
        }
        QLabel#hintText {
            color: #CBD5E1;
            line-height: 145%;
        }
        QLabel#metricTile {
            color: #CBD5E1;
            background: #020617;
            border: 1px solid #1E293B;
            border-radius: 7px;
            padding: 8px;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
        }
        QLabel#mutedLabel {
            color: #94A3B8;
            min-width: 58px;
        }
        QLabel#valueLabel {
            color: #CBD5E1;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
            min-width: 38px;
        }
        QLabel#successText {
            color: #22C55E;
            font-weight: 700;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
        }
        QGroupBox {
            background: #0B1120;
            border: 1px solid #1E293B;
            border-radius: 8px;
            margin-top: 14px;
            padding: 10px 10px 8px 10px;
            font-weight: 600;
        }
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 12px;
            padding: 0 8px;
            color: #22C55E;
            font-size: 12px;
        }

        QPushButton {
            background: #1E293B;
            border: 1px solid #334155;
            border-radius: 7px;
            padding: 7px 14px;
            color: #E2E8F0;
            font-weight: 600;
        }
        QPushButton:hover {
            background: #263449;
            border: 1px solid #22C55E;
            color: #F8FAFC;
        }
        QPushButton[hovered="true"] {
            border-color: #22C55E;
            color: #F8FAFC;
        }
        QPushButton[focused="true"] {
            border: 1px solid #38BDF8;
        }
        QPushButton[pressed="true"] {
            background: #020617;
        }
        QPushButton:pressed {
            background: #0B1120;
            border: 1px solid #16A34A;
        }
        QPushButton:disabled {
            color: #64748B;
            background: #0B1120;
            border: 1px solid #1E293B;
        }
        QPushButton[compact="true"] {
            padding: 4px 8px;
            font-size: 12px;
        }
        QPushButton[secondary="true"] {
            color: #FBBF24;
            border-color: #854D0E;
            background: #1C1917;
        }
        QPushButton[danger="true"] {
            color: #FCA5A5;
            border-color: #7F1D1D;
            background: #1F1114;
        }
        QPushButton[modeButton="true"] {
            min-width: 96px;
        }
        QPushButton[active="true"] {
            background: #22C55E;
            border: 1px solid #22C55E;
            color: #020617;
        }
        QPushButton#stopButton {
            background: #7F1D1D;
            border: 1px solid #EF4444;
            color: #FEE2E2;
            min-width: 86px;
        }
        QPushButton#stopButton:hover {
            background: #991B1B;
            border-color: #FCA5A5;
        }

        QLineEdit, QComboBox {
            background: #020617;
            border: 1px solid #334155;
            border-radius: 7px;
            padding: 7px 10px;
            color: #F8FAFC;
            selection-background-color: #166534;
        }
        QLineEdit:focus, QComboBox:focus {
            border: 1px solid #22C55E;
            background: #0B1120;
        }
        QLineEdit:hover, QComboBox:hover {
            border-color: #475569;
        }
        QComboBox::drop-down {
            border: none;
            subcontrol-origin: padding;
            subcontrol-position: top right;
            width: 26px;
        }
        QComboBox QAbstractItemView {
            background: #0F172A;
            border: 1px solid #334155;
            border-radius: 7px;
            padding: 4px;
            selection-background-color: #166534;
            selection-color: #F8FAFC;
        }

        QTextEdit#logBox {
            background: #020617;
            border: 1px solid #1E293B;
            border-radius: 8px;
            padding: 10px;
            color: #A7F3D0;
            font-family: "Fira Code", "Consolas", monospace;
            font-size: 12px;
        }

        QLabel {
            color: #94A3B8;
            background: transparent;
        }
        QLabel#modeStatus {
            color: #F8FAFC;
            font-weight: 700;
            padding: 0 8px;
            font-family: "Fira Code", "Microsoft YaHei", monospace;
        }
        QLabel#linkBadge {
            color: #FCA5A5;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 6px;
            background: #1F1114;
            border: 1px solid #7F1D1D;
        }
        QLabel#linkBadge[online="true"] {
            color: #BBF7D0;
            background: #052E16;
            border: 1px solid #166534;
        }

        QSlider::groove:horizontal {
            height: 5px;
            background: #1E293B;
            border-radius: 3px;
        }
        QSlider::handle:horizontal {
            width: 18px;
            height: 18px;
            margin: -7px 0;
            background: #22C55E;
            border-radius: 9px;
            border: 2px solid #0F172A;
        }
        QSlider::sub-page:horizontal {
            background: #16A34A;
            border-radius: 3px;
        }
        QSlider:focus {
            border: none;
        }
    )");
}

// ============================================================
// 线程管理
// ============================================================
void MainWindow::startThreads() {
    // 传感器数据 (颜色 + 循迹)
    m_sensorThread = new SensorReceiver([this]{ return m_ipInput->text().trimmed(); }, this);
    connect(m_sensorThread, &SensorReceiver::colorData, this, &MainWindow::onColorData);
    connect(m_sensorThread, &SensorReceiver::lineData, this, &MainWindow::onLineData);
    m_sensorThread->start();

    // 外部指令监听
    m_cmdListener = new CmdListener(GUI_CMD_PORT, this);
    connect(m_cmdListener, &CmdListener::commandReceived, this, &MainWindow::onCmd);
    m_cmdListener->start();

    // 指令队列
    m_ctrl = new UdpController(this);
    m_cmdQueue = new CommandQueue(
        [this]{ return m_state.espIp; },
        [this]{ return m_ipInput->text().trimmed(); },
        this
    );
    m_cmdQueue->start();

    // 链路监测
    m_espMonitor = new LinkMonitor([this]{ return m_state.espIp; }, ESP32_UDP_PORT, this);
    connect(m_espMonitor, &LinkMonitor::update, this, &MainWindow::onEspLink);
    m_espMonitor->start();

    m_camMonitor = new LinkMonitor([this]{ return m_ipInput->text().trimmed(); }, CTRL_PORT, this);
    connect(m_camMonitor, &LinkMonitor::update, this, &MainWindow::onCamLink);
    m_camMonitor->start();

    // 驾驶指令定时器 (15ms)
    m_ctrlTimer = new QTimer(this);
    connect(m_ctrlTimer, &QTimer::timeout, this, &MainWindow::sendDriveCmd);
    m_ctrlTimer->start(15);

    // 仪表盘刷新定时器 (100ms)
    m_dashTimer = new QTimer(this);
    connect(m_dashTimer, &QTimer::timeout, this, &MainWindow::updateDashboard);
    m_dashTimer->start(100);
}

void MainWindow::stopThreads() {
    if (m_sensorThread) { m_sensorThread->stop(); m_sensorThread->wait(3000); }
    if (m_cmdListener)  { m_cmdListener->stop();  m_cmdListener->wait(2000); }
    if (m_cmdQueue)     { m_cmdQueue->stop();     m_cmdQueue->wait(2000); }
    if (m_espMonitor)   { m_espMonitor->stop();   m_espMonitor->wait(3000); }
    if (m_camMonitor)   { m_camMonitor->stop();   m_camMonitor->wait(3000); }
    if (m_videoThread)  { m_videoThread->stop();  m_videoThread->wait(3000); }
}

// ============================================================
// 模式切换
// ============================================================
void MainWindow::switchMode(const QString& mode) {
    m_state.driveEnabled = (mode == "STREAM");

    if (mode == "STREAM") {
        m_statusLabel->setText("模式：自由驾驶");
        m_cmdQueue->enqueue("CAM", "MODE:STREAM");
        sendArm(ARM_ACTION_STREAM);
        m_video->setMouseLook(true);
        m_state.mouseLook = true;
        m_state.lineEnabled = false;
    } else if (mode == "COLOR") {
        m_statusLabel->setText("模式：色块识别");
        m_cmdQueue->enqueue("CAM", "MODE:COLOR");
        sendArm(ARM_ACTION_TRACK);
        m_video->setMouseLook(false);
        m_state.mouseLook = false;
        m_state.lineEnabled = false;
    } else if (mode == "LINE") {
        m_statusLabel->setText("模式：视觉循迹");
        m_cmdQueue->enqueue("CAM", "MODE:LINE");
        sendArm(ARM_ACTION_TRACK);
        m_video->setMouseLook(false);
        m_state.mouseLook = false;
        m_state.lineEnabled = true;
        setSpeed(LINE_SPEED_MODE);
    }

    m_state.currentMode = mode == "STREAM" ? "自由驾驶" :
                          mode == "COLOR"  ? "色块识别" : "视觉循迹";

    for (const QString& key : QStringList{"STREAM", "COLOR", "LINE"}) {
        if (QPushButton* btn = findChild<QPushButton*>("modeBtn_" + key)) {
            btn->setProperty("active", key == mode);
            btn->style()->unpolish(btn);
            btn->style()->polish(btn);
            btn->update();
        }
    }

    driveOverride("WS");
}

// ============================================================
// 连接
// ============================================================
void MainWindow::connectESP32() {
    m_state.espIp = m_espInput->text().trimmed();
    if (m_state.espIp.isEmpty()) {
        log("ESP32 地址为空，未发送注册请求");
        return;
    }

    m_settings.setEspIp(m_state.espIp);
    setSpeed(SPEED_LOW);
    m_ctrl->sendGuiReg(m_state.espIp, GUI_CMD_PORT);

    int r = m_settings.ledR(), g = m_settings.ledG(), b = m_settings.ledB();
    if (r > 0 || g > 0 || b > 0)
        m_ctrl->sendLed(m_state.espIp, r, g, b);

    log("已向 ESP32 发送 GUI 注册请求: " + m_state.espIp);
}

void MainWindow::startStream() {
    QString ip = m_ipInput->text().trimmed();
    if (ip.isEmpty()) return;
    m_settings.setCamIp(ip);
    m_state.camIp = ip;

    if (m_videoThread) {
        m_videoThread->stop();
        m_videoThread->wait(2000);
        m_videoThread->deleteLater();
        m_videoThread = nullptr;
    }
    m_video->clearFrame();
    if (m_camLinkLabel) {
        m_camLinkLabel->setText("MaixVision 连接中 | -- ms | -- dBm");
        m_camLinkLabel->setProperty("online", false);
        m_camLinkLabel->style()->unpolish(m_camLinkLabel);
        m_camLinkLabel->style()->polish(m_camLinkLabel);
    }

    m_videoThread = new VideoReceiver(ip, this);
    connect(m_videoThread, &VideoReceiver::frameReceived, this, &MainWindow::onFrame);
    connect(m_videoThread, &VideoReceiver::logMessage, this, [this](const QString& s){ log(s); });
    m_videoThread->start();

    log("开始连接视频流: " + ip);
}

// ============================================================
// 速度控制
// ============================================================
void MainWindow::setSpeed(int mode) {
    if (m_state.espIp.isEmpty()) return;
    if (mode == m_state.speedMode) return;

    m_cmdQueue->enqueue("ESP32", QString("S %1").arg(mode));
    m_state.speedMode = mode;
    m_state.currentGear = ::speedName(mode);
}

// ============================================================
// 麦轮混控
// ============================================================
QVector<int> MainWindow::mixMecanum(double strafe, double forward, double rotate) {
    double fl = forward + strafe + rotate;
    double fr = forward - strafe - rotate;
    double rl = forward - strafe + rotate;
    double rr = forward + strafe - rotate;

    double mag = qMax(1.0, qMax(qMax(qAbs(fl), qAbs(fr)), qMax(qAbs(rl), qAbs(rr))));

    auto discretize = [](double v) -> int {
        if (v > 0.2) return 1;
        if (v < -0.2) return -1;
        return 0;
    };

    return {discretize(fl / mag), discretize(fr / mag),
            discretize(rl / mag), discretize(rr / mag)};
}

QVector<int> MainWindow::driveFromKey(const QString& key) {
    // 驱动向量: (strafe, forward, rotate)
    static QMap<QString, QVector3D> vectors = {
        {"W",  {0, 1, 0}}, {"S",  {0, -1, 0}},
        {"A",  {-1,0, 0}}, {"D",  {1, 0, 0}},
        {"WA", {-1,1, 0}}, {"WD", {1, 1, 0}},
        {"SA", {-1,-1,0}}, {"SD", {1,-1, 0}},
        {"WS", {0, 0, 0}},
    };

    if (key == "AS") return mixMecanum(0, 0, 1);   // 逆时针
    if (key == "DS") return mixMecanum(0, 0, -1);  // 顺时针

    auto v = vectors.value(key, {0, 0, 0});
    return mixMecanum(v.x(), v.y(), v.z());
}

void MainWindow::driveOverride(const QString& key) {
    if (m_state.espIp.isEmpty()) return;

    // 原地旋转自动提速
    if (key == "AS" || key == "DS") {
        if (!m_state.rotationBoosted) {
            m_state.savedSpeedBeforeRotate = m_state.speedMode;
            setSpeed(SPEED_HIGH);
            m_state.rotationBoosted = true;
        }
    } else {
        if (m_state.rotationBoosted) {
            setSpeed(m_state.savedSpeedBeforeRotate);
            m_state.rotationBoosted = false;
        }
    }

    QVector<int> m = driveFromKey(key);
    m_ctrl->sendDrive(m_state.espIp, m);

    // 更新方向
    if (key == "W")       m_state.currentDir = "前进";
    else if (key == "S")  m_state.currentDir = "后退";
    else if (key == "A")  m_state.currentDir = "左转";
    else if (key == "D")  m_state.currentDir = "右转";
    else if (key == "WA") m_state.currentDir = "左前进";
    else if (key == "WD") m_state.currentDir = "右前进";
    else if (key == "SA") m_state.currentDir = "左后退";
    else if (key == "SD") m_state.currentDir = "右后退";
    else if (key == "AS") m_state.currentDir = "逆时针转";
    else if (key == "DS") m_state.currentDir = "顺时针转";
    else                  m_state.currentDir = "停止";

    // 模拟速度
    if (key == "WS" || key.isEmpty())
        m_state.currentSpeed = qMax(0, m_state.currentSpeed - 2);
    else
        m_state.currentSpeed = qMin(100, m_state.currentSpeed + 5);
}

void MainWindow::driveFor(const QString& key, int ms) {
    driveOverride(key);
    QTimer::singleShot(ms, this, [this]{ driveOverride("WS"); });
}

void MainWindow::microMove(const QString& key) {
    if (m_state.espIp.isEmpty()) return;
    QVector<int> m = driveFromKey(key);
    m_ctrl->sendDrive(m_state.espIp, m);
    QTimer::singleShot(m_state.microStepMs, this, [this, key]{
        m_ctrl->sendDrive(m_state.espIp, {0,0,0,0});
    });
}

// ============================================================
// 键盘事件
// ============================================================
void MainWindow::keyPressEvent(QKeyEvent* event) {
    if (event->isAutoRepeat()) return;

    if (event->key() == Qt::Key_Shift && !m_state.autoPick)
        setSpeed(SPEED_HIGH);

    if (m_state.autoAlign || m_state.autoPick || m_state.lineEnabled)
        return;

    switch (event->key()) {
    case Qt::Key_W: m_keyState["W"] = true; break;
    case Qt::Key_A: m_keyState["A"] = true; break;
    case Qt::Key_S: m_keyState["S"] = true; break;
    case Qt::Key_D: m_keyState["D"] = true; break;
    default: break;
    }
}

void MainWindow::keyReleaseEvent(QKeyEvent* event) {
    if (event->isAutoRepeat()) return;

    if (event->key() == Qt::Key_Shift && !m_state.autoPick)
        setSpeed(SPEED_LOW);

    if (m_state.autoAlign || m_state.autoPick || m_state.lineEnabled)
        return;

    switch (event->key()) {
    case Qt::Key_W: m_keyState["W"] = false; break;
    case Qt::Key_A: m_keyState["A"] = false; break;
    case Qt::Key_S: m_keyState["S"] = false; break;
    case Qt::Key_D: m_keyState["D"] = false; break;
    default: break;
    }
}

void MainWindow::wheelEvent(QWheelEvent* event) {
    if (!m_state.driveEnabled) return;
    int step = event->angleDelta().y() > 0 ? 10 : -10;
    m_state.s5Pwm = qBound(S5_MIN, m_state.s5Pwm + step, S5_MAX);
    sendArmServo(-1, -1, m_state.s5Pwm, 60);
}

void MainWindow::mousePressEvent(QMouseEvent* event) {
    if (event->button() == Qt::MiddleButton)
        m_video->toggleMouseLock();
}

// ============================================================
// 定时发送驾驶指令
// ============================================================
void MainWindow::sendDriveCmd() {
    if (!m_state.driveEnabled || !m_state.espConnected) return;
    if (m_state.autoAlign || m_state.autoPick || m_state.lineEnabled) return;

    bool w = m_keyState["W"], a = m_keyState["A"];
    bool s = m_keyState["S"], d = m_keyState["D"];

    QString key;
    if (w && s)       key = "WS";
    else if (w && a)  key = "WA";
    else if (w && d)  key = "WD";
    else if (s && a)  key = "AS";
    else if (s && d)  key = "DS";
    else if (w)       key = "W";
    else if (s)       key = "S";
    else if (a)       key = "A";
    else if (d)       key = "D";
    else              key = "WS";

    if (key != m_state.lastDriveKey) {
        driveOverride(key);
        m_state.lastDriveKey = key;
    }
}

void MainWindow::finishTurn() {
    m_lineTracker.finishTurn();
    driveOverride("WS");
}

// ============================================================
// 机械臂 / 灯
// ============================================================
void MainWindow::sendGrab() {
    sendArm(ARM_GRAB);
    QMessageBox::information(this, "提示", "已执行一次向前抓取");
}

void MainWindow::sendLedColor(int r, int g, int b) {
    m_settings.setLedColor(r, g, b);
    if (m_state.espIp.isEmpty()) return;
    m_cmdQueue->enqueue("ESP32", QString("STM LED %1 %2 %3").arg(r).arg(g).arg(b));
}

void MainWindow::sendArm(const QString& cmd) {
    if (m_state.espIp.isEmpty()) return;
    m_cmdQueue->enqueue("ESP32", QString("ARM %1").arg(cmd));
    log(QString("UART> %1").arg(cmd));
}

void MainWindow::sendArmServo(int s0, int s3, int s5, int t) {
    QString parts;
    if (s0 >= 0) parts += QString("#000P%1T%2!").arg(s0, 4, 10, QChar('0')).arg(t, 4, 10, QChar('0'));
    if (s3 >= 0) parts += QString("#003P%1T%2!").arg(s3, 4, 10, QChar('0')).arg(t, 4, 10, QChar('0'));
    if (s5 >= 0) parts += QString("#005P%1T%2!").arg(s5, 4, 10, QChar('0')).arg(t, 4, 10, QChar('0'));
    if (parts.isEmpty()) return;
    sendArm("{" + parts + "}");
}

void MainWindow::toggleAlign() {
    m_state.autoAlign = !m_state.autoAlign;
    log(m_state.autoAlign ? "自动对齐已开启" : "自动对齐已关闭");
}

void MainWindow::toggleAutoPick() {
    if (m_state.autoPick) {
        m_state.autoAlign = false;
        m_state.autoPick = false;
        m_colorAligner.reset();
        setSpeed(SPEED_LOW);
        log("自动拾取已关闭");
    } else {
        m_state.autoPick = true;
        m_state.autoAlign = true;
        m_colorAligner.reset();
        setSpeed(SPEED_MICRO);
        log("自动拾取已开启（微调对齐）");
    }
}

void MainWindow::stopAuto() {
    m_state.autoAlign = false;
    m_state.autoPick = false;
    m_colorAligner.reset();
    setSpeed(SPEED_LOW);
    log("已停止自动拾取/对齐");
}

void MainWindow::stopLine() {
    m_state.lineEnabled = false;
    m_lineTracker.reset();
    driveOverride("WS");
    log("已停止循迹");
}

void MainWindow::stopAll() {
    stopLine();
    stopAuto();
    driveOverride("WS");
    setSpeed(SPEED_LOW);
    log("已停止全部动作");
}

// ============================================================
// 回调
// ============================================================
void MainWindow::onFrame(const QImage& rgb) {
    m_video->setFrame(rgb);
}

void MainWindow::onColorData(const QMap<QString, QPoint>& colors, int) {
    if (!m_state.autoAlign && !m_state.autoPick) return;

    ColorResult result = m_colorAligner.process(colors, m_colorSelect->currentText());
    if (result.aligned) {
        if (m_state.autoPick) {
            sendArm(ARM_GRAB);
            toggleAutoPick();
            QMessageBox::information(this, "提示", "自动拾取完成");
        }
    } else {
        if (m_state.autoPick && !result.moveKey.isEmpty())
            microMove(result.moveKey);
    }
}

void MainWindow::onLineData(const QMap<QString, int>& fields) {
    if (!m_state.lineEnabled) return;

    LineResult result = m_lineTracker.process(fields);
    if (result.action == "TURN_LEFT") {
        driveOverride("A");
        QTimer::singleShot(result.turnMs, this, &MainWindow::finishTurn);
    } else if (result.action == "TURN_RIGHT") {
        driveOverride("D");
        QTimer::singleShot(result.turnMs, this, &MainWindow::finishTurn);
    } else if (!result.action.isEmpty()) {
        driveOverride(result.action);
    }
}

void MainWindow::onCmd(const QString& cmd) {
    if (!cmd.startsWith("CMD ")) return;
    QStringList parts = cmd.split(' ');
    if (parts.size() < 3) return;

    QString t = parts[1];
    if (t == "MOVE") {
        QString dir = parts[2];
        int dur = parts.size() >= 4 ? parts[3].toInt() : 1000;
        if (dir == "FWD")       driveFor("W", dur);
        else if (dir == "BACK") driveFor("S", dur);
        else if (dir == "LEFT") driveFor("A", dur);
        else if (dir == "RIGHT")driveFor("D", dur);
        else if (dir == "STOP") driveOverride("WS");
    } else if (t == "ARM") {
        QString v = parts.mid(2).join(' ');
        if (v == "GRAB") {
            sendArm(ARM_GRAB);
        } else if (v == "WAVE") {
            sendArm(ARM_WAVE);
            QTimer::singleShot(4000, this, [this]{ sendArm(ARM_WAVE_BACK); });
        }
    } else if (t == "LED") {
        QString v = parts.mid(2).join(' ');
        if (v == "OFF") {
            sendLedColor(0, 0, 0);
        } else if (parts.size() >= 5) {
            sendLedColor(parts[2].toInt(), parts[3].toInt(), parts[4].toInt());
        }
    } else if (t == "MODE") {
        QString v = parts.mid(2).join(' ');
        if (v == "STREAM") switchMode("STREAM");
        else if (v == "COLOR") switchMode("COLOR");
        else if (v == "LINE") switchMode("LINE");
    } else if (t == "AUTOPICK") {
        if (parts[2] == "START") toggleAutoPick();
        else if (parts[2] == "STOP") stopAuto();
    } else if (t == "LINE") {
        QString v = parts.mid(2).join(' ');
        if (v == "START") switchMode("LINE");
        else if (v == "STOP") stopLine();
    }
}

void MainWindow::onEspLink(bool ok, int latency, int rssi) {
    m_state.espConnected = ok;
    m_state.espLatency = latency;
    m_state.espRssi = rssi;

    if (m_espLinkLabel) {
        QString latencyText = ok && latency >= 0 ? QString("%1 ms").arg(latency) : "-- ms";
        QString rssiText = ok && rssi < 0 ? QString("%1 dBm").arg(rssi) : "-- dBm";
        m_espLinkLabel->setText(QString("ESP32 %1 | %2 | %3")
                                .arg(QString(ok ? "在线" : "离线"), latencyText, rssiText));
        m_espLinkLabel->setProperty("online", ok);
        m_espLinkLabel->style()->unpolish(m_espLinkLabel);
        m_espLinkLabel->style()->polish(m_espLinkLabel);
        m_espLinkLabel->update();
    }
}

void MainWindow::onCamLink(bool ok, int latency, int rssi) {
    m_state.camLatency = latency;
    m_state.camRssi = rssi;

    if (m_camLinkLabel) {
        QString latencyText = ok && latency >= 0 ? QString("%1 ms").arg(latency) : "-- ms";
        QString rssiText = ok && rssi < 0 ? QString("%1 dBm").arg(rssi) : "-- dBm";
        m_camLinkLabel->setText(QString("MaixVision %1 | %2 | %3")
                                .arg(QString(ok ? "在线" : "离线"), latencyText, rssiText));
        m_camLinkLabel->setProperty("online", ok);
        m_camLinkLabel->style()->unpolish(m_camLinkLabel);
        m_camLinkLabel->style()->polish(m_camLinkLabel);
        m_camLinkLabel->update();
    }
}

void MainWindow::onMouseDelta(double dx, double dy) {
    if (!m_state.mouseLook || !m_state.driveEnabled) return;
    if (m_state.autoPick || m_state.autoAlign) return;

    double now = QDateTime::currentMSecsSinceEpoch() / 1000.0;

    // 平滑滤波
    m_state.mouseDxFilt = MOUSE_SMOOTH_ALPHA * dx + (1 - MOUSE_SMOOTH_ALPHA) * m_state.mouseDxFilt;
    m_state.mouseDyFilt = MOUSE_SMOOTH_ALPHA * dy + (1 - MOUSE_SMOOTH_ALPHA) * m_state.mouseDyFilt;

    double fx = qBound(-MOUSE_MAX_STEP, m_state.mouseDxFilt, MOUSE_MAX_STEP);
    double fy = qBound(-MOUSE_MAX_STEP, m_state.mouseDyFilt, MOUSE_MAX_STEP);

    if (now - m_state.mouseLastSend >= (1.0 / MOUSE_SEND_HZ)) {
        m_state.mouseAccumX += fx * m_settings.mouseSens();
        m_state.mouseAccumY += fy * m_settings.mouseSens();

        int stepX = 0, stepY = 0;
        if (qAbs(m_state.mouseAccumX) >= MOUSE_MIN_STEP) {
            stepX = static_cast<int>(m_state.mouseAccumX);
            m_state.mouseAccumX -= stepX;
        }
        if (qAbs(m_state.mouseAccumY) >= MOUSE_MIN_STEP) {
            stepY = static_cast<int>(m_state.mouseAccumY);
            m_state.mouseAccumY -= stepY;
        }

        if (stepX != 0 || stepY != 0) {
            m_state.s0Pwm = qBound(S0_MIN, m_state.s0Pwm + stepX, S0_MAX);
            m_state.s3Pwm = qBound(S3_MIN, m_state.s3Pwm - stepY, S3_MAX);
            sendArmServo(m_state.s0Pwm, m_state.s3Pwm, -1, 60);
        }

        m_state.mouseLastSend = now;
    }
}

void MainWindow::onSensitivityChanged(int value) {
    double sens = value / 10.0;
    m_settings.setMouseSens(sens);
    m_sensLabel->setText(QString("鼠标灵敏度：%1").arg(sens, 0, 'f', 1));
}

void MainWindow::updateDashboard() {
    m_dashboard->setSpeed(m_state.currentSpeed);
    m_dashboard->setGear(m_state.currentGear);
    m_dashboard->setDirection(m_state.currentDir);
    m_dashboard->setMode(m_state.currentMode);
    m_dashboard->setSignal(m_state.espRssi);
    m_dashboard->setLatency(m_state.espLatency);
    m_dashboard->setServos(m_state.s0Pwm, m_state.s3Pwm, m_state.s5Pwm);
    m_dashboard->setConnectionStatus(m_state.espConnected,
                                     m_state.camLatency >= 0);
}

// ============================================================
// 日志
// ============================================================
void MainWindow::log(const QString& msg) {
    if (!m_logBox) return;

    QString ts = QDateTime::currentDateTime().toString("HH:mm:ss");
    m_logBox->append(QString("[%1] %2").arg(ts, msg));

    constexpr int MAX_LOG_BLOCKS = 260;
    QTextDocument* doc = m_logBox->document();
    while (doc->blockCount() > MAX_LOG_BLOCKS) {
        QTextCursor cursor(doc);
        cursor.movePosition(QTextCursor::Start);
        cursor.select(QTextCursor::BlockUnderCursor);
        cursor.removeSelectedText();
        cursor.deleteChar();
    }
    m_logBox->moveCursor(QTextCursor::End);
}

// ============================================================
// 关闭
// ============================================================
void MainWindow::closeEvent(QCloseEvent* event) {
    stopThreads();
    event->accept();
}
