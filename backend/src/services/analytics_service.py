"""
パフォーマンス分析サービス

トレード履歴と口座情報を元に、パフォーマンス指標を計算する。
勝率、プロフィットファクター、最大ドローダウン、資産曲線等を提供する。

使用例:
    service = AnalyticsService(db)
    performance = service.get_performance_metrics()
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from src.models.simulation import Simulation
from src.models.account import Account
from src.models.trade import Trade
from src.models.position import Position


class AnalyticsService:
    """
    パフォーマンス分析サービスクラス

    トレード履歴を分析し、各種パフォーマンス指標を計算する。

    Attributes:
        db (Session): SQLAlchemyデータベースセッション
    """

    def __init__(self, db: Session):
        """
        AnalyticsServiceを初期化する

        Args:
            db (Session): SQLAlchemyデータベースセッション
        """
        self.db = db

    def _get_active_simulation(self) -> Optional[Simulation]:
        """
        アクティブなシミュレーションを取得する

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
        最新のシミュレーション（停止済み含む）を取得する

        Returns:
            Optional[Simulation]: 最新のシミュレーション、存在しない場合はNone
        """
        return (
            self.db.query(Simulation)
            .order_by(Simulation.created_at.desc())
            .first()
        )

    def get_performance_metrics(self) -> dict:
        """
        パフォーマンス指標を取得する

        Returns:
            dict: パフォーマンス指標を含む辞書
                - basic: 基本指標（勝率、総損益等）
                - risk_return: リスク・リターン指標（PF、RR比等）
                - drawdown: ドローダウン指標
                - consecutive: 連続性指標
                - period: 期間情報
                エラー時は {\"error\": \"エラーメッセージ\"}
        """
        # 最新のシミュレーションを取得
        simulation = self._get_latest_simulation()
        if not simulation:
            return {"error": "No simulation found"}

        # トレード履歴を取得
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation.id)
            .order_by(Trade.closed_at)
            .all()
        )

        if not trades:
            # トレードがない場合はゼロ値を返す
            return {
                "basic": {
                    "win_rate": 0.0,
                    "total_pnl": 0.0,
                    "gross_profit": 0.0,
                    "gross_loss": 0.0,
                    "total_trades": 0,
                    "winning_trades": 0,
                    "losing_trades": 0,
                },
                "risk_return": {
                    "profit_factor": 0.0,
                    "average_win": 0.0,
                    "average_loss": 0.0,
                    "risk_reward_ratio": 0.0,
                    "max_win": 0.0,
                    "max_loss": 0.0,
                    "max_win_pips": 0.0,
                    "max_loss_pips": 0.0,
                },
                "drawdown": {
                    "max_drawdown": 0.0,
                    "max_drawdown_percent": 0.0,
                    "max_drawdown_duration_days": 0,
                },
                "consecutive": {
                    "max_consecutive_wins": 0,
                    "max_consecutive_losses": 0,
                },
                "period": {
                    "start_date": simulation.start_time.isoformat(),
                    "end_date": simulation.current_time.isoformat(),
                    "duration_days": 0,
                },
            }

        # 基本指標の計算
        winning_trades = [t for t in trades if float(t.realized_pnl) > 0]
        losing_trades = [t for t in trades if float(t.realized_pnl) < 0]
        total_trades = len(trades)
        winning_count = len(winning_trades)
        losing_count = len(losing_trades)

        win_rate = (winning_count / total_trades * 100) if total_trades > 0 else 0.0
        total_pnl = sum(float(t.realized_pnl) for t in trades)
        gross_profit = sum(float(t.realized_pnl) for t in winning_trades)
        gross_loss = sum(float(t.realized_pnl) for t in losing_trades)

        # リスク・リターン指標の計算
        average_win = gross_profit / winning_count if winning_count > 0 else 0.0
        average_loss = gross_loss / losing_count if losing_count > 0 else 0.0
        profit_factor = (
            gross_profit / abs(gross_loss) if gross_loss != 0 else 0.0
        )
        risk_reward_ratio = (
            average_win / abs(average_loss) if average_loss != 0 else 0.0
        )

        max_win = max((float(t.realized_pnl) for t in winning_trades), default=0.0)
        max_loss = min((float(t.realized_pnl) for t in losing_trades), default=0.0)
        max_win_pips = max(
            (float(t.realized_pnl_pips) for t in winning_trades), default=0.0
        )
        max_loss_pips = min(
            (float(t.realized_pnl_pips) for t in losing_trades), default=0.0
        )

        # ドローダウン指標の計算
        drawdown_data = self._calculate_drawdown(simulation.id)
        max_drawdown = drawdown_data["max_drawdown"]
        max_drawdown_percent = drawdown_data["max_drawdown_percent"]
        max_drawdown_duration_days = drawdown_data["max_drawdown_duration_days"]

        # 連続性指標の計算
        consecutive_data = self._calculate_consecutive_wins_losses(trades)
        max_consecutive_wins = consecutive_data["max_consecutive_wins"]
        max_consecutive_losses = consecutive_data["max_consecutive_losses"]

        # 期間情報
        duration_days = (simulation.current_time - simulation.start_time).days

        return {
            "basic": {
                "win_rate": round(win_rate, 1),
                "total_pnl": round(total_pnl, 2),
                "gross_profit": round(gross_profit, 2),
                "gross_loss": round(gross_loss, 2),
                "total_trades": total_trades,
                "winning_trades": winning_count,
                "losing_trades": losing_count,
            },
            "risk_return": {
                "profit_factor": round(profit_factor, 2),
                "average_win": round(average_win, 2),
                "average_loss": round(average_loss, 2),
                "risk_reward_ratio": round(risk_reward_ratio, 3),
                "max_win": round(max_win, 2),
                "max_loss": round(max_loss, 2),
                "max_win_pips": round(max_win_pips, 1),
                "max_loss_pips": round(max_loss_pips, 1),
            },
            "drawdown": {
                "max_drawdown": round(max_drawdown, 2),
                "max_drawdown_percent": round(max_drawdown_percent, 2),
                "max_drawdown_duration_days": max_drawdown_duration_days,
            },
            "consecutive": {
                "max_consecutive_wins": max_consecutive_wins,
                "max_consecutive_losses": max_consecutive_losses,
            },
            "period": {
                "start_date": simulation.start_time.isoformat(),
                "end_date": simulation.current_time.isoformat(),
                "duration_days": duration_days,
            },
        }

    def _calculate_consecutive_wins_losses(self, trades: List[Trade]) -> dict:
        """
        最大連勝数と最大連敗数を計算する

        Args:
            trades (List[Trade]): トレード履歴のリスト

        Returns:
            dict: 最大連勝数と最大連敗数を含む辞書
        """
        if not trades:
            return {"max_consecutive_wins": 0, "max_consecutive_losses": 0}

        max_wins = 0
        max_losses = 0
        current_wins = 0
        current_losses = 0

        for trade in trades:
            pnl = float(trade.realized_pnl)
            if pnl > 0:
                current_wins += 1
                current_losses = 0
                max_wins = max(max_wins, current_wins)
            elif pnl < 0:
                current_losses += 1
                current_wins = 0
                max_losses = max(max_losses, current_losses)
            else:
                # 損益ゼロの場合は連続をリセット
                current_wins = 0
                current_losses = 0

        return {
            "max_consecutive_wins": max_wins,
            "max_consecutive_losses": max_losses,
        }

    def _calculate_drawdown(self, simulation_id: str) -> dict:
        """
        ドローダウンを計算する

        Args:
            simulation_id (str): シミュレーションID

        Returns:
            dict: 最大ドローダウン（円・%）と期間を含む辞書
        """
        # 口座情報を取得
        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation_id)
            .first()
        )

        if not account:
            return {
                "max_drawdown": 0.0,
                "max_drawdown_percent": 0.0,
                "max_drawdown_duration_days": 0,
            }

        # トレード履歴を取得
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation_id)
            .order_by(Trade.closed_at)
            .all()
        )

        if not trades:
            return {
                "max_drawdown": 0.0,
                "max_drawdown_percent": 0.0,
                "max_drawdown_duration_days": 0,
            }

        # 資産推移を計算
        initial_balance = float(account.initial_balance)
        equity_points = []
        current_balance = initial_balance

        for trade in trades:
            current_balance += float(trade.realized_pnl)
            equity_points.append({
                "timestamp": trade.closed_at,
                "equity": current_balance,
            })

        # ドローダウンを計算
        max_drawdown = 0.0
        max_drawdown_percent = 0.0
        max_drawdown_duration_days = 0
        peak_equity = initial_balance
        peak_timestamp = None
        drawdown_start_timestamp = None

        for point in equity_points:
            equity = point["equity"]
            timestamp = point["timestamp"]

            if equity > peak_equity:
                # 新しいピークを記録
                peak_equity = equity
                peak_timestamp = timestamp
                drawdown_start_timestamp = None
            else:
                # ドローダウン中
                drawdown = peak_equity - equity
                drawdown_percent = (drawdown / peak_equity * 100) if peak_equity > 0 else 0.0

                if drawdown > max_drawdown:
                    max_drawdown = drawdown
                    max_drawdown_percent = drawdown_percent
                    if drawdown_start_timestamp is None:
                        drawdown_start_timestamp = peak_timestamp
                    if drawdown_start_timestamp:
                        duration = (timestamp - drawdown_start_timestamp).days
                        max_drawdown_duration_days = max(max_drawdown_duration_days, duration)

        return {
            "max_drawdown": -max_drawdown,  # 負の値として返す
            "max_drawdown_percent": -max_drawdown_percent,  # 負の値として返す
            "max_drawdown_duration_days": max_drawdown_duration_days,
        }

    def get_equity_curve(self, interval: str = "trade") -> dict:
        """
        資産曲線データを取得する

        Args:
            interval (str): データ間隔（"trade", "hour", "day"）

        Returns:
            dict: 資産曲線データを含む辞書
                - points: タイムスタンプと資産額のリスト
                - initial_balance: 初期資金
                - final_balance: 最終残高
                エラー時は {\"error\": \"エラーメッセージ\"}
        """
        # 最新のシミュレーションを取得
        simulation = self._get_latest_simulation()
        if not simulation:
            return {"error": "No simulation found"}

        # 口座情報を取得
        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation.id)
            .first()
        )

        if not account:
            return {"error": "No account found"}

        # トレード履歴を取得
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation.id)
            .order_by(Trade.closed_at)
            .all()
        )

        initial_balance = float(account.initial_balance)
        final_balance = float(account.balance)

        # 開始ポイント
        points = [
            {
                "timestamp": simulation.start_time.isoformat(),
                "balance": initial_balance,
                "equity": initial_balance,
                "cumulative_pnl": 0.0,
            }
        ]

        # トレードごとの資産推移を計算
        current_balance = initial_balance
        cumulative_pnl = 0.0

        for trade in trades:
            pnl = float(trade.realized_pnl)
            current_balance += pnl
            cumulative_pnl += pnl

            points.append({
                "timestamp": trade.closed_at.isoformat(),
                "balance": round(current_balance, 2),
                "equity": round(current_balance, 2),
                "cumulative_pnl": round(cumulative_pnl, 2),
            })

        # interval が "hour" または "day" の場合は集約処理が必要
        # 今回はシンプルに "trade" のみ対応
        if interval != "trade":
            # TODO: 時間・日単位での集約実装
            pass

        return {
            "points": points,
            "initial_balance": initial_balance,
            "final_balance": final_balance,
        }

    def get_drawdown_data(self) -> dict:
        """
        ドローダウンデータを取得する（グラフ表示用）

        Returns:
            dict: ドローダウンデータを含む辞書
                - points: タイムスタンプとドローダウンのリスト
                - max_drawdown: 最大ドローダウン
                - max_drawdown_percent: 最大ドローダウン率
                エラー時は {\"error\": \"エラーメッセージ\"}
        """
        # 最新のシミュレーションを取得
        simulation = self._get_latest_simulation()
        if not simulation:
            return {"error": "No simulation found"}

        # 口座情報を取得
        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation.id)
            .first()
        )

        if not account:
            return {"error": "No account found"}

        # トレード履歴を取得
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation.id)
            .order_by(Trade.closed_at)
            .all()
        )

        initial_balance = float(account.initial_balance)

        # 開始ポイント
        points = [
            {
                "timestamp": simulation.start_time.isoformat(),
                "equity": initial_balance,
                "peak_equity": initial_balance,
                "drawdown": 0.0,
                "drawdown_percent": 0.0,
            }
        ]

        # ドローダウンの計算
        current_balance = initial_balance
        peak_equity = initial_balance
        max_drawdown = 0.0
        max_drawdown_percent = 0.0

        for trade in trades:
            pnl = float(trade.realized_pnl)
            current_balance += pnl

            if current_balance > peak_equity:
                peak_equity = current_balance

            drawdown = peak_equity - current_balance
            drawdown_percent = (drawdown / peak_equity * 100) if peak_equity > 0 else 0.0

            if drawdown > max_drawdown:
                max_drawdown = drawdown
                max_drawdown_percent = drawdown_percent

            points.append({
                "timestamp": trade.closed_at.isoformat(),
                "equity": round(current_balance, 2),
                "peak_equity": round(peak_equity, 2),
                "drawdown": round(-drawdown, 2),
                "drawdown_percent": round(-drawdown_percent, 2),
            })

        return {
            "points": points,
            "max_drawdown": round(-max_drawdown, 2),
            "max_drawdown_percent": round(-max_drawdown_percent, 2),
        }
