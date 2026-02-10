from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.market_data_service import MarketDataService
from src.services.csv_import_service import CSVImportService
from src.utils.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.get("/candles")
async def get_candles(
    timeframe: str = Query(..., description="時間足（W1, D1, H1, M10）"),
    start_time: Optional[datetime] = Query(None, description="開始日時"),
    end_time: Optional[datetime] = Query(None, description="終了日時"),
    limit: int = Query(100, ge=1, le=1000, description="取得件数"),
    db: Session = Depends(get_db),
):
    """ローソク足データを取得する"""
    try:
        if timeframe not in ["W1", "D1", "H1", "M10"]:
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_candles error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candles/before")
async def get_candles_before(
    timeframe: str = Query(..., description="時間足（W1, D1, H1, M10）"),
    before_time: datetime = Query(..., description="指定時刻"),
    limit: int = Query(100, ge=1, le=1000, description="取得件数"),
    db: Session = Depends(get_db),
):
    """指定時刻より前のローソク足データを取得する（シミュレーション用）"""
    try:
        if timeframe not in ["W1", "D1", "H1", "M10"]:
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_candles_before error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candles/partial")
async def get_candles_partial(
    timeframe: str = Query(..., description="時間足（W1, D1, H1, M10）"),
    current_time: datetime = Query(..., description="現在時刻（シミュレーション時刻）"),
    limit: int = Query(100, ge=1, le=1000, description="取得件数"),
    db: Session = Depends(get_db),
):
    """
    最新のローソク足を部分的に生成して返す（未来データ非表示対応）

    指定時刻より前のローソク足データを取得し、最新のローソク足のみを
    current_time までのデータで動的に生成する。

    これにより、上位時間足で未来のデータが表示されることを防ぐ。
    例：current_time が 12:30 の場合、1時間足の 12:00 台のローソク足は
    12:00〜12:30 のデータのみから生成される。

    Returns:
        - candles: ローソク足データのリスト
        - data_missing: DBに該当時間足のデータが存在しない場合にTrue
    """
    try:
        if timeframe not in ["W1", "D1", "H1", "M10"]:
            raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

        service = MarketDataService(db)
        candles, data_missing = service.get_candles_with_partial_last(timeframe, current_time, limit)

        return {
            "success": True,
            "data": {
                "timeframe": timeframe,
                "candles": candles,
                "data_missing": data_missing,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_candles_partial error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeframes")
async def get_timeframes():
    """利用可能な時間足一覧を取得する"""
    try:
        return {
            "success": True,
            "data": {
                "timeframes": ["W1", "D1", "H1", "M10"],
            },
        }
    except Exception as e:
        logger.error(f"get_timeframes error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/date-range")
async def get_date_range(db: Session = Depends(get_db)):
    """データの日付範囲を取得する"""
    try:
        service = MarketDataService(db)
        date_range = service.get_date_range()

        return {
            "success": True,
            "data": date_range,
        }
    except Exception as e:
        logger.error(f"get_date_range error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files")
async def get_csv_files(db: Session = Depends(get_db)):
    """利用可能なCSVファイル一覧を取得する"""
    try:
        service = CSVImportService(db)
        files = service.get_available_files()

        return {
            "success": True,
            "data": {
                "files": files,
            },
        }
    except Exception as e:
        logger.error(f"get_csv_files error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/{timeframe}")
async def import_csv(
    timeframe: str,
    db: Session = Depends(get_db),
):
    """指定した時間足のCSVファイルをインポートする"""
    try:
        if timeframe not in ["W1", "D1", "H1", "M10"]:
            raise HTTPException(status_code=400, detail=f"Invalid timeframe: {timeframe}")

        logger.info(f"CSVインポート開始: timeframe={timeframe}")
        service = CSVImportService(db)
        result = service.import_csv(timeframe)
        logger.info(f"CSVインポート完了: timeframe={timeframe}")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"import_csv error : CSVファイルが見つかりません - {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"import_csv error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-all")
async def import_all_csv(db: Session = Depends(get_db)):
    """すべての時間足のCSVファイルをインポートする"""
    try:
        logger.info("全CSVインポート開始")
        service = CSVImportService(db)
        results = service.import_all()
        logger.info("全CSVインポート完了")

        return {
            "success": True,
            "data": {
                "results": results,
            },
        }
    except Exception as e:
        logger.error(f"import_all_csv error : {e}")
        raise HTTPException(status_code=500, detail=str(e))
