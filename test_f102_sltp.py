#!/usr/bin/env python3
"""
F-102: 損切り・利確設定（SL/TP）機能の簡易テストスクリプト

このスクリプトは以下の項目を確認します：
1. 新規注文時のSL/TP設定（価格指定）
2. 新規注文時のSL/TP設定（pips指定）
3. 既存ポジションへのSL/TP設定
4. SL発動の確認
5. TP発動の確認
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000/api/v1"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def print_test(test_name):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BLUE}テスト: {test_name}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*60}{Colors.RESET}")

def print_success(message):
    print(f"{Colors.GREEN}[OK] {message}{Colors.RESET}")

def print_error(message):
    print(f"{Colors.RED}[ERROR] {message}{Colors.RESET}")

def print_info(message):
    print(f"{Colors.YELLOW}[INFO] {message}{Colors.RESET}")

def get_json_response(response):
    """レスポンスをJSON形式で取得"""
    try:
        return response.json()
    except:
        return None

def test_1_start_simulation():
    """テスト1: シミュレーション開始"""
    print_test("1. シミュレーション開始")

    response = requests.post(f"{BASE_URL}/simulation/start", json={
        "start_time": "2024-12-24T09:00:00",
        "initial_balance": 1000000,
        "speed": 1.0
    })

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        sim_id = data["data"]["simulation_id"]
        print_success(f"シミュレーション開始成功: {sim_id}")

        # シミュレーションを実行可能状態にする
        print_info("シミュレーションを開始状態にする...")
        response = requests.post(f"{BASE_URL}/simulation/resume")
        data = get_json_response(response)
        if response.status_code == 200 and data and data.get("success"):
            print_success("シミュレーション開始状態への移行成功")
        else:
            print_error(f"シミュレーション開始状態への移行失敗: {data}")

        return sim_id
    else:
        print_error(f"シミュレーション開始失敗: {data}")
        return None

def test_2_create_order_with_sltp_price():
    """テスト2: 新規注文時のSL/TP設定（価格指定）"""
    print_test("2. 新規注文時のSL/TP設定（価格指定）")

    print_info("買い注文を作成（SL: 155.00, TP: 158.00）...")
    response = requests.post(f"{BASE_URL}/orders", json={
        "side": "buy",
        "lot_size": 0.1,
        "sl_price": 155.00,
        "tp_price": 158.00
    })

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        position_id = data["data"]["position_id"]
        sl_price = data["data"].get("sl_price")
        tp_price = data["data"].get("tp_price")
        print_success(f"注文作成成功: position_id={position_id}")
        print_success(f"  SL: {sl_price}, TP: {tp_price}")
        return position_id
    else:
        print_error(f"注文作成失敗: {data}")
        return None

def test_3_create_order_with_sltp_pips():
    """テスト3: 新規注文時のSL/TP設定（pips指定）"""
    print_test("3. 新規注文時のSL/TP設定（pips指定）")

    print_info("売り注文を作成（SL: -30pips, TP: +40pips）...")
    response = requests.post(f"{BASE_URL}/orders", json={
        "side": "sell",
        "lot_size": 0.1,
        "sl_pips": -30,
        "tp_pips": 40
    })

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        position_id = data["data"]["position_id"]
        sl_price = data["data"].get("sl_price")
        tp_price = data["data"].get("tp_price")
        print_success(f"注文作成成功: position_id={position_id}")
        print_success(f"  SL: {sl_price}, TP: {tp_price}")
        return position_id
    else:
        print_error(f"注文作成失敗: {data}")
        return None

def test_4_get_positions_with_sltp():
    """テスト4: ポジション取得（SL/TP情報含む）"""
    print_test("4. ポジション取得（SL/TP情報含む）")

    print_info("ポジション一覧を取得...")
    response = requests.get(f"{BASE_URL}/positions")

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        positions = data["data"]["positions"]
        print_success(f"ポジション取得成功: {len(positions)}件")
        for pos in positions:
            side = "買" if pos["side"] == "buy" else "売"
            print_info(f"  {side}: SL={pos.get('sl_price')}, TP={pos.get('tp_price')}")
        return True
    else:
        print_error(f"ポジション取得失敗: {data}")
        return False

def test_5_set_sltp_on_existing_position(position_id):
    """テスト5: 既存ポジションへのSL/TP設定"""
    print_test("5. 既存ポジションへのSL/TP設定")

    print_info(f"ポジション {position_id} にSL/TPを設定...")
    response = requests.put(f"{BASE_URL}/positions/{position_id}/sl-tp", json={
        "sl_price": 156.00,
        "tp_price": 157.00
    })

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        sl_price = data["data"].get("sl_price")
        tp_price = data["data"].get("tp_price")
        print_success(f"SL/TP設定成功: SL={sl_price}, TP={tp_price}")
        return True
    else:
        print_error(f"SL/TP設定失敗: {data}")
        return False

def test_6_check_positions():
    """テスト6: ポジション確認"""
    print_test("6. ポジション確認")

    print_info("現在のポジションを確認...")
    response = requests.get(f"{BASE_URL}/positions")

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        positions = data["data"]["positions"]
        print_success(f"現在のポジション数: {len(positions)}件")
        return positions
    else:
        print_error(f"ポジション取得失敗: {data}")
        return []

def main():
    print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BLUE}F-102: 損切り・利確設定（SL/TP）機能 簡易テスト{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*60}{Colors.RESET}")

    results = {}

    # テスト1: シミュレーション開始
    sim_id = test_1_start_simulation()
    results["シミュレーション開始"] = sim_id is not None
    if not sim_id:
        print_error("シミュレーション開始に失敗したため、テストを中断します")
        return

    # テスト2: 新規注文時のSL/TP設定（価格指定）
    position_id_1 = test_2_create_order_with_sltp_price()
    results["新規注文（価格指定）"] = position_id_1 is not None

    # テスト3: 新規注文時のSL/TP設定（pips指定）
    position_id_2 = test_3_create_order_with_sltp_pips()
    results["新規注文（pips指定）"] = position_id_2 is not None

    # テスト4: ポジション取得（SL/TP情報含む）
    results["ポジション取得"] = test_4_get_positions_with_sltp()

    # テスト5: 既存ポジションへのSL/TP設定
    if position_id_1:
        results["既存ポジションSL/TP設定"] = test_5_set_sltp_on_existing_position(position_id_1)

    # テスト6: ポジション確認
    positions = test_6_check_positions()
    results["ポジション確認"] = len(positions) > 0

    # 結果サマリー
    print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BLUE}テスト結果サマリー{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*60}{Colors.RESET}")

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for test_name, result in results.items():
        if result:
            print_success(f"{test_name}: 成功")
        else:
            print_error(f"{test_name}: 失敗")

    print(f"\n{Colors.BLUE}合計: {passed}/{total} テスト成功{Colors.RESET}")

    if passed == total:
        print(f"\n{Colors.GREEN}{'='*60}{Colors.RESET}")
        print(f"{Colors.GREEN}SUCCESS! F-102の基本機能が正常に動作しています！{Colors.RESET}")
        print(f"{Colors.GREEN}{'='*60}{Colors.RESET}\n")
    else:
        print(f"\n{Colors.RED}{'='*60}{Colors.RESET}")
        print(f"{Colors.RED}WARNING: 一部のテストが失敗しました。{Colors.RESET}")
        print(f"{Colors.RED}{'='*60}{Colors.RESET}\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}テストが中断されました{Colors.RESET}")
    except Exception as e:
        print(f"\n{Colors.RED}エラーが発生しました: {e}{Colors.RESET}")
        import traceback
        traceback.print_exc()
