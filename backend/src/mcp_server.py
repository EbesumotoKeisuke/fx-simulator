# -*- coding: utf-8 -*-
"""
FX Simulator MCP Server

Claude Desktop と連携するための Model Context Protocol サーバー。
トレード結果を分析し、Claude がAIフィードバックを生成するためのツールを提供します。
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
def get_trading_performance() -> Dict[str, Any]:
    """
    Get comprehensive trading performance metrics.

    Returns detailed statistics including:
    - Win rate, profit factor
    - Total P&L, max drawdown
    - Risk/reward ratios
    - Consecutive wins/losses
    - Average profit/loss per trade

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
def get_recent_trades(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get recent trade history.

    Args:
        limit: Number of recent trades to retrieve (default: 10, max: 100)

    Returns list of trades with:
    - Entry/exit prices and times
    - P&L in pips and JPY
    - Side (buy/sell)
    - Lot size

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
def get_losing_trades_analysis() -> Dict[str, Any]:
    """
    Analyze losing trades to identify patterns.

    Returns:
    - List of all losing trades
    - Common characteristics
    - Time-of-day patterns (if applicable)
    - Average loss size
    - Total number of losing trades

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
def get_winning_trades_analysis() -> Dict[str, Any]:
    """
    Analyze winning trades to identify success patterns.

    Returns:
    - List of all winning trades
    - Common characteristics
    - Best performing timeframes
    - Average profit size
    - Total number of winning trades

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
def get_drawdown_data() -> Dict[str, Any]:
    """
    Get drawdown history and statistics.

    Returns:
    - Current drawdown
    - Maximum drawdown
    - Maximum drawdown percentage
    - Drawdown duration
    - Recovery information

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
def get_equity_curve(interval: str = "trade") -> Dict[str, Any]:
    """
    Get equity curve data showing account balance over time.

    Args:
        interval: Granularity of data points ('trade', 'hour', 'day')
                  - 'trade': Every trade (default)
                  - 'hour': Hourly snapshots
                  - 'day': Daily snapshots

    Returns:
    - List of timestamps and equity values
    - Starting equity
    - Current equity
    - Peak equity

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
def get_trade_analysis_summary() -> Dict[str, Any]:
    """
    Get comprehensive trade analysis summary with improvement suggestions.

    Analyzes trading patterns and provides actionable improvement suggestions.

    Returns:
    - Hourly performance analysis (winrate by hour)
    - Best and worst trading hours
    - Maximum consecutive losses pattern
    - Specific improvement suggestions based on data

    This tool is particularly useful for identifying:
    - Time periods to avoid trading
    - Emotional trading patterns
    - Risk/reward imbalances

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
def get_current_alerts() -> Dict[str, Any]:
    """
    Get current trading alerts and warnings.

    Checks for various risk conditions including:
    - Consecutive losses (3+ losses in a row)
    - Daily loss exceeding 5% of initial balance
    - Drawdown exceeding 10%
    - Low winrate time periods

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
def get_chart_data(
    timeframe: str,
    limit: int = 100,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get candlestick (OHLCV) chart data for analysis.

    Retrieves historical price data for the specified timeframe.
    Useful for analyzing trading patterns, market conditions, and price movements.

    Args:
        timeframe: Time period for candles - 'W1' (weekly), 'D1' (daily), 'H1' (hourly), 'M10' (10-minute)
        limit: Maximum number of candles to retrieve (default: 100, max: 1000)
        start_time: Optional start date in ISO format (e.g., '2024-12-01T00:00:00')
        end_time: Optional end date in ISO format (e.g., '2024-12-31T23:59:59')

    Returns:
        dict: Chart data with candles list
            Each candle contains: timestamp, open, high, low, close, volume

    Examples:
        - Get latest 100 daily candles: get_chart_data('D1', 100)
        - Get hourly data for December: get_chart_data('H1', 1000, '2024-12-01T00:00:00', '2024-12-31T23:59:59')
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
def get_available_timeframes() -> Dict[str, Any]:
    """
    Get list of available chart timeframes.

    Returns all supported timeframes with their descriptions.
    Use this to understand which timeframes are available for analysis.

    Returns:
        dict: Available timeframes with descriptions
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
def get_data_date_range() -> Dict[str, Any]:
    """
    Get the date range of available chart data.

    Returns the start and end dates for all timeframes.
    Use this to understand what historical data is available for analysis.

    Returns:
        dict: Date range information for each timeframe
            - overall start_date and end_date
            - per-timeframe start, end, and record count
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
