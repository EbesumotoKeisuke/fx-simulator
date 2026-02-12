# -*- coding: utf-8 -*-
"""
MCP FXシミュレーション分析サーバー（シミュレーションデータ）
Claude Desktop向けFastMCPサーバー（11ツール）

ツール名は sim_ プレフィックス付き。
stock-monitoring-system の actual_ プレフィックスツールと区別するため。
- sim_*    : シミュレーションデータ（SQLiteデータベースベース）
- actual_* : 実際の売買履歴データ（stock-monitoring-system側で提供）
"""

from fastmcp import FastMCP
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from datetime import datetime

from src.utils.database import SessionLocal
from src.services.trading_service import TradingService
from src.services.analytics_service import AnalyticsService
from src.services.alert_service import AlertService
from src.services.market_data_service import MarketDataService


# MCPサーバーを作成
mcp = FastMCP("fx-simulator-analytics")


def get_db() -> Session:
    """データベースセッションを取得"""
    return SessionLocal()


@mcp.tool()
def sim_get_trading_performance() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境の総合パフォーマンス指標を取得する。
    勝率・PF・最大DD・RR比等を返す。

    Returns:
        dict: パフォーマンス指標の辞書
    """
    db = get_db()
    try:
        analytics_service = AnalyticsService(db)
        result = analytics_service.get_performance_metrics()

        if "error" in result:
            return {
                "error": "トレードデータが不足しています",
                "message": "分析に必要なトレードデータが見つかりません"
            }

        return result
    finally:
        db.close()


@mcp.tool()
def sim_get_recent_trades(limit: int = 10) -> List[Dict[str, Any]]:
    """【シミュレーション】シミュレーション環境の最近のトレード履歴を取得する。

    Args:
        limit: 取得件数（デフォルト10、最大100）

    Returns:
        list: 最近のトレード履歴のリスト
    """
    # limitの上限を設定
    if limit > 100:
        limit = 100
    if limit < 1:
        limit = 1

    db = get_db()
    try:
        trading_service = TradingService(db)
        result = trading_service.get_trades(limit=limit, offset=0)
        return result.get("trades", [])
    finally:
        db.close()


@mcp.tool()
def sim_get_losing_trades_analysis() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境の負けトレードパターンを分析する。
    時間帯別分布・平均損失額・最大損失額を返す。

    Returns:
        dict: 損失トレードの分析結果
    """
    db = get_db()
    try:
        trading_service = TradingService(db)
        all_trades_result = trading_service.get_trades(limit=10000, offset=0)
        all_trades = all_trades_result.get("trades", [])

        if not all_trades:
            return {
                "error": "トレードデータが見つかりません",
                "total_losing_trades": 0,
                "trades": [],
                "average_loss": 0,
                "largest_loss": 0
            }

        # 損失トレードのみ抽出
        losing_trades = [
            t for t in all_trades
            if t.get("realized_pnl", 0) < 0
        ]

        if not losing_trades:
            return {
                "message": "損失トレードがありません",
                "total_losing_trades": 0,
                "trades": [],
                "average_loss": 0,
                "largest_loss": 0
            }

        # 損失トレードの分析
        total_loss = sum(t["realized_pnl"] for t in losing_trades)
        average_loss = total_loss / len(losing_trades)
        largest_loss = min(t["realized_pnl"] for t in losing_trades)

        # 時間帯別の分析（時間データがある場合）
        time_analysis = {}
        for trade in losing_trades:
            if "opened_at" in trade and trade["opened_at"]:
                # ISO形式から時間を抽出 (例: "2024-01-01T09:00:00" -> 9)
                hour = int(trade["opened_at"].split("T")[1].split(":")[0])
                time_analysis[hour] = time_analysis.get(hour, 0) + 1

        analysis = {
            "total_losing_trades": len(losing_trades),
            "trades": losing_trades,
            "average_loss": round(average_loss, 2),
            "largest_loss": round(largest_loss, 2),
            "total_loss": round(total_loss, 2),
            "time_distribution": time_analysis if time_analysis else None
        }

        return analysis
    finally:
        db.close()


@mcp.tool()
def sim_get_winning_trades_analysis() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境の勝ちトレード成功パターンを分析する。
    時間帯別分布・平均利益額・最大利益額を返す。

    Returns:
        dict: 勝ちトレードの分析結果
    """
    db = get_db()
    try:
        trading_service = TradingService(db)
        all_trades_result = trading_service.get_trades(limit=10000, offset=0)
        all_trades = all_trades_result.get("trades", [])

        if not all_trades:
            return {
                "error": "トレードデータが見つかりません",
                "total_winning_trades": 0,
                "trades": [],
                "average_profit": 0,
                "largest_profit": 0
            }

        # 勝ちトレードのみ抽出
        winning_trades = [
            t for t in all_trades
            if t.get("realized_pnl", 0) > 0
        ]

        if not winning_trades:
            return {
                "message": "勝ちトレードがありません",
                "total_winning_trades": 0,
                "trades": [],
                "average_profit": 0,
                "largest_profit": 0
            }

        # 勝ちトレードの分析
        total_profit = sum(t["realized_pnl"] for t in winning_trades)
        average_profit = total_profit / len(winning_trades)
        largest_profit = max(t["realized_pnl"] for t in winning_trades)

        # 時間帯別の分析（時間データがある場合）
        time_analysis = {}
        for trade in winning_trades:
            if "opened_at" in trade and trade["opened_at"]:
                # ISO形式から時間を抽出 (例: "2024-01-01T09:00:00" -> 9)
                hour = int(trade["opened_at"].split("T")[1].split(":")[0])
                time_analysis[hour] = time_analysis.get(hour, 0) + 1

        analysis = {
            "total_winning_trades": len(winning_trades),
            "trades": winning_trades,
            "average_profit": round(average_profit, 2),
            "largest_profit": round(largest_profit, 2),
            "total_profit": round(total_profit, 2),
            "time_distribution": time_analysis if time_analysis else None
        }

        return analysis
    finally:
        db.close()


@mcp.tool()
def sim_get_drawdown_data() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境のドローダウン統計を取得する。
    現在DD・最大DD・DD推移を返す。

    Returns:
        dict: ドローダウンデータ
    """
    db = get_db()
    try:
        analytics_service = AnalyticsService(db)
        result = analytics_service.get_drawdown_data()

        if "error" in result:
            return {
                "error": "ドローダウンデータが取得できません",
                "message": result["error"]
            }

        return result
    finally:
        db.close()


@mcp.tool()
def sim_get_equity_curve(interval: str = "trade") -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境の資産推移（エクイティカーブ）を取得する。

    Args:
        interval: データ粒度（'trade', 'hour', 'day'）

    Returns:
        dict: 資産曲線データ
    """
    # intervalの検証
    if interval not in ["trade", "hour", "day"]:
        interval = "trade"

    db = get_db()
    try:
        analytics_service = AnalyticsService(db)
        result = analytics_service.get_equity_curve(interval)

        if "error" in result:
            return {
                "error": "資産曲線データが取得できません",
                "message": result["error"]
            }

        return result
    finally:
        db.close()


@mcp.tool()
def sim_get_trade_analysis_summary() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境の総合分析サマリーと改善提案を生成する。
    時間帯別勝率・連敗パターン・改善アクションを返す。

    Returns:
        dict: 分析サマリーと改善提案
    """
    db = get_db()
    try:
        alert_service = AlertService(db)
        result = alert_service.get_trade_analysis_summary()

        if "error" in result:
            return {
                "error": result["error"],
                "message": "分析データが取得できません"
            }

        return result
    finally:
        db.close()


@mcp.tool()
def sim_get_current_alerts() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境の現在のアラート・警告を取得する。
    連敗・日次損失超過・DD超過等のリスク状態をチェックする。

    Returns:
        dict: 現在のアラート一覧
    """
    db = get_db()
    try:
        alert_service = AlertService(db)
        alerts = alert_service.check_alerts()

        return {
            "alerts": alerts,
            "total_count": len(alerts),
            "has_danger": any(a["type"] == "danger" for a in alerts),
            "has_warning": any(a["type"] == "warning" for a in alerts),
        }
    finally:
        db.close()


@mcp.tool()
def sim_get_chart_data(
    timeframe: str,
    limit: int = 100,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
) -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境のOHLCチャートデータを取得する。

    Args:
        timeframe: タイムフレーム（'W1', 'D1', 'H1', 'M10'）
        limit: 取得件数（デフォルト100、最大1000）
        start_time: 開始日時（ISO形式、例: '2024-12-01T00:00:00'）
        end_time: 終了日時（ISO形式、例: '2024-12-31T23:59:59'）

    Returns:
        dict: チャートデータ
    """
    # Validate timeframe
    if timeframe not in ["W1", "D1", "H1", "M10"]:
        return {
            "error": f"Invalid timeframe: {timeframe}",
            "message": "Timeframe must be one of: W1 (weekly), D1 (daily), H1 (hourly), M10 (10-minute)"
        }

    # Validate limit
    if limit < 1:
        limit = 1
    if limit > 1000:
        limit = 1000

    # Parse datetime strings if provided
    start_dt = None
    end_dt = None
    try:
        if start_time:
            start_dt = datetime.fromisoformat(start_time)
        if end_time:
            end_dt = datetime.fromisoformat(end_time)
    except ValueError as e:
        return {
            "error": "Invalid datetime format",
            "message": f"Datetime must be in ISO format (e.g., '2024-12-01T00:00:00'): {str(e)}"
        }

    db = get_db()
    try:
        market_service = MarketDataService(db)
        candles = market_service.get_candles(timeframe, start_dt, end_dt, limit)

        return {
            "timeframe": timeframe,
            "candles": candles,
            "count": len(candles),
            "description": f"Retrieved {len(candles)} candles for {timeframe} timeframe"
        }
    finally:
        db.close()


@mcp.tool()
def sim_get_available_timeframes() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境で利用可能なタイムフレーム一覧を取得する。

    Returns:
        dict: 利用可能なタイムフレーム一覧
    """
    return {
        "timeframes": [
            {
                "code": "W1",
                "name": "Weekly",
                "description": "1週足 - Long-term trend analysis"
            },
            {
                "code": "D1",
                "name": "Daily",
                "description": "日足 - Daily trend and swing trading"
            },
            {
                "code": "H1",
                "name": "Hourly",
                "description": "1時間足 - Intraday trading"
            },
            {
                "code": "M10",
                "name": "10-Minute",
                "description": "10分足 - Scalping and precise entry/exit"
            }
        ],
        "total_count": 4
    }


@mcp.tool()
def sim_get_data_date_range() -> Dict[str, Any]:
    """【シミュレーション】シミュレーション環境のデータ期間（開始日〜終了日）を取得する。

    Returns:
        dict: 各タイムフレームの日付範囲情報
    """
    db = get_db()
    try:
        market_service = MarketDataService(db)
        date_range = market_service.get_date_range()

        if not date_range.get("start_date"):
            return {
                "error": "No chart data available",
                "message": "データベースにチャートデータが存在しません"
            }

        return date_range
    finally:
        db.close()


# メイン関数：MCPサーバーを起動
if __name__ == "__main__":
    # FastMCPサーバーを起動
    # Claude Desktop から呼び出されると自動的に実行される
    mcp.run()
