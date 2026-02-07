@echo off
REM FX Simulator 自動セットアップ・起動スクリプト
REM Claude Desktop MCP設定を自動作成してからDockerを起動します

echo ========================================
echo FX Simulator 自動セットアップ
echo ========================================
echo.

REM 1. Claude Desktop MCP設定を自動作成
echo [1/3] Claude Desktop MCP設定を作成中...
cd backend
python scripts\setup_claude_desktop.py
if errorlevel 1 (
    echo.
    echo [警告] Claude Desktop設定の作成に失敗しました
    echo Pythonがインストールされているか確認してください
    echo.
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] Dockerコンテナを起動中...
docker-compose up -d

if errorlevel 1 (
    echo.
    echo [エラー] Dockerの起動に失敗しました
    echo Docker Desktopが起動しているか確認してください
    echo.
    pause
    exit /b 1
)

echo.
echo [3/3] セットアップ完了
echo ========================================
echo.
echo 次のステップ:
echo 1. Claude Desktop を再起動してください
echo 2. ブラウザで http://localhost:3000 を開いてください
echo 3. Claude Desktop で以下のように質問してください:
echo    「FXシミュレーターのトレードパフォーマンスを分析してください」
echo.
echo ========================================
echo [成功] すべての準備が完了しました
echo ========================================
echo.
pause
