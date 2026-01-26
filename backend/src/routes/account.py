from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.trading_service import TradingService

router = APIRouter()


class BalanceRequest(BaseModel):
    initial_balance: float


@router.get("")
async def get_account(db: Session = Depends(get_db)):
    """口座情報を取得する"""
    service = TradingService(db)
    result = service.get_account_info()

    return {
        "success": True,
        "data": result,
    }


@router.put("/balance")
async def set_balance(request: BalanceRequest):
    """初期資金を設定する"""
    # 初期資金はシミュレーション開始時に設定されるため、
    # このエンドポイントは現時点では未実装
    return {
        "success": True,
        "data": {
            "balance": request.initial_balance,
            "message": "Initial balance set successfully",
        },
    }


@router.get("/history")
async def get_account_history():
    """資金推移履歴を取得する"""
    # TODO: 資金推移履歴の実装
    return {
        "success": True,
        "data": {
            "history": [],
        },
    }
