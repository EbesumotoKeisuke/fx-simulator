#!/usr/bin/env python3
"""trading_service.get_pending_orders()を直接テストする"""
import sys
sys.path.insert(0, '/c/Users/smile/Desktop/05_invest/fx-simulator/backend')

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.services.trading_service import TradingService
from src.utils.database import Base
import os

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://fx_user:fx_password@localhost:5432/fx_simulator")
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
db = Session()

print("=== TradingService.get_pending_orders() を直接呼び出し ===")
service = TradingService(db)

# アクティブなシミュレーションを確認
sim = service._get_active_simulation()
print(f"Active simulation: {sim.id if sim else None}")
print(f"Simulation status: {sim.status if sim else None}")

# get_pending_ordersを呼び出し
result = service.get_pending_orders(50, 0, None)
print(f"\nResult type: {type(result)}")
print(f"Result: {result}")

# statusフィルター付きで呼び出し
result_pending = service.get_pending_orders(50, 0, "pending")
print(f"\nResult (status='pending') type: {type(result_pending)}")
print(f"Result (status='pending'): {result_pending}")

db.close()
