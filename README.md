# FX Trade Simulator

FXトレードのシミュレーションツール。過去の為替データを使用してリアルな相場環境を再現し、仮想資金でトレードの練習ができます。

## 主要機能

### ✅ 実装済み機能（MVP）

- **マルチタイムフレームチャート表示** - 週足・日足・1時間足・10分足を同時表示、最新時刻は同期
- **過去データ再生** - 時系列で過去データを再生、速度調整可能（1x, 5x, 10x）
- **一時停止・再開** - シミュレーション中いつでも一時停止・再開が可能
- **成行注文** - 買い・売りの即座な注文発注
- **ポジション管理** - 保有ポジションの一覧表示、含み損益のリアルタイム計算
- **ポジション決済** - 個別決済、または全ポジション一括決済
- **口座情報表示** - 残高、評価額、証拠金、損益の表示
- **トレード履歴** - 過去のトレード記録を一覧表示
- **シミュレーション結果** - 終了時に統計情報を表示、CSV出力可能
- **CSVデータ読込** - ローカルフォルダのCSVファイルから為替データをインポート

### 🎯 主要な実装特徴

- **高速再生時の安定性** - 10x速度でもチャートが点滅せずスムーズに動作
- **タイムフレーム境界チェック** - 各時間足は境界を跨いだ時のみ更新、過剰な更新を防止
- **一時停止の即時反応** - 5x・10x速度でも一時停止ボタンを押した瞬間にチャート更新が停止
- **自動ポジションクローズ** - シミュレーション終了時に保有中の全ポジションを自動決済
- **停止後のデータアクセス** - シミュレーション終了後もトレード履歴・結果表示が可能

## 技術スタック

- **バックエンド**: Python (FastAPI)
- **フロントエンド**: React (TypeScript)
- **データベース**: PostgreSQL
- **開発環境**: Docker

## クイックスタート（推奨）

### Windows - 自動セットアップ

```bash
# リポジトリをクローン
git clone <repository-url>
cd fx-simulator

# 自動セットアップスクリプトを実行（これだけでOK！）
setup_and_start.bat
```

このスクリプトが自動的に以下を実行します:
- ✅ Claude Desktop MCP設定の作成
- ✅ Dockerコンテナの起動
- ✅ 環境構築

Claude Desktopを再起動後、 http://localhost:3000 でシミュレーターが使えます。

**詳細**: [README_SETUP.md](README_SETUP.md) を参照

---

## 手動セットアップ

### 必要条件

- Docker Desktop
- Git
- Python 3.11以上（Claude Desktop連携を使う場合）

### 起動方法

1. リポジトリをクローン

```bash
git clone <repository-url>
cd fx-simulator
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
- `fx_data_USDJPY_weekly_technical_indicator.csv` (週足)
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

## 使用方法

### 1. シミュレーション開始

1. http://localhost:3000 にアクセス
2. 画面右上の「開始」ボタンをクリック
3. シミュレーション設定モーダルで以下を入力：
   - **開始日時**: シミュレーションを開始する日時（例: 2024-12-23 00:00）
   - **初期資金**: 仮想資金額（例: 1,000,000円）
   - **再生速度**: 1x, 5x, 10x から選択
4. 「開始する」ボタンをクリック

### 2. トレード実行

1. **買い注文**: ロットサイズを入力して「買い」ボタンをクリック
2. **売り注文**: ロットサイズを入力して「売り」ボタンをクリック
3. **ポジション確認**: 画面下部のポジション一覧で含み損益を確認
4. **決済**: ポジション一覧の「決済」ボタンをクリック

### 3. シミュレーション制御

- **一時停止**: 「一時停止」ボタンで再生を停止
- **再開**: 「再開」ボタンで再生を再開
- **速度変更**: 速度ドロップダウンで再生速度を変更
- **終了**: 「終了」ボタンでシミュレーションを終了（保有ポジションは自動決済）

### 4. 結果確認

シミュレーション終了後、自動的に結果モーダルが表示されます：
- **最終残高**: シミュレーション終了時の口座残高
- **総トレード数**: 手動決済 + 自動決済の合計
- **確定損益**: 初期資金からの増減額
- **CSV出力**: 「CSV出力」ボタンでトレード履歴をダウンロード

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

### VSCodeデバッグ環境

プロジェクトにはVSCode用のデバッグ設定が含まれています。

#### バックエンドデバッグ（Python）

1. Docker環境でdebugpyが自動起動（ポート5678）
2. VSCodeで「Backend: Python リモートデバッグ」を選択して実行
3. backend配下のPythonコードにブレークポイントを設定可能

#### フロントエンドデバッグ（React/TypeScript）

1. VSCodeで「Frontend: Chrome でデバッグ」を選択して実行
2. frontend/src配下のコードにブレークポイントを設定可能

#### フルスタックデバッグ

1. VSCodeで「Full Stack: Frontend + Backend」を選択
2. フロントエンドとバックエンドを同時にデバッグ可能

### バックエンド開発（ローカル）

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### フロントエンド開発（ローカル）

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

### 設計書
- [要件定義書](docs/requirements.md) - 機能要件、非機能要件、制約事項
- [API設計書](docs/api-design.md) - RESTful APIエンドポイント仕様
- [DB設計書](docs/db-design.md) - データベーススキーマ設計
- [画面設計書](docs/screen-design.md) - UI/UX設計、画面レイアウト

### テストドキュメント
- [結合テスト計画書](docs/integration-test-plan.md) - 59のテストケース定義
- [テスト実施ガイド](docs/test-execution-guide.md) - UI操作テストの手順
- [テスト結果報告書](docs/integration-test-results.md) - テスト実施結果

## 既知の問題・制約事項

- 実際の取引所との接続は行わない（シミュレーションのみ）
- リアルタイムデータ配信は行わない（過去データの再生のみ）
- 認証機能なし（個人利用を想定）
- 通貨ペアはUSD/JPYのみ対応
- 成行注文のみ対応（指値・逆指値は未実装）
- 損切り・利確設定（SL/TP）は未実装

## 今後の拡張計画

- 指値・逆指値注文
- 損切り・利確設定（SL/TP）
- 複数通貨ペア対応
- テクニカル指標表示（移動平均線、RSI、MACD等）
- パフォーマンス分析（勝率、プロフィットファクター、最大ドローダウン等）
- トレードメモ機能
