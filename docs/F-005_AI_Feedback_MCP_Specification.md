# F-005: AIフィードバック機能 - MCP実装仕様書

## 概要

FXシミュレーターのトレード結果に対して、ChatGPT (OpenAI) による分析とフィードバックを提供する機能。Model Context Protocol (MCP) を使用してChatGPTと連携し、トレード履歴を分析して改善点を提案する。

## 前提条件

### ChatGPT側の要件

- **必要なプラン**: ChatGPT Pro, Plus, Business, Enterprise, または Education
- **Developer Mode**: 有効化が必要 (Settings → Developer Mode)
- **MCP対応**: 2025年9月以降、ChatGPTはフルMCPサポートを提供

### バックエンド要件

- Python 3.11+
- FastAPI 0.100+
- FastMCP または FastAPI-MCP ライブラリ
- 既存のFXシミュレーターバックエンド

## アーキテクチャ

```
┌─────────────────┐
│   ChatGPT Web   │
│  (Developer Mode)│
└────────┬────────┘
         │ MCP over HTTPS
         │ (SSE/HTTP Streaming)
         ▼
┌─────────────────┐
│  MCP Server     │
│  (FastAPI)      │
└────────┬────────┘
         │ Internal API
         ▼
┌─────────────────┐
│ FX Simulator    │
│   Backend       │
│  (FastAPI)      │
└─────────────────┘
```

## 実装方法

### 1. MCPサーバーの実装

#### 方法A: FastMCP を使用 (推奨)

**理由**: 最も人気があり、1日100万ダウンロード、全MCPサーバーの70%で使用

**実装例**:
```python
# backend/src/mcp_server.py

from fastmcp import FastMCP
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from src.utils.database import get_db
from src.services.trading_service import TradingService
from src.services.analytics_service import AnalyticsService

# FastAPIアプリケーション
app = FastAPI(
    title="FX Simulator MCP Server",
    description="Model Context Protocol server for FX trading simulator analytics",
    version="1.0.0"
)

# MCPサーバーを作成
mcp = FastMCP("fx-simulator-analytics")

@mcp.tool()
async def get_trading_performance(
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get comprehensive trading performance metrics.

    Returns detailed statistics including:
    - Win rate, profit factor
    - Total P&L, max drawdown
    - Risk/reward ratios
    - Consecutive wins/losses
    """
    analytics_service = AnalyticsService(db)
    result = analytics_service.get_performance_metrics()
    return result

@mcp.tool()
async def get_recent_trades(
    limit: int = 10,
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get recent trade history.

    Args:
        limit: Number of recent trades to retrieve (default: 10)

    Returns list of trades with:
    - Entry/exit prices and times
    - P&L in pips and JPY
    - Side (buy/sell)
    """
    trading_service = TradingService(db)
    result = trading_service.get_trades(limit=limit, offset=0)
    return result.get("trades", [])

@mcp.tool()
async def get_losing_trades_analysis(
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Analyze losing trades to identify patterns.

    Returns:
    - List of all losing trades
    - Common characteristics
    - Time-of-day patterns
    - Average loss size
    """
    trading_service = TradingService(db)
    all_trades = trading_service.get_trades(limit=10000, offset=0)

    losing_trades = [
        t for t in all_trades.get("trades", [])
        if t.get("realized_pnl", 0) < 0
    ]

    # 損失トレードの分析
    analysis = {
        "total_losing_trades": len(losing_trades),
        "trades": losing_trades,
        "average_loss": sum(t["realized_pnl"] for t in losing_trades) / len(losing_trades) if losing_trades else 0,
        "largest_loss": min((t["realized_pnl"] for t in losing_trades), default=0)
    }

    return analysis

@mcp.tool()
async def get_winning_trades_analysis(
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Analyze winning trades to identify success patterns.

    Returns:
    - List of all winning trades
    - Common characteristics
    - Best performing timeframes
    - Average profit size
    """
    trading_service = TradingService(db)
    all_trades = trading_service.get_trades(limit=10000, offset=0)

    winning_trades = [
        t for t in all_trades.get("trades", [])
        if t.get("realized_pnl", 0) > 0
    ]

    # 勝ちトレードの分析
    analysis = {
        "total_winning_trades": len(winning_trades),
        "trades": winning_trades,
        "average_profit": sum(t["realized_pnl"] for t in winning_trades) / len(winning_trades) if winning_trades else 0,
        "largest_profit": max((t["realized_pnl"] for t in winning_trades), default=0)
    }

    return analysis

# FastMCPサーバーを起動
if __name__ == "__main__":
    mcp.run()
```

#### 方法B: FastAPI-MCP を使用 (代替案)

**理由**: FastAPIとのネイティブ統合、HTTP呼び出し不要

**実装例**:
```python
# backend/src/mcp_integration.py

from fastapi_mcp import FastApiMCP
from src.main import app  # 既存のFastAPIアプリ

# MCPをマウント
mcp = FastApiMCP(app, title="FX Simulator Analytics")
mcp.mount()  # /mcp エンドポイントで利用可能
```

### 2. ChatGPTへの接続設定

#### 手順

1. **ChatGPT Settings にアクセス**
   - https://chatgpt.com → Settings → Connectors → Create

2. **コネクタ情報を入力**
   - **Name**: `FX Simulator Analytics`
   - **Description**: `Analyze FX trading simulator results and provide actionable feedback for improving trading performance`
   - **URL**: `https://your-server.com/mcp` (本番環境URL)
   - **Authentication**: `OAuth` (推奨) または `None` (開発時)

3. **Developer Mode を有効化**
   - Settings → Developer Mode → Enable

4. **接続テスト**
   - ChatGPTで以下のように質問:
   ```
   Can you analyze my recent FX trading performance?
   ```

### 3. セキュリティ設定

#### OAuth認証の実装 (推奨)

```python
# backend/src/mcp_auth.py

from fastapi import Security, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def verify_token(token: str = Security(oauth2_scheme)):
    """Verify OAuth token from ChatGPT"""
    # トークン検証ロジック
    if not is_valid_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    return token
```

#### CORS設定

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://chatgpt.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4. フロントエンドUI (分析画面への統合)

#### AIフィードバックボタンの追加

```typescript
// frontend/src/pages/AnalysisPage.tsx

const handleGetAIFeedback = async () => {
  try {
    const response = await analyticsApi.generateAIFeedback({
      include_market_data: true,
      max_suggestions: 5
    })

    if (response.success) {
      setAiFeedback(response.data)
    }
  } catch (error) {
    console.error('Failed to get AI feedback:', error)
  }
}

// UIに追加
<button
  onClick={handleGetAIFeedback}
  className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
>
  AI分析を取得
</button>
```

## MCPツールの定義

### 必須ツール

ChatGPT Connectors や Deep Research で動作させるには、以下の2つのツールが必須:

1. **search**: データ検索
2. **fetch**: 詳細データ取得

### FXシミュレーター用ツール一覧

| ツール名 | 説明 | パラメータ | 戻り値 |
|---------|------|----------|--------|
| `get_trading_performance` | パフォーマンス指標取得 | なし | 勝率、PF、DD等 |
| `get_recent_trades` | 最近のトレード履歴 | limit (int) | トレードリスト |
| `get_losing_trades_analysis` | 損失トレード分析 | なし | 損失パターン |
| `get_winning_trades_analysis` | 勝ちトレード分析 | なし | 成功パターン |
| `get_drawdown_data` | ドローダウン履歴 | なし | DD推移データ |
| `get_equity_curve` | 資産曲線データ | interval (str) | 資産推移 |

### プロンプト設計例

ChatGPTに対して以下のような質問が可能:

```
# パフォーマンス分析
"Analyze my FX trading performance and identify the top 3 areas for improvement"

# 損失パターン分析
"What patterns do you see in my losing trades? Are there specific times or conditions I should avoid?"

# 成功パターン分析
"What are the common characteristics of my profitable trades?"

# 総合アドバイス
"Based on my trading history, provide 5 actionable recommendations to improve my win rate"
```

## デプロイメント

### ローカル開発

```bash
# MCPサーバーを起動
cd backend
python -m src.mcp_server

# または uvicorn で起動
uvicorn src.mcp_server:app --reload --port 8001
```

### 本番環境

```bash
# Docker を使用
docker build -t fx-simulator-mcp .
docker run -p 8001:8001 fx-simulator-mcp

# または Gunicorn で起動
gunicorn src.mcp_server:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8001
```

### ChatGPTからのアクセス

- **開発環境**: ngrok 等のトンネルサービスを使用
  ```bash
  ngrok http 8001
  # ChatGPTに https://<random>.ngrok.io/mcp を設定
  ```

- **本番環境**: HTTPS必須
  - Heroku, AWS, GCP, Vercel 等にデプロイ
  - SSL証明書の設定

## テスト方法

### 1. ローカルテスト

```python
# test_mcp.py

import asyncio
from src.mcp_server import get_trading_performance, get_recent_trades

async def test_tools():
    # パフォーマンス取得テスト
    perf = await get_trading_performance()
    print("Performance:", perf)

    # トレード履歴取得テスト
    trades = await get_recent_trades(limit=5)
    print("Recent trades:", trades)

if __name__ == "__main__":
    asyncio.run(test_tools())
```

### 2. ChatGPT統合テスト

1. MCPサーバーを起動
2. ChatGPTのConnectorsに追加
3. ChatGPTで質問:
   ```
   Use the FX Simulator Analytics connector to get my trading performance
   ```

### 3. メタデータ更新

ツールリストや説明を変更した場合:
1. MCPサーバーを再デプロイ
2. ChatGPT → Settings → Connectors → 該当コネクタ → **Refresh**

## ベストプラクティス

### 1. ツール設計

- **明確な operation_id**: ツール名を明確に (`get_trading_performance`)
- **詳細な説明**: ChatGPTがツールを適切に選択できるよう詳細に記述
- **入力検証**: 堅牢な入力バリデーション

### 2. エラーハンドリング

```python
@mcp.tool()
async def get_trading_performance(db: Session = Depends(get_db)):
    try:
        analytics_service = AnalyticsService(db)
        result = analytics_service.get_performance_metrics()

        if "error" in result:
            raise HTTPException(
                status_code=404,
                detail="No trading data available"
            )

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get performance metrics: {str(e)}"
        )
```

### 3. レート制限

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.get("/mcp")
@limiter.limit("60/minute")
async def mcp_endpoint():
    # MCPリクエスト処理
    pass
```

### 4. ログとモニタリング

```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@mcp.tool()
async def get_trading_performance(db: Session = Depends(get_db)):
    logger.info("MCP tool called: get_trading_performance")
    # ... 処理
```

## フィードバックメカニズム

### AI推奨の検証

ChatGPTからの推奨を受け取った後:

1. **定期的なレビュー**: AIの推奨と実際の結果を比較
2. **精度追跡**: 推奨の的中率を記録
3. **調整**: パフォーマンスに基づいてプロンプトやツールを改善

### ユーザー信頼性の向上

```python
@mcp.tool()
async def confirm_action(action: str) -> Dict[str, bool]:
    """
    Confirm an action before execution.
    Reduces mistakes and improves user trust.
    """
    # ユーザー確認ロジック
    return {"confirmed": True, "action": action}
```

## 参考リソース

### 公式ドキュメント

- [OpenAI MCP Documentation](https://platform.openai.com/docs/mcp)
- [FastMCP Documentation](https://gofastmcp.com)
- [Model Context Protocol Spec](http://blog.modelcontextprotocol.io)

### 実装例

- [Building an AI Trading Bot Using MCP](https://medium.com/@cognidownunder/building-an-ai-trading-bot-using-model-context-protocol-mcp-server-a-detailed-guide-17a75e468ea5)
- [Alpaca MCP Server](https://alpaca.markets/mcp-server)
- [FastMCP GitHub Examples](https://github.com/jlowin/fastmcp/tree/main/examples)

### コミュニティ

- [OpenAI Developer Community - MCP](https://community.openai.com/c/mcp)
- [FastMCP Discord](https://discord.gg/fastmcp)

## 次のステップ

1. ✅ MCP実装方法の調査完了
2. ⬜ FastMCPライブラリのインストールと基本実装
3. ⬜ MCPツールの実装（6つのツール）
4. ⬜ ChatGPTとの接続テスト
5. ⬜ フロントエンドUIの実装
6. ⬜ 本番環境へのデプロイ

## まとめ

ChatGPTのMCP対応により、FXシミュレーターのトレード分析を自然言語で行うことが可能になりました。FastMCPを使用することで、既存のFastAPIバックエンドと簡単に統合でき、トレーダーはChatGPTを通じて詳細な分析とフィードバックを受け取ることができます。

実装の鍵は:
- 明確で詳細なツール定義
- 堅牢なエラーハンドリング
- セキュアな認証設定
- ユーザー信頼性を高めるフィードバックメカニズム
