cmake_minimum_required(VERSION 3.16)
project(SmartCar VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

# 查找 Qt6
find_package(Qt6 REQUIRED COMPONENTS Widgets Network)
message(STATUS "Qt6 版本: ${Qt6_VERSION}")

set(SOURCES
    src/main.cpp
    src/settings.cpp
    src/dashboard.cpp
    src/videowidget.cpp
    src/networkmanager.cpp
    src/tracker.cpp
    src/mainwindow.cpp
)

set(HEADERS
    src/constants.h
    src/appstate.h
    src/settings.h
    src/dashboard.h
    src/videowidget.h
    src/networkmanager.h
    src/tracker.h
    src/mainwindow.h
)

add_executable(${PROJECT_NAME} WIN32 ${SOURCES} ${HEADERS})
target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(${PROJECT_NAME} PRIVATE Qt6::Widgets Qt6::Network)
