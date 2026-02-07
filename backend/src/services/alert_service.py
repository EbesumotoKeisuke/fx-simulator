"""
自動アラートサービス

トレード中のリアルタイムアラート機能を提供する。
連敗、ロットサイズ異常、時間帯パフォーマンス等を監視し、
感情的なトレードや過度なリスクを防止するためのアラートを生成する。

使用例:
    service = AlertService(db)
    alerts = service.check_alerts()
"""

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
import uuid

from src.models.simulation import Simulation
from src.models.account import Account
from src.models.trade import Trade
from src.models.position import Position


class AlertService:
    """
    自動アラートサービスクラス

    トレード状況を監視し、注意が必要な状況でアラートを生成する。

    Attributes:
        db (Session): SQLAlchemyデータベースセッション
    """

    # アラート重要度
    SEVERITY_INFO = "info"
    SEVERITY_WARNING = "warning"
    SEVERITY_DANGER = "danger"

    # デフォルト設定
    DEFAULT_CONSECUTIVE_LOSS_WARNING = 3
    DEFAULT_CONSECUTIVE_LOSS_DANGER = 5
    DEFAULT_LOT_SIZE_MULTIPLIER = 2.0
    DEFAULT_MARGIN_USAGE_DANGER = 0.5  # 50%
    DEFAULT_DAILY_LOSS_DANGER = 0.05  # 5%
    DEFAULT_TRADING_INTERVAL_MINUTES = 5
    DEFAULT_LOW_WINRATE_THRESHOLD = 40  # 40%

    def __init__(self, db: Session):
        """
        AlertServiceを初期化する

        Args:
            db (Session): SQLAlchemyデータベースセッション
        """
        self.db = db

    def _get_active_simulation(self) -> Optional[Simulation]:
        """アクティブなシミュレーションを取得する"""
        return (
            self.db.query(Simulation)
            .filter(Simulation.status.in_(["running", "paused"]))
            .order_by(Simulation.created_at.desc())
            .first()
        )

    def check_alerts(self, lot_size: float = None) -> List[Dict[str, Any]]:
        """
        現在のトレード状況に基づいてアラートを生成する

        Args:
            lot_size: 注文しようとしているロットサイズ（オプション）

        Returns:
            List[Dict]: アラートのリスト
                - id: アラートID
                - type: 重要度 (info/warning/danger)
                - message: アラートメッセージ
                - category: アラートカテゴリ
                - timestamp: 生成時刻
        """
        simulation = self._get_active_simulation()
        if not simulation:
            return []

        alerts = []

        # 連敗チェック
        alerts.extend(self._check_consecutive_losses(simulation.id))

        # 本日の損失チェック
        alerts.extend(self._check_daily_loss(simulation))

        # ドローダウンチェック
        alerts.extend(self._check_drawdown(simulation.id))

        # トレード間隔チェック
        alerts.extend(self._check_trading_interval(simulation.id))

        # ロットサイズチェック（注文時のみ）
        if lot_size is not None:
            alerts.extend(self._check_lot_size(simulation.id, lot_size))

        # 時間帯チェック
        alerts.extend(self._check_time_performance(simulation))

        return alerts

    def _check_consecutive_losses(self, simulation_id: str) -> List[Dict[str, Any]]:
        """連敗をチェックする"""
        alerts = []

        # 最近のトレードを取得（新しい順）
        recent_trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation_id)
            .order_by(desc(Trade.closed_at))
            .limit(10)
            .all()
        )

        if not recent_trades:
            return alerts

        # 連敗数をカウント
        consecutive_losses = 0
        for trade in recent_trades:
            if float(trade.realized_pnl) < 0:
                consecutive_losses += 1
            else:
                break

        # アラート生成
        if consecutive_losses >= self.DEFAULT_CONSECUTIVE_LOSS_DANGER:
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": self.SEVERITY_DANGER,
                "message": f"{consecutive_losses}連敗中です。一度休憩を取ることをお勧めします",
                "category": "consecutive_loss",
                "timestamp": datetime.now().isoformat(),
            })
        elif consecutive_losses >= self.DEFAULT_CONSECUTIVE_LOSS_WARNING:
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": self.SEVERITY_WARNING,
                "message": f"本日{consecutive_losses}連敗しています。冷静に判断していますか？",
                "category": "consecutive_loss",
                "timestamp": datetime.now().isoformat(),
            })

        return alerts

    def _check_daily_loss(self, simulation: Simulation) -> List[Dict[str, Any]]:
        """本日の損失をチェックする"""
        alerts = []

        # 口座情報を取得
        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation.id)
            .first()
        )

        if not account:
            return alerts

        # 本日のトレードを取得
        # シミュレーション時刻の当日を使用
        sim_date = simulation.current_time.date()
        today_start = datetime.combine(sim_date, datetime.min.time())
        today_end = datetime.combine(sim_date, datetime.max.time())

        today_trades = (
            self.db.query(Trade)
            .filter(
                and_(
                    Trade.simulation_id == simulation.id,
                    Trade.closed_at >= today_start,
                    Trade.closed_at <= today_end,
                )
            )
            .all()
        )

        if not today_trades:
            return alerts

        # 本日の損失を計算
        today_pnl = sum(float(t.realized_pnl) for t in today_trades)
        initial_balance = float(account.initial_balance)

        if today_pnl < 0:
            loss_percent = abs(today_pnl) / initial_balance

            if loss_percent >= self.DEFAULT_DAILY_LOSS_DANGER:
                alerts.append({
                    "id": str(uuid.uuid4()),
                    "type": self.SEVERITY_DANGER,
                    "message": f"本日の損失が{loss_percent * 100:.1f}%に達しました",
                    "category": "daily_loss",
                    "timestamp": datetime.now().isoformat(),
                })

        return alerts

    def _check_drawdown(self, simulation_id: str) -> List[Dict[str, Any]]:
        """ドローダウンをチェックする"""
        alerts = []

        # 口座情報を取得
        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation_id)
            .first()
        )

        if not account:
            return alerts

        # トレード履歴を取得
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation_id)
            .order_by(Trade.closed_at)
            .all()
        )

        if not trades:
            return alerts

        # 資産推移を計算してドローダウンを求める
        initial_balance = float(account.initial_balance)
        current_balance = initial_balance
        peak_equity = initial_balance

        for trade in trades:
            current_balance += float(trade.realized_pnl)
            if current_balance > peak_equity:
                peak_equity = current_balance

        # 現在のドローダウンを計算
        drawdown = peak_equity - current_balance
        drawdown_percent = (drawdown / peak_equity) if peak_equity > 0 else 0

        if drawdown_percent >= 0.10:  # 10%以上
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": self.SEVERITY_DANGER,
                "message": f"ドローダウンが{drawdown_percent * 100:.1f}%を超えました",
                "category": "drawdown",
                "timestamp": datetime.now().isoformat(),
            })

        return alerts

    def _check_trading_interval(self, simulation_id: str) -> List[Dict[str, Any]]:
        """トレード間隔をチェックする"""
        alerts = []

        # 最後のトレードを取得
        last_trade = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation_id)
            .order_by(desc(Trade.closed_at))
            .first()
        )

        if not last_trade:
            return alerts

        # シミュレーションの現在時刻を取得
        simulation = (
            self.db.query(Simulation)
            .filter(Simulation.id == simulation_id)
            .first()
        )

        if not simulation:
            return alerts

        # 前回トレードからの時間差を計算
        time_diff = simulation.current_time - last_trade.closed_at
        minutes_since_last_trade = time_diff.total_seconds() / 60

        # 前回が損切りかどうかを確認
        was_loss = float(last_trade.realized_pnl) < 0

        if minutes_since_last_trade < self.DEFAULT_TRADING_INTERVAL_MINUTES:
            if was_loss:
                alerts.append({
                    "id": str(uuid.uuid4()),
                    "type": self.SEVERITY_WARNING,
                    "message": "損切り直後です。感情的になっていませんか？",
                    "category": "trading_interval",
                    "timestamp": datetime.now().isoformat(),
                })
            else:
                alerts.append({
                    "id": str(uuid.uuid4()),
                    "type": self.SEVERITY_WARNING,
                    "message": f"前回のトレードから{int(minutes_since_last_trade)}分しか経っていません",
                    "category": "trading_interval",
                    "timestamp": datetime.now().isoformat(),
                })

        return alerts

    def _check_lot_size(self, simulation_id: str, lot_size: float) -> List[Dict[str, Any]]:
        """ロットサイズをチェックする"""
        alerts = []

        # 過去のトレードの平均ロットサイズを計算
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation_id)
            .all()
        )

        if len(trades) >= 3:
            avg_lot_size = sum(float(t.lot_size) for t in trades) / len(trades)

            if lot_size >= avg_lot_size * self.DEFAULT_LOT_SIZE_MULTIPLIER:
                alerts.append({
                    "id": str(uuid.uuid4()),
                    "type": self.SEVERITY_WARNING,
                    "message": f"通常より大きいロットサイズです（平均: {avg_lot_size:.2f}ロット）",
                    "category": "lot_size",
                    "timestamp": datetime.now().isoformat(),
                })

        # 口座情報を取得して証拠金使用率をチェック
        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation_id)
            .first()
        )

        if account:
            # 簡易的な証拠金計算（レバレッジ25倍、1ロット=10万通貨）
            # 実際の価格は現在価格が必要だが、ここでは概算
            estimated_margin = lot_size * 100000 / 25
            equity = float(account.equity)

            if equity > 0 and estimated_margin / equity >= self.DEFAULT_MARGIN_USAGE_DANGER:
                alerts.append({
                    "id": str(uuid.uuid4()),
                    "type": self.SEVERITY_DANGER,
                    "message": "証拠金の50%以上を使用する注文です",
                    "category": "margin_usage",
                    "timestamp": datetime.now().isoformat(),
                })

        return alerts

    def _check_time_performance(self, simulation: Simulation) -> List[Dict[str, Any]]:
        """時間帯のパフォーマンスをチェックする"""
        alerts = []

        # 現在の時間帯を取得
        current_hour = simulation.current_time.hour

        # この時間帯のトレードを取得
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation.id)
            .all()
        )

        if len(trades) < 10:
            return alerts  # データが少なすぎる場合はスキップ

        # 時間帯別の勝率を計算
        hour_trades = [
            t for t in trades
            if t.opened_at and t.opened_at.hour == current_hour
        ]

        if len(hour_trades) >= 5:
            wins = sum(1 for t in hour_trades if float(t.realized_pnl) > 0)
            winrate = (wins / len(hour_trades)) * 100

            if winrate < self.DEFAULT_LOW_WINRATE_THRESHOLD:
                alerts.append({
                    "id": str(uuid.uuid4()),
                    "type": self.SEVERITY_INFO,
                    "message": f"この時間帯（{current_hour}時台）の勝率は{winrate:.0f}%です",
                    "category": "time_performance",
                    "timestamp": datetime.now().isoformat(),
                })

        # 週末チェック
        day_of_week = simulation.current_time.weekday()
        hour = simulation.current_time.hour

        # 金曜日の22時以降
        if day_of_week == 4 and hour >= 22:
            hours_to_close = 24 - hour + 6  # 土曜5:50頃クローズ
            alerts.append({
                "id": str(uuid.uuid4()),
                "type": self.SEVERITY_INFO,
                "message": f"週末クローズまで残り約{hours_to_close}時間です",
                "category": "weekend_warning",
                "timestamp": datetime.now().isoformat(),
            })

        return alerts

    def get_trade_analysis_summary(self) -> Dict[str, Any]:
        """
        トレード分析サマリーを取得する
        Claude MCPから呼び出される想定

        Returns:
            Dict: 分析サマリー
        """
        simulation = self._get_active_simulation()
        if not simulation:
            # 最新の停止済みシミュレーションを取得
            simulation = (
                self.db.query(Simulation)
                .order_by(desc(Simulation.created_at))
                .first()
            )

        if not simulation:
            return {"error": "シミュレーションが見つかりません"}

        # 全トレードを取得
        trades = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation.id)
            .order_by(Trade.closed_at)
            .all()
        )

        if not trades:
            return {"error": "トレードデータがありません"}

        # 時間帯別分析
        hour_stats = {}
        for trade in trades:
            if trade.opened_at:
                hour = trade.opened_at.hour
                if hour not in hour_stats:
                    hour_stats[hour] = {"wins": 0, "losses": 0, "pnl": 0}

                if float(trade.realized_pnl) > 0:
                    hour_stats[hour]["wins"] += 1
                else:
                    hour_stats[hour]["losses"] += 1
                hour_stats[hour]["pnl"] += float(trade.realized_pnl)

        # 時間帯別勝率を計算
        hour_winrates = {}
        for hour, stats in hour_stats.items():
            total = stats["wins"] + stats["losses"]
            if total > 0:
                hour_winrates[hour] = {
                    "winrate": round(stats["wins"] / total * 100, 1),
                    "total_trades": total,
                    "pnl": round(stats["pnl"], 2),
                }

        # ベスト/ワースト時間帯
        best_hour = max(hour_winrates.items(), key=lambda x: x[1]["winrate"]) if hour_winrates else None
        worst_hour = min(hour_winrates.items(), key=lambda x: x[1]["winrate"]) if hour_winrates else None

        # 連敗パターン分析
        max_consecutive_losses = 0
        current_losses = 0
        loss_after_loss_count = 0
        prev_was_loss = False

        for trade in trades:
            is_loss = float(trade.realized_pnl) < 0
            if is_loss:
                current_losses += 1
                max_consecutive_losses = max(max_consecutive_losses, current_losses)
                if prev_was_loss:
                    loss_after_loss_count += 1
            else:
                current_losses = 0
            prev_was_loss = is_loss

        # 改善提案を生成
        suggestions = []

        if worst_hour:
            hour, stats = worst_hour
            if stats["winrate"] < 40:
                suggestions.append({
                    "category": "時間帯",
                    "issue": f"{hour}時台の勝率が{stats['winrate']}%と低い",
                    "suggestion": f"{hour}時台のトレードを避けるか、より慎重に判断することを検討してください",
                })

        if max_consecutive_losses >= 3:
            suggestions.append({
                "category": "連敗",
                "issue": f"最大{max_consecutive_losses}連敗のパターンがある",
                "suggestion": "3連敗後は一時的にトレードを控え、冷静になる時間を取りましょう",
            })

        # 損益バランス分析
        winning_trades = [t for t in trades if float(t.realized_pnl) > 0]
        losing_trades = [t for t in trades if float(t.realized_pnl) < 0]

        if winning_trades and losing_trades:
            avg_win = sum(float(t.realized_pnl) for t in winning_trades) / len(winning_trades)
            avg_loss = abs(sum(float(t.realized_pnl) for t in losing_trades) / len(losing_trades))

            if avg_win < avg_loss:
                suggestions.append({
                    "category": "リスクリワード",
                    "issue": f"平均利益({avg_win:.0f}円)が平均損失({avg_loss:.0f}円)より小さい",
                    "suggestion": "利確幅を広げるか、損切り幅を狭くしてリスクリワード比を改善しましょう",
                })

        return {
            "simulation_id": str(simulation.id),
            "total_trades": len(trades),
            "hour_analysis": hour_winrates,
            "best_hour": {"hour": best_hour[0], **best_hour[1]} if best_hour else None,
            "worst_hour": {"hour": worst_hour[0], **worst_hour[1]} if worst_hour else None,
            "max_consecutive_losses": max_consecutive_losses,
            "suggestions": suggestions,
        }
