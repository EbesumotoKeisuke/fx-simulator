#!/usr/bin/env python3
"""デバッグログ確認用の簡易テスト"""
import requests
import time

BASE_URL = "http://localhost:8000/api/v1"

print("=== デバッグログ確認テスト ===\n")

# シミュレーション状態を確認
print("1. シミュレーション状態確認")
response = requests.get(f"{BASE_URL}/simulation/status")
print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    print(f"Simulation ID: {data['data']['simulation_id']}")
    print(f"Status: {data['data']['status']}\n")

# 予約注文一覧を取得（デバッグログが出力されるはず）
print("2. 予約注文一覧取得（1回目）")
response = requests.get(f"{BASE_URL}/orders/pending")
print(f"Status: {response.status_code}")
data = response.json()
print(f"Response: {data}")
print(f"Data type: {type(data.get('data'))}")
print(f"Data value: {data.get('data')}\n")

# 予約注文を作成
print("3. 予約注文作成")
response = requests.post(f"{BASE_URL}/orders/pending", json={
    "order_type": "limit",
    "side": "buy",
    "lot_size": 0.1,
    "trigger_price": 156.000
})
print(f"Status: {response.status_code}")
if response.status_code == 200:
    order_data = response.json()
    print(f"Created order ID: {order_data['data']['order_id']}\n")

# 予約注文一覧を再取得（デバッグログが出力されるはず）
print("4. 予約注文一覧取得（2回目）")
time.sleep(0.5)  # 少し待つ
response = requests.get(f"{BASE_URL}/orders/pending")
print(f"Status: {response.status_code}")
data = response.json()
print(f"Response: {data}")
print(f"Data type: {type(data.get('data'))}")
print(f"Data value: {data.get('data')}\n")

print("=== バックエンドのコンソール出力を確認してください ===")
print("以下のようなデバッグログが表示されているはずです:")
print("  [DEBUG] get_pending_orders called: limit=50, offset=0, status=None")
print("  [DEBUG] Active simulation: <simulation_id>")
print("  [DEBUG] Found X orders, returning Y after pagination")
print("  [DEBUG] Returning result: {...}")
print("  [DEBUG ROUTE] GET /pending called: ...")
print("  [DEBUG ROUTE] Service returned: ...")
print("  [DEBUG ROUTE] Final response: ...")
