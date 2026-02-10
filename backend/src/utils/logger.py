"""
ログ管理ユーティリティ

アプリケーション全体で使用するログ設定を提供します。
ログレベル別にファイル出力を行い、ローテーション機能を備えています。

ログレベル:
- INFO: 情報（処理完了、APIリクエスト成功など）
- WARNING: 警告（リトライ発生、閾値接近など）
- ERROR: エラー（API失敗、バリデーションエラーなど）
- CRITICAL: 重大エラー（サーバー停止、DB接続不可など）
"""

import logging
import os
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional


class InfoFilter(logging.Filter):
    """INFO以上のログのみを通すフィルター"""
    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= logging.INFO


class ErrorFilter(logging.Filter):
    """ERROR以上のログのみを通すフィルター"""
    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= logging.ERROR


class JSTFormatter(logging.Formatter):
    """日本時間（JST）でフォーマットするフォーマッター"""

    def converter(self, timestamp: float) -> time.struct_time:
        """UTCタイムスタンプをJSTに変換"""
        return time.localtime(timestamp + 9 * 3600)

    def formatTime(self, record: logging.LogRecord, datefmt: Optional[str] = None) -> str:
        """レコードの時刻をJSTでフォーマット"""
        ct = self.converter(record.created)
        if datefmt:
            s = time.strftime(datefmt, ct)
        else:
            s = time.strftime("%Y-%m-%d %H:%M:%S", ct)
        return s


class LoggerSetting:
    """
    ログ設定クラス

    各モジュールでロガーを初期化する際に使用します。
    ログレベル別にファイル出力を行い、自動ローテーション機能を提供します。

    使用例:
        from src.utils.logger import get_logger
        logger = get_logger(__name__)
        logger.info("処理が完了しました")
    """

    # ログ設定
    MAX_BYTES = 1_000_000      # 1MB
    BACKUP_COUNT = 10          # バックアップファイル数

    # ログフォーマット
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
    DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

    # ログディレクトリ（プロジェクトルートからの相対パス）
    _log_dir: Optional[Path] = None
    _initialized: bool = False

    def __init__(self, name: str):
        """
        ロガーを初期化

        Args:
            name: ロガー名（通常は __name__ を使用）
        """
        self.name = name
        self.logger = logging.getLogger(name)

        # 初回のみログディレクトリとハンドラーを設定
        if not LoggerSetting._initialized:
            self._setup_log_directory()
            LoggerSetting._initialized = True

        # このロガーにハンドラーが設定されていない場合のみ設定
        if not self.logger.handlers:
            self._setup_handlers()

    def _setup_log_directory(self) -> None:
        """ログディレクトリを設定・作成"""
        # プロジェクトルートを探す（backend/src/utils/logger.py から3階層上）
        current_file = Path(__file__).resolve()
        project_root = current_file.parent.parent.parent.parent

        LoggerSetting._log_dir = project_root / "logs" / "backend"
        LoggerSetting._log_dir.mkdir(parents=True, exist_ok=True)

    def _setup_handlers(self) -> None:
        """ログハンドラーを設定"""
        self.logger.setLevel(logging.DEBUG)

        # フォーマッター（JST対応）
        formatter = JSTFormatter(self.LOG_FORMAT, self.DATE_FORMAT)

        # コンソールハンドラー
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.DEBUG)
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)

        if LoggerSetting._log_dir:
            # INFOハンドラー（INFO以上をファイル出力）
            info_handler = RotatingFileHandler(
                LoggerSetting._log_dir / "app_info.log",
                maxBytes=self.MAX_BYTES,
                backupCount=self.BACKUP_COUNT,
                encoding="utf-8"
            )
            info_handler.setLevel(logging.INFO)
            info_handler.addFilter(InfoFilter())
            info_handler.setFormatter(formatter)
            self.logger.addHandler(info_handler)

            # ERRORハンドラー（ERROR以上をファイル出力）
            error_handler = RotatingFileHandler(
                LoggerSetting._log_dir / "app_error.log",
                maxBytes=self.MAX_BYTES,
                backupCount=self.BACKUP_COUNT,
                encoding="utf-8"
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.addFilter(ErrorFilter())
            error_handler.setFormatter(formatter)
            self.logger.addHandler(error_handler)

            # DEBUGハンドラー（開発環境用、環境変数で制御）
            if os.environ.get("DEBUG", "").lower() == "true":
                debug_handler = RotatingFileHandler(
                    LoggerSetting._log_dir / "app_debug.log",
                    maxBytes=self.MAX_BYTES,
                    backupCount=self.BACKUP_COUNT,
                    encoding="utf-8"
                )
                debug_handler.setLevel(logging.DEBUG)
                debug_handler.setFormatter(formatter)
                self.logger.addHandler(debug_handler)


# グローバルロガーキャッシュ
_loggers: dict[str, logging.Logger] = {}


def get_logger(name: str) -> logging.Logger:
    """
    ロガーを取得

    同じ名前のロガーは再利用されます。

    Args:
        name: ロガー名（通常は __name__ を使用）

    Returns:
        設定済みのロガーインスタンス

    使用例:
        from src.utils.logger import get_logger

        logger = get_logger(__name__)

        # 情報ログ
        logger.info("シミュレーションを開始しました")

        # 警告ログ
        logger.warning(f"証拠金維持率が低下しています: {margin_rate}%")

        # エラーログ
        logger.error(f"注文作成に失敗しました: {error_message}")

        # 重大エラーログ
        logger.critical(f"データベース接続に失敗しました: {exception}")
    """
    if name not in _loggers:
        logger_setting = LoggerSetting(name)
        _loggers[name] = logger_setting.logger
    return _loggers[name]
