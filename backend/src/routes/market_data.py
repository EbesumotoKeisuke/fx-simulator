from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.market_data_service import MarketDataService
from src.services.csv_import_service import CSVImportService

router = APIRouter()


@router.get("/candles")
async def get_candles(
    timeframe: str = Query(..., description="時間足（D1, H1, M10）"),
    start_time: Optional[datetime] = Query(None, description="開始日時"),
    end_time: Optional[datetime] = Query(None, description="終了日時"),
    limit: int = Query(100, ge=1, le=1000, description="取得件数"),
    db: Session = Depends(get_db),
):
    """ローソク足データを取得する"""
    if timeframe not in ["D1", "H1", "M10"]:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    service = MarketDataService(db)
    candles = service.get_candles(timeframe, start_time, end_time, limit)

    return {
        "success": True,
        "data": {
            "timeframe": timeframe,
            "candles": candles,
        },
    }


@router.get("/candles/before")
async def get_candles_before(
    timeframe: str = Query(..., description="時間足（D1, H1, M10）"),
    before_time: datetime = Query(..., description="指定時刻"),
    limit: int = Query(100, ge=1, le=1000, description="取得件数"),
    db: Session = Depends(get_db),
):
    """指定時刻より前のローソク足データを取得する（シミュレーション用）"""
    if timeframe not in ["D1", "H1", "M10"]:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    service = MarketDataService(db)
    candles = service.get_candles_before(timeframe, before_time, limit)

    return {
        "success": True,
        "data": {
            "timeframe": timeframe,
            "candles": candles,
        },
    }


@router.get("/timeframes")
async def get_timeframes():
    """利用可能な時間足一覧を取得する"""
    return {
        "success": True,
        "data": {
            "timeframes": ["D1", "H1", "M10"],
        },
    }


@router.get("/date-range")
async def get_date_range(db: Session = Depends(get_db)):
    """データの日付範囲を取得する"""
    service = MarketDataService(db)
    date_range = service.get_date_range()

    return {
        "success": True,
        "data": date_range,
    }


@router.get("/files")
async def get_csv_files(db: Session = Depends(get_db)):
    """利用可能なCSVファイル一覧を取得する"""
    service = CSVImportService(db)
    files = service.get_available_files()

    return {
        "success": True,
        "data": {
            "files": files,
        },
    }


@router.post("/import/{timeframe}")
async def import_csv(
    timeframe: str,
    db: Session = Depends(get_db),
):
    """指定した時間足のCSVファイルをインポートする"""
    if timeframe not in ["D1", "H1", "M10"]:
        raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

    service = CSVImportService(db)
    try:
        result = service.import_csv(timeframe)
        return {
            "success": True,
            "data": result,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-all")
async def import_all_csv(db: Session = Depends(get_db)):
    """すべての時間足のCSVファイルをインポートする"""
    service = CSVImportService(db)
    results = service.import_all()

    return {
        "success": True,
        "data": {
            "results": results,
        },
    }
