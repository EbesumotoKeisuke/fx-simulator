"""
アラートAPIルート

トレード中の自動アラート機能に関するエンドポイントを提供する。
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.alert_service import AlertService
from src.utils.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


class CheckAlertsRequest(BaseModel):
    """アラートチェックリクエスト"""
    lot_size: Optional[float] = None


class AlertResponse(BaseModel):
    """アラートレスポンス"""
    id: str
    type: str  # info, warning, danger
    message: str
    category: str
    timestamp: str


@router.get("/")
async def get_alerts(
    lot_size: Optional[float] = Query(None, description="注文しようとしているロットサイズ"),
    db: Session = Depends(get_db),
):
    """
    現在のアラートを取得する

    トレード状況に基づいてアラートを生成し返却する。
    lot_sizeが指定された場合、ロットサイズに関するアラートも含む。

    Args:
        lot_size: 注文しようとしているロットサイズ（オプション）
        db: データベースセッション

    Returns:
        dict: {
            "success": True,
            "data": {
                "alerts": アラートのリスト
            }
        }
    """
    try:
        service = AlertService(db)
        alerts = service.check_alerts(lot_size=lot_size)

        return {
            "success": True,
            "data": {
                "alerts": alerts,
            },
        }
    except Exception as e:
        logger.error(f"get_alerts error : {e}")
        return {
            "success": False,
            "error": {"message": str(e)},
        }


@router.post("/check")
async def check_alerts(
    request: CheckAlertsRequest,
    db: Session = Depends(get_db),
):
    """
    注文前にアラートをチェックする

    注文実行前に呼び出し、警告やリスクを確認する。

    Args:
        request: アラートチェックリクエスト
        db: データベースセッション

    Returns:
        dict: {
            "success": True,
            "data": {
                "alerts": アラートのリスト,
                "has_danger": 危険アラートがあるかどうか,
                "has_warning": 警告アラートがあるかどうか
            }
        }
    """
    try:
        service = AlertService(db)
        alerts = service.check_alerts(lot_size=request.lot_size)

        has_danger = any(a["type"] == "danger" for a in alerts)
        has_warning = any(a["type"] == "warning" for a in alerts)

        return {
            "success": True,
            "data": {
                "alerts": alerts,
                "has_danger": has_danger,
                "has_warning": has_warning,
            },
        }
    except Exception as e:
        logger.error(f"check_alerts error : {e}")
        return {
            "success": False,
            "error": {"message": str(e)},
        }


@router.get("/analysis-summary")
async def get_analysis_summary(
    db: Session = Depends(get_db),
):
    """
    トレード分析サマリーを取得する

    時間帯別の勝率、連敗パターン、改善提案などの分析結果を返す。
    Claude MCP連携でも使用される。

    Returns:
        dict: {
            "success": True,
            "data": 分析サマリー
        }
    """
    try:
        service = AlertService(db)
        result = service.get_trade_analysis_summary()

        if "error" in result:
            logger.warning(f"分析サマリー取得でエラー: {result['error']}")
            return {
                "success": False,
                "error": {"message": result["error"]},
            }

        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        logger.error(f"get_analysis_summary error : {e}")
        return {
            "success": False,
            "error": {"message": str(e)},
        }
