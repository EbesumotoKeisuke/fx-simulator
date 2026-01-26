# FX Trade Simulator

FXトレードのシミュレーションツール。過去の為替データを使用してリアルな相場環境を再現し、仮想資金でトレードの練習ができます。

## 機能

- マルチタイムフレームチャート表示（日足・1時間足・10分足）
- 過去データの時系列再生
- 成行注文（買い/売り）
- ポジション管理・決済
- 損益計算
- トレード履歴のCSV出力

## 技術スタック

- **バックエンド**: Python (FastAPI)
- **フロントエンド**: React (TypeScript)
- **データベース**: PostgreSQL
- **開発環境**: Docker

## セットアップ

### 必要条件

- Docker Desktop
- Git

### 起動方法

1. リポジトリをクローン

```bash
git clone <repository-url>
cd fx-trade-simulator
```

2. 環境変数ファイルを作成

```bash
cp backend/.env.example backend/.env
```

3. Dockerコンテナを起動

```bash
docker-compose up -d
```

4. ブラウザでアクセス

- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:8000
- API ドキュメント: http://localhost:8000/docs

### 為替データの準備

`backend/data/` フォルダに以下のCSVファイルを配置してください。

**必要なファイル:**
- `fx_data_USDJPY_technical_indicator.csv` (日足)
- `fx_data_USDJPY_1hour_technical_indicator.csv` (1時間足)
- `fx_data_USDJPY_10minutes_technical_indicator.csv` (10分足)

**CSVフォーマット (OHLCV形式):**
```
time,open,high,low,close,Volume
2024-01-01 00:00:00,145.50,145.80,145.30,145.65,12500
```

### データのインポート

1. ブラウザで http://localhost:3000 にアクセス
2. 「データ管理」ボタンをクリック
3. 各時間足の「インポート」ボタンをクリック、または「全てインポート」をクリック

## データベースの確認方法

### psqlでの接続

```bash
# Dockerコンテナに接続
docker exec -it fx_simulator_db psql -U postgres -d fx_simulator
```

### よく使うSQLコマンド

```sql
-- テーブル一覧を確認
\dt

-- ローソク足データの件数を確認
SELECT timeframe, COUNT(*) as count FROM candles GROUP BY timeframe;

-- 各時間足のデータ期間を確認
SELECT
  timeframe,
  MIN(timestamp) as start_date,
  MAX(timestamp) as end_date,
  COUNT(*) as total_records
FROM candles
GROUP BY timeframe;

-- シミュレーション一覧を確認
SELECT id, status, start_time, end_time, speed FROM simulations ORDER BY created_at DESC LIMIT 5;

-- 口座情報を確認
SELECT * FROM accounts ORDER BY created_at DESC LIMIT 5;

-- トレード履歴を確認
SELECT
  side,
  lot_size,
  entry_price,
  exit_price,
  realized_pnl,
  realized_pnl_pips,
  opened_at,
  closed_at
FROM trades
ORDER BY closed_at DESC
LIMIT 10;

-- ポジション一覧を確認
SELECT * FROM positions WHERE status = 'open';

-- 終了
\q
```

### Docker Composeでのデータベースリセット

```bash
# データベースボリュームを削除して再作成
docker-compose down -v
docker-compose up -d
```

## 開発

### バックエンド開発

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### フロントエンド開発

```bash
cd frontend
npm install
npm run dev
```

## トラブルシューティング

### シミュレーションが開始できない

1. データがインポートされているか確認
   - 「データ管理」画面でレコード数が0でないことを確認
   - psqlで `SELECT COUNT(*) FROM candles;` を実行して確認

2. バックエンドのログを確認
   ```bash
   docker logs fx_simulator_backend
   ```

### チャートが表示されない

1. ブラウザの開発者ツールでコンソールエラーを確認
2. APIエンドポイントが動作しているか確認
   ```bash
   curl http://localhost:8000/api/v1/market-data/date-range
   ```

### データベース接続エラー

1. PostgreSQLコンテナが起動しているか確認
   ```bash
   docker ps | grep fx_simulator_db
   ```

2. コンテナを再起動
   ```bash
   docker-compose restart db
   ```

## ドキュメント

- [要件定義書](docs/requirements.md)
- [API設計書](docs/api-design.md)
- [DB設計書](docs/db-design.md)
- [画面設計書](docs/screen-design.md)
