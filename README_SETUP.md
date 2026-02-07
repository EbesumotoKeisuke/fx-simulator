# FX Simulator セットアップガイド

## クイックスタート（推奨）

### Windows

1. リポジトリをクローン
```bash
git clone <repository-url>
cd fx-simulator
```

2. **自動セットアップスクリプトを実行**（推奨）
```bash
setup_and_start.bat
```

このスクリプトは自動的に以下を実行します:
- Claude Desktop MCP設定の作成
- Dockerコンテナの起動
- 必要な環境設定

3. Claude Desktopを再起動

4. ブラウザで http://localhost:3000 を開く

**これだけで完了です！**

---

## 手動セットアップ（上級者向け）

自動セットアップスクリプトを使わない場合は、以下の手順で設定してください。

### 1. Claude Desktop MCP設定

```bash
cd backend
python scripts/setup_claude_desktop.py
cd ..
```

### 2. Dockerコンテナの起動

```bash
docker-compose up -d
```

### 3. Claude Desktopの再起動

Claude Desktopを完全に終了し、再起動してください。

---

## 使い方

### シミュレーターの起動

ブラウザで以下にアクセス:
```
http://localhost:3000
```

### Claude Desktopでの分析

Claude Desktopで以下のように質問してください:

```
FXシミュレーターのトレードパフォーマンスを分析してください
```

```
損失トレードのパターンを見つけて、改善策を教えてください
```

```
現在のトレードで注意すべき点はありますか？
```

---

## トラブルシューティング

### setup_and_start.bat が失敗する

**Pythonがインストールされていない場合:**
```bash
# Python 3.11以上をインストール
https://www.python.org/downloads/
```

**Docker Desktopが起動していない場合:**
1. Docker Desktopを起動
2. もう一度 `setup_and_start.bat` を実行

### Claude Desktopがツールを認識しない

1. Claude Desktopを完全に終了（タスクバーから右クリック → 終了）
2. Claude Desktopを再起動
3. もう一度質問してみる

### MCPサーバーが起動しない

設定ファイルを確認:
```
C:\Users\<ユーザー名>\AppData\Roaming\Claude\claude_desktop_config.json
```

---

## 環境要件

- **OS**: Windows 10/11
- **Python**: 3.11以上
- **Docker Desktop**: 最新版
- **Claude Desktop**: 最新版
- **Claude Pro**: 必須（MCP機能を使用するため）

---

## ディレクトリ構成

```
fx-simulator/
├── setup_and_start.bat          # 自動セットアップスクリプト（推奨）
├── docker-compose.yml            # Docker設定
├── backend/
│   ├── scripts/
│   │   └── setup_claude_desktop.py  # MCP設定スクリプト
│   ├── src/
│   │   ├── mcp_server.py        # MCPサーバー
│   │   └── services/
│   │       └── alert_service.py  # アラートサービス
│   └── ...
├── frontend/
│   └── ...
└── docs/
    ├── F-007_Auto_Alert_Specification.md  # アラート機能仕様
    └── Claude_Desktop_Setup.md            # 詳細セットアップガイド
```

---

## 次のステップ

1. ✅ 自動セットアップスクリプトの実行
2. ✅ Claude Desktopの再起動
3. ⬜ シミュレーターでトレード実行
4. ⬜ Claude Desktopで分析と改善提案を受ける
5. ⬜ アラート機能でリアルタイムリスク管理

---

## 詳細ドキュメント

- [Claude Desktop詳細セットアップ](docs/Claude_Desktop_Setup.md)
- [自動アラート機能仕様](docs/F-007_Auto_Alert_Specification.md)
- [MCP仕様](docs/F-005_AI_Feedback_MCP_Specification.md)
