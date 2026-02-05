"""
シミュレーション履歴確認スクリプト

データベースに直接接続してシミュレーション履歴を確認します。
"""

import sys
import io

# Windows環境での日本語出力対応
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    from sqlalchemy import create_engine, text
    import os

    # データベース接続
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/fx_simulator')

    print("=" * 60)
    print("シミュレーション履歴調査")
    print("=" * 60)
    print(f"\nデータベース: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")

    engine = create_engine(DATABASE_URL)

    print("\n【全シミュレーション履歴】")
    with engine.connect() as conn:
        result = conn.execute(text('''
            SELECT
                id,
                status,
                start_time,
                end_time,
                created_at
            FROM simulations
            ORDER BY created_at DESC
        '''))

        simulations = result.fetchall()
        if simulations:
            print(f"総シミュレーション数: {len(simulations)} 件\n")
            for i, sim in enumerate(simulations, 1):
                print(f"{i}. シミュレーションID: {sim[0]}")
                print(f"   状態: {sim[1]}")
                print(f"   シミュレーション期間: {sim[2]} 〜 {sim[3] or '実行中'}")
                print(f"   作成日時: {sim[4]}")

                # このシミュレーションのトレード数を確認
                trade_result = conn.execute(text('''
                    SELECT COUNT(*) FROM trades WHERE simulation_id = :sim_id
                '''), {"sim_id": sim[0]})
                trade_count = trade_result.scalar()
                print(f"   トレード数: {trade_count} 件")
                print()
        else:
            print("シミュレーション履歴が見つかりません")

    print("\n【データベース全体の統計】")
    with engine.connect() as conn:
        # テーブル一覧と件数
        tables = ['simulations', 'accounts', 'orders', 'positions', 'trades', 'candles_m10', 'candles_h1', 'candles_d1', 'candles_w1']
        for table in tables:
            try:
                result = conn.execute(text(f'SELECT COUNT(*) FROM {table}'))
                count = result.scalar()
                print(f"{table}: {count} 件")
            except:
                print(f"{table}: テーブルが存在しません")

    print("\n" + "=" * 60)
    print("\n【結論】")
    print("- トレード履歴は各シミュレーションに紐づいて保存されます")
    print("- シミュレーションが削除されると、CASCADE削除により")
    print("  関連するトレード、ポジション、注文、口座情報も削除されます")
    print("- 過去のトレード履歴を保持したい場合:")
    print("  1. シミュレーションを削除しない")
    print("  2. シミュレーション終了時にCSV出力で保存する")
    print("=" * 60)

except ImportError:
    print("エラー: sqlalchemy がインストールされていません")
    print("pip install sqlalchemy psycopg2 でインストールしてください")
except Exception as e:
    print(f"エラー: {e}")
    print("\nデータベースに接続できません。")
    print("以下を確認してください:")
    print("1. PostgreSQL が起動している")
    print("2. データベース 'fx_simulator' が存在する")
    print("3. 接続情報が正しい（ユーザー名: postgres、パスワード: postgres）")
