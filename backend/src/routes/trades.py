from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
from datetime import datetime

from src.utils.database import get_db
from src.services.trading_service import TradingService

router = APIRouter()


@router.get("")
async def get_trades(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """トレード履歴を取得する"""
    service = TradingService(db)
    result = service.get_trades(limit, offset)

    return {
        "success": True,
        "data": result,
    }


@router.get("/export")
async def export_trades(db: Session = Depends(get_db)):
    """トレード履歴をCSVで出力する"""
    service = TradingService(db)
    result = service.get_trades(limit=1000, offset=0)

    # CSVヘッダー
    csv_lines = [
        "trade_id,side,lot_size,entry_price,exit_price,realized_pnl,realized_pnl_pips,opened_at,closed_at"
    ]

    # データ行
    for trade in result["trades"]:
        csv_lines.append(
            f"{trade['trade_id']},{trade['side']},{trade['lot_size']},"
            f"{trade['entry_price']},{trade['exit_price']},{trade['realized_pnl']},"
            f"{trade['realized_pnl_pips']},{trade['opened_at']},{trade['closed_at']}"
        )

    csv_content = "\n".join(csv_lines)
    filename = f"trades_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        },
    )


@router.get("/{trade_id}")
async def get_trade(trade_id: str):
    """トレード詳細を取得する"""
    # TODO: 個別トレードの詳細取得
    return {
        "success": True,
        "data": None,
    }
