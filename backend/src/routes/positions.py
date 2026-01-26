from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.trading_service import TradingService

router = APIRouter()


@router.get("")
async def get_positions(db: Session = Depends(get_db)):
    """保有ポジション一覧を取得する"""
    service = TradingService(db)
    result = service.get_positions()

    return {
        "success": True,
        "data": result,
    }


@router.get("/{position_id}")
async def get_position(position_id: str):
    """ポジション詳細を取得する"""
    # TODO: 個別ポジションの詳細取得
    return {
        "success": True,
        "data": None,
    }


@router.post("/{position_id}/close")
async def close_position(
    position_id: str,
    db: Session = Depends(get_db),
):
    """ポジションを決済する"""
    service = TradingService(db)
    result = service.close_position(position_id)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }
