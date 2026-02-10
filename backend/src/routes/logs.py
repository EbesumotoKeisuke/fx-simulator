"""
ログ受信APIルート

フロントエンドからのログを受信し、ファイルに記録します。
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Any
from pathlib import Path
import json
import time
from logging.handlers import RotatingFileHandler
import logging

router = APIRouter(prefix="/logs", tags=["logs"])


class LogRequest(BaseModel):
    """フロントエンドからのログリクエスト"""
    level: str
    source: str
    message: str
    data: Optional[Any] = None
    userAgent: str
    url: str
    timestamp: str


class LogResponse(BaseModel):
    """ログ受信レスポンス"""
    success: bool
    message: str


# フロントエンドログ用のロガーを設定
_frontend_logger: Optional[logging.Logger] = None


def _get_frontend_logger() -> logging.Logger:
    """フロントエンドログ専用のロガーを取得"""
    global _frontend_logger

    if _frontend_logger is None:
        _frontend_logger = logging.getLogger("frontend")
        _frontend_logger.setLevel(logging.DEBUG)

        # ログディレクトリを設定
        current_file = Path(__file__).resolve()
        project_root = current_file.parent.parent.parent.parent
        log_dir = project_root / "logs" / "frontend"
        log_dir.mkdir(parents=True, exist_ok=True)

        # ハンドラーが未設定の場合のみ追加
        if not _frontend_logger.handlers:
            # フォーマッター
            formatter = logging.Formatter(
                "%(asctime)s - %(levelname)s - %(message)s",
                "%Y-%m-%d %H:%M:%S"
            )

            # ファイルハンドラー
            handler = RotatingFileHandler(
                log_dir / "app.log",
                maxBytes=1_000_000,
                backupCount=10,
                encoding="utf-8"
            )
            handler.setLevel(logging.DEBUG)
            handler.setFormatter(formatter)
            _frontend_logger.addHandler(handler)

    return _frontend_logger


@router.post("", response_model=LogResponse)
async def receive_log(request: LogRequest) -> LogResponse:
    """
    フロントエンドからのログを受信

    フロントエンドで発生したエラーや重大なイベントを
    バックエンドのログファイルに記録します。

    Args:
        request: フロントエンドからのログリクエスト

    Returns:
        ログ受信結果
    """
    try:
        frontend_logger = _get_frontend_logger()

        # データをJSON文字列に変換
        data_str = ""
        if request.data is not None:
            try:
                data_str = f" | data: {json.dumps(request.data, ensure_ascii=False)}"
            except (TypeError, ValueError):
                data_str = f" | data: {str(request.data)}"

        # ログメッセージを構築
        log_message = (
            f"[{request.source}] {request.message}{data_str} | "
            f"url: {request.url} | ua: {request.userAgent[:50]}..."
        )

        # ログレベルに応じて出力
        level = request.level.upper()
        if level == "CRITICAL":
            frontend_logger.critical(log_message)
        elif level == "ERROR":
            frontend_logger.error(log_message)
        elif level == "WARNING":
            frontend_logger.warning(log_message)
        elif level == "INFO":
            frontend_logger.info(log_message)
        else:
            frontend_logger.debug(log_message)

        return LogResponse(success=True, message="Log received")

    except Exception as e:
        return LogResponse(success=False, message=str(e))
