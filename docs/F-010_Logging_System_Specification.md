# F-010 ログ管理システム設計書

## 1. 概要

### 1.1 目的
FXシミュレーターアプリケーションにおいて、フロントエンド・バックエンド両方で統一されたログ管理システムを構築し、開発・運用時のデバッグ、エラー追跡、パフォーマンス監視を効率化する。

### 1.2 対象範囲
- バックエンド（Python/FastAPI）
- フロントエンド（React/TypeScript）

### 1.3 参考実装
- `C:\Users\smile\Desktop\05_invest\develop\escape\stock-monitoring-system`

---

## 2. ログレベル定義

| レベル | 名称 | 説明 | 用途例 |
|--------|------|------|--------|
| 1 | INFO | 情報 | 処理完了、APIリクエスト成功、シミュレーション開始/停止 |
| 2 | WARNING | 警告 | 非推奨APIの使用、リトライ発生、閾値接近 |
| 3 | ERROR | エラー | API失敗、データ取得失敗、バリデーションエラー |
| 4 | CRITICAL | 重大エラー | サーバー停止、DB接続不可、サービス継続不能 |

### 2.1 ログレベル使い分けガイドライン

#### INFO（情報）
- シミュレーション開始/停止/一時停止
- 注文の作成/決済完了
- データインポート完了
- API正常レスポンス

#### WARNING（警告）
- API応答遅延（3秒以上）
- 証拠金不足の警告
- 連敗数閾値超過
- キャッシュミス

#### ERROR（エラー）
- APIリクエスト失敗
- データベースクエリ失敗
- バリデーションエラー
- ファイル読み込み失敗

#### CRITICAL（重大エラー）
- データベース接続不可
- サーバー起動失敗
- メモリ不足
- 未処理の例外

---

## 3. システム構成

### 3.1 ディレクトリ構造

```
fx-simulator/
├── logs/                           # ログ出力ディレクトリ（Git管理外）
│   ├── backend/                    # バックエンドログ
│   │   ├── app_info.log           # INFO以上のログ
│   │   ├── app_error.log          # ERROR以上のログ
│   │   └── app_debug.log          # DEBUG用（開発環境のみ）
│   └── frontend/                   # フロントエンドログ
│       └── app.log                # フロントエンドログ（APIエラー等）
├── backend/
│   └── src/
│       └── utils/
│           └── logger.py          # バックエンドロガー
└── frontend/
    └── src/
        └── utils/
            └── logger.ts          # フロントエンドロガー
```

### 3.2 Git管理設定

```gitignore
# ログファイル（フォルダは管理、中身は除外）
logs/**/*
!logs/.gitkeep
!logs/backend/.gitkeep
!logs/frontend/.gitkeep
```

---

## 4. バックエンド実装設計

### 4.1 LoggerSettingクラス

**ファイル:** `backend/src/utils/logger.py`

```python
import logging
import os
import time
from logging.handlers import RotatingFileHandler
from typing import Optional

class LoggerSetting:
    """
    ログ設定クラス

    ログレベル別にファイル出力を行い、ローテーション機能を提供
    """

    # ログ設定
    MAX_BYTES = 1_000_000      # 1MB
    BACKUP_COUNT = 10          # バックアップファイル数
    LOG_DIR = "logs/backend"   # ログ出力先

    # ログフォーマット
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
    DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
```

### 4.2 ログハンドラー構成

| ハンドラー | ファイル名 | レベル | 説明 |
|-----------|-----------|--------|------|
| InfoHandler | app_info.log | INFO+ | 通常ログ（INFO, WARNING含む） |
| ErrorHandler | app_error.log | ERROR+ | エラーログ（ERROR, CRITICAL） |
| DebugHandler | app_debug.log | DEBUG | デバッグ用（開発環境のみ） |
| ConsoleHandler | - | DEBUG | コンソール出力 |

### 4.3 使用例

```python
from src.utils.logger import get_logger

logger = get_logger(__name__)

# 情報ログ
logger.info("シミュレーションを開始しました")

# 警告ログ
logger.warning(f"証拠金維持率が低下しています: {margin_rate}%")

# エラーログ（統一フォーマット）
logger.error(f"create_order error : {error_message}")

# 重大エラーログ（統一フォーマット）
logger.critical(f"【connect_database error : {exception}")
```

### 4.4 ログ出力フォーマット

```
2026-02-10 12:30:45 - trading_service - INFO - trading_service.py:123 - 注文を作成しました: order_id=xxx
2026-02-10 12:30:46 - trading_service - ERROR - trading_service.py:156 - 【create_order error : ValueError: Invalid lot size
```

### 4.5 エラーログフォーマット規約

エラーログは以下の統一フォーマットで出力すること：

```python
logger.error(f"関数名 error : {エラー内容}")
```

**例:**
```python
def create_order(order_data):
    try:
        # 処理
    except ValueError as e:
        logger.error(f"create_order error : {e}")
        raise
    except Exception as e:
        logger.error(f"create_order error : {e}")
        raise
```

---

## 5. フロントエンド実装設計

### 5.1 Loggerクラス

**ファイル:** `frontend/src/utils/logger.ts`

```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4,
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  source: string
  message: string
  data?: unknown
}

class Logger {
  private static instance: Logger
  private logLevel: LogLevel = LogLevel.INFO
  private logs: LogEntry[] = []
  private maxLogs: number = 1000

  // バックエンドへのログ送信機能
  async sendToBackend(entry: LogEntry): Promise<void>
}
```

### 5.2 ログ送信API

フロントエンドのERROR/CRITICALログはバックエンドAPIを通じてファイルに記録。

**エンドポイント:** `POST /api/logs`

```typescript
interface LogRequest {
  level: string
  source: string
  message: string
  data?: unknown
  userAgent: string
  url: string
}
```

### 5.3 使用例

```typescript
import { logger } from '../utils/logger'

// 情報ログ
logger.info('OrderPanel', '注文パネルを開きました')

// 警告ログ
logger.warning('ChartPanel', 'データ読み込みに時間がかかっています')

// エラーログ（統一フォーマット）
logger.error('API', '【startSimulation error : シミュレーション開始に失敗しました', { error })

// 重大エラーログ（統一フォーマット）
logger.critical('App', '【componentDidCatch error : アプリケーションエラーが発生しました', { error })
```

### 5.4 コンソール出力フォーマット

```
[2026-02-10 12:30:45] [INFO] [OrderPanel] 注文パネルを開きました
[2026-02-10 12:30:46] [ERROR] [API] 【startSimulation error : シミュレーション開始に失敗しました { error: ... }
```

### 5.5 エラーログフォーマット規約

エラーログは以下の統一フォーマットで出力すること：

```typescript
logger.error('ソース名', '【関数名 error : {エラー内容}', { error })
```

**例:**
```typescript
const handleSubmit = async () => {
  try {
    // 処理
  } catch (error) {
    logger.error('OrderPanel', '【handleSubmit error : 注文の送信に失敗しました', { error })
    throw error
  }
}
```

---

## 6. ログローテーション設定

### 6.1 バックエンド

| 設定項目 | 値 | 説明 |
|---------|-----|------|
| maxBytes | 1,000,000 (1MB) | ファイルサイズ上限 |
| backupCount | 10 | バックアップファイル数 |
| encoding | utf-8 | 文字エンコーディング |

### 6.2 ローテーション例

```
app_info.log      ← 現在のログ
app_info.log.1    ← 1世代前
app_info.log.2    ← 2世代前
...
app_info.log.10   ← 最古（これより古いものは削除）
```

---

## 7. 実装対象モジュール

### 7.1 バックエンド（ログ追加対象）

| モジュール | ログ内容 |
|-----------|---------|
| `main.py` | API起動、シャットダウン |
| `simulation_service.py` | シミュレーション制御 |
| `trading_service.py` | 注文処理、ポジション管理 |
| `market_data_service.py` | マーケットデータ取得 |
| `analytics_service.py` | パフォーマンス計算 |
| `alert_service.py` | アラート処理 |

### 7.2 フロントエンド（ログ追加対象）

| モジュール | ログ内容 |
|-----------|---------|
| `api.ts` | APIリクエスト/レスポンス |
| `simulationStore.ts` | 状態変更 |
| `ChartPanel.tsx` | チャート描画 |
| `OrderPanel.tsx` | 注文操作 |
| `ControlBar.tsx` | シミュレーション制御 |

---

## 8. 環境別設定

### 8.1 開発環境

```python
# バックエンド
LOG_LEVEL = "DEBUG"
CONSOLE_OUTPUT = True
DEBUG_LOG_ENABLED = True
```

```typescript
// フロントエンド
LOG_LEVEL = LogLevel.DEBUG
SEND_TO_BACKEND = false
```

### 8.2 本番環境

```python
# バックエンド
LOG_LEVEL = "INFO"
CONSOLE_OUTPUT = False
DEBUG_LOG_ENABLED = False
```

```typescript
// フロントエンド
LOG_LEVEL = LogLevel.WARNING
SEND_TO_BACKEND = true
```

---

## 9. タイムゾーン設定

すべてのログはJST（日本標準時）で記録。

```python
# バックエンド
import time
formatter.converter = lambda *args: time.localtime(time.time() + 9*3600)
```

```typescript
// フロントエンド
const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
```

---

## 10. エラーハンドリング統合

### 10.1 バックエンド例外ハンドリング

```python
from src.utils.logger import get_logger

logger = get_logger(__name__)

def process_data(data):
    try:
        # 処理
    except ValueError as e:
        logger.error(f"process_data error : {e}")
        raise
    except Exception as e:
        logger.error(f"process_data error : {e}")
        raise
```

### 10.2 フロントエンドエラーバウンダリ

```typescript
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.critical('ErrorBoundary', `componentDidCatch error : ${error.message}`, {
      componentStack: errorInfo.componentStack,
    })
  }
}
```

---

## 11. 実装スケジュール

| フェーズ | 内容 | 対象 |
|---------|------|------|
| Phase 1 | ログユーティリティ作成 | logger.py, logger.ts |
| Phase 2 | logsフォルダ・gitignore設定 | プロジェクトルート |
| Phase 3 | バックエンドサービスにログ追加 | 各サービスファイル |
| Phase 4 | フロントエンドにログ追加 | 各コンポーネント |
| Phase 5 | フロントエンドログAPI実装 | バックエンドAPI追加 |

---

## 12. 運用ガイドライン

### 12.1 ログ確認方法

```bash
# 最新のエラーログを確認
tail -f logs/backend/app_error.log

# 情報ログを検索
grep "シミュレーション" logs/backend/app_info.log
```

### 12.2 ログ容量管理

- 各ログファイル: 最大1MB × 10世代 = 10MB
- バックエンド合計: 約30MB（3ファイル × 10MB）
- フロントエンド合計: 約10MB

### 12.3 定期メンテナンス

- 月1回: 古いバックアップログの確認・削除
- 障害時: エラーログの分析・対応

---

## 13. 承認

| 項目 | 内容 |
|------|------|
| 作成日 | 2026-02-10 |
| 作成者 | Claude Code |
| バージョン | 1.0 |
| ステータス | レビュー待ち |
