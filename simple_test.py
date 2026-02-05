#!/usr/bin/env python3
"""簡易APIテスト"""
import requests

BASE_URL = "http://localhost:8000/api/v1"

print("=== シミュレーション状態確認 ===")
response = requests.get(f"{BASE_URL}/simulation/status")
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")

print("\n=== 予約注文一覧取得 ===")
response = requests.get(f"{BASE_URL}/orders/pending")
print(f"Status: {response.status_code}")
data = response.json()
print(f"Response: {data}")
print(f"Data type: {type(data.get('data'))}")
print(f"Data value: {data.get('data')}")

print("\n=== 予約注文作成テスト ===")
response = requests.post(f"{BASE_URL}/orders/pending", json={
    "order_type": "limit",
    "side": "buy",
    "lot_size": 0.1,
    "trigger_price": 156.000
})
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")

print("\n=== 再度予約注文一覧取得 ===")
response = requests.get(f"{BASE_URL}/orders/pending")
print(f"Status: {response.status_code}")
data = response.json()
print(f"Response: {data}")
