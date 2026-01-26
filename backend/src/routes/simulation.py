from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.utils.database import get_db
from src.services.simulation_service import SimulationService

router = APIRouter()


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


@router.post("/stop")
async def stop_simulation(db: Session = Depends(get_db)):
    """シミュレーションを終了する"""
    service = SimulationService(db)
    result = service.stop()

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


@router.post("/pause")
async def pause_simulation(db: Session = Depends(get_db)):
    """シミュレーションを一時停止する"""
    service = SimulationService(db)
    result = service.pause()

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


@router.post("/resume")
async def resume_simulation(db: Session = Depends(get_db)):
    """シミュレーションを再開する"""
    service = SimulationService(db)
    result = service.resume()

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


@router.put("/speed")
async def update_speed(
    request: SimulationSpeedRequest,
    db: Session = Depends(get_db),
):
    """再生速度を変更する"""
    if request.speed < 0.5 or request.speed > 10.0:
        raise HTTPException(
            status_code=400,
            detail="Speed must be between 0.5 and 10.0",
        )

    service = SimulationService(db)
    result = service.set_speed(request.speed)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }


@router.get("/status")
async def get_status(db: Session = Depends(get_db)):
    """シミュレーション状態を取得する"""
    service = SimulationService(db)
    result = service.get_status()

    return {
        "success": True,
        "data": result,
    }


@router.get("/current-time")
async def get_current_time(db: Session = Depends(get_db)):
    """現在のシミュレーション時刻を取得する"""
    service = SimulationService(db)
    current_time = service.get_current_time()

    return {
        "success": True,
        "data": {
            "current_time": current_time.isoformat() if current_time else None,
        },
    }


@router.post("/advance-time")
async def advance_time(
    request: AdvanceTimeRequest,
    db: Session = Depends(get_db),
):
    """シミュレーション時刻を進める"""
    service = SimulationService(db)
    result = service.advance_time(request.new_time)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return {
        "success": True,
        "data": result,
    }
