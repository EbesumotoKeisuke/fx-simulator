from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("/performance")
async def get_performance(db: Session = Depends(get_db)):
    """パフォーマンス指標を取得する"""
    service = AnalyticsService(db)
    result = service.get_performance_metrics()

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


@router.get("/equity-curve")
async def get_equity_curve(
    interval: Literal["trade", "hour", "day"] = Query("trade"),
    db: Session = Depends(get_db),
):
    """資産曲線データを取得する"""
    service = AnalyticsService(db)
    result = service.get_equity_curve(interval)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


@router.get("/drawdown")
async def get_drawdown(db: Session = Depends(get_db)):
    """ドローダウンデータを取得する"""
    service = AnalyticsService(db)
    result = service.get_drawdown_data()

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


class AIFeedbackRequest(BaseModel):
    include_market_data: Optional[bool] = True
    max_suggestions: Optional[int] = 5


@router.post("/ai-feedback")
async def generate_ai_feedback(
    request: AIFeedbackRequest,
    db: Session = Depends(get_db),
):
    """AI改善コメントを生成する"""
    # TODO: AI改善コメント生成機能は次フェーズで実装
    raise HTTPException(
        status_code=501,
        detail="AI feedback generation is not implemented yet. This feature will be available in a future release.",
    )


@router.get("/ai-feedback")
async def get_ai_feedback(
    feedback_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """最新のAI改善コメントを取得する"""
    # TODO: AI改善コメント取得機能は次フェーズで実装
    raise HTTPException(
        status_code=501,
        detail="AI feedback retrieval is not implemented yet. This feature will be available in a future release.",
    )
