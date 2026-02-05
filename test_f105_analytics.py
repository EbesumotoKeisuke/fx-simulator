#!/usr/bin/env python3
"""
F-105: パフォーマンス分析機能の簡易テストスクリプト

このスクリプトは以下の項目を確認します：
1. シミュレーション開始とトレード実行
2. パフォーマンス指標の取得
3. 資産曲線データの取得
4. ドローダウンデータの取得
5. 各指標の妥当性確認
"""

import requests
import json
import time
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

def test_2_create_trades():
    """テスト2: 複数のトレードを実行（勝ち・負けトレードを作成）"""
    print_test("2. 複数のトレードを実行")

    # トレード1: 買い注文（勝ちトレード想定）
    print_info("トレード1: 買い注文を作成...")
    response = requests.post(f"{BASE_URL}/orders", json={
        "side": "buy",
        "lot_size": 0.1
    })
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        position_id_1 = data["data"]["position_id"]
        print_success(f"トレード1作成成功: {position_id_1}")
    else:
        print_error(f"トレード1作成失敗: {data}")
        return None

    # 時間経過シミュレーション
    time.sleep(0.5)

    # トレード2: 売り注文（負けトレード想定）
    print_info("トレード2: 売り注文を作成...")
    response = requests.post(f"{BASE_URL}/orders", json={
        "side": "sell",
        "lot_size": 0.1
    })
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        position_id_2 = data["data"]["position_id"]
        print_success(f"トレード2作成成功: {position_id_2}")
    else:
        print_error(f"トレード2作成失敗: {data}")
        return None

    # トレード3: 買い注文（勝ちトレード想定）
    print_info("トレード3: 買い注文を作成...")
    response = requests.post(f"{BASE_URL}/orders", json={
        "side": "buy",
        "lot_size": 0.2
    })
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        position_id_3 = data["data"]["position_id"]
        print_success(f"トレード3作成成功: {position_id_3}")
    else:
        print_error(f"トレード3作成失敗: {data}")
        return None

    # ポジションを決済
    print_info("ポジション1を決済...")
    response = requests.post(f"{BASE_URL}/positions/{position_id_1}/close")
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        pnl_1 = data["data"].get("realized_pnl", 0)
        print_success(f"ポジション1決済成功: 損益={pnl_1}円")
    else:
        print_error(f"ポジション1決済失敗: {data}")

    time.sleep(0.5)

    print_info("ポジション2を決済...")
    response = requests.post(f"{BASE_URL}/positions/{position_id_2}/close")
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        pnl_2 = data["data"].get("realized_pnl", 0)
        print_success(f"ポジション2決済成功: 損益={pnl_2}円")
    else:
        print_error(f"ポジション2決済失敗: {data}")

    time.sleep(0.5)

    print_info("ポジション3を決済...")
    response = requests.post(f"{BASE_URL}/positions/{position_id_3}/close")
    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        pnl_3 = data["data"].get("realized_pnl", 0)
        print_success(f"ポジション3決済成功: 損益={pnl_3}円")
    else:
        print_error(f"ポジション3決済失敗: {data}")

    return True

def test_3_get_performance_metrics():
    """テスト3: パフォーマンス指標を取得"""
    print_test("3. パフォーマンス指標を取得")

    print_info("パフォーマンス指標を取得...")
    response = requests.get(f"{BASE_URL}/analytics/performance")

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        metrics = data["data"]
        print_success("パフォーマンス指標取得成功")

        # 基本指標
        basic = metrics.get("basic", {})
        print_info(f"  勝率: {basic.get('win_rate')}%")
        print_info(f"  総損益: {basic.get('total_pnl')}円")
        print_info(f"  総利益: {basic.get('gross_profit')}円")
        print_info(f"  総損失: {basic.get('gross_loss')}円")
        print_info(f"  総トレード数: {basic.get('total_trades')}件")

        # リスク・リターン指標
        risk_return = metrics.get("risk_return", {})
        print_info(f"  プロフィットファクター: {risk_return.get('profit_factor')}")
        print_info(f"  平均利益: {risk_return.get('average_win')}円")
        print_info(f"  平均損失: {risk_return.get('average_loss')}円")
        print_info(f"  リスクリワード比: {risk_return.get('risk_reward_ratio')}")

        # ドローダウン指標
        drawdown = metrics.get("drawdown", {})
        print_info(f"  最大ドローダウン: {drawdown.get('max_drawdown')}円")
        print_info(f"  最大ドローダウン率: {drawdown.get('max_drawdown_percent')}%")

        # 連続性指標
        consecutive = metrics.get("consecutive", {})
        print_info(f"  最大連勝数: {consecutive.get('max_consecutive_wins')}")
        print_info(f"  最大連敗数: {consecutive.get('max_consecutive_losses')}")

        return True
    else:
        print_error(f"パフォーマンス指標取得失敗: {data}")
        return False

def test_4_get_equity_curve():
    """テスト4: 資産曲線データを取得"""
    print_test("4. 資産曲線データを取得")

    print_info("資産曲線データを取得...")
    response = requests.get(f"{BASE_URL}/analytics/equity-curve?interval=trade")

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        equity_data = data["data"]
        points = equity_data.get("points", [])
        initial_balance = equity_data.get("initial_balance")
        final_balance = equity_data.get("final_balance")

        print_success(f"資産曲線データ取得成功: {len(points)}ポイント")
        print_info(f"  初期資金: {initial_balance}円")
        print_info(f"  最終残高: {final_balance}円")

        if len(points) >= 2:
            print_info(f"  開始: {points[0]['timestamp']} - {points[0]['balance']}円")
            print_info(f"  終了: {points[-1]['timestamp']} - {points[-1]['balance']}円")

        return True
    else:
        print_error(f"資産曲線データ取得失敗: {data}")
        return False

def test_5_get_drawdown_data():
    """テスト5: ドローダウンデータを取得"""
    print_test("5. ドローダウンデータを取得")

    print_info("ドローダウンデータを取得...")
    response = requests.get(f"{BASE_URL}/analytics/drawdown")

    data = get_json_response(response)
    if response.status_code == 200 and data and data.get("success"):
        drawdown_data = data["data"]
        points = drawdown_data.get("points", [])
        max_drawdown = drawdown_data.get("max_drawdown")
        max_drawdown_percent = drawdown_data.get("max_drawdown_percent")

        print_success(f"ドローダウンデータ取得成功: {len(points)}ポイント")
        print_info(f"  最大ドローダウン: {max_drawdown}円")
        print_info(f"  最大ドローダウン率: {max_drawdown_percent}%")

        return True
    else:
        print_error(f"ドローダウンデータ取得失敗: {data}")
        return False

def main():
    print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BLUE}F-105: パフォーマンス分析機能 簡易テスト{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*60}{Colors.RESET}")

    results = {}

    # テスト1: シミュレーション開始
    sim_id = test_1_start_simulation()
    results["シミュレーション開始"] = sim_id is not None
    if not sim_id:
        print_error("シミュレーション開始に失敗したため、テストを中断します")
        return

    # テスト2: 複数のトレードを実行
    results["複数トレード実行"] = test_2_create_trades()

    # テスト3: パフォーマンス指標を取得
    results["パフォーマンス指標取得"] = test_3_get_performance_metrics()

    # テスト4: 資産曲線データを取得
    results["資産曲線データ取得"] = test_4_get_equity_curve()

    # テスト5: ドローダウンデータを取得
    results["ドローダウンデータ取得"] = test_5_get_drawdown_data()

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
        print(f"{Colors.GREEN}SUCCESS! F-105の基本機能が正常に動作しています！{Colors.RESET}")
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
