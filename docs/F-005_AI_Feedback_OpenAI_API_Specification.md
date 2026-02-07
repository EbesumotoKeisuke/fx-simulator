# F-005: AIフィードバック機能 - OpenAI API実装仕様書

## 概要

FXシミュレーターのトレード結果に対して、OpenAI API (GPT-4o-mini) による分析とフィードバックを提供する機能。無料版ChatGPTアカウントでも利用可能な、コスト効率の高い実装方式。

## 前提条件

### OpenAI API要件

- **OpenAI APIキー**: https://platform.openai.com/api-keys で取得（無料登録可能）
- **初回クレジット**: 新規アカウントは$5の無料クレジット付与
- **課金設定**: クレジットカード登録で従量課金利用可能

### バックエンド要件

- Python 3.11+
- FastAPI 0.100+
- OpenAI Python SDK 1.0+
- 既存のFXシミュレーターバックエンド

## アーキテクチャ

```
┌─────────────────┐
│  Frontend       │
│  (React/TS)     │
└────────┬────────┘
         │ HTTPS API
         ▼
┌─────────────────┐
│  FastAPI        │
│  Backend        │
│  ┌───────────┐  │
│  │ Analytics │  │
│  │ Endpoint  │  │
│  └─────┬─────┘  │
│        │        │
│        ▼        │
│  ┌───────────┐  │
│  │  OpenAI   │  │
│  │  Client   │  │
│  └─────┬─────┘  │
└────────┼────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│  OpenAI API     │
│  (GPT-4o-mini)  │
└─────────────────┘
```

## 実装方法

### 1. 環境変数設定

```bash
# backend/.env

# OpenAI API設定
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini  # または gpt-4o
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.7
```

### 2. 依存パッケージのインストール

```bash
# backend/requirements.txt に追加
openai>=1.0.0
python-dotenv>=1.0.0
```

```bash
cd backend
pip install openai python-dotenv
```

### 3. OpenAI サービスの実装

```python
# backend/src/services/ai_feedback_service.py

from openai import OpenAI
from typing import Dict, Any, List
import os
from sqlalchemy.orm import Session

from src.services.analytics_service import AnalyticsService
from src.services.trading_service import TradingService


class AIFeedbackService:
    def __init__(self, db: Session):
        self.db = db
        self.analytics_service = AnalyticsService(db)
        self.trading_service = TradingService(db)

        # OpenAI クライアント初期化
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.max_tokens = int(os.getenv("OPENAI_MAX_TOKENS", "2000"))
        self.temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))

    def generate_trading_feedback(
        self,
        include_market_data: bool = True,
        max_suggestions: int = 5
    ) -> Dict[str, Any]:
        """
        トレード結果を分析してAIフィードバックを生成

        Args:
            include_market_data: マーケットデータを含めるか
            max_suggestions: 最大提案数

        Returns:
            AIフィードバック結果
        """
        try:
            # 1. パフォーマンス指標を取得
            performance = self.analytics_service.get_performance_metrics()

            if "error" in performance:
                return {
                    "error": "トレードデータが不足しています",
                    "feedback": None
                }

            # 2. 最近のトレード履歴を取得
            recent_trades_result = self.trading_service.get_trades(limit=20, offset=0)
            recent_trades = recent_trades_result.get("trades", [])

            # 3. 勝ちトレードと負けトレードを分析
            winning_trades = [t for t in recent_trades if t.get("realized_pnl", 0) > 0]
            losing_trades = [t for t in recent_trades if t.get("realized_pnl", 0) < 0]

            # 4. プロンプトを構築
            prompt = self._build_analysis_prompt(
                performance=performance,
                winning_trades=winning_trades,
                losing_trades=losing_trades,
                max_suggestions=max_suggestions
            )

            # 5. OpenAI APIを呼び出し
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "あなたはプロのFXトレードアドバイザーです。トレード結果を分析し、具体的で実行可能な改善提案を日本語で提供してください。"
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                max_tokens=self.max_tokens,
                temperature=self.temperature
            )

            # 6. レスポンスを整形
            feedback_text = response.choices[0].message.content

            return {
                "feedback": feedback_text,
                "metadata": {
                    "model": self.model,
                    "tokens_used": {
                        "prompt": response.usage.prompt_tokens,
                        "completion": response.usage.completion_tokens,
                        "total": response.usage.total_tokens
                    },
                    "performance_summary": {
                        "total_trades": performance.get("total_trades", 0),
                        "win_rate": performance.get("win_rate", 0),
                        "profit_factor": performance.get("profit_factor", 0)
                    }
                }
            }

        except Exception as e:
            return {
                "error": f"AIフィードバック生成に失敗しました: {str(e)}",
                "feedback": None
            }

    def _build_analysis_prompt(
        self,
        performance: Dict[str, Any],
        winning_trades: List[Dict[str, Any]],
        losing_trades: List[Dict[str, Any]],
        max_suggestions: int
    ) -> str:
        """
        分析用プロンプトを構築
        """
        prompt = f"""
以下のFXトレード結果を分析し、トレーダーに対して具体的な改善提案を{max_suggestions}つ提供してください。

## パフォーマンス概要
- 総トレード数: {performance.get('total_trades', 0)}回
- 勝率: {performance.get('win_rate', 0):.1f}%
- プロフィットファクター: {performance.get('profit_factor', 0):.2f}
- 総損益: {performance.get('total_pnl', 0):,.0f}円
- 最大ドローダウン: {performance.get('max_drawdown', 0):,.0f}円
- 平均利益: {performance.get('avg_profit', 0):,.0f}円
- 平均損失: {performance.get('avg_loss', 0):,.0f}円
- 最大連勝: {performance.get('max_consecutive_wins', 0)}回
- 最大連敗: {performance.get('max_consecutive_losses', 0)}回

## 勝ちトレード分析
- 勝ちトレード数: {len(winning_trades)}回
"""

        if winning_trades:
            avg_winning_pnl = sum(t["realized_pnl"] for t in winning_trades) / len(winning_trades)
            prompt += f"- 平均利益: {avg_winning_pnl:,.0f}円\n"
            prompt += f"- 最大利益: {max(t['realized_pnl'] for t in winning_trades):,.0f}円\n"

        prompt += f"""
## 負けトレード分析
- 負けトレード数: {len(losing_trades)}回
"""

        if losing_trades:
            avg_losing_pnl = sum(t["realized_pnl"] for t in losing_trades) / len(losing_trades)
            prompt += f"- 平均損失: {avg_losing_pnl:,.0f}円\n"
            prompt += f"- 最大損失: {min(t['realized_pnl'] for t in losing_trades):,.0f}円\n"

        prompt += f"""

## 分析要求
1. このトレーダーの強みと弱みを特定してください
2. 勝率、プロフィットファクター、またはリスク管理を改善するための具体的な提案を{max_suggestions}つ挙げてください
3. 各提案は実行可能で、測定可能なものにしてください

## 出力形式
以下の形式で回答してください:

### 📊 パフォーマンス評価

[総合的な評価を2-3文で]

### ✅ 強み

- [強み1]
- [強み2]

### ⚠️ 改善が必要な点

- [弱み1]
- [弱み2]

### 💡 具体的な改善提案

1. **[提案タイトル1]**
   - 現状: [何が問題か]
   - 改善策: [どう改善するか]
   - 期待効果: [どんな効果が期待できるか]

2. **[提案タイトル2]**
   - 現状: [何が問題か]
   - 改善策: [どう改善するか]
   - 期待効果: [どんな効果が期待できるか]

[最大{max_suggestions}個まで]

### 🎯 優先して取り組むべきこと

[最も重要な改善点を1つ、具体的に説明]
"""

        return prompt


    def get_cost_estimate(self, num_analyses: int = 1) -> Dict[str, Any]:
        """
        コスト見積もりを取得

        Args:
            num_analyses: 分析回数

        Returns:
            コスト見積もり
        """
        # GPT-4o-mini の料金 (2026年2月時点)
        # Input: $0.15 / 1M tokens
        # Output: $0.60 / 1M tokens

        # 平均的なトークン数を仮定
        avg_input_tokens = 3000  # プロンプト + データ
        avg_output_tokens = 1500  # フィードバック

        input_cost = (avg_input_tokens / 1_000_000) * 0.15 * num_analyses
        output_cost = (avg_output_tokens / 1_000_000) * 0.60 * num_analyses
        total_cost = input_cost + output_cost

        return {
            "num_analyses": num_analyses,
            "estimated_cost_usd": round(total_cost, 4),
            "estimated_cost_jpy": round(total_cost * 150, 2),  # 1USD = 150円と仮定
            "avg_tokens_per_analysis": avg_input_tokens + avg_output_tokens,
            "breakdown": {
                "input_tokens": avg_input_tokens * num_analyses,
                "output_tokens": avg_output_tokens * num_analyses,
                "input_cost_usd": round(input_cost, 4),
                "output_cost_usd": round(output_cost, 4)
            }
        }
```

### 4. APIエンドポイントの実装

```python
# backend/src/routes/analytics.py (既存ファイルを更新)

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.analytics_service import AnalyticsService
from src.services.ai_feedback_service import AIFeedbackService

router = APIRouter()

# ... 既存のエンドポイント ...


class AIFeedbackRequest(BaseModel):
    include_market_data: Optional[bool] = True
    max_suggestions: Optional[int] = 5


@router.post("/ai-feedback")
async def generate_ai_feedback(
    request: AIFeedbackRequest,
    db: Session = Depends(get_db),
):
    """AI改善コメントを生成する (OpenAI API使用)"""
    try:
        service = AIFeedbackService(db)
        result = service.generate_trading_feedback(
            include_market_data=request.include_market_data,
            max_suggestions=request.max_suggestions
        )

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AIフィードバック生成に失敗しました: {str(e)}"
        )


@router.get("/ai-feedback/cost-estimate")
async def get_cost_estimate(
    num_analyses: int = Query(1, ge=1, le=1000, description="分析回数"),
    db: Session = Depends(get_db),
):
    """AIフィードバックのコスト見積もりを取得"""
    service = AIFeedbackService(db)
    result = service.get_cost_estimate(num_analyses)

    return {
        "success": True,
        "data": result
    }
```

### 5. フロントエンド実装

```typescript
// frontend/src/services/api.ts (既存ファイルに追加)

export interface AIFeedbackRequest {
  include_market_data?: boolean
  max_suggestions?: number
}

export interface AIFeedbackResponse {
  feedback: string
  metadata: {
    model: string
    tokens_used: {
      prompt: number
      completion: number
      total: number
    }
    performance_summary: {
      total_trades: number
      win_rate: number
      profit_factor: number
    }
  }
}

export const analyticsApi = {
  // ... 既存のメソッド ...

  generateAIFeedback: async (
    request: AIFeedbackRequest
  ): Promise<ApiResponse<AIFeedbackResponse>> => {
    const response = await fetch(`${API_BASE_URL}/analytics/ai-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error('Failed to generate AI feedback')
    }

    return response.json()
  },

  getCostEstimate: async (numAnalyses: number = 1) => {
    const response = await fetch(
      `${API_BASE_URL}/analytics/ai-feedback/cost-estimate?num_analyses=${numAnalyses}`
    )

    if (!response.ok) {
      throw new Error('Failed to get cost estimate')
    }

    return response.json()
  },
}
```

```typescript
// frontend/src/pages/AnalysisPage.tsx (既存ファイルに追加)

import { useState } from 'react'
import { analyticsApi, AIFeedbackResponse } from '../services/api'

export const AnalysisPage = () => {
  const [aiFeedback, setAiFeedback] = useState<AIFeedbackResponse | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGetAIFeedback = async () => {
    try {
      setIsGenerating(true)
      setError(null)

      const response = await analyticsApi.generateAIFeedback({
        include_market_data: true,
        max_suggestions: 5
      })

      if (response.success) {
        setAiFeedback(response.data)
      }
    } catch (err) {
      console.error('Failed to get AI feedback:', err)
      setError('AIフィードバックの生成に失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">パフォーマンス分析</h1>

      {/* 既存のパフォーマンス指標表示 */}

      {/* AIフィードバックセクション */}
      <div className="mt-8 p-6 bg-surface-secondary rounded-lg">
        <h2 className="text-xl font-bold mb-4">🤖 AI改善提案</h2>

        <button
          onClick={handleGetAIFeedback}
          disabled={isGenerating}
          className="px-6 py-3 bg-btn-primary text-text-strong rounded hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? '分析中...' : 'AI分析を取得'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500 rounded text-red-500">
            {error}
          </div>
        )}

        {aiFeedback && (
          <div className="mt-6">
            <div className="prose prose-invert max-w-none">
              <div
                className="whitespace-pre-wrap text-text-normal"
                dangerouslySetInnerHTML={{
                  __html: aiFeedback.feedback.replace(/\n/g, '<br/>')
                }}
              />
            </div>

            <div className="mt-4 p-4 bg-surface-tertiary rounded text-sm text-text-muted">
              <p>モデル: {aiFeedback.metadata.model}</p>
              <p>使用トークン数: {aiFeedback.metadata.tokens_used.total}</p>
              <p>
                推定コスト: 約
                {(
                  (aiFeedback.metadata.tokens_used.prompt / 1_000_000) * 0.15 +
                  (aiFeedback.metadata.tokens_used.completion / 1_000_000) * 0.60
                ).toFixed(4)} USD
                (約{(
                  ((aiFeedback.metadata.tokens_used.prompt / 1_000_000) * 0.15 +
                  (aiFeedback.metadata.tokens_used.completion / 1_000_000) * 0.60) * 150
                ).toFixed(2)}円)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

## コスト試算

### GPT-4o-mini 使用時（推奨）

| 項目 | 値 |
|------|-----|
| 入力トークン単価 | $0.15 / 1M tokens |
| 出力トークン単価 | $0.60 / 1M tokens |
| 1回あたりの入力トークン | 約3,000 tokens |
| 1回あたりの出力トークン | 約1,500 tokens |
| **1回あたりのコスト** | **約$0.001 (0.15円)** |
| 月100回使用 | 約$0.10 (15円) |
| 月1,000回使用 | 約$1.00 (150円) |

### GPT-4o 使用時（高精度が必要な場合）

| 項目 | 値 |
|------|-----|
| 入力トークン単価 | $2.50 / 1M tokens |
| 出力トークン単価 | $10.00 / 1M tokens |
| **1回あたりのコスト** | **約$0.015 (2.25円)** |
| 月100回使用 | 約$1.50 (225円) |

## セキュリティ設定

### 1. APIキーの保護

```python
# backend/.env (Gitにコミットしない)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```gitignore
# .gitignore
.env
.env.local
*.env
```

### 2. レート制限

```python
# backend/src/services/ai_feedback_service.py

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/ai-feedback")
@limiter.limit("10/hour")  # 1時間に10回まで
async def generate_ai_feedback(...):
    # ...
```

### 3. コスト制限

```python
# backend/src/services/ai_feedback_service.py

class AIFeedbackService:
    def __init__(self, db: Session):
        # ...
        self.max_monthly_cost = float(os.getenv("OPENAI_MAX_MONTHLY_COST", "10.0"))  # $10/月

    def check_monthly_budget(self) -> bool:
        """月間予算をチェック"""
        # 当月の使用コストを計算
        # 予算超過の場合はFalseを返す
        pass
```

## テスト方法

### 1. ローカルテスト

```python
# test_ai_feedback.py

import asyncio
from sqlalchemy.orm import Session
from src.services.ai_feedback_service import AIFeedbackService
from src.utils.database import SessionLocal

async def test_ai_feedback():
    db: Session = SessionLocal()
    try:
        service = AIFeedbackService(db)

        # フィードバック生成テスト
        result = service.generate_trading_feedback(
            include_market_data=True,
            max_suggestions=3
        )

        print("=== AI Feedback ===")
        print(result.get("feedback"))
        print("\n=== Metadata ===")
        print(result.get("metadata"))

        # コスト見積もりテスト
        cost = service.get_cost_estimate(num_analyses=100)
        print("\n=== Cost Estimate (100 analyses) ===")
        print(f"Total: ${cost['estimated_cost_usd']} ({cost['estimated_cost_jpy']}円)")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_ai_feedback())
```

### 2. APIエンドポイントテスト

```bash
# サーバー起動
cd backend
uvicorn src.main:app --reload

# 別ターミナルでテスト
curl -X POST http://localhost:8000/api/analytics/ai-feedback \
  -H "Content-Type: application/json" \
  -d '{"include_market_data": true, "max_suggestions": 5}'

# コスト見積もりテスト
curl http://localhost:8000/api/analytics/ai-feedback/cost-estimate?num_analyses=100
```

## デプロイメント

### 環境変数の設定

```bash
# 本番環境 (.env.production)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_MONTHLY_COST=10.0
```

### Docker対応

```dockerfile
# backend/Dockerfile

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 環境変数は実行時に注入
ENV OPENAI_API_KEY=""

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose.yml

version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=gpt-4o-mini
    env_file:
      - ./backend/.env
```

## ベストプラクティス

### 1. プロンプトエンジニアリング

- **明確な指示**: 出力形式を明確に指定
- **コンテキスト提供**: 十分なトレードデータを含める
- **制約設定**: 最大提案数、出力長を制限

### 2. エラーハンドリング

```python
try:
    response = self.client.chat.completions.create(...)
except openai.RateLimitError:
    # レート制限エラー
    return {"error": "API使用制限に達しました。しばらく待ってから再試行してください"}
except openai.APIError as e:
    # APIエラー
    return {"error": f"OpenAI APIエラー: {str(e)}"}
```

### 3. キャッシング

```python
# 同一条件での再生成を防ぐ
from functools import lru_cache
from hashlib import md5

@lru_cache(maxsize=100)
def _get_cached_feedback(data_hash: str):
    # データハッシュに基づいてキャッシュ
    pass
```

### 4. ログとモニタリング

```python
import logging

logger = logging.getLogger(__name__)

logger.info(f"AI feedback generated: {response.usage.total_tokens} tokens")
logger.info(f"Estimated cost: ${cost:.4f}")
```

## 参考リソース

### 公式ドキュメント

- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [OpenAI Python SDK](https://github.com/openai/openai-python)
- [OpenAI Pricing](https://openai.com/pricing)

### 実装例

- [OpenAI Cookbook - Trading Analysis](https://github.com/openai/openai-cookbook)
- [Building Trading Bots with OpenAI](https://medium.com/@cognidownunder/building-an-ai-trading-bot-using-model-context-protocol-mcp-server-a-detailed-guide-17a75e468ea5)

## 次のステップ

1. ✅ OpenAI API実装方法の調査完了
2. ⬜ OpenAI APIキーの取得と設定
3. ⬜ AIFeedbackServiceの実装
4. ⬜ APIエンドポイントの実装
5. ⬜ フロントエンドUIの実装
6. ⬜ テストと動作確認
7. ⬜ 本番環境へのデプロイ

## まとめ

OpenAI APIを使用することで、無料版ChatGPTアカウントでもAIフィードバック機能を実装できます。

### メリット

- ✅ **超低コスト**: 月100回で約15円
- ✅ **簡単実装**: FastAPIに直接統合可能
- ✅ **柔軟性**: プロンプトを自由にカスタマイズ可能
- ✅ **高品質**: GPT-4o-miniでも十分な分析能力

### 実装の鍵

- 明確で詳細なプロンプト設計
- 堅牢なエラーハンドリング
- APIキーの安全な管理
- コスト管理とレート制限

この方式なら、ChatGPT有料プランなしで、月額数十円でプロレベルのトレード分析を提供できます。
