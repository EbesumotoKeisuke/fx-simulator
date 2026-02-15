from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.analytics_service import AnalyticsService
from src.utils.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.get("/performance")
async def get_performance(db: Session = Depends(get_db)):
    """パフォーマンス指標を取得する"""
    try:
        service = AnalyticsService(db)
        result = service.get_performance_metrics()

        if "error" in result:
            logger.warning(f"パフォーマンス取得でエラー: {result['error']}")
            raise HTTPException(status_code=404, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_performance error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/equity-curve")
async def get_equity_curve(
    interval: Literal["trade", "hour", "day"] = Query("trade"),
    db: Session = Depends(get_db),
):
    """資産曲線データを取得する"""
    try:
        service = AnalyticsService(db)
        result = service.get_equity_curve(interval)

        if "error" in result:
            logger.warning(f"資産曲線取得でエラー: {result['error']}")
            raise HTTPException(status_code=404, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_equity_curve error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/drawdown")
async def get_drawdown(db: Session = Depends(get_db)):
    """ドローダウンデータを取得する"""
    try:
        service = AnalyticsService(db)
        result = service.get_drawdown_data()

        if "error" in result:
            logger.warning(f"ドローダウン取得でエラー: {result['error']}")
            raise HTTPException(status_code=404, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_drawdown error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@router.get("/trades-with-candles")
async def get_trades_with_candles(
    timeframe: Literal["W1", "D1", "H1", "M10"] = Query("H1", description="時間足"),
    min_candles: int = Query(80, ge=1, le=1000, description="最低ローソク足本数"),
    db: Session = Depends(get_db),
):
    """
    売買履歴とローソク足データを一緒に取得する（パフォーマンス分析用）

    F-003: パフォーマンス分析へのチャート表示機能
    売買履歴の時間範囲に対応するローソク足データを取得し、
    チャート上に売買履歴をマーカーとして表示するために使用する。

    売買履歴が少ない場合でもチャートとして機能するよう、
    min_candlesで指定した本数以上のローソク足を返す。

    Args:
        timeframe: 時間足（W1, D1, H1, M10）
        min_candles: 最低ローソク足本数（デフォルト80）
        db: データベースセッション

    Returns:
        dict: {
            "trades": 売買履歴のリスト,
            "candles": ローソク足データのリスト,
            "timeframe": 時間足,
            "start_time": 売買履歴の開始時刻,
            "end_time": 売買履歴の終了時刻
        }
    """
    try:
        from src.services.trading_service import TradingService
        from src.services.market_data_service import MarketDataService, add_ema_to_candles
        from datetime import datetime

        trading_service = TradingService(db)
        market_service = MarketDataService(db)

        # 売買履歴を取得
        trades_result = trading_service.get_trades(limit=10000, offset=0)
        trades = trades_result.get("trades", [])

        if not trades:
            return {
                "success": True,
                "data": {
                    "trades": [],
                    "candles": [],
                    "timeframe": timeframe,
                    "start_time": None,
                    "end_time": None
                }
            }

        # 売買履歴の時間範囲を取得
        opened_times = [datetime.fromisoformat(t["opened_at"]) for t in trades if t.get("opened_at")]
        closed_times = [datetime.fromisoformat(t["closed_at"]) for t in trades if t.get("closed_at")]

        if not opened_times or not closed_times:
            return {
                "success": True,
                "data": {
                    "trades": trades,
                    "candles": [],
                    "timeframe": timeframe,
                    "start_time": None,
                    "end_time": None
                }
            }

        start_time = min(opened_times)
        end_time = max(closed_times)

        # ローソク足データを取得（動的生成で最新データまで表示）
        # get_candles_with_partial_last を使用して、H1/D1/W1も
        # 下位時間足（M10等）から動的生成し、最新データまで表示する
        candles, _ = market_service.get_candles_with_partial_last(
            timeframe=timeframe,
            current_time=end_time,
            limit=max(min_candles, 10000)
        )

        # EMAを追加
        candles = add_ema_to_candles(candles, period=20)

        return {
            "success": True,
            "data": {
                "trades": trades,
                "candles": candles,
                "timeframe": timeframe,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat()
            }
        }
    except Exception as e:
        logger.error(f"get_trades_with_candles error : {e}")
        return {
            "success": False,
            "error": {"message": str(e)},
        }
