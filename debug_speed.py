"""
速度1x問題のデバッグスクリプト

シミュレーションの速度設定を確認します。
"""

import sys
import io
import requests

# Windows環境での日本語出力対応
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API_BASE_URL = "http://localhost:8000/api/v1"

def check_speed_issue():
    print("=" * 60)
    print("速度1x問題のデバッグ")
    print("=" * 60)

    try:
        # 1. 現在のシミュレーション状態を確認
        print("\n[1] 現在のシミュレーション状態")
        response = requests.get(f"{API_BASE_URL}/simulation/status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and data.get("data"):
                status = data["data"].get("status")
                speed = data["data"].get("speed")
                current_time = data["data"].get("current_time")
                print(f"  ステータス: {status}")
                print(f"  速度: {speed} (型: {type(speed).__name__})")
                print(f"  現在時刻: {current_time}")

                # 速度の値を詳しく確認
                if speed is not None:
                    print(f"\n  速度の詳細:")
                    print(f"    値: {speed}")
                    print(f"    型: {type(speed)}")
                    print(f"    文字列表現: '{str(speed)}'")
                    print(f"    == 1.0: {speed == 1.0}")
                    print(f"    == 1: {speed == 1}")
                    print(f"    == '1': {speed == '1'}")
            else:
                print("  シミュレーションが存在しません")
        else:
            print(f"  エラー: status code {response.status_code}")

        # 2. シミュレーション開始時刻と現在時刻の差を確認
        print("\n[2] 時刻の進行状況")
        if data.get("success") and data.get("data"):
            current_time_str = data["data"].get("current_time")
            if current_time_str:
                from datetime import datetime
                current = datetime.fromisoformat(current_time_str)
                print(f"  現在のシミュレーション時刻: {current}")
                print(f"  （チャートが更新されない場合、この時刻が進んでいません）")

        print("\n" + "=" * 60)
        print("\n【確認事項】")
        print("1. 速度が正しく設定されているか")
        print("2. 速度の型が正しいか（数値であるべき）")
        print("3. シミュレーションが'running'状態か")
        print("\n【対処方法】")
        print("- localStorageをクリア: F12 → Application → Local Storage → 右クリック → Clear")
        print("- ブラウザのキャッシュをクリア: Ctrl+Shift+Delete")
        print("- フロントエンドを強制リロード: Ctrl+Shift+R")
        print("=" * 60)

    except requests.exceptions.ConnectionError:
        print("エラー: バックエンドに接続できません")
    except Exception as e:
        print(f"予期しないエラー: {e}")

if __name__ == "__main__":
    check_speed_issue()
