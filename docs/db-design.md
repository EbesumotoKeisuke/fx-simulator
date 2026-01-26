# DB設計書

## 1. データベース概要

### 1.1 基本情報
- **DBMS**: PostgreSQL 15
- **文字コード**: UTF-8
- **タイムゾーン**: UTC（表示時にローカルタイムに変換）

### 1.2 命名規則
- テーブル名: スネークケース、複数形（例: `candles`, `positions`）
- カラム名: スネークケース（例: `entry_price`, `created_at`）
- インデックス名: `idx_{テーブル名}_{カラム名}`
- 外部キー名: `fk_{テーブル名}_{参照テーブル名}`

---

## 2. ER図

```
+------------------+       +------------------+       +------------------+
|     candles      |       |   simulations    |       |     accounts     |
+------------------+       +------------------+       +------------------+
| id (PK)          |       | id (PK)          |<----->| id (PK)          |
| timeframe        |       | status           |       | simulation_id(FK)|
| timestamp        |       | start_time       |       | initial_balance  |
| open             |       | end_time         |       | balance          |
| high             |       | current_time     |       | equity           |
| low              |       | speed            |       | realized_pnl     |
| close            |       | created_at       |       | updated_at       |
| volume           |       | updated_at       |       +------------------+
| created_at       |       +------------------+
+------------------+              |
                                  |
        +-------------------------+-------------------------+
        |                         |                         |
        v                         v                         v
+------------------+       +------------------+       +------------------+
|     orders       |       |    positions     |       |     trades       |
+------------------+       +------------------+       +------------------+
| id (PK)          |       | id (PK)          |       | id (PK)          |
| simulation_id(FK)|       | simulation_id(FK)|       | simulation_id(FK)|
| side             |       | order_id (FK)    |       | position_id (FK) |
| lot_size         |       | side             |       | side             |
| entry_price      |       | lot_size         |       | lot_size         |
| executed_at      |       | entry_price      |       | entry_price      |
| created_at       |       | status           |       | exit_price       |
+------------------+       | opened_at        |       | realized_pnl     |
                           | closed_at        |       | realized_pnl_pips|
                           | created_at       |       | opened_at        |
                           +------------------+       | closed_at        |
                                                      | created_at       |
                                                      +------------------+
```

---

## 3. テーブル定義

### 3.1 candles（ローソク足データ）

為替のローソク足データを格納する。CSVファイルからインポートされる。

| カラム名 | データ型 | NULL | デフォルト | 説明 |
|----------|----------|------|------------|------|
| id | BIGSERIAL | NO | auto | 主キー |
| timeframe | VARCHAR(10) | NO | - | 時間足（D1, H1, M10） |
| timestamp | TIMESTAMP | NO | - | ローソク足の開始時刻（UTC） |
| open | DECIMAL(10,5) | NO | - | 始値 |
| high | DECIMAL(10,5) | NO | - | 高値 |
| low | DECIMAL(10,5) | NO | - | 安値 |
| close | DECIMAL(10,5) | NO | - | 終値 |
| volume | BIGINT | YES | 0 | 出来高 |
| created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 作成日時 |

**インデックス**
| インデックス名 | カラム | 種類 | 説明 |
|----------------|--------|------|------|
| pk_candles | id | PRIMARY KEY | 主キー |
| idx_candles_timeframe_timestamp | timeframe, timestamp | UNIQUE | 時間足と時刻の複合ユニーク |
| idx_candles_timestamp | timestamp | INDEX | 時刻検索用 |

**DDL**
```sql
CREATE TABLE candles (
    id BIGSERIAL PRIMARY KEY,
    timeframe VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    open DECIMAL(10,5) NOT NULL,
    high DECIMAL(10,5) NOT NULL,
    low DECIMAL(10,5) NOT NULL,
    close DECIMAL(10,5) NOT NULL,
    volume BIGINT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT idx_candles_timeframe_timestamp UNIQUE (timeframe, timestamp)
);

CREATE INDEX idx_candles_timestamp ON candles(timestamp);
```

---

### 3.2 simulations（シミュレーション）

シミュレーションセッションを管理する。

| カラム名 | データ型 | NULL | デフォルト | 説明 |
|----------|----------|------|------------|------|
| id | UUID | NO | gen_random_uuid() | 主キー |
| status | VARCHAR(20) | NO | 'created' | 状態（created, running, paused, stopped） |
| start_time | TIMESTAMP | NO | - | シミュレーション開始時刻 |
| end_time | TIMESTAMP | YES | - | シミュレーション終了時刻 |
| current_time | TIMESTAMP | NO | - | 現在のシミュレーション時刻 |
| speed | DECIMAL(5,2) | NO | 1.0 | 再生速度（0.5〜10.0） |
| created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 更新日時 |

**インデックス**
| インデックス名 | カラム | 種類 | 説明 |
|----------------|--------|------|------|
| pk_simulations | id | PRIMARY KEY | 主キー |
| idx_simulations_status | status | INDEX | 状態検索用 |
| idx_simulations_created_at | created_at | INDEX | 作成日時検索用 |

**DDL**
```sql
CREATE TABLE simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'created',
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    current_time TIMESTAMP NOT NULL,
    speed DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_simulations_status ON simulations(status);
CREATE INDEX idx_simulations_created_at ON simulations(created_at);
```

---

### 3.3 accounts（口座）

シミュレーションごとの口座情報を管理する。

| カラム名 | データ型 | NULL | デフォルト | 説明 |
|----------|----------|------|------------|------|
| id | UUID | NO | gen_random_uuid() | 主キー |
| simulation_id | UUID | NO | - | シミュレーションID（外部キー） |
| initial_balance | DECIMAL(15,2) | NO | - | 初期資金 |
| balance | DECIMAL(15,2) | NO | - | 現在残高 |
| equity | DECIMAL(15,2) | NO | - | 有効証拠金（残高 + 含み損益） |
| realized_pnl | DECIMAL(15,2) | NO | 0 | 確定損益 |
| updated_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 更新日時 |

**インデックス**
| インデックス名 | カラム | 種類 | 説明 |
|----------------|--------|------|------|
| pk_accounts | id | PRIMARY KEY | 主キー |
| idx_accounts_simulation_id | simulation_id | UNIQUE | シミュレーションとの1:1関係 |

**DDL**
```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL UNIQUE,
    initial_balance DECIMAL(15,2) NOT NULL,
    balance DECIMAL(15,2) NOT NULL,
    equity DECIMAL(15,2) NOT NULL,
    realized_pnl DECIMAL(15,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_accounts_simulation FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
);
```

---

### 3.4 orders（注文）

発注された注文を記録する。

| カラム名 | データ型 | NULL | デフォルト | 説明 |
|----------|----------|------|------------|------|
| id | UUID | NO | gen_random_uuid() | 主キー |
| simulation_id | UUID | NO | - | シミュレーションID（外部キー） |
| side | VARCHAR(10) | NO | - | 売買方向（buy, sell） |
| lot_size | DECIMAL(10,2) | NO | - | ロットサイズ |
| entry_price | DECIMAL(10,5) | NO | - | 約定価格 |
| executed_at | TIMESTAMP | NO | - | 約定日時 |
| created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 作成日時 |

**インデックス**
| インデックス名 | カラム | 種類 | 説明 |
|----------------|--------|------|------|
| pk_orders | id | PRIMARY KEY | 主キー |
| idx_orders_simulation_id | simulation_id | INDEX | シミュレーション検索用 |
| idx_orders_executed_at | executed_at | INDEX | 約定日時検索用 |

**DDL**
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL,
    side VARCHAR(10) NOT NULL,
    lot_size DECIMAL(10,2) NOT NULL,
    entry_price DECIMAL(10,5) NOT NULL,
    executed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_simulation FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
    CONSTRAINT chk_orders_side CHECK (side IN ('buy', 'sell'))
);

CREATE INDEX idx_orders_simulation_id ON orders(simulation_id);
CREATE INDEX idx_orders_executed_at ON orders(executed_at);
```

---

### 3.5 positions（ポジション）

保有中のポジションを管理する。

| カラム名 | データ型 | NULL | デフォルト | 説明 |
|----------|----------|------|------------|------|
| id | UUID | NO | gen_random_uuid() | 主キー |
| simulation_id | UUID | NO | - | シミュレーションID（外部キー） |
| order_id | UUID | NO | - | 注文ID（外部キー） |
| side | VARCHAR(10) | NO | - | 売買方向（buy, sell） |
| lot_size | DECIMAL(10,2) | NO | - | ロットサイズ |
| entry_price | DECIMAL(10,5) | NO | - | エントリー価格 |
| status | VARCHAR(20) | NO | 'open' | 状態（open, closed） |
| opened_at | TIMESTAMP | NO | - | ポジション開設日時 |
| closed_at | TIMESTAMP | YES | - | ポジション決済日時 |
| created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 作成日時 |

**インデックス**
| インデックス名 | カラム | 種類 | 説明 |
|----------------|--------|------|------|
| pk_positions | id | PRIMARY KEY | 主キー |
| idx_positions_simulation_id | simulation_id | INDEX | シミュレーション検索用 |
| idx_positions_status | status | INDEX | 状態検索用 |
| idx_positions_simulation_status | simulation_id, status | INDEX | 保有ポジション検索用 |

**DDL**
```sql
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL,
    order_id UUID NOT NULL,
    side VARCHAR(10) NOT NULL,
    lot_size DECIMAL(10,2) NOT NULL,
    entry_price DECIMAL(10,5) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    opened_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_positions_simulation FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
    CONSTRAINT fk_positions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT chk_positions_side CHECK (side IN ('buy', 'sell')),
    CONSTRAINT chk_positions_status CHECK (status IN ('open', 'closed'))
);

CREATE INDEX idx_positions_simulation_id ON positions(simulation_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_simulation_status ON positions(simulation_id, status);
```

---

### 3.6 trades（トレード履歴）

決済済みのトレード履歴を記録する。

| カラム名 | データ型 | NULL | デフォルト | 説明 |
|----------|----------|------|------------|------|
| id | UUID | NO | gen_random_uuid() | 主キー |
| simulation_id | UUID | NO | - | シミュレーションID（外部キー） |
| position_id | UUID | NO | - | ポジションID（外部キー） |
| side | VARCHAR(10) | NO | - | 売買方向（buy, sell） |
| lot_size | DECIMAL(10,2) | NO | - | ロットサイズ |
| entry_price | DECIMAL(10,5) | NO | - | エントリー価格 |
| exit_price | DECIMAL(10,5) | NO | - | 決済価格 |
| realized_pnl | DECIMAL(15,2) | NO | - | 確定損益（円） |
| realized_pnl_pips | DECIMAL(10,1) | NO | - | 確定損益（pips） |
| opened_at | TIMESTAMP | NO | - | ポジション開設日時 |
| closed_at | TIMESTAMP | NO | - | ポジション決済日時 |
| created_at | TIMESTAMP | NO | CURRENT_TIMESTAMP | 作成日時 |

**インデックス**
| インデックス名 | カラム | 種類 | 説明 |
|----------------|--------|------|------|
| pk_trades | id | PRIMARY KEY | 主キー |
| idx_trades_simulation_id | simulation_id | INDEX | シミュレーション検索用 |
| idx_trades_closed_at | closed_at | INDEX | 決済日時検索用 |

**DDL**
```sql
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL,
    position_id UUID NOT NULL,
    side VARCHAR(10) NOT NULL,
    lot_size DECIMAL(10,2) NOT NULL,
    entry_price DECIMAL(10,5) NOT NULL,
    exit_price DECIMAL(10,5) NOT NULL,
    realized_pnl DECIMAL(15,2) NOT NULL,
    realized_pnl_pips DECIMAL(10,1) NOT NULL,
    opened_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trades_simulation FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE,
    CONSTRAINT fk_trades_position FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE,
    CONSTRAINT chk_trades_side CHECK (side IN ('buy', 'sell'))
);

CREATE INDEX idx_trades_simulation_id ON trades(simulation_id);
CREATE INDEX idx_trades_closed_at ON trades(closed_at);
```

---

## 4. データ量見積もり

| テーブル | 想定レコード数 | 1レコードサイズ | 想定データサイズ |
|----------|----------------|-----------------|------------------|
| candles | 500万件 | 約100バイト | 約500MB |
| simulations | 1,000件 | 約200バイト | 約200KB |
| accounts | 1,000件 | 約100バイト | 約100KB |
| orders | 10万件 | 約150バイト | 約15MB |
| positions | 10万件 | 約200バイト | 約20MB |
| trades | 10万件 | 約250バイト | 約25MB |

**備考**
- candlesテーブルが最も大きくなる（過去10年分のデータを想定）
- 日足: 約2,500件/通貨ペア
- 1時間足: 約60,000件/通貨ペア
- 10分足: 約360,000件/通貨ペア

---

## 5. バックアップ・リストア

### 5.1 バックアップ
```bash
# 全データベースのバックアップ
pg_dump -U postgres -h localhost fx_simulator > backup_$(date +%Y%m%d).sql

# candlesテーブルのみ（大容量のため分割）
pg_dump -U postgres -h localhost -t candles fx_simulator > candles_backup.sql
```

### 5.2 リストア
```bash
# 全データベースのリストア
psql -U postgres -h localhost fx_simulator < backup_20240115.sql
```

---

## 6. 初期データ

### 6.1 マスターデータ
本システムではマスターデータは不要（通貨ペアは単一のUSD/JPYのみを想定）。

### 6.2 為替データのインポート
CSVファイルからのインポートはバックエンドのサービスで実装する。

```sql
-- CSVインポート例（COPY文）
COPY candles (timeframe, timestamp, open, high, low, close, volume)
FROM '/path/to/usdjpy_h1.csv'
WITH (FORMAT csv, HEADER true);
```

---

## 7. CSVファイル仕様

### 7.1 ファイル一覧

| ファイル名 | 時間足 | 配置場所 |
|-----------|--------|----------|
| fx_data_USDJPY_technical_indicator.csv | 日足（D1） | backend/data/ |
| fx_data_USDJPY_1hour_technical_indicator.csv | 1時間足（H1） | backend/data/ |
| fx_data_USDJPY_10minutes_technical_indicator.csv | 10分足（M10） | backend/data/ |

### 7.2 CSVフォーマット仕様

すべてのCSVファイルは統一されたOHLCV形式で格納される。

| カラム名 | データ型 | 説明 | 例 |
|---------|---------|------|-----|
| time | datetime | ローソク足の開始時刻（ISO 8601形式、タイムゾーン付き可） | 2024-12-23 07:10:00+09:00 |
| open | decimal | 始値 | 156.364 |
| high | decimal | 高値 | 156.453 |
| low | decimal | 安値 | 156.364 |
| close | decimal | 終値 | 156.439 |
| Volume | integer | 出来高 | 12 |

**サンプルデータ**
```csv
time,open,high,low,close,Volume
2024-12-23 07:10:00+09:00,156.364,156.453,156.364,156.439,12
2024-12-23 07:20:00+09:00,156.439,156.444,156.434,156.434,14
```

### 7.3 データ期間（参考）

| 時間足 | 開始日 | 終了日 | レコード数 |
|-------|--------|--------|-----------|
| 日足（D1） | 2020-10-06 | 2026-01-23 | 約1,048件 |
| 1時間足（H1） | 2023-05-12 | 2026-01-24 | 約15,853件 |
| 10分足（M10） | 2024-12-23 | 2026-01-24 | 約40,090件 |

### 7.4 インポート処理

バックエンドのサービスで以下の処理を実施：

1. CSVファイルの読み込み
2. タイムスタンプのUTC変換（タイムゾーン情報がある場合）
3. timeframeカラムの付与（D1, H1, M10）
4. candlesテーブルへの一括INSERT（重複は無視またはUPDATE）

```python
# インポート処理の擬似コード
def import_csv(file_path: str, timeframe: str):
    df = pd.read_csv(file_path)
    df['timeframe'] = timeframe
    df['timestamp'] = pd.to_datetime(df['time']).dt.tz_convert('UTC')
    # DBへ一括INSERT
```
