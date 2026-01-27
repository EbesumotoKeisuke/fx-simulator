#!/bin/bash

# FX Simulator API Integration Test Script
# このスクリプトはバックエンドAPIの基本機能をテストします

echo "========================================="
echo "FX Simulator API Integration Test"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

# Test function
test_api() {
    local test_name=$1
    local method=$2
    local url=$3
    local data=$4
    local expected_success=$5

    echo -n "Testing: $test_name ... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$url")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url")
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT -H "Content-Type: application/json" -d "$data" "$url")
    fi

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    success=$(echo "$body" | grep -o '"success":[^,}]*' | cut -d':' -f2)

    if [ "$http_code" = "200" ] && [ "$success" = "$expected_success" ]; then
        echo -e "${GREEN}PASS${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        echo "  HTTP Code: $http_code"
        echo "  Response: $body"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi
}

echo "環境確認テスト"
echo "-----------------------------------------"

# ENV-003: バックエンド接続
echo -n "ENV-003: Backend API connection ... "
http_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs)
if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}PASS${NC}"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC} (HTTP $http_code)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""
echo "データ管理テスト"
echo "-----------------------------------------"

# DATA-002: データ日付範囲取得
test_api "DATA-002: Get date range" "GET" "http://localhost:8000/api/v1/market-data/date-range" "" "true"

# DATA-003: ローソク足データ取得
test_api "DATA-003: Get H1 candles" "GET" "http://localhost:8000/api/v1/market-data/candles?timeframe=H1&limit=10" "" "true"

test_api "DATA-003: Get M10 candles" "GET" "http://localhost:8000/api/v1/market-data/candles?timeframe=M10&limit=10" "" "true"

test_api "DATA-003: Get D1 candles" "GET" "http://localhost:8000/api/v1/market-data/candles?timeframe=D1&limit=10" "" "true"

echo ""
echo "シミュレーション基本機能テスト"
echo "-----------------------------------------"

# シミュレーション開始
start_data='{"start_time":"2024-01-15T09:00:00Z","initial_balance":1000000,"speed":1.0}'
test_api "SIM-002: Start simulation" "POST" "http://localhost:8000/api/v1/simulation/start" "$start_data" "true"

# シミュレーション状態取得
test_api "SIM-STATUS: Get status" "GET" "http://localhost:8000/api/v1/simulation/status" "" "true"

# シミュレーション一時停止
test_api "SIM-006: Pause simulation" "POST" "http://localhost:8000/api/v1/simulation/pause" "" "true"

# シミュレーション再開
test_api "SIM-009: Resume simulation" "POST" "http://localhost:8000/api/v1/simulation/resume" "" "true"

# 速度変更
speed_data='{"speed":5.0}'
test_api "SIM-010: Change speed" "PUT" "http://localhost:8000/api/v1/simulation/speed" "$speed_data" "true"

echo ""
echo "口座情報テスト"
echo "-----------------------------------------"

# 口座情報取得
test_api "ACCOUNT-001: Get account info" "GET" "http://localhost:8000/api/v1/account" "" "true"

echo ""
echo "トレード機能テスト"
echo "-----------------------------------------"

# 買い注文
buy_order='{"side":"buy","lot_size":0.1}'
test_api "TRADE-001: Buy order" "POST" "http://localhost:8000/api/v1/orders" "$buy_order" "true"

# ポジション一覧取得
test_api "TRADE-007: Get positions" "GET" "http://localhost:8000/api/v1/positions" "" "true"

# 売り注文
sell_order='{"side":"sell","lot_size":0.1}'
test_api "TRADE-002: Sell order" "POST" "http://localhost:8000/api/v1/orders" "$sell_order" "true"

# 注文履歴取得
test_api "Get orders history" "GET" "http://localhost:8000/api/v1/orders" "" "true"

# シミュレーション終了
echo ""
echo "シミュレーション終了テスト"
echo "-----------------------------------------"

# 終了前にポジション一覧確認
echo "Checking positions before stop..."
curl -s http://localhost:8000/api/v1/positions | grep -o '"positions":\[.*\]' | head -c 100

# シミュレーション終了
test_api "SIM-011: Stop simulation" "POST" "http://localhost:8000/api/v1/simulation/stop" "" "true"

# 終了後のトレード履歴取得
test_api "RESULT-001: Get trades after stop" "GET" "http://localhost:8000/api/v1/trades" "" "true"

# 終了後の口座情報取得
test_api "RESULT-001: Get account after stop" "GET" "http://localhost:8000/api/v1/account" "" "true"

echo ""
echo "エッジケーステスト"
echo "-----------------------------------------"

# 停止状態で注文（エラーになるべき）
edge_order='{"side":"buy","lot_size":0.1}'
echo -n "EDGE-002: Order when stopped ... "
response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$edge_order" "http://localhost:8000/api/v1/orders")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')
success=$(echo "$body" | grep -o '"success":[^,}]*' | cut -d':' -f2)

if [ "$success" = "false" ]; then
    echo -e "${GREEN}PASS${NC} (correctly rejected)"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC} (should have been rejected)"
    echo "  Response: $body"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# 無効なロットサイズ
invalid_lot='{"side":"buy","lot_size":0}'
echo -n "TRADE-005: Invalid lot size ... "
response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$invalid_lot" "http://localhost:8000/api/v1/orders")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')
success=$(echo "$body" | grep -o '"success":[^,}]*' | cut -d':' -f2)

if [ "$success" = "false" ]; then
    echo -e "${GREEN}PASS${NC} (correctly rejected)"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}FAIL${NC} (should have been rejected)"
    echo "  Response: $body"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo -e "Total Tests: $((PASS_COUNT + FAIL_COUNT))"
echo -e "${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "${RED}FAIL: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}All API tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
fi
