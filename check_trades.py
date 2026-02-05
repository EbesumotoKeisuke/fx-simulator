"""
トレード履歴確認スクリプト

バックエンドAPIを使用してトレード履歴の統計を表示します。
"""

import sys
import io
import requests
import json
from datetime import datetime

# Windows環境での日本語出力対応
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API_BASE_URL = "http://localhost:8000/api/v1"

def check_trades():
    print("=" * 60)
    print("トレード履歴調査")
    print("=" * 60)

    try:
        # トレード履歴を取得（最大1000件）
        response = requests.get(f"{API_BASE_URL}/trades?limit=1000&offset=0")

        if response.status_code != 200:
            print(f"エラー: APIから応答がありません (ステータス: {response.status_code})")
            print("バックエンドが起動しているか確認してください")
            return

        data = response.json()

        if not data.get("success"):
            print("エラー:", data.get("error", {}).get("message", "不明なエラー"))
            return

        trades = data.get("data", {}).get("trades", [])
        total = data.get("data", {}).get("total", 0)

        print(f"\n【統計情報】")
        print(f"総トレード数: {total} 件")
        print(f"取得件数: {len(trades)} 件")

        if trades:
            # 日付範囲を計算
            dates = [datetime.fromisoformat(t["closed_at"]) for t in trades]
            oldest = min(dates)
            newest = max(dates)

            print(f"\n【期間】")
            print(f"最古のトレード: {oldest.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"最新のトレード: {newest.strftime('%Y-%m-%d %H:%M:%S')}")

            # 勝敗統計
            wins = [t for t in trades if t["realized_pnl"] > 0]
            losses = [t for t in trades if t["realized_pnl"] < 0]

            print(f"\n【勝敗】")
            print(f"勝ちトレード: {len(wins)} 件")
            print(f"負けトレード: {len(losses)} 件")
            if total > 0:
                win_rate = (len(wins) / total) * 100
                print(f"勝率: {win_rate:.1f}%")

            # 損益統計
            total_pnl = sum(t["realized_pnl"] for t in trades)
            print(f"\n【損益】")
            print(f"累計損益: ¥{total_pnl:,.2f}")

            if wins:
                avg_win = sum(t["realized_pnl"] for t in wins) / len(wins)
                max_win = max(t["realized_pnl"] for t in wins)
                print(f"平均利確: ¥{avg_win:,.2f}")
                print(f"最大利確: ¥{max_win:,.2f}")

            if losses:
                avg_loss = sum(t["realized_pnl"] for t in losses) / len(losses)
                max_loss = min(t["realized_pnl"] for t in losses)
                print(f"平均損切: ¥{avg_loss:,.2f}")
                print(f"最大損失: ¥{max_loss:,.2f}")

            # 最近のトレード5件を表示
            print(f"\n【最近のトレード（上位5件）】")
            for i, trade in enumerate(trades[:5], 1):
                closed_at = datetime.fromisoformat(trade["closed_at"])
                pnl_sign = "+" if trade["realized_pnl"] > 0 else ""
                print(f"\n{i}. {closed_at.strftime('%Y-%m-%d %H:%M')}")
                print(f"   {trade['side'].upper()} {trade['lot_size']}ロット")
                print(f"   {trade['entry_price']} → {trade['exit_price']}")
                print(f"   損益: {pnl_sign}¥{trade['realized_pnl']:,.2f}")
        else:
            print("\nトレード履歴が見つかりませんでした。")
            print("\n【考えられる理由】")
            print("1. まだトレードを実行していない")
            print("2. シミュレーションが削除された（CASCADE削除によりトレードも削除）")
            print("3. データベースがリセットされた")

        print("\n" + "=" * 60)
        print("\n【重要な注意事項】")
        print("- トレード履歴はシミュレーションに紐づいて保存されます")
        print("- シミュレーションを削除すると、関連するトレード履歴も削除されます")
        print("- トレード履歴を永続的に保存したい場合は、CSV出力を使用してください")
        print("=" * 60)

    except requests.exceptions.ConnectionError:
        print("エラー: バックエンドに接続できません")
        print("http://localhost:8000 でバックエンドが起動しているか確認してください")
    except Exception as e:
        print(f"予期しないエラー: {e}")

if __name__ == "__main__":
    check_trades()
