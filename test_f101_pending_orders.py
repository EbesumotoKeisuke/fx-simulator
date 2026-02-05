#!/usr/bin/env python3
"""
F-101: 指値・逆指値注文機能の動作確認スクリプト

このスクリプトは以下の項目を確認します：
1. 予約注文の作成（指値・逆指値）
2. 予約注文の一覧取得
3. 予約注文の変更
4. 予約注文のキャンセル
5. 予約注文の約定チェック（10分足OHLCによる判定）
6. シミュレーション終了時の自動キャンセル
"""

import requests
import json
from datetime import datetime, timedelta

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

def test_1_create_simulation():
    """テスト1: シミュレーション開始"""
    print_test("1. シミュレーション開始")

    # シミュレーション開始
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

def test_2_create_pending_orders():
    """テスト2: 予約注文の作成"""
    print_test("2. 予約注文の作成")

    orders = []

    # 指値買い注文
    print_info("指値買い注文を作成...")
    response = requests.post(f"{BASE_URL}/orders/pending", json={
        "order_type": "limit",
        "side": "buy",
        "lot_size": 0.1,
        "trigger_price": 156.000
    })
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        order_id = data["data"]["order_id"]
        orders.append(order_id)
        print_success(f"指値買い注文作成成功: {order_id}")
    else:
        print_error(f"指値買い注文作成失敗: {data}")

    # 指値売り注文
    print_info("指値売り注文を作成...")
    response = requests.post(f"{BASE_URL}/orders/pending", json={
        "order_type": "limit",
        "side": "sell",
        "lot_size": 0.1,
        "trigger_price": 157.000
    })
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        order_id = data["data"]["order_id"]
        orders.append(order_id)
        print_success(f"指値売り注文作成成功: {order_id}")
    else:
        print_error(f"指値売り注文作成失敗: {data}")

    # 逆指値買い注文
    print_info("逆指値買い注文を作成...")
    response = requests.post(f"{BASE_URL}/orders/pending", json={
        "order_type": "stop",
        "side": "buy",
        "lot_size": 0.1,
        "trigger_price": 157.500
    })
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        order_id = data["data"]["order_id"]
        orders.append(order_id)
        print_success(f"逆指値買い注文作成成功: {order_id}")
    else:
        print_error(f"逆指値買い注文作成失敗: {data}")

    # 逆指値売り注文
    print_info("逆指値売り注文を作成...")
    response = requests.post(f"{BASE_URL}/orders/pending", json={
        "order_type": "stop",
        "side": "sell",
        "lot_size": 0.1,
        "trigger_price": 155.500
    })
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        order_id = data["data"]["order_id"]
        orders.append(order_id)
        print_success(f"逆指値売り注文作成成功: {order_id}")
    else:
        print_error(f"逆指値売り注文作成失敗: {data}")

    return orders

def test_3_get_pending_orders():
    """テスト3: 予約注文一覧の取得"""
    print_test("3. 予約注文一覧の取得")

    response = requests.get(f"{BASE_URL}/orders/pending", params={
        "status": "pending"
    })

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        result_data = data.get("data")
        if result_data and "orders" in result_data:
            orders = result_data["orders"]
            print_success(f"予約注文一覧取得成功: {len(orders)}件")
            for order in orders:
                order_type = "指値" if order["order_type"] == "limit" else "逆指値"
                side = "買" if order["side"] == "buy" else "売"
                print_info(f"  - {order_type}/{side}: ロット{order['lot_size']}, 価格{order['trigger_price']}, 状態:{order['status']}")
            return True
        else:
            print_error(f"予約注文一覧取得失敗: dataがNoneまたは不正な形式 - {data}")
            return False
    else:
        print_error(f"予約注文一覧取得失敗: {data}")
        return False

def test_4_update_pending_order(order_id):
    """テスト4: 予約注文の変更"""
    print_test("4. 予約注文の変更")

    # 注文の変更
    print_info(f"注文ID {order_id} を変更...")
    response = requests.put(f"{BASE_URL}/orders/pending/{order_id}", json={
        "lot_size": 0.2,
        "trigger_price": 156.100
    })

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        updated_order = data["data"]
        print_success(f"予約注文変更成功: ロット{updated_order['lot_size']}, 価格{updated_order['trigger_price']}")
        return True
    else:
        print_error(f"予約注文変更失敗: {data}")
        return False

def test_5_cancel_pending_order(order_id):
    """テスト5: 予約注文のキャンセル"""
    print_test("5. 予約注文のキャンセル")

    print_info(f"注文ID {order_id} をキャンセル...")
    response = requests.delete(f"{BASE_URL}/orders/pending/{order_id}")

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        print_success(f"予約注文キャンセル成功: {data['data']['status']}")
        return True
    else:
        print_error(f"予約注文キャンセル失敗: {data}")
        return False

def test_6_order_execution():
    """テスト6: 予約注文の約定チェック"""
    print_test("6. 予約注文の約定チェック")

    # 時刻を進める（約定チェックが実行される）
    print_info("シミュレーション時刻を進める...")
    for i in range(3):
        response = requests.post(f"{BASE_URL}/simulation/advance-time", json={
            "new_time": f"2024-12-24T09:{(i+1)*10:02d}:00"
        })
        data = get_json_response(response)
        if response.status_code == 200 and data and data.get("success"):
            print_success(f"時刻更新成功: {data['data']['current_time']}")
        else:
            print_error(f"時刻更新失敗: {data}")

    # 予約注文の状態を確認
    print_info("予約注文の状態を確認...")
    response = requests.get(f"{BASE_URL}/orders/pending")
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        result_data = data.get("data")
        if result_data and "orders" in result_data:
            orders = result_data["orders"]
            pending_count = sum(1 for o in orders if o["status"] == "pending")
            executed_count = sum(1 for o in orders if o["status"] == "executed")
            print_success(f"未約定: {pending_count}件, 約定済: {executed_count}件")

            for order in orders:
                if order["status"] == "executed":
                    print_info(f"  - 約定: {order['order_type']}/{order['side']}, 価格{order['trigger_price']}")
            return True
        else:
            print_error(f"予約注文確認失敗: dataがNoneまたは不正な形式 - {data}")
            return False
    else:
        print_error(f"予約注文確認失敗: {data}")
        return False

def test_7_pause_and_check():
    """テスト7: 一時停止時の注文保持"""
    print_test("7. 一時停止時の注文保持")

    # シミュレーションを一時停止
    print_info("シミュレーションを一時停止...")
    response = requests.post(f"{BASE_URL}/simulation/pause")
    data = get_json_response(response)
    if not (response.status_code == 200 and data and data.get("success")):
        print_error(f"一時停止失敗: {data}")
        return False
    print_success("一時停止成功")

    # 予約注文が保持されているか確認
    print_info("予約注文が保持されているか確認...")
    response = requests.get(f"{BASE_URL}/orders/pending", params={"status": "pending"})
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        orders = data["data"]["orders"]
        print_success(f"予約注文が保持されています: {len(orders)}件")
        return True
    else:
        print_error(f"予約注文確認失敗: {data}")
        return False

def test_8_stop_and_auto_cancel():
    """テスト8: シミュレーション終了時の自動キャンセル"""
    print_test("8. シミュレーション終了時の自動キャンセル")

    # 終了前の予約注文数を確認
    print_info("終了前の予約注文数を確認...")
    response = requests.get(f"{BASE_URL}/orders/pending", params={"status": "pending"})
    data = get_json_response(response)
    if not (response.status_code == 200 and data and data.get("success")):
        print_error(f"予約注文確認失敗: {data}")
        return False

    pending_before = len(data["data"]["orders"])
    print_info(f"終了前の未約定注文: {pending_before}件")

    # シミュレーションを終了
    print_info("シミュレーションを終了...")
    response = requests.post(f"{BASE_URL}/simulation/stop")
    data = get_json_response(response)
    if not (response.status_code == 200 and data and data.get("success")):
        print_error(f"シミュレーション終了失敗: {data}")
        return False
    print_success(f"シミュレーション終了成功: 最終残高 {data['data']['final_balance']:,.0f}円")

    # 終了後の予約注文状態を確認（cancelledになっているはず）
    print_info("終了後の予約注文状態を確認...")
    response = requests.get(f"{BASE_URL}/orders/pending")
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        all_orders = data["data"]["orders"]
        cancelled_orders = [o for o in all_orders if o["status"] == "cancelled"]
        print_success(f"キャンセル済注文: {len(cancelled_orders)}件")

        # 元々pending状態だった注文が全てcancelledになっているか確認
        if len(cancelled_orders) >= pending_before:
            print_success("未約定注文が全て自動キャンセルされました")
            return True
        else:
            print_error(f"一部の注文がキャンセルされていません (期待: {pending_before}件, 実際: {len(cancelled_orders)}件)")
            return False
    else:
        print_error(f"予約注文確認失敗: {data}")
        return False

def main():
    print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BLUE}F-101: 指値・逆指値注文機能 動作確認{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*60}{Colors.RESET}")

    results = {}

    # テスト1: シミュレーション開始
    sim_id = test_1_create_simulation()
    results["シミュレーション開始"] = sim_id is not None
    if not sim_id:
        print_error("シミュレーション開始に失敗したため、テストを中断します")
        return

    # テスト2: 予約注文の作成
    order_ids = test_2_create_pending_orders()
    results["予約注文作成"] = len(order_ids) == 4

    # テスト3: 予約注文一覧の取得
    results["予約注文一覧取得"] = test_3_get_pending_orders()

    # テスト4: 予約注文の変更
    if order_ids:
        results["予約注文変更"] = test_4_update_pending_order(order_ids[0])

    # テスト5: 予約注文のキャンセル
    if len(order_ids) >= 2:
        results["予約注文キャンセル"] = test_5_cancel_pending_order(order_ids[1])

    # テスト6: 予約注文の約定チェック
    results["予約注文約定チェック"] = test_6_order_execution()

    # テスト7: 一時停止時の注文保持
    results["一時停止時の注文保持"] = test_7_pause_and_check()

    # テスト8: シミュレーション終了時の自動キャンセル
    results["終了時の自動キャンセル"] = test_8_stop_and_auto_cancel()

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
        print(f"{Colors.GREEN}SUCCESS! F-101の全機能が正常に動作しています！{Colors.RESET}")
        print(f"{Colors.GREEN}{'='*60}{Colors.RESET}\n")
    else:
        print(f"\n{Colors.RED}{'='*60}{Colors.RESET}")
        print(f"{Colors.RED}WARNING: 一部のテストが失敗しました。修正が必要です。{Colors.RESET}")
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
