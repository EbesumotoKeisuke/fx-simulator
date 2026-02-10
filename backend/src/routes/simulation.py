from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.simulation_service import SimulationService
from src.utils.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


class SimulationStartRequest(BaseModel):
    start_time: datetime
    initial_balance: float = 1000000
    speed: float = 1.0


class SimulationSpeedRequest(BaseModel):
    speed: float


class AdvanceTimeRequest(BaseModel):
    new_time: datetime


@router.post("/start")
async def start_simulation(
    request: SimulationStartRequest,
    db: Session = Depends(get_db),
):
    """シミュレーションを開始する"""
    try:
        logger.info(f"シミュレーション開始リクエスト: start_time={request.start_time}, initial_balance={request.initial_balance}")
        service = SimulationService(db)
        result = service.start(
            start_time=request.start_time,
            initial_balance=request.initial_balance,
            speed=request.speed,
        )

        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        logger.error(f"start_simulation error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
async def stop_simulation(db: Session = Depends(get_db)):
    """シミュレーションを終了する"""
    try:
        logger.info("シミュレーション停止リクエスト")
        service = SimulationService(db)
        result = service.stop()

        if "error" in result:
            logger.warning(f"シミュレーション停止エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        logger.info("シミュレーション停止成功")
        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"stop_simulation error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pause")
async def pause_simulation(db: Session = Depends(get_db)):
    """シミュレーションを一時停止する"""
    try:
        logger.info("シミュレーション一時停止リクエスト")
        service = SimulationService(db)
        result = service.pause()

        if "error" in result:
            logger.warning(f"シミュレーション一時停止エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"pause_simulation error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resume")
async def resume_simulation(db: Session = Depends(get_db)):
    """シミュレーションを再開する"""
    try:
        logger.info("シミュレーション再開リクエスト")
        service = SimulationService(db)
        result = service.resume()

        if "error" in result:
            logger.warning(f"シミュレーション再開エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"resume_simulation error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/speed")
async def update_speed(
    request: SimulationSpeedRequest,
    db: Session = Depends(get_db),
):
    """再生速度を変更する"""
    try:
        if request.speed < 0.5 or request.speed > 10.0:
            raise HTTPException(
                status_code=400,
                detail="Speed must be between 0.5 and 10.0",
            )

        logger.info(f"再生速度変更: speed={request.speed}")
        service = SimulationService(db)
        result = service.set_speed(request.speed)

        if "error" in result:
            logger.warning(f"再生速度変更エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_speed error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_status(db: Session = Depends(get_db)):
    """シミュレーション状態を取得する"""
    try:
        service = SimulationService(db)
        result = service.get_status()

        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        logger.error(f"get_status error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/current-time")
async def get_current_time(db: Session = Depends(get_db)):
    """現在のシミュレーション時刻を取得する"""
    try:
        service = SimulationService(db)
        current_time = service.get_current_time()

        return {
            "success": True,
            "data": {
                "current_time": current_time.isoformat() if current_time else None,
            },
        }
    except Exception as e:
        logger.error(f"get_current_time error : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/advance-time")
async def advance_time(
    request: AdvanceTimeRequest,
    db: Session = Depends(get_db),
):
    """シミュレーション時刻を進める"""
    try:
        service = SimulationService(db)
        result = service.advance_time(request.new_time)

        if "error" in result:
            logger.warning(f"時刻更新エラー: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        return {
            "success": True,
            "data": result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"advance_time error : {e}")
        raise HTTPException(status_code=500, detail=str(e))
