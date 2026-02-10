"""
ロガーユーティリティのテスト

ログ設定、ログ出力、ファイル出力をテストします。
"""

import pytest
import os
import logging
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

# テスト対象のモジュールをインポート
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.logger import LoggerSetting, get_logger, InfoFilter, ErrorFilter, JSTFormatter


class TestInfoFilter:
    """InfoFilterのテスト"""

    def test_filter_info_level(self):
        """INFOレベル以上を通す"""
        filter_obj = InfoFilter()
        record = MagicMock()
        record.levelno = logging.INFO
        assert filter_obj.filter(record) is True

    def test_filter_warning_level(self):
        """WARNINGレベルを通す"""
        filter_obj = InfoFilter()
        record = MagicMock()
        record.levelno = logging.WARNING
        assert filter_obj.filter(record) is True

    def test_filter_error_level(self):
        """ERRORレベルを通す"""
        filter_obj = InfoFilter()
        record = MagicMock()
        record.levelno = logging.ERROR
        assert filter_obj.filter(record) is True

    def test_filter_debug_level(self):
        """DEBUGレベルを通さない"""
        filter_obj = InfoFilter()
        record = MagicMock()
        record.levelno = logging.DEBUG
        assert filter_obj.filter(record) is False


class TestErrorFilter:
    """ErrorFilterのテスト"""

    def test_filter_error_level(self):
        """ERRORレベル以上を通す"""
        filter_obj = ErrorFilter()
        record = MagicMock()
        record.levelno = logging.ERROR
        assert filter_obj.filter(record) is True

    def test_filter_critical_level(self):
        """CRITICALレベルを通す"""
        filter_obj = ErrorFilter()
        record = MagicMock()
        record.levelno = logging.CRITICAL
        assert filter_obj.filter(record) is True

    def test_filter_warning_level(self):
        """WARNINGレベルを通さない"""
        filter_obj = ErrorFilter()
        record = MagicMock()
        record.levelno = logging.WARNING
        assert filter_obj.filter(record) is False

    def test_filter_info_level(self):
        """INFOレベルを通さない"""
        filter_obj = ErrorFilter()
        record = MagicMock()
        record.levelno = logging.INFO
        assert filter_obj.filter(record) is False


class TestJSTFormatter:
    """JSTFormatterのテスト"""

    def test_format_time_jst(self):
        """日本時間でフォーマットされる"""
        formatter = JSTFormatter("%(asctime)s - %(message)s", "%Y-%m-%d %H:%M:%S")
        record = MagicMock()
        record.created = 0  # 1970-01-01 00:00:00 UTC
        record.getMessage.return_value = "test message"
        record.levelname = "INFO"
        record.name = "test"
        record.filename = "test.py"
        record.lineno = 1
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None

        # フォーマットが正しい形式であることを確認
        formatted_time = formatter.formatTime(record)
        # YYYY-MM-DD HH:MM:SS形式であることを検証
        import re
        assert re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", formatted_time) is not None

    def test_format_time_custom_format(self):
        """カスタムフォーマットで時刻をフォーマットできる"""
        formatter = JSTFormatter("%(asctime)s - %(message)s", "%Y/%m/%d")
        record = MagicMock()
        record.created = 0

        formatted_time = formatter.formatTime(record, "%Y/%m/%d")
        # YYYY/MM/DD形式であることを検証
        import re
        assert re.match(r"\d{4}/\d{2}/\d{2}", formatted_time) is not None


class TestGetLogger:
    """get_logger関数のテスト"""

    def test_get_logger_returns_logger(self):
        """ロガーを取得できる"""
        logger = get_logger("test_module")
        assert isinstance(logger, logging.Logger)

    def test_get_logger_same_name_returns_same_logger(self):
        """同じ名前で同じロガーを取得できる"""
        logger1 = get_logger("same_module")
        logger2 = get_logger("same_module")
        assert logger1 is logger2

    def test_get_logger_different_name_returns_different_logger(self):
        """異なる名前で異なるロガーを取得できる"""
        logger1 = get_logger("module_a")
        logger2 = get_logger("module_b")
        assert logger1 is not logger2


class TestLoggerFunctionality:
    """ロガー機能のテスト"""

    def test_logger_info(self, caplog):
        """INFOログを出力できる"""
        logger = get_logger("test_info")
        with caplog.at_level(logging.INFO):
            logger.info("テストメッセージ")
        assert "テストメッセージ" in caplog.text

    def test_logger_warning(self, caplog):
        """WARNINGログを出力できる"""
        logger = get_logger("test_warning")
        with caplog.at_level(logging.WARNING):
            logger.warning("警告メッセージ")
        assert "警告メッセージ" in caplog.text

    def test_logger_error(self, caplog):
        """ERRORログを出力できる"""
        logger = get_logger("test_error")
        with caplog.at_level(logging.ERROR):
            logger.error("エラーメッセージ")
        assert "エラーメッセージ" in caplog.text

    def test_logger_critical(self, caplog):
        """CRITICALログを出力できる"""
        logger = get_logger("test_critical")
        with caplog.at_level(logging.CRITICAL):
            logger.critical("重大エラーメッセージ")
        assert "重大エラーメッセージ" in caplog.text

    def test_logger_with_exception_info(self, caplog):
        """例外情報付きでログを出力できる"""
        logger = get_logger("test_exception")
        try:
            raise ValueError("テスト例外")
        except ValueError:
            with caplog.at_level(logging.ERROR):
                logger.error("エラー発生", exc_info=True)
        assert "エラー発生" in caplog.text
        assert "ValueError" in caplog.text
