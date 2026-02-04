from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Literal
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.trading_service import TradingService

router = APIRouter()


class OrderRequest(BaseModel):
    side: Literal["buy", "sell"]
    lot_size: float


@router.post("")
async def create_order(
    request: OrderRequest,
    db: Session = Depends(get_db),
):
    """新規成行注文を発注する"""
    if request.lot_size < 0.01 or request.lot_size > 100.0:
        raise HTTPException(
            status_code=400,
            detail="Lot size must be between 0.01 and 100.0",
        )

    service = TradingService(db)
    result = service.create_order(request.side, request.lot_size)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


@router.get("")
async def get_orders(
    limit: int = Query(50, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """注文履歴を取得する"""
    service = TradingService(db)
    result = service.get_orders(limit, offset)

    return {
        "success": True,
        "data": result,
    }


@router.get("/{order_id}")
async def get_order(order_id: str):
    """注文詳細を取得する"""
    # TODO: 個別注文の詳細取得
    return {
        "success": True,
        "data": None,
    }
