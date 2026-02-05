# -*- coding: utf-8 -*-
"""
未来データ非表示対応（部分的ローソク足生成）のテストスクリプト

このスクリプトは、以下の機能をテストします：
1. 新しいAPIエンドポイント /market-data/candles/partial の動作確認
2. 最新のローソク足が current_time までのデータのみで生成されているか確認
3. 旧APIとの比較（未来データが含まれないことの確認）
"""

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent / "backend"))

from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from src.services.market_data_service import MarketDataService

# データベース接続
DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/fx_simulator"
engine = create_engine(DATABASE_URL)


def test_calculate_candle_start_time():
    """calculate_candle_start_time() のテスト"""
    print("\n=== Test: calculate_candle_start_time() ===")

    with Session(engine) as db:
        service = MarketDataService(db)

        # テストケース1: 1時間足（12:30 → 12:00）
        current_time = datetime(2024, 12, 30, 12, 30, 0)
        result = service.calculate_candle_start_time('H1', current_time)
        expected = datetime(2024, 12, 30, 12, 0, 0)
        assert result == expected, f"H1 failed: {result} != {expected}"
        print(f"[OK] H1: {current_time} -> {result}")

        # テストケース2: 日足（12:30 → 7:00）
        result = service.calculate_candle_start_time('D1', current_time)
        expected = datetime(2024, 12, 30, 7, 0, 0)
        assert result == expected, f"D1 failed: {result} != {expected}"
        print(f"[OK] D1: {current_time} -> {result}")

        # テストケース3: 日足（6:00 → 前日7:00）
        current_time_early = datetime(2024, 12, 30, 6, 0, 0)
        result = service.calculate_candle_start_time('D1', current_time_early)
        expected = datetime(2024, 12, 29, 7, 0, 0)
        assert result == expected, f"D1 early failed: {result} != {expected}"
        print(f"[OK] D1 (early): {current_time_early} -> {result}")

        # テストケース4: 週足（月曜日 → 月曜日7:00）
        # 2024年12月30日は月曜日
        current_time = datetime(2024, 12, 30, 12, 30, 0)
        result = service.calculate_candle_start_time('W1', current_time)
        expected = datetime(2024, 12, 30, 7, 0, 0)
        assert result == expected, f"W1 failed: {result} != {expected}"
        print(f"[OK] W1: {current_time} -> {result}")

        # テストケース5: 10分足（12:35 → 12:30）
        current_time = datetime(2024, 12, 30, 12, 35, 0)
        result = service.calculate_candle_start_time('M10', current_time)
        expected = datetime(2024, 12, 30, 12, 30, 0)
        assert result == expected, f"M10 failed: {result} != {expected}"
        print(f"[OK] M10: {current_time} -> {result}")


def test_generate_partial_candle():
    """generate_partial_candle() のテスト"""
    print("\n=== Test: generate_partial_candle() ===")

    with Session(engine) as db:
        service = MarketDataService(db)

        # テストケース: 1時間足の12:00台を12:00〜12:30のデータから生成
        start_time = datetime(2024, 12, 30, 12, 0, 0)
        current_time = datetime(2024, 12, 30, 12, 30, 0)

        result = service.generate_partial_candle('H1', start_time, current_time)

        assert result is not None, "H1 partial candle should not be None"
        assert 'timestamp' in result, "Missing timestamp"
        assert 'open' in result, "Missing open"
        assert 'high' in result, "Missing high"
        assert 'low' in result, "Missing low"
        assert 'close' in result, "Missing close"
        assert 'volume' in result, "Missing volume"

        print(f"[OK] H1 partial candle generated:")
        print(f"  Timestamp: {result['timestamp']}")
        print(f"  OHLC: O={result['open']}, H={result['high']}, L={result['low']}, C={result['close']}")
        print(f"  Volume: {result['volume']}")


def test_get_candles_with_partial_last():
    """get_candles_with_partial_last() のテスト（新旧API比較）"""
    print("\n=== Test: get_candles_with_partial_last() vs get_candles_before() ===")

    with Session(engine) as db:
        service = MarketDataService(db)

        current_time = datetime(2024, 12, 30, 12, 30, 0)

        # 新API: 部分的ローソク足を生成
        new_candles = service.get_candles_with_partial_last('H1', current_time, 5)

        # 旧API: 完全なローソク足を取得
        old_candles = service.get_candles_before('H1', current_time, 5)

        assert len(new_candles) > 0, "New API should return candles"
        assert len(old_candles) > 0, "Old API should return candles"
        assert len(new_candles) == len(old_candles), f"Candle count mismatch: {len(new_candles)} != {len(old_candles)}"

        # 最後のローソク足を比較
        new_last = new_candles[-1]
        old_last = old_candles[-1]

        print(f"\n最新のローソク足比較（12:00台、current_time=12:30）:")
        print(f"  旧API (12:00-12:59の全データ):")
        print(f"    Volume: {old_last['volume']}")
        print(f"    OHLC: O={old_last['open']}, H={old_last['high']}, L={old_last['low']}, C={old_last['close']}")

        print(f"  新API (12:00-12:30のデータのみ):")
        print(f"    Volume: {new_last['volume']}")
        print(f"    OHLC: O={new_last['open']}, H={new_last['high']}, L={new_last['low']}, C={new_last['close']}")

        # 出来高が異なることを確認（新APIの方が少ないはず）
        assert new_last['volume'] < old_last['volume'], f"New API volume should be less than old API: {new_last['volume']} >= {old_last['volume']}"
        print(f"\n[OK] 新APIの出来高が旧APIより少ない: {new_last['volume']} < {old_last['volume']}")
        print(f"  -> 未来データが含まれていないことを確認")


def test_m10_unchanged():
    """10分足は変更されていないことを確認"""
    print("\n=== Test: M10 (10分足) unchanged ===")

    with Session(engine) as db:
        service = MarketDataService(db)

        current_time = datetime(2024, 12, 30, 12, 30, 0)

        # 新API（M10は内部で get_candles_before を呼ぶ）
        new_candles = service.get_candles_with_partial_last('M10', current_time, 5)

        # 旧API
        old_candles = service.get_candles_before('M10', current_time, 5)

        # 完全に一致することを確認
        assert new_candles == old_candles, "M10 should be unchanged"
        print(f"[OK] M10 (10分足) は変更なし（新旧APIで同じ結果）")


def main():
    """全てのテストを実行"""
    print("=" * 60)
    print("未来データ非表示対応のテスト")
    print("=" * 60)

    try:
        test_calculate_candle_start_time()
        test_generate_partial_candle()
        test_get_candles_with_partial_last()
        test_m10_unchanged()

        print("\n" + "=" * 60)
        print("[SUCCESS] 全てのテストが成功しました！")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n[FAIL] テスト失敗: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] エラー発生: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
