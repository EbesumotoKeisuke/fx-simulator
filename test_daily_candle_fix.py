# -*- coding: utf-8 -*-
"""
日足の重複ローソク足バグの修正確認テスト

このスクリプトは、以下をテストします：
1. 0:00のタイムスタンプを持つ日足ローソク足が前日7:00に調整されているか
2. 同じ日付で2本のローソク足が表示されないか
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


def test_daily_candle_timestamp_adjustment():
    """日足の0:00タイムスタンプが前日7:00に調整されるかをテスト"""
    print("\n=== Test: Daily Candle Timestamp Adjustment ===")

    with Session(engine) as db:
        service = MarketDataService(db)

        # 4/1の日中を現在時刻とする
        current_time = datetime(2025, 4, 1, 12, 0, 0)

        # 日足データを取得
        candles = service.get_candles_with_partial_last('D1', current_time, 10)

        print(f"\nCurrent time: {current_time}")
        print(f"Total candles retrieved: {len(candles)}")
        print("\nLast 5 candles:")

        for candle in candles[-5:]:
            timestamp = candle['timestamp']
            dt = datetime.fromisoformat(timestamp)
            print(f"  {timestamp} (Date: {dt.date()}, Hour: {dt.hour})")

        # 同じ日付のローソク足を検出
        dates = {}
        for candle in candles:
            timestamp = candle['timestamp']
            dt = datetime.fromisoformat(timestamp)
            date_key = dt.date()

            if date_key not in dates:
                dates[date_key] = []
            dates[date_key].append(timestamp)

        # 重複チェック
        duplicates_found = False
        for date_key, timestamps in dates.items():
            if len(timestamps) > 1:
                print(f"\n[ERROR] Duplicate candles found for date {date_key}:")
                for ts in timestamps:
                    print(f"  - {ts}")
                duplicates_found = True

        if duplicates_found:
            print("\n[FAIL] Duplicate daily candles detected!")
            return False
        else:
            print("\n[OK] No duplicate daily candles detected")

        # タイムスタンプが全て7:00以降であることを確認
        invalid_timestamps = []
        for candle in candles:
            timestamp = candle['timestamp']
            dt = datetime.fromisoformat(timestamp)
            if dt.hour < 7:
                invalid_timestamps.append(timestamp)

        if invalid_timestamps:
            print(f"\n[ERROR] Found timestamps with hour < 7:")
            for ts in invalid_timestamps:
                print(f"  - {ts}")
            print("\n[FAIL] Invalid timestamps detected!")
            return False
        else:
            print("[OK] All timestamps have hour >= 7")

        return True


def main():
    """テストを実行"""
    print("=" * 60)
    print("Daily Candle Duplicate Bug Fix Test")
    print("=" * 60)

    try:
        success = test_daily_candle_timestamp_adjustment()

        print("\n" + "=" * 60)
        if success:
            print("[SUCCESS] All tests passed!")
            print("The duplicate daily candle bug has been fixed.")
        else:
            print("[FAIL] Tests failed!")
        print("=" * 60)

        sys.exit(0 if success else 1)

    except Exception as e:
        print(f"\n[ERROR] Error occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
