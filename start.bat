@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ─── Paper Reader 一键启动脚本 ────────────────────────────────────────
REM  双击此脚本启动桌面模式应用（后端托管前端静态文件）
REM  关闭此窗口或按 Ctrl+C 终止后端进程
REM
REM  使用方式：
REM    1. 确保前端已构建：cd frontend && npm run build
REM    2. 双击 start.bat 或在项目根目录运行 start.bat
REM
REM  环境要求（二选一）：
REM    - uv（推荐）：https://docs.astral.sh/uv/
REM    - Python 3.12+：https://www.python.org/

REM ─── 配置 ─────────────────────────────────────────────────────────
set "APP_NAME=Paper Reader"
set "APP_URL=http://localhost:8000"
set "HEALTH_URL=http://localhost:8000/health"
set "MAX_WAIT=30"
set "POLL_INTERVAL=1"
set "PORT=8000"

REM ─── 确保工作目录为脚本所在目录（项目根目录）─────────────────────
cd /d "%~dp0"

REM ─── 检查前端构建产物 ──────────────────────────────────────────────
if not exist "frontend\dist\index.html" (
    echo.
    echo [错误] 前端未构建，请先运行以下命令：
    echo.
    echo     cd frontend ^&^& npm run build
    echo.
    echo 构建完成后再运行此脚本。
    echo.
    pause
    exit /b 1
)

REM ─── 设置桌面模式环境变量 ─────────────────────────────────────────
REM DESKTOP_MODE=true 让后端使用桌面模式路径和 CORS 配置
REM STATIC_DIR 相对于 backend/ 目录（uvicorn 工作目录）解析
REM   backend/../frontend/dist = 项目根/frontend/dist
set "DESKTOP_MODE=true"
set "STATIC_DIR=..\frontend\dist"
REM 前端 API_BASE 在构建时已通过 .env.production 设置为空（同源）

echo [配置] DESKTOP_MODE=true
echo [配置] STATIC_DIR=..\frontend\dist

REM ─── 检测 Python 命令 ─────────────────────────────────────────────
set "PYTHON_CMD="

REM 优先尝试 uv run（项目使用 uv 管理依赖）
where uv >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=uv run"
    echo [信息] 检测到 uv，使用 "uv run" 启动后端
) else (
    REM 备选：python -m uvicorn（需手动安装依赖到虚拟环境中）
    where python >nul 2>&1
    if %errorlevel% equ 0 (
        set "PYTHON_CMD=python -m"
        echo [信息] 未检测到 uv，使用 "python -m" 启动后端
        echo [提示] 推荐安装 uv 以获得更好的依赖管理：https://docs.astral.sh/uv/
    ) else (
        echo.
        echo [错误] 未找到 Python 运行环境。请安装以下任一：
        echo.
        echo     1. uv  （推荐）: https://docs.astral.sh/uv/
        echo     2. Python 3.12+ : https://www.python.org/
        echo.
        pause
        exit /b 1
    )
)

REM ─── 检查端口是否已被占用 ────────────────────────────────────────
netstat -ano 2>nul | findstr ":%PORT%.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo [警告] 端口 %PORT% 已被占用。后端可能无法启动。
    echo          如果已有 Paper Reader 实例在运行，请先关闭。
    echo.
    echo          按任意键继续，或关闭此窗口取消...
    pause >nul
)

REM ─── 打印启动 Banner ──────────────────────────────────────────────
echo.
echo ══════════════════════════════════════════════
echo   %APP_NAME%  —  桌面模式启动
echo ══════════════════════════════════════════════
echo   地址: %APP_URL%
echo   模式: DESKTOP_MODE=true
echo   日志: backend\backend.log
echo.
echo   关闭此窗口或按 Ctrl+C 停止后端服务
echo ══════════════════════════════════════════════
echo.

REM ─── 启动后端 ─────────────────────────────────────────────────────
echo [启动] 正在启动后端服务...
echo.

REM uvicorn 在 backend/ 目录下运行（pyproject.toml 和 uv.lock 在此）
REM STATIC_DIR 使用相对路径 ../frontend/dist（从 backend/ 向上到项目根）
REM 日志写回 backend\backend.log（从项目根目录可访问）
pushd backend
if "%PYTHON_CMD%"=="uv run" (
    start /B uv run uvicorn app.main:app --host 0.0.0.0 --port %PORT% > backend.log 2>&1
) else (
    start /B python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT% > backend.log 2>&1
)
popd

echo [信息] 后端日志: backend\backend.log
echo.

REM ─── 等待后端就绪（健康检查轮询）─────────────────────────────────
echo [等待] 正在等待后端服务就绪（最长等待 %MAX_WAIT% 秒）...
set "WAITED=0"

:health_check
if !WAITED! geq %MAX_WAIT% goto :health_timeout

REM 使用 PowerShell 进行健康检查（Windows 内置，比 curl 更可靠）
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%HEALTH_URL%' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1

if %errorlevel% equ 0 (
    goto :backend_ready
)

set /a "WAITED+=1"
echo [等待] 后端未就绪 ( !WAITED!/%MAX_WAIT%s )...
timeout /t %POLL_INTERVAL% /nobreak >nul 2>&1
goto :health_check

:health_timeout
echo.
echo [错误] 后端服务在 %MAX_WAIT% 秒内未就绪。
echo.
echo 可能原因：
echo   1. 端口 %PORT% 已被占用
echo   2. 后端启动失败（依赖缺失、配置错误等）
echo   3. 前端构建产物路径不正确
echo.
echo 请查看后端日志: backend\backend.log
echo.
pause
goto :cleanup

:backend_ready
echo.
echo [就绪] 后端服务已启动！
echo.

REM ─── 打开浏览器 ───────────────────────────────────────────────────
echo [打开] 正在打开浏览器...
start "" "%APP_URL%"

echo.
echo ──────────────────────────────────────────────
echo   %APP_NAME% 已启动，浏览器应已打开。
echo   地址: %APP_URL%
echo.
echo   关闭此窗口将停止后端服务。
echo ──────────────────────────────────────────────
echo.

REM ─── 保持脚本运行 ─────────────────────────────────────────────────
REM 用户关闭此窗口时，Windows 会终止控制台进程及其子进程
REM 按 Ctrl+C 会弹出终止确认，选择 Y 后进入 cleanup
echo [运行中] 关闭此窗口将停止后端服务...

:keep_alive
REM 循环等待，每 60 秒打印一次状态（最长等待 86400 秒 = 24 小时）
timeout /t 60 /nobreak >nul 2>&1
goto :keep_alive

:cleanup
echo.
echo [停止] 正在停止后端服务...

REM 通过端口查找并终止占用 %PORT% 端口的进程
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT%.*LISTENING"') do (
    echo [停止] 终止进程 %%a （端口 %PORT%）
    taskkill /F /PID %%a >nul 2>&1
)

echo [停止] 后端服务已停止。
echo.
pause
endlocal