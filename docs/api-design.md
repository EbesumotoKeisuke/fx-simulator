# API設計書

## 1. API概要

### 1.1 基本情報
- **ベースURL**: `http://localhost:8000/api/v1`
- **認証**: なし（個人利用のため）
- **レスポンス形式**: JSON
- **文字コード**: UTF-8

### 1.2 共通レスポンス形式

#### 成功時
```json
{
  "success": true,
  "data": { ... }
}
```

#### エラー時
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーメッセージ"
  }
}
```

---

## 2. エンドポイント一覧

### 2.1 為替データ関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| GET | `/market-data/candles` | ローソク足データ取得 | F-001, F-008 |
| GET | `/market-data/timeframes` | 利用可能な時間足一覧 | F-001 |
| GET | `/market-data/date-range` | データの日付範囲取得 | F-002, F-108 |
| POST | `/market-data/import` | 外部データソースからインポート | F-111 |

### 2.2 シミュレーション関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| POST | `/simulation/start` | シミュレーション開始 | F-002, F-108 |
| POST | `/simulation/stop` | シミュレーション終了 | F-109 |
| POST | `/simulation/pause` | シミュレーション一時停止 | F-002 |
| POST | `/simulation/resume` | シミュレーション再開 | F-002 |
| PUT | `/simulation/speed` | 再生速度変更 | F-107 |
| GET | `/simulation/status` | シミュレーション状態取得 | F-002 |
| GET | `/simulation/current-time` | 現在のシミュレーション時刻取得 | F-001 |

### 2.3 注文関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| POST | `/orders` | 新規注文（成行） | F-003 |
| GET | `/orders` | 注文履歴一覧取得 | F-007 |
| GET | `/orders/{order_id}` | 注文詳細取得 | F-007 |

### 2.4 ポジション関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| GET | `/positions` | 保有ポジション一覧取得 | F-004 |
| POST | `/positions/{position_id}/close` | ポジション決済 | F-004 |
| GET | `/positions/{position_id}` | ポジション詳細取得 | F-004 |

### 2.5 資金・損益関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| GET | `/account` | 口座情報取得（残高・損益） | F-005, F-006 |
| PUT | `/account/balance` | 初期資金設定 | F-006 |
| GET | `/account/history` | 資金推移履歴取得 | F-005 |

### 2.6 トレード履歴関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| GET | `/trades` | トレード履歴一覧取得 | F-007 |
| GET | `/trades/export` | トレード履歴CSV出力 | F-109 |
| GET | `/trades/{trade_id}` | トレード詳細取得 | F-007 |

---

## 3. API詳細仕様

### 3.1 為替データ関連

#### GET `/market-data/candles`
ローソク足データを取得する。

**クエリパラメータ**
| パラメータ | 型 | 必須 | 説明 |
|------------|------|------|------|
| timeframe | string | Yes | 時間足（`D1`, `H1`, `M10`） |
| start_time | datetime | No | 開始日時（ISO 8601形式） |
| end_time | datetime | No | 終了日時（ISO 8601形式） |
| limit | int | No | 取得件数（デフォルト: 100, 最大: 1000） |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "timeframe": "H1",
    "candles": [
      {
        "timestamp": "2024-01-15T10:00:00Z",
        "open": 145.50,
        "high": 145.80,
        "low": 145.30,
        "close": 145.65,
        "volume": 12500
      }
    ]
  }
}
```

#### GET `/market-data/date-range`
データが存在する日付範囲を取得する。

**レスポンス**
```json
{
  "success": true,
  "data": {
    "start_date": "2020-01-01",
    "end_date": "2024-12-31",
    "timeframes": {
      "D1": { "start": "2020-01-01", "end": "2024-12-31" },
      "H1": { "start": "2022-01-01", "end": "2024-12-31" },
      "M10": { "start": "2023-01-01", "end": "2024-12-31" }
    }
  }
}
```

#### POST `/market-data/import`
外部データソースから為替データをインポートする。

**リクエストボディ**
```json
{
  "source": "yahoo_finance",
  "symbol": "USDJPY",
  "timeframe": "H1",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

**レスポンス**
```json
{
  "success": true,
  "data": {
    "imported_count": 8760,
    "timeframe": "H1",
    "date_range": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    }
  }
}
```

---

### 3.2 シミュレーション関連

#### POST `/simulation/start`
シミュレーションを開始する。

**リクエストボディ**
```json
{
  "start_time": "2024-01-15T09:00:00Z",
  "initial_balance": 1000000,
  "speed": 1.0
}
```

**レスポンス**
```json
{
  "success": true,
  "data": {
    "simulation_id": "sim_abc123",
    "status": "running",
    "current_time": "2024-01-15T09:00:00Z",
    "balance": 1000000
  }
}
```

#### GET `/simulation/status`
現在のシミュレーション状態を取得する。

**レスポンス**
```json
{
  "success": true,
  "data": {
    "simulation_id": "sim_abc123",
    "status": "running",
    "current_time": "2024-01-15T14:30:00Z",
    "speed": 1.0,
    "elapsed_real_time": 3600,
    "elapsed_sim_time": 19800
  }
}
```

#### POST `/simulation/stop`
シミュレーションを終了する。

**処理内容**
1. 保有中の全ポジション（status='open'）を自動的にクローズする
   - クローズ時の価格は現在のシミュレーション時刻における市場価格
   - 各ポジションごとにTradeレコードが作成される
   - 確定損益が口座残高に反映される
2. シミュレーションのstatusを'stopped'に更新
3. final_balance、total_trades、profit_lossを計算して返却

**レスポンス**
```json
{
  "success": true,
  "data": {
    "simulation_id": "sim_abc123",
    "status": "stopped",
    "final_balance": 1025000,
    "total_trades": 15,
    "profit_loss": 25000
  }
}
```

**備考**
- total_tradesには手動決済分と自動決済分の両方が含まれる
- 停止後もGET `/trades`やGET `/account`でデータ取得可能

---

### 3.3 注文関連

#### POST `/orders`
新規成行注文を発注する。

**リクエストボディ**
```json
{
  "side": "buy",
  "lot_size": 0.1
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| side | string | Yes | `buy` または `sell` |
| lot_size | float | Yes | ロットサイズ（0.01〜100.0） |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "order_id": "ord_xyz789",
    "position_id": "pos_abc123",
    "side": "buy",
    "lot_size": 0.1,
    "entry_price": 145.50,
    "executed_at": "2024-01-15T10:30:00Z"
  }
}
```

#### GET `/orders`
注文履歴を取得する。

**クエリパラメータ**
| パラメータ | 型 | 必須 | 説明 |
|------------|------|------|------|
| limit | int | No | 取得件数（デフォルト: 50） |
| offset | int | No | オフセット（デフォルト: 0） |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "order_id": "ord_xyz789",
        "side": "buy",
        "lot_size": 0.1,
        "entry_price": 145.50,
        "executed_at": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 25,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 3.4 ポジション関連

#### GET `/positions`
保有中のポジション一覧を取得する。

**レスポンス**
```json
{
  "success": true,
  "data": {
    "positions": [
      {
        "position_id": "pos_abc123",
        "side": "buy",
        "lot_size": 0.1,
        "entry_price": 145.50,
        "current_price": 145.80,
        "unrealized_pnl": 3000,
        "unrealized_pnl_pips": 30,
        "opened_at": "2024-01-15T10:30:00Z"
      }
    ],
    "total_unrealized_pnl": 3000
  }
}
```

#### POST `/positions/{position_id}/close`
ポジションを決済する。

**レスポンス**
```json
{
  "success": true,
  "data": {
    "position_id": "pos_abc123",
    "trade_id": "trd_def456",
    "side": "buy",
    "lot_size": 0.1,
    "entry_price": 145.50,
    "exit_price": 145.80,
    "realized_pnl": 3000,
    "realized_pnl_pips": 30,
    "closed_at": "2024-01-15T15:00:00Z"
  }
}
```

---

### 3.5 資金・損益関連

#### GET `/account`
口座情報を取得する。

**取得対象**
- アクティブなシミュレーション（status='running'または'paused'）が存在する場合はそれを優先
- アクティブなシミュレーションがない場合は、最新の停止済みシミュレーション（status='stopped'）を取得
- これにより、シミュレーション終了後も結果表示やCSV出力が可能

**レスポンス**
```json
{
  "success": true,
  "data": {
    "balance": 1025000,
    "equity": 1028000,
    "margin_used": 14550,
    "margin_available": 1013450,
    "unrealized_pnl": 3000,
    "realized_pnl": 25000,
    "initial_balance": 1000000
  }
}
```

#### PUT `/account/balance`
初期資金を設定する。

**リクエストボディ**
```json
{
  "initial_balance": 1000000
}
```

**レスポンス**
```json
{
  "success": true,
  "data": {
    "balance": 1000000,
    "message": "Initial balance set successfully"
  }
}
```

---

### 3.6 トレード履歴関連

#### GET `/trades`
決済済みトレード履歴を取得する。

**取得対象**
- アクティブなシミュレーション（status='running'または'paused'）が存在する場合はそれを優先
- アクティブなシミュレーションがない場合は、最新の停止済みシミュレーション（status='stopped'）を取得
- これにより、シミュレーション終了後も結果表示やCSV出力が可能

**クエリパラメータ**
| パラメータ | 型 | 必須 | 説明 |
|------------|------|------|------|
| limit | int | No | 取得件数（デフォルト: 50） |
| offset | int | No | オフセット（デフォルト: 0） |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "trade_id": "trd_def456",
        "side": "buy",
        "lot_size": 0.1,
        "entry_price": 145.50,
        "exit_price": 145.80,
        "realized_pnl": 3000,
        "realized_pnl_pips": 30,
        "opened_at": "2024-01-15T10:30:00Z",
        "closed_at": "2024-01-15T15:00:00Z"
      }
    ],
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

#### GET `/trades/export`
トレード履歴をCSV形式で出力する。

**レスポンス**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="trades_20240115.csv"`

```csv
trade_id,side,lot_size,entry_price,exit_price,realized_pnl,realized_pnl_pips,opened_at,closed_at
trd_def456,buy,0.1,145.50,145.80,3000,30,2024-01-15T10:30:00Z,2024-01-15T15:00:00Z
```

---

## 4. エラーコード一覧

| コード | HTTPステータス | 説明 |
|--------|----------------|------|
| INVALID_PARAMETER | 400 | パラメータが不正 |
| SIMULATION_NOT_RUNNING | 400 | シミュレーションが実行中でない |
| SIMULATION_ALREADY_RUNNING | 400 | シミュレーションが既に実行中 |
| POSITION_NOT_FOUND | 404 | ポジションが見つからない |
| ORDER_NOT_FOUND | 404 | 注文が見つからない |
| INSUFFICIENT_BALANCE | 400 | 残高不足 |
| INVALID_LOT_SIZE | 400 | ロットサイズが不正 |
| DATA_NOT_FOUND | 404 | 為替データが見つからない |
| IMPORT_FAILED | 500 | データインポートに失敗 |
| INTERNAL_ERROR | 500 | 内部エラー |

---

## 5. WebSocket API（リアルタイム更新用）

### 5.1 接続
```
ws://localhost:8000/ws/simulation
```

### 5.2 メッセージ形式

#### サーバーからクライアントへ

**時間更新**
```json
{
  "type": "time_update",
  "data": {
    "current_time": "2024-01-15T10:30:00Z"
  }
}
```

**価格更新**
```json
{
  "type": "price_update",
  "data": {
    "price": 145.65,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

**ポジション更新**
```json
{
  "type": "position_update",
  "data": {
    "positions": [...],
    "total_unrealized_pnl": 3000
  }
}
```

**口座更新**
```json
{
  "type": "account_update",
  "data": {
    "balance": 1025000,
    "equity": 1028000,
    "unrealized_pnl": 3000
  }
}
```
