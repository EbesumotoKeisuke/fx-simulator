from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect

from src.routes import market_data, simulation, orders, positions, account, trades, analytics, alerts, logs
from src.utils.logger import get_logger

# ロガーを初期化
logger = get_logger(__name__)
from src.utils.database import engine, Base
from src.models import candle, simulation as sim_model, account as acc_model, order, position, trade, pending_order


def run_migrations():
    """既存テーブルに対するマイグレーションを実行する"""
    inspector = inspect(engine)

    # accountsテーブルにconsecutive_lossesカラムを追加
    if 'accounts' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('accounts')]
        if 'consecutive_losses' not in columns:
            with engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE accounts ADD COLUMN consecutive_losses INTEGER NOT NULL DEFAULT 0"
                ))
                conn.commit()
                print("Migration: Added consecutive_losses column to accounts table")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 起動時: テーブル作成
    logger.info("アプリケーションを起動しています...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("データベーステーブルを作成しました")
        # マイグレーション実行
        run_migrations()
        logger.info("マイグレーションが完了しました")
        logger.info("FX Trade Simulator API が起動しました")
    except Exception as e:
        logger.critical(f"アプリケーション起動に失敗しました: {e}")
        raise
    yield
    # 終了時
    logger.info("アプリケーションをシャットダウンしています...")


app = FastAPI(
    title="FX Trade Simulator API",
    description="FXトレードシミュレーター用のバックエンドAPI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーターの登録
app.include_router(market_data.router, prefix="/api/v1/market-data", tags=["Market Data"])
app.include_router(simulation.router, prefix="/api/v1/simulation", tags=["Simulation"])
app.include_router(orders.router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(positions.router, prefix="/api/v1/positions", tags=["Positions"])
app.include_router(account.router, prefix="/api/v1/account", tags=["Account"])
app.include_router(trades.router, prefix="/api/v1/trades", tags=["Trades"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["Alerts"])
app.include_router(logs.router, prefix="/api", tags=["Logs"])


@app.get("/")
async def root():
    return {"message": "FX Trade Simulator API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
