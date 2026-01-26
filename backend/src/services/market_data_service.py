"""
市場データサービス

ローソク足データの取得を行うサービス。
チャート表示やシミュレーション時の価格取得に使用する。

使用例:
    service = MarketDataService(db)
    # 日足データを100件取得
    candles = service.get_candles('D1', limit=100)
    # 現在価格を取得
    price = service.get_current_price('M10', datetime.now())
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.models.candle import Candle


class MarketDataService:
    """
    市場データサービスクラス

    ローソク足データの取得、日付範囲の確認、現在価格の取得を行う。

    Attributes:
        db (Session): SQLAlchemyデータベースセッション
    """

    def __init__(self, db: Session):
        """
        MarketDataServiceを初期化する

        Args:
            db (Session): SQLAlchemyデータベースセッション
        """
        self.db = db

    def get_candles(
        self,
        timeframe: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[dict]:
        """
        ローソク足データを取得する

        指定された時間足のローソク足データを時系列順（昇順）で取得する。
        開始時刻・終了時刻でフィルタリング可能。

        Args:
            timeframe (str): 時間足（'D1', 'H1', 'M10'）
            start_time (Optional[datetime]): 取得開始時刻（含む）
            end_time (Optional[datetime]): 取得終了時刻（含む）
            limit (int, optional): 取得件数上限。デフォルトは100

        Returns:
            list[dict]: ローソク足データのリスト
                各要素は timestamp, open, high, low, close, volume を含む
        """
        query = self.db.query(Candle).filter(Candle.timeframe == timeframe)

        if start_time:
            query = query.filter(Candle.timestamp >= start_time)
        if end_time:
            query = query.filter(Candle.timestamp <= end_time)

        query = query.order_by(Candle.timestamp.asc()).limit(limit)
        candles = query.all()

        return [
            {
                "timestamp": c.timestamp.isoformat(),
                "open": float(c.open),
                "high": float(c.high),
                "low": float(c.low),
                "close": float(c.close),
                "volume": c.volume,
            }
            for c in candles
        ]

    def get_candles_before(
        self,
        timeframe: str,
        before_time: datetime,
        limit: int = 100,
    ) -> list[dict]:
        """
        指定時刻より前のローソク足データを取得する（シミュレーション用）

        シミュレーション画面でチャートを表示する際に使用。
        指定時刻以前のデータを取得し、時系列順（昇順）で返す。

        Args:
            timeframe (str): 時間足（'D1', 'H1', 'M10'）
            before_time (datetime): この時刻以前のデータを取得
            limit (int, optional): 取得件数上限。デフォルトは100

        Returns:
            list[dict]: ローソク足データのリスト（時系列順）
        """
        query = (
            self.db.query(Candle)
            .filter(Candle.timeframe == timeframe)
            .filter(Candle.timestamp <= before_time)
            .order_by(Candle.timestamp.desc())
            .limit(limit)
        )
        candles = query.all()

        # 時系列順に並び替え
        candles.reverse()

        return [
            {
                "timestamp": c.timestamp.isoformat(),
                "open": float(c.open),
                "high": float(c.high),
                "low": float(c.low),
                "close": float(c.close),
                "volume": c.volume,
            }
            for c in candles
        ]

    def get_date_range(self) -> dict:
        """
        全時間足のデータ範囲を取得する

        各時間足（D1, H1, M10）のデータ開始日、終了日、レコード数を取得。
        シミュレーション開始日の選択時に使用する。

        Returns:
            dict: データ範囲情報
                - start_date (str|None): 全体の開始日（ISO形式）
                - end_date (str|None): 全体の終了日（ISO形式）
                - timeframes (dict): 各時間足の範囲情報
        """
        timeframes = {}

        for tf in ["D1", "H1", "M10"]:
            result = (
                self.db.query(
                    func.min(Candle.timestamp).label("start"),
                    func.max(Candle.timestamp).label("end"),
                    func.count(Candle.id).label("count"),
                )
                .filter(Candle.timeframe == tf)
                .first()
            )

            if result and result.start:
                timeframes[tf] = {
                    "start": result.start.isoformat(),
                    "end": result.end.isoformat(),
                    "count": result.count,
                }

        # 全体の範囲
        overall = (
            self.db.query(
                func.min(Candle.timestamp).label("start"),
                func.max(Candle.timestamp).label("end"),
            )
            .first()
        )

        return {
            "start_date": overall.start.isoformat() if overall and overall.start else None,
            "end_date": overall.end.isoformat() if overall and overall.end else None,
            "timeframes": timeframes,
        }

    def get_candle_count(self, timeframe: str) -> int:
        """
        指定時間足のローソク足数を取得する

        Args:
            timeframe (str): 時間足（'D1', 'H1', 'M10'）

        Returns:
            int: ローソク足の総数
        """
        return self.db.query(Candle).filter(Candle.timeframe == timeframe).count()

    def get_current_price(self, timeframe: str, current_time: datetime) -> Optional[float]:
        """
        指定時刻の終値（現在価格）を取得する

        シミュレーション時刻における最新の終値を現在価格として返す。
        注文の約定価格やポジションの含み損益計算に使用する。

        Args:
            timeframe (str): 時間足（'D1', 'H1', 'M10'）
            current_time (datetime): シミュレーション時刻

        Returns:
            Optional[float]: 終値（現在価格）、データがない場合はNone
        """
        candle = (
            self.db.query(Candle)
            .filter(Candle.timeframe == timeframe)
            .filter(Candle.timestamp <= current_time)
            .order_by(Candle.timestamp.desc())
            .first()
        )
        return float(candle.close) if candle else None
