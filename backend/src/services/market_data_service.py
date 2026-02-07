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

from datetime import datetime, timedelta
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
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
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
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
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

        各時間足（W1, D1, H1, M10）のデータ開始日、終了日、レコード数を取得。
        シミュレーション開始日の選択時に使用する。

        Returns:
            dict: データ範囲情報
                - start_date (str|None): 全体の開始日（ISO形式）
                - end_date (str|None): 全体の終了日（ISO形式）
                - timeframes (dict): 各時間足の範囲情報
        """
        timeframes = {}

        for tf in ["W1", "D1", "H1", "M10"]:
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
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）

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
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
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

    def get_candle_at_time(self, timeframe: str, current_time: datetime):
        """
        指定時刻のローソク足（OHLC）を取得する

        予約注文の約定チェックに使用。
        指定時刻以前の最新のローソク足を返す。

        Args:
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
            current_time (datetime): シミュレーション時刻

        Returns:
            Optional[Candle]: ローソク足オブジェクト、データがない場合はNone
        """
        return (
            self.db.query(Candle)
            .filter(Candle.timeframe == timeframe)
            .filter(Candle.timestamp <= current_time)
            .order_by(Candle.timestamp.desc())
            .first()
        )

    def calculate_candle_start_time(self, timeframe: str, current_time: datetime) -> datetime:
        """
        ローソク足の開始時刻を計算する

        各時間足に応じて、現在時刻を含むローソク足の開始時刻を計算する。
        最新のローソク足を動的生成する際に使用する。

        Args:
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
            current_time (datetime): 現在時刻（シミュレーション時刻）

        Returns:
            datetime: ローソク足の開始時刻

        Examples:
            >>> # 1時間足の場合（12:30 → 12:00）
            >>> calculate_candle_start_time('H1', datetime(2024, 12, 30, 12, 30))
            datetime(2024, 12, 30, 12, 0)

            >>> # 日足の場合（12:30 → 7:00）
            >>> calculate_candle_start_time('D1', datetime(2024, 12, 30, 12, 30))
            datetime(2024, 12, 30, 7, 0)

            >>> # 週足の場合（月曜日を週の開始とする）
            >>> calculate_candle_start_time('W1', datetime(2024, 12, 30, 12, 30))
            datetime(2024, 12, 30, 7, 0)  # 月曜日7:00
        """
        if timeframe == 'M10':
            # 10分足: 現在時刻の10分単位の開始時刻（例：12:35 → 12:30）
            minute = (current_time.minute // 10) * 10
            return current_time.replace(minute=minute, second=0, microsecond=0)
        elif timeframe == 'H1':
            # 1時間足: 現在時刻の「時」の開始時刻（例：12:30 → 12:00）
            return current_time.replace(minute=0, second=0, microsecond=0)
        elif timeframe == 'D1':
            # 日足: 現在日の開始時刻（7:00）
            day_start = current_time.replace(hour=7, minute=0, second=0, microsecond=0)
            if current_time.hour < 7:
                # 7:00より前の場合は前日の7:00
                day_start -= timedelta(days=1)
            return day_start
        elif timeframe == 'W1':
            # 週足: 現在週の開始時刻（月曜日7:00）
            # ISO週定義: 月曜日を週の開始とする
            days_since_monday = current_time.weekday()  # 月曜=0, 日曜=6
            week_start = current_time - timedelta(days=days_since_monday)
            week_start = week_start.replace(hour=7, minute=0, second=0, microsecond=0)
            if current_time.weekday() == 0 and current_time.hour < 7:
                # 月曜日の7:00より前の場合は前週の月曜日7:00
                week_start -= timedelta(days=7)
            return week_start
        else:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

    def generate_partial_candle(
        self,
        timeframe: str,
        start_time: datetime,
        current_time: datetime,
    ) -> Optional[dict]:
        """
        部分的なローソク足を動的に生成する

        指定された時間足の最新のローソク足を、より細かい時間足のデータから集約して生成する。
        start_time から current_time までのデータのみを使用する。

        集約元の時間足:
        - H1（1時間足）: M10（10分足）から集約
        - D1（日足）: H1（1時間足）から集約
        - W1（週足）: D1（日足）から集約

        Args:
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
            start_time (datetime): ローソク足の開始時刻
            current_time (datetime): 現在時刻（この時刻までのデータを使用）

        Returns:
            Optional[dict]: ローソク足データ（timestamp, open, high, low, close, volume）
                元データが0件の場合はNone

        Examples:
            >>> # 1時間足の12:00台を12:00〜12:30のデータから生成
            >>> generate_partial_candle('H1', datetime(2024, 12, 30, 12, 0), datetime(2024, 12, 30, 12, 30))
            {
                'timestamp': '2024-12-30T12:00:00',
                'open': 145.50,
                'high': 145.80,
                'low': 145.30,
                'close': 145.65,
                'volume': 12500
            }
        """
        # 集約元の時間足を決定
        if timeframe == 'H1':
            source_timeframe = 'M10'  # 10分足から集約
        elif timeframe == 'D1':
            source_timeframe = 'H1'   # 1時間足から集約
        elif timeframe == 'W1':
            source_timeframe = 'D1'   # 日足から集約
        elif timeframe == 'M10':
            # 10分足は最小単位なので、部分的な生成は不要
            # DBから直接取得したデータをそのまま使用
            return None
        else:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        # start_time 〜 current_time の元データを取得
        source_candles = (
            self.db.query(Candle)
            .filter(Candle.timeframe == source_timeframe)
            .filter(Candle.timestamp >= start_time)
            .filter(Candle.timestamp <= current_time)
            .order_by(Candle.timestamp.asc())
            .all()
        )

        # 元データが0件の場合はNoneを返す
        if not source_candles:
            return None

        # OHLCを計算
        return {
            'timestamp': start_time.isoformat(),
            'open': float(source_candles[0].open),              # 最初のデータの始値
            'high': float(max(c.high for c in source_candles)), # 全データの高値の最大値
            'low': float(min(c.low for c in source_candles)),   # 全データの安値の最小値
            'close': float(source_candles[-1].close),           # 最後のデータの終値
            'volume': sum(c.volume for c in source_candles)     # 全データの出来高の合計
        }

    def get_candles_with_partial_last(
        self,
        timeframe: str,
        current_time: datetime,
        limit: int = 100,
    ) -> list[dict]:
        """
        最新のローソク足を部分的に生成して返す（未来データ非表示対応）

        指定時刻より前のローソク足データを取得し、最新のローソク足のみを
        current_time までのデータで動的に生成する。

        これにより、上位時間足で未来のデータが表示されることを防ぐ。
        例：current_time が 12:30 の場合、1時間足の 12:00 台のローソク足は
        12:00〜12:30 のデータのみから生成される。

        Args:
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
            current_time (datetime): シミュレーション時刻
            limit (int, optional): 取得件数上限。デフォルトは100

        Returns:
            list[dict]: ローソク足データのリスト（時系列順）
                最新のローソク足は動的生成されたもの

        Examples:
            >>> # 1時間足を取得（current_time = 12:30）
            >>> get_candles_with_partial_last('H1', datetime(2024, 12, 30, 12, 30), limit=10)
            [
                # 11:00台までは完全なOHLC
                {'timestamp': '2024-12-30T11:00:00', 'open': 145.20, ...},
                # 12:00台は12:00〜12:30のみのOHLC（動的生成）
                {'timestamp': '2024-12-30T12:00:00', 'open': 145.50, ...}
            ]
        """
        # 10分足は最小単位なので、動的生成は不要（既存ロジックをそのまま使用）
        if timeframe == 'M10':
            return self.get_candles_before(timeframe, current_time, limit)

        # 1. 最新のローソク足の開始時刻を計算
        latest_candle_start = self.calculate_candle_start_time(timeframe, current_time)

        # 2. current_time以前の全てのローソク足を取得（旧APIと同じ）
        all_candles = self.get_candles_before(timeframe, current_time, limit)

        if not all_candles:
            # データが0件の場合、最新のローソク足のみを生成して返す
            partial_candle = self.generate_partial_candle(timeframe, latest_candle_start, current_time)
            return [partial_candle] if partial_candle else []

        # 2.5. 日足の場合、タイムスタンプが7:00未満のローソク足の時刻を7:00に調整
        # （日付は変更しない - FXの日足は7:00 JSTから始まるため）
        if timeframe == 'D1':
            adjusted_candles = []
            for c in all_candles:
                candle_time = datetime.fromisoformat(c['timestamp'])
                # タイムスタンプが7:00未満の場合、同日の7:00に調整
                # 例：4/1 0:00 → 4/1 7:00（日付は変えない）
                if candle_time.hour < 7:
                    adjusted_time = candle_time.replace(hour=7, minute=0, second=0, microsecond=0)
                    c_adjusted = c.copy()
                    c_adjusted['timestamp'] = adjusted_time.isoformat()
                    adjusted_candles.append(c_adjusted)
                else:
                    adjusted_candles.append(c)
            all_candles = adjusted_candles

        # 3. 最新のローソク足をリストから除外
        # （DBに存在する場合、未来データを含む完全なOHLCなので除外する）
        latest_candle_start_iso = latest_candle_start.isoformat()
        filtered_candles = [c for c in all_candles if c['timestamp'] != latest_candle_start_iso]

        # 4. 最新のローソク足を10分足から動的生成
        partial_candle = self.generate_partial_candle(timeframe, latest_candle_start, current_time)

        # 5. 最新のローソク足を追加（Noneでない場合）
        if partial_candle:
            filtered_candles.append(partial_candle)

        return filtered_candles
