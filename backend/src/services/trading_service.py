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
from src.models.pending_order import PendingOrder
from src.services.market_data_service import MarketDataService
from src.utils.logger import get_logger

logger = get_logger(__name__)


# 1ロットあたりの通貨単位（100,000通貨 = 1スタンダードロット）
LOT_UNIT = 100000
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

    def _get_latest_simulation(self) -> Optional[Simulation]:
        """
        最新のシミュレーションを取得する（内部メソッド）

        アクティブなシミュレーションを優先し、なければ停止済みを含む最新のシミュレーションを返す。
        結果表示やトレード履歴取得で使用する。

        Returns:
            Optional[Simulation]: 最新のシミュレーション、存在しない場合はNone
        """
        # まずアクティブなシミュレーションを探す
        active = self._get_active_simulation()
        if active:
            return active

        # アクティブなシミュレーションがなければ、停止済みを含む最新のシミュレーションを返す
        return (
            self.db.query(Simulation)
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

    def _calculate_required_margin(self, price: float, lot_size: float) -> float:
        """
        必要証拠金を計算する（内部メソッド）

        Args:
            price (float): 価格
            lot_size (float): ロットサイズ

        Returns:
            float: 必要証拠金（円）
        """
        # 1ロット = 100,000通貨
        # レバレッジ = 25倍（日本の最大レバレッジ）
        # 必要証拠金 = (価格 × ロット数 × 100,000) / 25
        CURRENCY_PER_LOT = 100000
        LEVERAGE = 25
        return (price * lot_size * CURRENCY_PER_LOT) / LEVERAGE

    def _get_total_used_margin(self, simulation_id: str) -> float:
        """
        使用中の証拠金合計を計算する（内部メソッド）

        Args:
            simulation_id (str): シミュレーションID

        Returns:
            float: 使用証拠金合計（円）
        """
        # 保有中のポジションを取得
        open_positions = (
            self.db.query(Position)
            .filter(Position.simulation_id == simulation_id)
            .filter(Position.status == "open")
            .all()
        )

        total_margin = 0.0
        for pos in open_positions:
            # 各ポジションの必要証拠金を計算
            margin = self._calculate_required_margin(
                float(pos.entry_price), float(pos.lot_size)
            )
            total_margin += margin

        return total_margin

    def create_order(
        self,
        side: str,
        lot_size: float,
        sl_price: Optional[float] = None,
        tp_price: Optional[float] = None,
        sl_pips: Optional[float] = None,
        tp_pips: Optional[float] = None,
    ) -> dict:
        """
        成行注文を作成する

        指定されたサイド（買い/売り）とロットサイズで成行注文を作成し、
        同時にポジションを開く。シミュレーションが実行中でない場合はエラー。

        Args:
            side (str): 'buy'（買い）または 'sell'（売り）
            lot_size (float): ロットサイズ（0.01〜1.0）
            sl_price (float, optional): 損切り価格（絶対価格）
            tp_price (float, optional): 利確価格（絶対価格）
            sl_pips (float, optional): 損切りpips（エントリー価格からの相対値）
            tp_pips (float, optional): 利確pips（エントリー価格からの相対値）

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

        # 証拠金チェック
        # 新規ポジションの必要証拠金を計算
        required_margin = self._calculate_required_margin(current_price, lot_size)

        # 現在の使用証拠金を計算
        used_margin = self._get_total_used_margin(simulation.id)

        # 合計証拠金が口座残高を超えないかチェック
        total_required_margin = used_margin + required_margin
        if total_required_margin > float(account.balance):
            return {
                "error": f"証拠金不足: 必要証拠金 ¥{int(total_required_margin):,} > 残高 ¥{int(account.balance):,}"
            }

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

        # SL/TP設定
        if sl_price is not None:
            position.sl_price = Decimal(str(sl_price))
            # sl_priceからsl_pipsを計算
            if side == "buy":
                position.sl_pips = Decimal(str((sl_price - current_price) / PIPS_UNIT))
            else:
                position.sl_pips = Decimal(str((current_price - sl_price) / PIPS_UNIT))
        elif sl_pips is not None:
            position.sl_pips = Decimal(str(sl_pips))
            # sl_pipsからsl_priceを計算
            if side == "buy":
                position.sl_price = Decimal(str(current_price + (sl_pips * PIPS_UNIT)))
            else:
                position.sl_price = Decimal(str(current_price - (sl_pips * PIPS_UNIT)))

        if tp_price is not None:
            position.tp_price = Decimal(str(tp_price))
            # tp_priceからtp_pipsを計算
            if side == "buy":
                position.tp_pips = Decimal(str((tp_price - current_price) / PIPS_UNIT))
            else:
                position.tp_pips = Decimal(str((current_price - tp_price) / PIPS_UNIT))
        elif tp_pips is not None:
            position.tp_pips = Decimal(str(tp_pips))
            # tp_pipsからtp_priceを計算
            if side == "buy":
                position.tp_price = Decimal(str(current_price + (tp_pips * PIPS_UNIT)))
            else:
                position.tp_price = Decimal(str(current_price - (tp_pips * PIPS_UNIT)))

        self.db.add(position)
        self.db.commit()

        logger.info(f"注文を作成しました: order_id={order.id}, side={side}, lot_size={lot_size}, entry_price={current_price}")

        return {
            "order_id": str(order.id),
            "position_id": str(position.id),
            "side": side,
            "lot_size": lot_size,
            "entry_price": current_price,
            "executed_at": order.executed_at.isoformat(),
            "sl_price": float(position.sl_price) if position.sl_price else None,
            "tp_price": float(position.tp_price) if position.tp_price else None,
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
                "sl_price": float(p.sl_price) if p.sl_price else None,
                "tp_price": float(p.tp_price) if p.tp_price else None,
                "sl_pips": float(p.sl_pips) if p.sl_pips else None,
                "tp_pips": float(p.tp_pips) if p.tp_pips else None,
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

        # 連敗カウント更新
        # 損失トレード → カウント+1
        # 30pips以上の利益 → リセット
        # 30pips未満の利益 → 維持
        if pnl_pips < 0:
            account.consecutive_losses += 1
        elif pnl_pips >= 30:
            account.consecutive_losses = 0
        # 0 <= pnl_pips < 30 の場合は何もしない（維持）

        self.db.commit()

        logger.info(f"ポジションを決済しました: position_id={position.id}, pnl={realized_pnl:.2f}円 ({pnl_pips:.1f}pips)")

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
        停止済みのシミュレーションも含めて最新のシミュレーションから取得する。

        Returns:
            dict: 口座情報を含む辞書
                - balance (float): 口座残高
                - equity (float): 有効証拠金（残高 + 含み損益）
                - unrealized_pnl (float): 含み損益
                - realized_pnl (float): 確定損益
                - initial_balance (float): 初期資金
        """
        simulation = self._get_latest_simulation()
        if not simulation:
            return {
                "balance": 0,
                "equity": 0,
                "unrealized_pnl": 0,
                "realized_pnl": 0,
                "initial_balance": 0,
                "margin_used": 0,
                "margin_available": 0,
                "consecutive_losses": 0,
            }

        account = self._get_account(simulation.id)
        if not account:
            return {
                "balance": 0,
                "equity": 0,
                "unrealized_pnl": 0,
                "realized_pnl": 0,
                "initial_balance": 0,
                "margin_used": 0,
                "margin_available": 0,
                "consecutive_losses": 0,
            }

        # 含み損益を計算
        positions_data = self.get_positions()
        unrealized_pnl = positions_data["total_unrealized_pnl"]

        # 有効証拠金 = 残高 + 含み損益
        equity = float(account.balance) + unrealized_pnl

        # 口座のequityを更新
        account.equity = Decimal(str(round(equity, 2)))
        self.db.commit()

        # 使用証拠金を計算（両建て対応）
        # 買いと売りのポジションを分けて計算し、大きい方のマージンを使用
        CURRENCY_PER_LOT = 100000  # 1ロット = 100,000通貨
        LEVERAGE = 25  # レバレッジ25倍
        buy_margin = 0.0
        sell_margin = 0.0
        for position in positions_data["positions"]:
            margin = (position["entry_price"] * position["lot_size"] * CURRENCY_PER_LOT) / LEVERAGE
            if position["side"] == "buy":
                buy_margin += margin
            else:  # sell
                sell_margin += margin

        # 両建ての場合、大きい方のポジションのマージンを使用
        margin_used = max(buy_margin, sell_margin)

        # 利用可能証拠金 = 有効証拠金 - 使用証拠金
        margin_available = equity - margin_used

        return {
            "balance": float(account.balance),
            "equity": round(equity, 2),
            "unrealized_pnl": unrealized_pnl,
            "realized_pnl": float(account.realized_pnl),
            "initial_balance": float(account.initial_balance),
            "margin_used": round(margin_used, 2),
            "margin_available": round(margin_available, 2),
            "consecutive_losses": account.consecutive_losses,
        }

    def get_trades(self, limit: int = 50, offset: int = 0) -> dict:
        """
        トレード履歴を取得する

        決済済みのトレード履歴をページネーション付きで取得する。
        決済時刻の降順でソートされる。
        停止済みのシミュレーションも含めて最新のシミュレーションから取得する。

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
        simulation = self._get_latest_simulation()
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

    def create_pending_order(
        self, order_type: str, side: str, lot_size: float, trigger_price: float
    ) -> dict:
        """
        予約注文（指値・逆指値）を作成する

        Args:
            order_type (str): 'limit'（指値）または 'stop'（逆指値）
            side (str): 'buy'（買い）または 'sell'（売り）
            lot_size (float): ロットサイズ（0.01〜100.0）
            trigger_price (float): トリガー価格

        Returns:
            dict: 予約注文結果を含む辞書
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        if simulation.status not in ["running", "paused"]:
            return {"error": "Simulation is not running or paused"}

        # 予約注文を作成
        pending_order = PendingOrder(
            simulation_id=simulation.id,
            order_type=order_type,
            side=side,
            lot_size=Decimal(str(lot_size)),
            trigger_price=Decimal(str(trigger_price)),
            status="pending",
        )
        self.db.add(pending_order)
        self.db.commit()

        return {
            "order_id": str(pending_order.id),
            "order_type": order_type,
            "side": side,
            "lot_size": lot_size,
            "trigger_price": trigger_price,
            "status": "pending",
            "created_at": pending_order.created_at.isoformat(),
        }

    def get_pending_orders(
        self, limit: int = 50, offset: int = 0, status: Optional[str] = None
    ) -> dict:
        """
        未約定の予約注文一覧を取得する

        Args:
            limit (int, optional): 取得件数上限。デフォルトは50
            offset (int, optional): 取得開始位置。デフォルトは0
            status (str, optional): 状態フィルター（pending, executed, cancelled）

        Returns:
            dict: 予約注文一覧を含む辞書
        """
        # 停止済みのシミュレーションも含む最新のシミュレーションを取得
        # これにより、終了後の予約注文の確認（cancelledステータスなど）が可能
        simulation = self._get_latest_simulation()
        if not simulation:
            return {"orders": [], "total": 0}

        query = (
            self.db.query(PendingOrder)
            .filter(PendingOrder.simulation_id == simulation.id)
            .order_by(PendingOrder.created_at.desc())
        )

        if status:
            query = query.filter(PendingOrder.status == status)

        total = query.count()
        orders = query.offset(offset).limit(limit).all()

        return {
            "orders": [
                {
                    "order_id": str(o.id),
                    "order_type": o.order_type,
                    "side": o.side,
                    "lot_size": float(o.lot_size),
                    "trigger_price": float(o.trigger_price),
                    "status": o.status,
                    "created_at": o.created_at.isoformat(),
                }
                for o in orders
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get_pending_order(self, order_id: str) -> dict:
        """
        未約定注文の詳細を取得する

        Args:
            order_id (str): 注文ID

        Returns:
            dict: 予約注文詳細を含む辞書
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        order = (
            self.db.query(PendingOrder)
            .filter(PendingOrder.id == order_id)
            .filter(PendingOrder.simulation_id == simulation.id)
            .first()
        )

        if not order:
            return {"error": "Pending order not found"}

        return {
            "order_id": str(order.id),
            "order_type": order.order_type,
            "side": order.side,
            "lot_size": float(order.lot_size),
            "trigger_price": float(order.trigger_price),
            "status": order.status,
            "created_at": order.created_at.isoformat(),
            "executed_at": order.executed_at.isoformat() if order.executed_at else None,
            "updated_at": order.updated_at.isoformat(),
        }

    def update_pending_order(
        self,
        order_id: str,
        lot_size: Optional[float] = None,
        trigger_price: Optional[float] = None,
    ) -> dict:
        """
        未約定注文の内容を変更する

        Args:
            order_id (str): 注文ID
            lot_size (float, optional): 新しいロットサイズ
            trigger_price (float, optional): 新しいトリガー価格

        Returns:
            dict: 更新後の予約注文を含む辞書
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        order = (
            self.db.query(PendingOrder)
            .filter(PendingOrder.id == order_id)
            .filter(PendingOrder.simulation_id == simulation.id)
            .filter(PendingOrder.status == "pending")
            .first()
        )

        if not order:
            return {"error": "Pending order not found or already executed/cancelled"}

        # 更新
        if lot_size is not None:
            order.lot_size = Decimal(str(lot_size))
        if trigger_price is not None:
            order.trigger_price = Decimal(str(trigger_price))

        order.updated_at = datetime.now()
        self.db.commit()

        return {
            "order_id": str(order.id),
            "order_type": order.order_type,
            "side": order.side,
            "lot_size": float(order.lot_size),
            "trigger_price": float(order.trigger_price),
            "status": order.status,
            "updated_at": order.updated_at.isoformat(),
        }

    def cancel_pending_order(self, order_id: str) -> dict:
        """
        未約定注文をキャンセルする

        Args:
            order_id (str): 注文ID

        Returns:
            dict: キャンセル結果を含む辞書
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        order = (
            self.db.query(PendingOrder)
            .filter(PendingOrder.id == order_id)
            .filter(PendingOrder.simulation_id == simulation.id)
            .filter(PendingOrder.status == "pending")
            .first()
        )

        if not order:
            return {"error": "Pending order not found or already executed/cancelled"}

        # キャンセル
        order.status = "cancelled"
        order.updated_at = datetime.now()
        self.db.commit()

        return {
            "order_id": str(order.id),
            "status": "cancelled",
            "cancelled_at": order.updated_at.isoformat(),
        }

    def check_pending_orders_execution(self, simulation_id: str, current_time: datetime):
        """
        未約定注文の約定チェックを行う

        シミュレーション時刻が更新されるたびに呼ばれ、
        10分足ローソク足のOHLCを使って約定条件を満たす予約注文を執行する。

        Args:
            simulation_id (str): シミュレーションID
            current_time (datetime): 現在のシミュレーション時刻
        """
        # pending状態の予約注文を取得
        pending_orders = (
            self.db.query(PendingOrder)
            .filter(PendingOrder.simulation_id == simulation_id)
            .filter(PendingOrder.status == "pending")
            .all()
        )

        if not pending_orders:
            return

        # 現在時刻の10分足ローソク足を取得
        candle = self.market_data_service.get_candle_at_time("M10", current_time)
        if not candle:
            return

        open_price = float(candle.open)
        high_price = float(candle.high)
        low_price = float(candle.low)
        close_price = float(candle.close)

        for pending_order in pending_orders:
            trigger_price = float(pending_order.trigger_price)
            should_execute = False

            # 約定条件チェック
            if pending_order.order_type == "limit":
                if pending_order.side == "buy":
                    # 指値買い: 安値がトリガー価格以下
                    should_execute = low_price <= trigger_price
                else:  # sell
                    # 指値売り: 高値がトリガー価格以上
                    should_execute = high_price >= trigger_price
            else:  # stop
                if pending_order.side == "buy":
                    # 逆指値買い: 高値がトリガー価格以上
                    should_execute = high_price >= trigger_price
                else:  # sell
                    # 逆指値売り: 安値がトリガー価格以下
                    should_execute = low_price <= trigger_price

            if should_execute:
                # 注文を作成
                order = Order(
                    simulation_id=simulation_id,
                    side=pending_order.side,
                    lot_size=pending_order.lot_size,
                    entry_price=pending_order.trigger_price,
                    executed_at=current_time,
                )
                self.db.add(order)
                self.db.flush()

                # ポジションを作成
                position = Position(
                    simulation_id=simulation_id,
                    order_id=order.id,
                    side=pending_order.side,
                    lot_size=pending_order.lot_size,
                    entry_price=pending_order.trigger_price,
                    status="open",
                    opened_at=current_time,
                )
                self.db.add(position)

                # 予約注文を実行済みに変更
                pending_order.status = "executed"
                pending_order.executed_at = current_time
                pending_order.updated_at = current_time

        self.db.commit()

    def set_sltp(
        self,
        position_id: str,
        sl_price: Optional[float] = None,
        tp_price: Optional[float] = None,
        sl_pips: Optional[float] = None,
        tp_pips: Optional[float] = None,
    ) -> dict:
        """
        ポジションにSL/TPを設定する

        Args:
            position_id (str): ポジションID
            sl_price (float, optional): 損切り価格（絶対価格）
            tp_price (float, optional): 利確価格（絶対価格）
            sl_pips (float, optional): 損切りpips（エントリー価格からの相対値）
            tp_pips (float, optional): 利確pips（エントリー価格からの相対値）

        Returns:
            dict: 設定結果を含む辞書
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        position = (
            self.db.query(Position)
            .filter(Position.id == position_id)
            .filter(Position.simulation_id == simulation.id)
            .filter(Position.status == "open")
            .first()
        )

        if not position:
            return {"error": "Position not found or already closed"}

        # sl_priceとsl_pipsが両方指定されている場合はエラー
        if sl_price is not None and sl_pips is not None:
            return {"error": "Cannot specify both sl_price and sl_pips"}

        # tp_priceとtp_pipsが両方指定されている場合はエラー
        if tp_price is not None and tp_pips is not None:
            return {"error": "Cannot specify both tp_price and tp_pips"}

        entry_price = float(position.entry_price)

        # SL設定
        if sl_price is not None:
            position.sl_price = Decimal(str(sl_price))
            # sl_priceからsl_pipsを計算
            if position.side == "buy":
                position.sl_pips = Decimal(str((sl_price - entry_price) / PIPS_UNIT))
            else:
                position.sl_pips = Decimal(str((entry_price - sl_price) / PIPS_UNIT))
        elif sl_pips is not None:
            position.sl_pips = Decimal(str(sl_pips))
            # sl_pipsからsl_priceを計算
            if position.side == "buy":
                position.sl_price = Decimal(str(entry_price + (sl_pips * PIPS_UNIT)))
            else:
                position.sl_price = Decimal(str(entry_price - (sl_pips * PIPS_UNIT)))
        else:
            # nullを指定してSLを削除
            position.sl_price = None
            position.sl_pips = None

        # TP設定
        if tp_price is not None:
            position.tp_price = Decimal(str(tp_price))
            # tp_priceからtp_pipsを計算
            if position.side == "buy":
                position.tp_pips = Decimal(str((tp_price - entry_price) / PIPS_UNIT))
            else:
                position.tp_pips = Decimal(str((entry_price - tp_price) / PIPS_UNIT))
        elif tp_pips is not None:
            position.tp_pips = Decimal(str(tp_pips))
            # tp_pipsからtp_priceを計算
            if position.side == "buy":
                position.tp_price = Decimal(str(entry_price + (tp_pips * PIPS_UNIT)))
            else:
                position.tp_price = Decimal(str(entry_price - (tp_pips * PIPS_UNIT)))
        else:
            # nullを指定してTPを削除
            position.tp_price = None
            position.tp_pips = None

        self.db.commit()

        return {
            "position_id": str(position.id),
            "sl_price": float(position.sl_price) if position.sl_price else None,
            "tp_price": float(position.tp_price) if position.tp_price else None,
            "sl_pips": float(position.sl_pips) if position.sl_pips else None,
            "tp_pips": float(position.tp_pips) if position.tp_pips else None,
            "updated_at": datetime.now().isoformat(),
        }

    def check_sltp_triggers(self, simulation_id: str, current_time: datetime):
        """
        SL/TPの判定を行う

        シミュレーション時刻が更新されるたびに呼ばれ、
        10分足ローソク足のOHLCを使ってSL/TPの発動条件を満たすポジションを決済する。

        同一ローソク足でSLとTPの両方が満たされた場合は、エラーを返す。

        Args:
            simulation_id (str): シミュレーションID
            current_time (datetime): 現在のシミュレーション時刻

        Returns:
            dict: 判定結果
                - triggered_positions (list): 発動したポジションのリスト
                - conflict_positions (list): SLとTPが同時発動したポジションのリスト（ユーザー選択が必要）
        """
        # オープン状態でSLまたはTPが設定されているポジションを取得
        positions = (
            self.db.query(Position)
            .filter(Position.simulation_id == simulation_id)
            .filter(Position.status == "open")
            .filter((Position.sl_price.isnot(None)) | (Position.tp_price.isnot(None)))
            .all()
        )

        if not positions:
            return {"triggered_positions": [], "conflict_positions": []}

        # 現在時刻の10分足ローソク足を取得
        candle = self.market_data_service.get_candle_at_time("M10", current_time)
        if not candle:
            return {"triggered_positions": [], "conflict_positions": []}

        open_price = float(candle.open)
        high_price = float(candle.high)
        low_price = float(candle.low)
        close_price = float(candle.close)

        triggered_positions = []
        conflict_positions = []

        for position in positions:
            sl_triggered = False
            tp_triggered = False

            # SL判定
            if position.sl_price:
                sl_price = float(position.sl_price)
                if position.side == "buy":
                    # 買いポジションのSL: 安値がSL価格以下
                    sl_triggered = low_price <= sl_price
                else:  # sell
                    # 売りポジションのSL: 高値がSL価格以上
                    sl_triggered = high_price >= sl_price

            # TP判定
            if position.tp_price:
                tp_price = float(position.tp_price)
                if position.side == "buy":
                    # 買いポジションのTP: 高値がTP価格以上
                    tp_triggered = high_price >= tp_price
                else:  # sell
                    # 売りポジションのTP: 安値がTP価格以下
                    tp_triggered = low_price <= tp_price

            # 同時発動チェック
            if sl_triggered and tp_triggered:
                conflict_positions.append({
                    "position_id": str(position.id),
                    "side": position.side,
                    "entry_price": float(position.entry_price),
                    "sl_price": float(position.sl_price) if position.sl_price else None,
                    "tp_price": float(position.tp_price) if position.tp_price else None,
                })
            elif sl_triggered:
                # SL発動 - ポジションを決済
                exit_price = float(position.sl_price)
                self._close_position_with_price(position, exit_price, current_time)
                triggered_positions.append({
                    "position_id": str(position.id),
                    "trigger_type": "sl",
                    "exit_price": exit_price,
                })
            elif tp_triggered:
                # TP発動 - ポジションを決済
                exit_price = float(position.tp_price)
                self._close_position_with_price(position, exit_price, current_time)
                triggered_positions.append({
                    "position_id": str(position.id),
                    "trigger_type": "tp",
                    "exit_price": exit_price,
                })

        if triggered_positions or conflict_positions:
            self.db.commit()

        return {
            "triggered_positions": triggered_positions,
            "conflict_positions": conflict_positions,
        }

    def _close_position_with_price(self, position: Position, exit_price: float, current_time: datetime):
        """
        指定された価格でポジションを決済する（内部メソッド）

        Args:
            position (Position): 決済するポジション
            exit_price (float): 決済価格
            current_time (datetime): 決済時刻
        """
        entry_price = float(position.entry_price)

        # 損益計算
        if position.side == "buy":
            pnl_pips = (exit_price - entry_price) / PIPS_UNIT
        else:
            pnl_pips = (entry_price - exit_price) / PIPS_UNIT

        realized_pnl = pnl_pips * float(position.lot_size) * LOT_UNIT * PIPS_UNIT

        # ポジションを閉じる
        position.status = "closed"
        position.closed_at = current_time

        # トレード履歴を作成
        trade = Trade(
            simulation_id=position.simulation_id,
            position_id=position.id,
            side=position.side,
            lot_size=position.lot_size,
            entry_price=position.entry_price,
            exit_price=Decimal(str(exit_price)),
            realized_pnl=Decimal(str(round(realized_pnl, 2))),
            realized_pnl_pips=Decimal(str(round(pnl_pips, 1))),
            opened_at=position.opened_at,
            closed_at=current_time,
        )
        self.db.add(trade)

        # 口座残高を更新
        account = self._get_account(position.simulation_id)
        if account:
            account.balance += Decimal(str(round(realized_pnl, 2)))
            account.realized_pnl += Decimal(str(round(realized_pnl, 2)))

            # 連敗カウント更新
            # 損失トレード → カウント+1
            # 30pips以上の利益 → リセット
            # 30pips未満の利益 → 維持
            if pnl_pips < 0:
                account.consecutive_losses += 1
            elif pnl_pips >= 30:
                account.consecutive_losses = 0
            # 0 <= pnl_pips < 30 の場合は何もしない（維持）
