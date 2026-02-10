from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.trading_service import TradingService
from src.utils.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


class SetSLTPRequest(BaseModel):
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None
    sl_pips: Optional[float] = None
    tp_pips: Optional[float] = None


@router.get("")
async def get_positions(db: Session = Depends(get_db)):
    """保有ポジション一覧を取得する"""
    try:
        service = TradingService(db)
        result = service.get_positions()

        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        logger.error(f"get_positions error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{position_id}")
async def get_position(position_id: str):
    """ポジション詳細を取得する"""
    try:
        # TODO: 個別ポジションの詳細取得
        return {
            "success": True,
            "data": None,
        }
    except Exception as e:
        logger.error(f"get_position error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{position_id}/close")
async def close_position(
    position_id: str,
    db: Session = Depends(get_db),
):
    """ポジションを決済する"""
    try:
        logger.info(f"ポジション決済: position_id={position_id}")
        service = TradingService(db)
        result = service.close_position(position_id)

        if "error" in result:
            logger.warning(f"ポジション決済エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        logger.info(f"ポジション決済成功: position_id={position_id}, pnl={result.get('realized_pnl')}")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"close_position error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{position_id}/sl-tp")
async def set_sltp(
    position_id: str,
    request: SetSLTPRequest,
    db: Session = Depends(get_db),
):
    """ポジションにSL/TPを設定する"""
    try:
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

        logger.info(f"SL/TP設定: position_id={position_id}")
        service = TradingService(db)
        result = service.set_sltp(
            position_id,
            request.sl_price,
            request.tp_price,
            request.sl_pips,
            request.tp_pips,
        )

        if "error" in result:
            logger.warning(f"SL/TP設定エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        logger.info(f"SL/TP設定成功: position_id={position_id}")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"set_sltp error : {e}")
        raise HTTPException(status_code=500, detail=str(e))
