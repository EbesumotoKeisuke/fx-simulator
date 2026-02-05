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
| POST | `/orders/pending` | 予約注文作成（指値・逆指値） | F-101 |
| GET | `/orders/pending` | 未約定注文一覧取得 | F-101 |
| GET | `/orders/pending/{order_id}` | 未約定注文詳細取得 | F-101 |
| PUT | `/orders/pending/{order_id}` | 未約定注文変更 | F-101 |
| DELETE | `/orders/pending/{order_id}` | 未約定注文キャンセル | F-101 |

### 2.4 ポジション関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| GET | `/positions` | 保有ポジション一覧取得 | F-004 |
| POST | `/positions/{position_id}/close` | ポジション決済 | F-004 |
| GET | `/positions/{position_id}` | ポジション詳細取得 | F-004 |
| PUT | `/positions/{position_id}/sl-tp` | 損切り・利確設定 | F-102 |

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

### 2.7 パフォーマンス分析関連

| メソッド | エンドポイント | 説明 | 機能ID |
|----------|----------------|------|--------|
| GET | `/analytics/performance` | パフォーマンス指標取得 | F-105 |
| GET | `/analytics/equity-curve` | 資産曲線データ取得 | F-105 |
| GET | `/analytics/drawdown` | ドローダウンデータ取得 | F-105 |
| POST | `/analytics/ai-feedback` | AI改善コメント生成 | F-105 |
| GET | `/analytics/ai-feedback` | 最新のAI改善コメント取得 | F-105 |

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
新規成行注文を発注する。SL/TPの同時設定も可能。

**リクエストボディ**
```json
{
  "side": "buy",
  "lot_size": 0.1,
  "sl_price": 145.00,
  "tp_price": 146.00,
  "sl_pips": -20,
  "tp_pips": 30
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| side | string | Yes | `buy` または `sell` |
| lot_size | float | Yes | ロットサイズ（0.01〜100.0） |
| sl_price | float | No | 損切り価格（価格指定の場合） |
| tp_price | float | No | 利確価格（価格指定の場合） |
| sl_pips | float | No | 損切りpips（pips指定の場合） |
| tp_pips | float | No | 利確pips（pips指定の場合） |

**注意事項**:
- `sl_price` と `sl_pips` は排他的（どちらか一方のみ指定）
- `tp_price` と `tp_pips` は排他的（どちらか一方のみ指定）
- 買いポジション：SLは負の値、TPは正の値（pips指定時）
- 売りポジション：SLは正の値、TPは負の値（pips指定時）

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

#### POST `/orders/pending`
予約注文（指値・逆指値）を作成する。

**リクエストボディ**
```json
{
  "order_type": "limit",
  "side": "buy",
  "lot_size": 0.1,
  "trigger_price": 145.00
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| order_type | string | Yes | `limit`（指値）または `stop`（逆指値） |
| side | string | Yes | `buy` または `sell` |
| lot_size | float | Yes | ロットサイズ（0.01〜100.0） |
| trigger_price | float | Yes | トリガー価格（約定価格） |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "order_id": "pord_xyz789",
    "order_type": "limit",
    "side": "buy",
    "lot_size": 0.1,
    "trigger_price": 145.00,
    "status": "pending",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### GET `/orders/pending`
未約定の予約注文一覧を取得する。

**クエリパラメータ**
| パラメータ | 型 | 必須 | 説明 |
|------------|------|------|------|
| limit | int | No | 取得件数（デフォルト: 50） |
| offset | int | No | オフセット（デフォルト: 0） |
| status | string | No | 状態フィルター（`pending`, `executed`, `cancelled`） |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "order_id": "pord_xyz789",
        "order_type": "limit",
        "side": "buy",
        "lot_size": 0.1,
        "trigger_price": 145.00,
        "status": "pending",
        "created_at": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 5,
    "limit": 50,
    "offset": 0
  }
}
```

#### PUT `/orders/pending/{order_id}`
未約定注文の内容を変更する。

**リクエストボディ**
```json
{
  "lot_size": 0.2,
  "trigger_price": 144.50
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| lot_size | float | No | 新しいロットサイズ |
| trigger_price | float | No | 新しいトリガー価格 |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "order_id": "pord_xyz789",
    "order_type": "limit",
    "side": "buy",
    "lot_size": 0.2,
    "trigger_price": 144.50,
    "status": "pending",
    "updated_at": "2024-01-15T11:00:00Z"
  }
}
```

#### DELETE `/orders/pending/{order_id}`
未約定注文をキャンセルする。

**レスポンス**
```json
{
  "success": true,
  "data": {
    "order_id": "pord_xyz789",
    "status": "cancelled",
    "cancelled_at": "2024-01-15T11:30:00Z"
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

#### PUT `/positions/{position_id}/sl-tp`
ポジションに損切り（SL）・利確（TP）を設定する。

**リクエストボディ**
```json
{
  "sl_price": 144.00,
  "tp_price": 146.50,
  "sl_pips": null,
  "tp_pips": null
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| sl_price | float | No | 損切り価格（絶対価格） |
| tp_price | float | No | 利確価格（絶対価格） |
| sl_pips | float | No | 損切りpips（エントリー価格からの相対値） |
| tp_pips | float | No | 利確pips（エントリー価格からの相対値） |

**備考**
- `sl_price`と`sl_pips`は排他的（どちらか一方のみ指定）
- `tp_price`と`tp_pips`は排他的（どちらか一方のみ指定）
- pips指定の場合、バックエンドで価格に変換して保存
- 既に設定済みの場合は上書き、`null`を指定すると削除
- フロントエンドでバリデーション実施：
  - 買いポジション：SLは負の値のみ、TPは正の値のみ（pips指定時）
  - 売りポジション：SLは正の値のみ、TPは負の値のみ（pips指定時）
  - 価格指定時：エントリー価格との大小関係をチェック

**レスポンス**
```json
{
  "success": true,
  "data": {
    "position_id": "pos_abc123",
    "sl_price": 144.00,
    "tp_price": 146.50,
    "sl_pips": -15.0,
    "tp_pips": 25.0,
    "updated_at": "2024-01-15T12:00:00Z"
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

### 3.7 パフォーマンス分析関連

#### GET `/analytics/performance`
シミュレーションのパフォーマンス指標を取得する。

**レスポンス**
```json
{
  "success": true,
  "data": {
    "basic": {
      "win_rate": 66.7,
      "total_pnl": 25000,
      "gross_profit": 45000,
      "gross_loss": -20000,
      "total_trades": 15,
      "winning_trades": 10,
      "losing_trades": 5
    },
    "risk_return": {
      "profit_factor": 2.25,
      "average_win": 4500,
      "average_loss": -4000,
      "risk_reward_ratio": 1.125,
      "max_win": 8500,
      "max_loss": -7200,
      "max_win_pips": 55.0,
      "max_loss_pips": -45.0
    },
    "drawdown": {
      "max_drawdown": -12000,
      "max_drawdown_percent": -1.2,
      "max_drawdown_duration_days": 3
    },
    "consecutive": {
      "max_consecutive_wins": 5,
      "max_consecutive_losses": 3
    },
    "period": {
      "start_date": "2024-01-15T09:00:00Z",
      "end_date": "2024-01-20T17:00:00Z",
      "duration_days": 5
    }
  }
}
```

**指標説明**
| 指標 | 説明 |
|------|------|
| win_rate | 勝率（%） |
| total_pnl | 総損益（円） |
| gross_profit | 総利益（勝ちトレードの合計、円） |
| gross_loss | 総損失（負けトレードの合計、円） |
| profit_factor | プロフィットファクター（総利益 / 総損失の絶対値） |
| average_win | 平均利益（円） |
| average_loss | 平均損失（円） |
| risk_reward_ratio | リスクリワード比（平均利益 / 平均損失の絶対値） |
| max_drawdown | 最大ドローダウン（円） |
| max_drawdown_percent | 最大ドローダウン率（%） |
| max_consecutive_wins | 最大連勝数 |
| max_consecutive_losses | 最大連敗数 |

#### GET `/analytics/equity-curve`
資産曲線データを取得する（グラフ表示用）。

**クエリパラメータ**
| パラメータ | 型 | 必須 | 説明 |
|------------|------|------|------|
| interval | string | No | データ間隔（`trade`, `hour`, `day`）デフォルト: `trade` |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "points": [
      {
        "timestamp": "2024-01-15T10:30:00Z",
        "balance": 1000000,
        "equity": 1000000,
        "cumulative_pnl": 0
      },
      {
        "timestamp": "2024-01-15T11:00:00Z",
        "balance": 1003000,
        "equity": 1005000,
        "cumulative_pnl": 3000
      }
    ],
    "initial_balance": 1000000,
    "final_balance": 1025000
  }
}
```

#### GET `/analytics/drawdown`
ドローダウンデータを取得する（グラフ表示用）。

**レスポンス**
```json
{
  "success": true,
  "data": {
    "points": [
      {
        "timestamp": "2024-01-15T10:00:00Z",
        "equity": 1000000,
        "peak_equity": 1000000,
        "drawdown": 0,
        "drawdown_percent": 0
      },
      {
        "timestamp": "2024-01-15T14:00:00Z",
        "equity": 988000,
        "peak_equity": 1000000,
        "drawdown": -12000,
        "drawdown_percent": -1.2
      }
    ],
    "max_drawdown": -12000,
    "max_drawdown_percent": -1.2
  }
}
```

#### POST `/analytics/ai-feedback`
ChatGPT APIまたはMCPサーバーを使用して、トレード分析に基づくAI改善コメントを生成する。

**リクエストボディ**
```json
{
  "include_market_data": true,
  "max_suggestions": 5
}
```

| フィールド | 型 | 必須 | 説明 |
|------------|------|------|------|
| include_market_data | boolean | No | 市場データ（CSV）を分析に含めるか（デフォルト: true） |
| max_suggestions | int | No | 最大提案数（デフォルト: 5、範囲: 3〜10） |

**処理フロー**
1. 現在のシミュレーションのトレード履歴を取得
2. パフォーマンス指標を計算
3. 市場データ（価格、テクニカル指標）を取得
4. ChatGPT APIまたはMCPサーバーに分析リクエストを送信
5. AI生成のコメントをデータベースに保存
6. 生成されたコメントを返却

**レスポンス**
```json
{
  "success": true,
  "data": {
    "feedback_id": "fb_abc123",
    "suggestions": [
      {
        "title": "リスク管理の改善",
        "description": "損切り幅が不均一です。エントリー価格の-2%を目安に統一することで、リスクをコントロールしやすくなります。",
        "priority": "high"
      },
      {
        "title": "トレードタイミングの最適化",
        "description": "9:00-10:00のボラティリティが高い時間帯でのエントリーが多く見られます。10:30以降の落ち着いた相場環境での取引を検討してみてください。",
        "priority": "medium"
      },
      {
        "title": "利確戦略の見直し",
        "description": "平均利確が+29 pipsに対し、平均損切が-27 pipsとほぼ同等です。リスクリワード比を1.5:1以上に改善することをお勧めします。",
        "priority": "high"
      }
    ],
    "generated_at": "2024-01-20T17:05:00Z",
    "model": "gpt-4",
    "data_points_analyzed": {
      "trades": 15,
      "candles": 1440
    }
  }
}
```

#### GET `/analytics/ai-feedback`
最新のAI改善コメントを取得する。

**クエリパラメータ**
| パラメータ | 型 | 必須 | 説明 |
|------------|------|------|------|
| feedback_id | string | No | 特定のフィードバックIDを指定 |

**レスポンス**
```json
{
  "success": true,
  "data": {
    "feedback_id": "fb_abc123",
    "suggestions": [
      {
        "title": "リスク管理の改善",
        "description": "損切り幅が不均一です。エントリー価格の-2%を目安に統一することで、リスクをコントロールしやすくなります。",
        "priority": "high"
      }
    ],
    "generated_at": "2024-01-20T17:05:00Z",
    "model": "gpt-4"
  }
}
```

**備考**
- AI改善コメント生成には外部API（OpenAI）またはMCPサーバーへの接続が必要
- API呼び出しには数秒〜数十秒かかる場合がある
- 生成されたコメントはキャッシュされ、再利用可能
- APIキーの設定は環境変数またはコンフィグファイルで管理

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
| PENDING_ORDER_NOT_FOUND | 404 | 予約注文が見つからない |
| INVALID_ORDER_TYPE | 400 | 注文タイプが不正 |
| INVALID_TRIGGER_PRICE | 400 | トリガー価格が不正 |
| INVALID_SL_TP_PARAMS | 400 | SL/TPパラメータが不正（価格とpips両方指定など） |
| SLTP_CONFLICT | 409 | 同一ローソク足でSLとTPが両方発動 |
| AI_API_ERROR | 500 | AI API（ChatGPT/MCP）との通信エラー |
| AI_API_TIMEOUT | 504 | AI API（ChatGPT/MCP）のタイムアウト |
| AI_API_RATE_LIMIT | 429 | AI APIのレート制限に達しました |
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
