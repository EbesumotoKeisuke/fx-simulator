# Claude Desktop + MCP セットアップガイド

## 概要

このガイドでは、Claude Desktop アプリと FX Simulator の MCP サーバーを連携させる手順を説明します。

## 前提条件

- ✅ Claude Pro プランに加入済み
- ✅ Windows 環境
- ✅ Python 3.11+ インストール済み
- ✅ FastMCP ライブラリインストール済み (`pip install fastmcp`)

## セットアップ手順

### 1. Claude Desktop アプリのインストール

1. https://claude.ai/download にアクセス
2. Windows版をダウンロード
3. インストーラーを実行してインストール
4. Claude Desktop を起動してログイン

### 2. MCP設定ファイルの作成

Claude Desktop は `%APPDATA%\Claude\claude_desktop_config.json` を読み込んで MCP サーバーを起動します。

#### 設定ファイルのパス

```
C:\Users\smile\AppData\Roaming\Claude\claude_desktop_config.json
```

#### 設定内容

以下の内容で設定ファイルを作成してください:

```json
{
  "mcpServers": {
    "fx-simulator-analytics": {
      "command": "python",
      "args": [
        "-m",
        "src.mcp_server"
      ],
      "cwd": "c:\\Users\\smile\\Desktop\\05_invest\\fx-simulator\\backend",
      "env": {
        "PYTHONPATH": "c:\\Users\\smile\\Desktop\\05_invest\\fx-simulator\\backend"
      }
    }
  }
}
```

**重要**:
- パス区切り文字は `\\` (バックスラッシュ2つ) を使用
- `cwd` (作業ディレクトリ) は backend フォルダを指定
- `PYTHONPATH` を設定して、`src` モジュールを認識させる

### 3. 設定ファイルの自動作成スクリプト

設定ファイルを手動で作成する代わりに、以下のスクリプトを実行してください:

```bash
# backend ディレクトリで実行
cd backend
python scripts/setup_claude_desktop.py
```

このスクリプトは:
1. `%APPDATA%\Claude` ディレクトリを作成（存在しない場合）
2. `claude_desktop_config.json` を生成
3. 正しいパスを自動設定

### 4. Claude Desktop の再起動

設定ファイルを作成したら、Claude Desktop を再起動してください:

1. Claude Desktop を完全に終了（タスクバーから右クリック → 終了）
2. Claude Desktop を再起動
3. MCP サーバーが自動的に起動されます

### 5. 接続確認

Claude Desktop で以下のように質問してください:

```
FXシミュレーターのトレードパフォーマンスを分析してください
```

Claude が MCP ツールを使用して以下のような応答をします:

```
FXシミュレーターのパフォーマンスデータを取得しました。

📊 パフォーマンス概要:
- 総トレード数: XX回
- 勝率: XX.X%
- プロフィットファクター: X.XX
- 総損益: ¥XXX,XXX

[詳細な分析...]
```

## 利用可能なMCPツール

Claude Desktop から以下の11個のツールが利用可能です:

### トレードパフォーマンス分析

#### 1. get_trading_performance
パフォーマンス指標を取得

**使用例**:
```
トレードパフォーマンスを教えてください
```

#### 2. get_recent_trades
最近のトレード履歴を取得

**使用例**:
```
最近の10件のトレードを見せてください
```

#### 3. get_losing_trades_analysis
損失トレードを分析

**使用例**:
```
負けトレードのパターンを分析してください
```

#### 4. get_winning_trades_analysis
勝ちトレードを分析

**使用例**:
```
勝ちトレードの共通点を見つけてください
```

#### 5. get_drawdown_data
ドローダウン履歴を取得

**使用例**:
```
ドローダウンの状況を教えてください
```

#### 6. get_equity_curve
資産曲線を取得

**使用例**:
```
資産曲線のデータを取得してください
```

#### 7. get_trade_analysis_summary
時間帯別分析と改善提案を取得

**使用例**:
```
トレードを分析して、改善提案をしてください
```

#### 8. get_current_alerts
現在のリスクアラートを取得

**使用例**:
```
現在のトレードで注意すべき点はありますか？
```

### チャートデータ取得（新機能）

#### 9. get_chart_data
ローソク足（OHLCV）データを取得

**パラメータ**:
- `timeframe`: 時間足 ('W1'=週足, 'D1'=日足, 'H1'=1時間足, 'M10'=10分足)
- `limit`: 取得件数 (デフォルト: 100, 最大: 1000)
- `start_time`: 開始日時 (ISO形式、例: '2024-12-01T00:00:00')
- `end_time`: 終了日時 (ISO形式)

**使用例**:
```
2024年12月の日足チャートデータを取得してください
```

```
最新の100本の1時間足データを見せてください
```

#### 10. get_available_timeframes
利用可能な時間足一覧を取得

**使用例**:
```
どの時間足のデータが利用可能ですか？
```

#### 11. get_data_date_range
データの日付範囲を取得

**使用例**:
```
どの期間のデータがありますか？
```

## 実践的な質問例

### 包括的な分析

```
私のFXトレード結果を総合的に分析し、以下の点について教えてください:
1. 現在のパフォーマンス評価
2. 勝ちトレードと負けトレードの特徴
3. 改善すべき点トップ3
4. 具体的なアクションプラン
```

### 損失削減

```
損失トレードを詳しく分析して、損失を減らすための具体的な改善策を5つ提案してください
```

### 勝率向上

```
勝ちトレードの共通パターンを見つけて、勝率を上げるための戦略を教えてください
```

### リスク管理

```
ドローダウンと資産曲線を見て、リスク管理が適切かどうか評価してください
```

### チャートデータを使った分析（新機能）

```
2024年12月の日足チャートデータを取得して、トレンドを分析してください
```

```
最近のトレード結果と同じ期間のチャートデータを比較して、エントリータイミングが適切だったか評価してください
```

```
勝ちトレードと負けトレードの時のチャート状況を比較分析してください
```

## トラブルシューティング

### MCP サーバーが起動しない

1. **Python パスの確認**
   ```bash
   python --version
   # Python 3.11 以上であることを確認
   ```

2. **FastMCP のインストール確認**
   ```bash
   pip show fastmcp
   ```

3. **Claude Desktop のログを確認**
   - Claude Desktop → Settings → Developer → View Logs
   - エラーメッセージを確認

### ツールが認識されない

1. **設定ファイルのパスを確認**
   - `C:\Users\smile\AppData\Roaming\Claude\claude_desktop_config.json`
   - ファイルが存在するか確認
   - JSON形式が正しいか確認

2. **MCP サーバーの再起動**
   - Claude Desktop を完全に終了
   - 再起動

### データベース接続エラー

1. **データベースが起動しているか確認**
   ```bash
   # Dockerコンテナが起動しているか確認
   docker ps
   ```

2. **環境変数の確認**
   - `backend/.env` ファイルが存在するか
   - データベース接続情報が正しいか

## 次のステップ

1. ✅ Claude Desktop のインストール
2. ✅ MCP 設定ファイルの作成
3. ✅ Claude Desktop の再起動
4. ✅ 接続確認
5. ⬜ 実際のトレード分析を実行
6. ⬜ AI フィードバックを活用したトレード改善

## 参考リソース

- [Claude Desktop 公式ドキュメント](https://docs.anthropic.com/claude/docs/claude-desktop)
- [Model Context Protocol 仕様](https://modelcontextprotocol.io)
- [FastMCP ドキュメント](https://gofastmcp.com)

---

設定に問題がある場合は、`backend/logs/mcp_server.log` を確認してください。
