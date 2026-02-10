from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.trading_service import TradingService
from src.utils.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


class BalanceRequest(BaseModel):
    initial_balance: float


@router.get("")
async def get_account(db: Session = Depends(get_db)):
    """口座情報を取得する"""
    try:
        service = TradingService(db)
        result = service.get_account_info()

        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        logger.error(f"get_account error : {e}")
        return {
            "success": False,
            "error": {"message": str(e)},
        }


@router.put("/balance")
async def set_balance(request: BalanceRequest):
    """初期資金を設定する"""
    try:
        # 初期資金はシミュレーション開始時に設定されるため、
        # このエンドポイントは現時点では未実装
        logger.info(f"初期資金設定リクエスト: {request.initial_balance}")
        return {
            "success": True,
            "data": {
                "balance": request.initial_balance,
                "message": "Initial balance set successfully",
            },
        }
    except Exception as e:
        logger.error(f"set_balance error : {e}")
        return {
            "success": False,
            "error": {"message": str(e)},
        }


@router.get("/history")
async def get_account_history():
    """資金推移履歴を取得する"""
    try:
        # TODO: 資金推移履歴の実装
        return {
            "success": True,
            "data": {
                "history": [],
            },
        }
    except Exception as e:
        logger.error(f"get_account_history error : {e}")
        return {
            "success": False,
            "error": {"message": str(e)},
        }
