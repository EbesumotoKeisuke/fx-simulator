#!/usr/bin/env python3
"""
positionsテーブルにSL/TP用のカラムを追加するマイグレーションスクリプト
F-102（損切り・利確設定）機能のために必要なカラムを追加する
"""

import sys
import os

# プロジェクトルートをPythonパスに追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from src.utils.database import DATABASE_URL


def main():
    """positionsテーブルにsl_price, tp_price, sl_pips, tp_pipsカラムを追加"""
    print("=" * 60)
    print("マイグレーション: positions テーブルにSL/TPカラムを追加")
    print("=" * 60)

    engine = create_engine(DATABASE_URL)

    try:
        with engine.connect() as conn:
            print("\n[1/4] sl_price カラムを追加中...")
            conn.execute(text('ALTER TABLE positions ADD COLUMN IF NOT EXISTS sl_price DECIMAL(10, 5)'))
            conn.commit()
            print("✓ sl_price カラムを追加しました")

            print("\n[2/4] tp_price カラムを追加中...")
            conn.execute(text('ALTER TABLE positions ADD COLUMN IF NOT EXISTS tp_price DECIMAL(10, 5)'))
            conn.commit()
            print("✓ tp_price カラムを追加しました")

            print("\n[3/4] sl_pips カラムを追加中...")
            conn.execute(text('ALTER TABLE positions ADD COLUMN IF NOT EXISTS sl_pips DECIMAL(10, 2)'))
            conn.commit()
            print("✓ sl_pips カラムを追加しました")

            print("\n[4/4] tp_pips カラムを追加中...")
            conn.execute(text('ALTER TABLE positions ADD COLUMN IF NOT EXISTS tp_pips DECIMAL(10, 2)'))
            conn.commit()
            print("✓ tp_pips カラムを追加しました")

        print("\n" + "=" * 60)
        print("SUCCESS! 全てのカラムが正常に追加されました")
        print("=" * 60)
        return 0

    except Exception as e:
        print(f"\nERROR: マイグレーション失敗 - {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
