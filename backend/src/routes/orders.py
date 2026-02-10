from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Literal, Optional
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.trading_service import TradingService
from src.utils.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


class OrderRequest(BaseModel):
    side: Literal["buy", "sell"]
    lot_size: float
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None
    sl_pips: Optional[float] = None
    tp_pips: Optional[float] = None


class PendingOrderRequest(BaseModel):
    order_type: Literal["limit", "stop"]
    side: Literal["buy", "sell"]
    lot_size: float
    trigger_price: float


class UpdatePendingOrderRequest(BaseModel):
    lot_size: Optional[float] = None
    trigger_price: Optional[float] = None


@router.post("")
async def create_order(
    request: OrderRequest,
    db: Session = Depends(get_db),
):
    """新規成行注文を発注する"""
    try:
        if request.lot_size < 0.01 or request.lot_size > 100.0:
            raise HTTPException(
                status_code=400,
                detail="Lot size must be between 0.01 and 100.0",
            )

        # sl_priceとsl_pipsが両方指定されている場合はエラー
        if request.sl_price is not None and request.sl_pips is not None:
            raise HTTPException(
                status_code=400,
                detail="Cannot specify both sl_price and sl_pips",
            )

        # tp_priceとtp_pipsが両方指定されている場合はエラー
        if request.tp_price is not None and request.tp_pips is not None:
            raise HTTPException(
                status_code=400,
                detail="Cannot specify both tp_price and tp_pips",
            )

        logger.info(f"注文作成: side={request.side}, lot_size={request.lot_size}")
        service = TradingService(db)
        result = service.create_order(
            request.side,
            request.lot_size,
            request.sl_price,
            request.tp_price,
            request.sl_pips,
            request.tp_pips,
        )

        if "error" in result:
            logger.warning(f"注文作成エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        logger.info(f"注文作成成功: order_id={result.get('order_id')}")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_order error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def get_orders(
    limit: int = Query(50, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """注文履歴を取得する"""
    try:
        service = TradingService(db)
        result = service.get_orders(limit, offset)

        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        logger.error(f"get_orders error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pending")
async def create_pending_order(
    request: PendingOrderRequest,
    db: Session = Depends(get_db),
):
    """予約注文（指値・逆指値）を作成する"""
    try:
        if request.lot_size < 0.01 or request.lot_size > 100.0:
            raise HTTPException(
                status_code=400,
                detail="Lot size must be between 0.01 and 100.0",
            )

        logger.info(f"予約注文作成: type={request.order_type}, side={request.side}, lot_size={request.lot_size}")
        service = TradingService(db)
        result = service.create_pending_order(
            request.order_type, request.side, request.lot_size, request.trigger_price
        )

        if "error" in result:
            logger.warning(f"予約注文作成エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        logger.info(f"予約注文作成成功: order_id={result.get('order_id')}")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_pending_order error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending")
async def get_pending_orders(
    limit: int = Query(50, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """未約定の予約注文一覧を取得する"""
    try:
        if status and status not in ["pending", "executed", "cancelled"]:
            raise HTTPException(
                status_code=400,
                detail="Status must be 'pending', 'executed', or 'cancelled'",
            )

        service = TradingService(db)
        result = service.get_pending_orders(limit, offset, status)

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_pending_orders error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending/{order_id}")
async def get_pending_order(
    order_id: str,
    db: Session = Depends(get_db),
):
    """未約定注文の詳細を取得する"""
    try:
        service = TradingService(db)
        result = service.get_pending_order(order_id)

        if "error" in result:
            logger.warning(f"予約注文が見つかりません: order_id={order_id}")
            raise HTTPException(status_code=404, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_pending_order error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/pending/{order_id}")
async def update_pending_order(
    order_id: str,
    request: UpdatePendingOrderRequest,
    db: Session = Depends(get_db),
):
    """未約定注文の内容を変更する"""
    try:
        if request.lot_size is not None and (request.lot_size < 0.01 or request.lot_size > 100.0):
            raise HTTPException(
                status_code=400,
                detail="Lot size must be between 0.01 and 100.0",
            )

        logger.info(f"予約注文更新: order_id={order_id}")
        service = TradingService(db)
        result = service.update_pending_order(order_id, request.lot_size, request.trigger_price)

        if "error" in result:
            logger.warning(f"予約注文更新エラー: {result['error']}")
            raise HTTPException(status_code=404, detail=result["error"])

        logger.info(f"予約注文更新成功: order_id={order_id}")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_pending_order error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/pending/{order_id}")
async def cancel_pending_order(
    order_id: str,
    db: Session = Depends(get_db),
):
    """未約定注文をキャンセルする"""
    try:
        logger.info(f"予約注文キャンセル: order_id={order_id}")
        service = TradingService(db)
        result = service.cancel_pending_order(order_id)

        if "error" in result:
            logger.warning(f"予約注文キャンセルエラー: {result['error']}")
            raise HTTPException(status_code=404, detail=result["error"])

        logger.info(f"予約注文キャンセル成功: order_id={order_id}")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cancel_pending_order error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{order_id}")
async def get_order(order_id: str, db: Session = Depends(get_db)):
    """注文詳細を取得する"""
    try:
        # TODO: 個別注文の詳細取得
        return {
            "success": True,
            "data": None,
        }
    except Exception as e:
        logger.error(f"get_order error : {e}")
        raise HTTPException(status_code=500, detail=str(e))
