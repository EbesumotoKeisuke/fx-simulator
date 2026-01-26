"""
トレーディングサービス

注文の作成、ポジション管理、決済処理、トレード履歴の管理を行う。
シミュレーション内での仮想取引を実現するための中核サービス。

使用例:
    service = TradingService(db)
    # 買い注文を作成
    result = service.create_order(side='buy', lot_size=0.1)
    # ポジションを決済
    result = service.close_position(position_id='xxx-xxx')
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional, List

from sqlalchemy.orm import Session

from src.models.simulation import Simulation
from src.models.account import Account
from src.models.order import Order
from src.models.position import Position
from src.models.trade import Trade
from src.services.market_data_service import MarketDataService


# 1ロットあたりの通貨単位（10,000通貨）
LOT_UNIT = 10000
# pipsの単位（USD/JPYの場合は0.01円 = 1pips）
PIPS_UNIT = 0.01


class TradingService:
    """
    トレーディングサービスクラス

    FX取引の注文、ポジション管理、決済処理を行う。
    損益計算はpips単位と円単位の両方で行う。

    損益計算式:
        pips = (決済価格 - エントリー価格) / PIPS_UNIT  # 買いの場合
        円損益 = pips × ロット数 × LOT_UNIT × PIPS_UNIT

    Attributes:
        db (Session): SQLAlchemyデータベースセッション
        market_data_service (MarketDataService): 市場データ取得サービス
    """

    def __init__(self, db: Session):
        """
        TradingServiceを初期化する

        Args:
            db (Session): SQLAlchemyデータベースセッション
        """
        self.db = db
        self.market_data_service = MarketDataService(db)

    def _get_active_simulation(self) -> Optional[Simulation]:
        """
        アクティブなシミュレーションを取得する（内部メソッド）

        Returns:
            Optional[Simulation]: アクティブなシミュレーション、存在しない場合はNone
        """
        return (
            self.db.query(Simulation)
            .filter(Simulation.status.in_(["created", "running", "paused"]))
            .order_by(Simulation.created_at.desc())
            .first()
        )

    def _get_account(self, simulation_id) -> Optional[Account]:
        """
        シミュレーションに紐づく口座を取得する（内部メソッド）

        Args:
            simulation_id: シミュレーションID

        Returns:
            Optional[Account]: 口座情報、存在しない場合はNone
        """
        return (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation_id)
            .first()
        )

    def _get_current_price(self, simulation: Simulation) -> Optional[float]:
        """
        現在価格を取得する（内部メソッド）

        シミュレーション時刻における10分足の終値を現在価格として返す。

        Args:
            simulation (Simulation): シミュレーションオブジェクト

        Returns:
            Optional[float]: 現在価格、取得できない場合はNone
        """
        return self.market_data_service.get_current_price(
            "M10", simulation.current_time
        )

    def create_order(self, side: str, lot_size: float) -> dict:
        """
        成行注文を作成する

        指定されたサイド（買い/売り）とロットサイズで成行注文を作成し、
        同時にポジションを開く。シミュレーションが実行中でない場合はエラー。

        Args:
            side (str): 'buy'（買い）または 'sell'（売り）
            lot_size (float): ロットサイズ（0.01〜1.0）

        Returns:
            dict: 注文結果を含む辞書
                - order_id (str): 注文ID
                - position_id (str): ポジションID
                - side (str): 売買方向
                - lot_size (float): ロットサイズ
                - entry_price (float): エントリー価格
                - executed_at (str): 約定時刻（ISO形式）
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        if simulation.status not in ["running", "paused"]:
            return {"error": "Simulation is not running or paused"}

        account = self._get_account(simulation.id)
        if not account:
            return {"error": "Account not found"}

        # 現在価格を取得
        current_price = self._get_current_price(simulation)
        if not current_price:
            return {"error": "Could not get current price"}

        # 注文を作成
        order = Order(
            simulation_id=simulation.id,
            side=side,
            lot_size=Decimal(str(lot_size)),
            entry_price=Decimal(str(current_price)),
            executed_at=simulation.current_time,
        )
        self.db.add(order)
        self.db.flush()

        # ポジションを作成
        position = Position(
            simulation_id=simulation.id,
            order_id=order.id,
            side=side,
            lot_size=Decimal(str(lot_size)),
            entry_price=Decimal(str(current_price)),
            status="open",
            opened_at=simulation.current_time,
        )
        self.db.add(position)
        self.db.commit()

        return {
            "order_id": str(order.id),
            "position_id": str(position.id),
            "side": side,
            "lot_size": lot_size,
            "entry_price": current_price,
            "executed_at": order.executed_at.isoformat(),
        }

    def get_orders(self, limit: int = 50, offset: int = 0) -> dict:
        """
        注文履歴を取得する

        アクティブなシミュレーションの注文履歴をページネーション付きで取得する。

        Args:
            limit (int, optional): 取得件数上限。デフォルトは50
            offset (int, optional): 取得開始位置。デフォルトは0

        Returns:
            dict: 注文履歴を含む辞書
                - orders (list): 注文リスト
                - total (int): 総件数
                - limit (int): 取得件数上限
                - offset (int): 取得開始位置
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"orders": [], "total": 0}

        query = (
            self.db.query(Order)
            .filter(Order.simulation_id == simulation.id)
            .order_by(Order.executed_at.desc())
        )
        total = query.count()
        orders = query.offset(offset).limit(limit).all()

        return {
            "orders": [
                {
                    "order_id": str(o.id),
                    "side": o.side,
                    "lot_size": float(o.lot_size),
                    "entry_price": float(o.entry_price),
                    "executed_at": o.executed_at.isoformat(),
                }
                for o in orders
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get_positions(self) -> dict:
        """
        保有ポジション一覧を取得する

        オープン状態のポジション一覧と、現在価格に基づく含み損益を計算して返す。
        含み損益は各ポジションごとのpips損益と円損益、および合計を計算する。

        Returns:
            dict: ポジション情報を含む辞書
                - positions (list): ポジションリスト（各要素に含み損益を含む）
                - total_unrealized_pnl (float): 合計含み損益（円）
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"positions": [], "total_unrealized_pnl": 0}

        current_price = self._get_current_price(simulation)
        if not current_price:
            current_price = 0

        positions = (
            self.db.query(Position)
            .filter(Position.simulation_id == simulation.id)
            .filter(Position.status == "open")
            .order_by(Position.opened_at.desc())
            .all()
        )

        total_unrealized_pnl = Decimal("0")
        position_list = []

        for p in positions:
            entry_price = float(p.entry_price)
            unrealized_pnl_pips = 0
            unrealized_pnl = 0

            if current_price and entry_price:
                if p.side == "buy":
                    unrealized_pnl_pips = (current_price - entry_price) / PIPS_UNIT
                else:
                    unrealized_pnl_pips = (entry_price - current_price) / PIPS_UNIT

                # 損益計算（円）: pips × lot_size × 10000 × 0.01
                unrealized_pnl = unrealized_pnl_pips * float(p.lot_size) * LOT_UNIT * PIPS_UNIT
                total_unrealized_pnl += Decimal(str(unrealized_pnl))

            position_list.append({
                "position_id": str(p.id),
                "side": p.side,
                "lot_size": float(p.lot_size),
                "entry_price": entry_price,
                "current_price": current_price,
                "unrealized_pnl": round(unrealized_pnl, 2),
                "unrealized_pnl_pips": round(unrealized_pnl_pips, 1),
                "opened_at": p.opened_at.isoformat(),
            })

        return {
            "positions": position_list,
            "total_unrealized_pnl": round(float(total_unrealized_pnl), 2),
        }

    def close_position(self, position_id: str) -> dict:
        """
        ポジションを決済する

        指定されたポジションを現在価格で決済し、損益を確定する。
        トレード履歴を作成し、口座残高を更新する。

        Args:
            position_id (str): 決済するポジションのID

        Returns:
            dict: 決済結果を含む辞書
                - position_id (str): ポジションID
                - trade_id (str): トレードID
                - side (str): 売買方向
                - lot_size (float): ロットサイズ
                - entry_price (float): エントリー価格
                - exit_price (float): 決済価格
                - realized_pnl (float): 確定損益（円）
                - realized_pnl_pips (float): 確定損益（pips）
                - closed_at (str): 決済時刻（ISO形式）
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        if simulation.status not in ["running", "paused"]:
            return {"error": "Simulation is not running or paused"}

        position = (
            self.db.query(Position)
            .filter(Position.id == position_id)
            .filter(Position.simulation_id == simulation.id)
            .filter(Position.status == "open")
            .first()
        )

        if not position:
            return {"error": "Position not found"}

        account = self._get_account(simulation.id)
        if not account:
            return {"error": "Account not found"}

        # 現在価格を取得
        current_price = self._get_current_price(simulation)
        if not current_price:
            return {"error": "Could not get current price"}

        # 損益計算
        entry_price = float(position.entry_price)
        if position.side == "buy":
            pnl_pips = (current_price - entry_price) / PIPS_UNIT
        else:
            pnl_pips = (entry_price - current_price) / PIPS_UNIT

        realized_pnl = pnl_pips * float(position.lot_size) * LOT_UNIT * PIPS_UNIT

        # ポジションを閉じる
        position.status = "closed"
        position.closed_at = simulation.current_time

        # トレード履歴を作成
        trade = Trade(
            simulation_id=simulation.id,
            position_id=position.id,
            side=position.side,
            lot_size=position.lot_size,
            entry_price=position.entry_price,
            exit_price=Decimal(str(current_price)),
            realized_pnl=Decimal(str(round(realized_pnl, 2))),
            realized_pnl_pips=Decimal(str(round(pnl_pips, 1))),
            opened_at=position.opened_at,
            closed_at=simulation.current_time,
        )
        self.db.add(trade)

        # 口座残高を更新
        account.balance += Decimal(str(round(realized_pnl, 2)))
        account.realized_pnl += Decimal(str(round(realized_pnl, 2)))

        self.db.commit()

        return {
            "position_id": str(position.id),
            "trade_id": str(trade.id),
            "side": position.side,
            "lot_size": float(position.lot_size),
            "entry_price": entry_price,
            "exit_price": current_price,
            "realized_pnl": round(realized_pnl, 2),
            "realized_pnl_pips": round(pnl_pips, 1),
            "closed_at": simulation.current_time.isoformat(),
        }

    def get_account_info(self) -> dict:
        """
        口座情報を取得する

        残高、有効証拠金、含み損益、確定損益、初期資金を返す。
        有効証拠金は残高に含み損益を加算して計算する。

        Returns:
            dict: 口座情報を含む辞書
                - balance (float): 口座残高
                - equity (float): 有効証拠金（残高 + 含み損益）
                - unrealized_pnl (float): 含み損益
                - realized_pnl (float): 確定損益
                - initial_balance (float): 初期資金
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {
                "balance": 0,
                "equity": 0,
                "unrealized_pnl": 0,
                "realized_pnl": 0,
                "initial_balance": 0,
            }

        account = self._get_account(simulation.id)
        if not account:
            return {
                "balance": 0,
                "equity": 0,
                "unrealized_pnl": 0,
                "realized_pnl": 0,
                "initial_balance": 0,
            }

        # 含み損益を計算
        positions_data = self.get_positions()
        unrealized_pnl = positions_data["total_unrealized_pnl"]

        # 有効証拠金 = 残高 + 含み損益
        equity = float(account.balance) + unrealized_pnl

        # 口座のequityを更新
        account.equity = Decimal(str(round(equity, 2)))
        self.db.commit()

        return {
            "balance": float(account.balance),
            "equity": round(equity, 2),
            "unrealized_pnl": unrealized_pnl,
            "realized_pnl": float(account.realized_pnl),
            "initial_balance": float(account.initial_balance),
        }

    def get_trades(self, limit: int = 50, offset: int = 0) -> dict:
        """
        トレード履歴を取得する

        決済済みのトレード履歴をページネーション付きで取得する。
        決済時刻の降順でソートされる。

        Args:
            limit (int, optional): 取得件数上限。デフォルトは50
            offset (int, optional): 取得開始位置。デフォルトは0

        Returns:
            dict: トレード履歴を含む辞書
                - trades (list): トレードリスト
                - total (int): 総件数
                - limit (int): 取得件数上限
                - offset (int): 取得開始位置
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"trades": [], "total": 0}

        query = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation.id)
            .order_by(Trade.closed_at.desc())
        )
        total = query.count()
        trades = query.offset(offset).limit(limit).all()

        return {
            "trades": [
                {
                    "trade_id": str(t.id),
                    "side": t.side,
                    "lot_size": float(t.lot_size),
                    "entry_price": float(t.entry_price),
                    "exit_price": float(t.exit_price),
                    "realized_pnl": float(t.realized_pnl),
                    "realized_pnl_pips": float(t.realized_pnl_pips),
                    "opened_at": t.opened_at.isoformat(),
                    "closed_at": t.closed_at.isoformat(),
                }
                for t in trades
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
