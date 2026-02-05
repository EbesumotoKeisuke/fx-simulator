"""
API接続診断スクリプト

バックエンドAPIの動作確認を行います。
"""

import sys
import io
import requests

# Windows環境での日本語出力対応
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

API_BASE_URL = "http://localhost:8000/api/v1"

def check_api():
    print("=" * 60)
    print("API接続診断")
    print("=" * 60)

    # 1. バックエンドの起動確認
    print("\n[1] バックエンドの起動確認...")
    try:
        response = requests.get(f"{API_BASE_URL}/simulation/status", timeout=5)
        print(f"✓ バックエンドは起動しています (status: {response.status_code})")
    except requests.exceptions.ConnectionError:
        print("✗ エラー: バックエンドに接続できません")
        print("  → backend ディレクトリで uvicorn を起動してください")
        return
    except Exception as e:
        print(f"✗ エラー: {e}")
        return

    # 2. 注文API (orders) の確認
    print("\n[2] 注文API (limit=1000) の確認...")
    try:
        response = requests.get(f"{API_BASE_URL}/orders?limit=1000&offset=0", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                orders_count = len(data.get("data", {}).get("orders", []))
                print(f"✓ 注文APIは正常に動作しています (取得件数: {orders_count})")
            else:
                print(f"✗ エラー: {data.get('error', {}).get('message', '不明')}")
        else:
            error_data = response.json()
            print(f"✗ エラー (status: {response.status_code})")
            print(f"  詳細: {error_data}")
            if "validation error" in str(error_data).lower():
                print("\n  → バックエンドを再起動してください！")
                print("  → backend/src/routes/orders.py の変更が反映されていません")
    except Exception as e:
        print(f"✗ エラー: {e}")

    # 3. トレードAPI (trades) の確認
    print("\n[3] トレードAPI (limit=1000) の確認...")
    try:
        response = requests.get(f"{API_BASE_URL}/trades?limit=1000&offset=0", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                trades_count = len(data.get("data", {}).get("trades", []))
                print(f"✓ トレードAPIは正常に動作しています (取得件数: {trades_count})")
            else:
                print(f"✗ エラー: {data.get('error', {}).get('message', '不明')}")
        else:
            error_data = response.json()
            print(f"✗ エラー (status: {response.status_code})")
            print(f"  詳細: {error_data}")
    except Exception as e:
        print(f"✗ エラー: {e}")

    # 4. シミュレーション状態の確認
    print("\n[4] シミュレーション状態の確認...")
    try:
        response = requests.get(f"{API_BASE_URL}/simulation/status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and data.get("data"):
                status = data["data"].get("status")
                current_time = data["data"].get("current_time")
                print(f"✓ シミュレーション状態: {status}")
                print(f"  現在時刻: {current_time}")
            else:
                print("  シミュレーションが存在しません")
        else:
            print(f"✗ エラー (status: {response.status_code})")
    except Exception as e:
        print(f"✗ エラー: {e}")

    print("\n" + "=" * 60)
    print("\n【診断結果】")
    print("上記で ✗ エラーが表示されている場合:")
    print("1. バックエンドを再起動してください")
    print("2. フロントエンドをリロード (Ctrl+Shift+R) してください")
    print("3. ブラウザのコンソール (F12) でエラーを確認してください")
    print("=" * 60)

if __name__ == "__main__":
    check_api()
