# -*- coding: utf-8 -*-
"""
MCP ツールのテストスクリプト

各MCPツールが正しく動作するかを確認します。
"""

import sys
import json
from pathlib import Path

# backend ディレクトリをパスに追加
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# UTF-8出力を強制
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from src.utils.database import SessionLocal
from src.services.trading_service import TradingService
from src.services.analytics_service import AnalyticsService


def print_section(title: str):
    """セクションヘッダーを表示"""
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


def test_get_trading_performance():
    """get_trading_performance ツールのテスト"""
    print_section("Test: get_trading_performance()")

    db = SessionLocal()
    try:
        analytics_service = AnalyticsService(db)
        result = analytics_service.get_performance_metrics()

        if "error" in result:
            print(f"WARNING: {result['error']}")
            return False

        print("SUCCESS")
        print(f"\nTotal trades: {result.get('total_trades', 'N/A')}")
        print(f"Win rate: {result.get('win_rate', 'N/A')}%")
        print(f"Profit factor: {result.get('profit_factor', 'N/A')}")
        print(f"Total P&L: {result.get('total_pnl', 'N/A'):,} JPY")
        print(f"Max drawdown: {result.get('max_drawdown', 'N/A'):,} JPY")

        return True

    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_get_recent_trades():
    """get_recent_trades ツールのテスト"""
    print_section("Test: get_recent_trades(limit=5)")

    db = SessionLocal()
    try:
        trading_service = TradingService(db)
        result = trading_service.get_trades(limit=5, offset=0)
        trades = result.get("trades", [])

        print(f"SUCCESS - {len(trades)} trades retrieved")

        if trades:
            print("\nMost recent trade:")
            trade = trades[0]
            print(f"  Side: {trade.get('side', 'N/A')}")
            print(f"  Entry: {trade.get('entry_price', 'N/A')}")
            print(f"  Exit: {trade.get('exit_price', 'N/A')}")
            print(f"  P&L: {trade.get('realized_pnl', 'N/A'):,} JPY")

        return True

    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_get_losing_trades_analysis():
    """get_losing_trades_analysis ツールのテスト"""
    print_section("Test: get_losing_trades_analysis()")

    db = SessionLocal()
    try:
        trading_service = TradingService(db)
        all_trades_result = trading_service.get_trades(limit=10000, offset=0)
        all_trades = all_trades_result.get("trades", [])

        if not all_trades:
            print("WARNING: No trade data found")
            return False

        # Extract losing trades only
        losing_trades = [
            t for t in all_trades
            if t.get("realized_pnl", 0) < 0
        ]

        if not losing_trades:
            print("INFO: No losing trades found")
            return True

        # Analyze losing trades
        total_loss = sum(t["realized_pnl"] for t in losing_trades)
        average_loss = total_loss / len(losing_trades)
        largest_loss = min(t["realized_pnl"] for t in losing_trades)

        print("SUCCESS")
        print(f"\nTotal losing trades: {len(losing_trades)}")
        print(f"Average loss: {average_loss:,.2f} JPY")
        print(f"Largest loss: {largest_loss:,.2f} JPY")
        print(f"Total loss: {total_loss:,.2f} JPY")

        return True

    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_get_winning_trades_analysis():
    """get_winning_trades_analysis ツールのテスト"""
    print_section("Test: get_winning_trades_analysis()")

    db = SessionLocal()
    try:
        trading_service = TradingService(db)
        all_trades_result = trading_service.get_trades(limit=10000, offset=0)
        all_trades = all_trades_result.get("trades", [])

        if not all_trades:
            print("WARNING: No trade data found")
            return False

        # Extract winning trades only
        winning_trades = [
            t for t in all_trades
            if t.get("realized_pnl", 0) > 0
        ]

        if not winning_trades:
            print("INFO: No winning trades found")
            return True

        # Analyze winning trades
        total_profit = sum(t["realized_pnl"] for t in winning_trades)
        average_profit = total_profit / len(winning_trades)
        largest_profit = max(t["realized_pnl"] for t in winning_trades)

        print("SUCCESS")
        print(f"\nTotal winning trades: {len(winning_trades)}")
        print(f"Average profit: {average_profit:,.2f} JPY")
        print(f"Largest profit: {largest_profit:,.2f} JPY")
        print(f"Total profit: {total_profit:,.2f} JPY")

        return True

    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_get_drawdown_data():
    """get_drawdown_data ツールのテスト"""
    print_section("Test: get_drawdown_data()")

    db = SessionLocal()
    try:
        analytics_service = AnalyticsService(db)
        result = analytics_service.get_drawdown_data()

        if "error" in result:
            print(f"WARNING: {result['error']}")
            return False

        print("SUCCESS")
        print(f"\nCurrent drawdown: {result.get('current_drawdown', 'N/A'):,} JPY")
        print(f"Max drawdown: {result.get('max_drawdown', 'N/A'):,} JPY")
        print(f"Max drawdown %: {result.get('max_drawdown_pct', 'N/A')}%")

        return True

    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_get_equity_curve():
    """get_equity_curve ツールのテスト"""
    print_section("Test: get_equity_curve(interval='trade')")

    db = SessionLocal()
    try:
        analytics_service = AnalyticsService(db)
        result = analytics_service.get_equity_curve(interval="trade")

        if "error" in result:
            print(f"WARNING: {result['error']}")
            return False

        print("SUCCESS")
        print(f"\nStarting equity: {result.get('starting_equity', 'N/A'):,} JPY")
        print(f"Current equity: {result.get('current_equity', 'N/A'):,} JPY")
        print(f"Peak equity: {result.get('peak_equity', 'N/A'):,} JPY")

        equity_data = result.get('equity_data', [])
        print(f"Data points: {len(equity_data)}")

        return True

    except Exception as e:
        print(f"FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def main():
    """全てのテストを実行"""
    print("=" * 60)
    print("MCP Tools Test")
    print("=" * 60)

    tests = [
        test_get_trading_performance,
        test_get_recent_trades,
        test_get_losing_trades_analysis,
        test_get_winning_trades_analysis,
        test_get_drawdown_data,
        test_get_equity_curve
    ]

    results = []
    for test in tests:
        result = test()
        results.append(result)

    # Result summary
    print_section("Test Results Summary")
    passed = sum(results)
    total = len(results)

    print(f"\nPassed: {passed}/{total}")
    print(f"Failed: {total - passed}/{total}")

    if passed == total:
        print("\n[SUCCESS] All tests passed!")
        print("\nNext steps:")
        print("1. Install Claude Desktop")
        print("2. Run setup script: python backend/scripts/setup_claude_desktop.py")
        print("3. Restart Claude Desktop")
        print("4. Ask Claude Desktop to analyze your trades")
        return 0
    else:
        print("\n[WARNING] Some tests failed")
        print("Please check if trade data exists in the database")
        return 1


if __name__ == "__main__":
    sys.exit(main())
