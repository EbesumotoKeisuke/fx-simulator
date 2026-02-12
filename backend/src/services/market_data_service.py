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
from typing import Optional, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.models.candle import Candle
from src.utils.logger import get_logger

logger = get_logger(__name__)


def is_market_open(timestamp: datetime) -> bool:
    """
    FX市場が営業しているかをチェックする

    FX市場の営業時間：
    - 月曜日 7:00 (JST) ～ 土曜日 早朝（概ね6:00-7:00）
    - 日曜日は休場

    Args:
        timestamp: チェックする日時

    Returns:
        bool: 市場が営業している場合True
    """
    # 日曜日は完全に休場
    if timestamp.weekday() == 6:  # Sunday = 6
        return False

    # 土曜日は7:00以降は休場
    if timestamp.weekday() == 5:  # Saturday = 5
        if timestamp.hour >= 7:
            return False

    # 月曜日は7:00より前は休場
    if timestamp.weekday() == 0:  # Monday = 0
        if timestamp.hour < 7:
            return False

    return True


def filter_market_hours(candles: List[Candle], timeframe: str = 'M10') -> List[Candle]:
    """
    市場営業時間外のローソク足データをフィルタリングする

    注意: W1（週足）とD1（日足）は1本のローソク足が長い期間を表すため、
    市場営業時間フィルタリングをスキップする。
    H1（1時間足）とM10（10分足）のみフィルタリングを適用する。

    Args:
        candles: ローソク足データのリスト
        timeframe: 時間足（'W1', 'D1', 'H1', 'M10'）

    Returns:
        List[Candle]: 営業時間内のローソク足データのみのリスト
    """
    # 週足と日足は市場時間フィルタリングをスキップ
    if timeframe in ('W1', 'D1'):
        return candles

    return [c for c in candles if is_market_open(c.timestamp)]


def calculate_ema(prices: list[float], period: int = 20) -> list[Optional[float]]:
    """
    指数移動平均（EMA）を計算する

    EMA = (終値 - 前回EMA) × 乗数 + 前回EMA
    乗数 = 2 / (期間 + 1)

    Args:
        prices (list[float]): 終値のリスト（時系列順）
        period (int): EMAの期間（デフォルト20）

    Returns:
        list[Optional[float]]: EMA値のリスト（最初のperiod-1件はNone）
    """
    if len(prices) < period:
        return [None] * len(prices)

    ema_values: list[Optional[float]] = []
    multiplier = 2 / (period + 1)

    # 最初のEMAは単純移動平均（SMA）で計算
    sma = sum(prices[:period]) / period
    ema_values.extend([None] * (period - 1))
    ema_values.append(sma)

    # 以降はEMA公式で計算
    prev_ema = sma
    for price in prices[period:]:
        ema = (price - prev_ema) * multiplier + prev_ema
        ema_values.append(ema)
        prev_ema = ema

    return ema_values


def add_ema_to_candles(candles: list[dict], period: int = 20) -> list[dict]:
    """
    ローソク足データにEMA値を追加する

    Args:
        candles (list[dict]): ローソク足データのリスト
        period (int): EMAの期間（デフォルト20）

    Returns:
        list[dict]: EMA値（ema20）が追加されたローソク足データのリスト
    """
    if not candles:
        return candles

    # 終値のリストを抽出
    closes = [c['close'] for c in candles]

    # EMAを計算
    ema_values = calculate_ema(closes, period)

    # 各ローソク足にEMA値を追加
    for i, candle in enumerate(candles):
        candle['ema20'] = ema_values[i]

    return candles


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
        日曜日のデータは除外される。

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

        query = query.order_by(Candle.timestamp.asc()).limit(limit * 2)  # 日曜日除外を考慮して多めに取得
        candles = query.all()

        # 市場営業時間外のデータを除外（週足・日足はスキップ）
        candles = filter_market_hours(candles, timeframe)

        # limit件に制限
        candles = candles[:limit]

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
        日曜日のデータは除外される。

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
            .limit(limit * 2)  # 日曜日除外を考慮して多めに取得
        )
        candles = query.all()

        # 市場営業時間外のデータを除外（週足・日足はスキップ）
        candles = filter_market_hours(candles, timeframe)

        # limit件に制限
        candles = candles[:limit]

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

        # 市場営業時間外のデータを除外（週足・日足はスキップ）
        source_candles = filter_market_hours(source_candles, source_timeframe)

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
    ) -> tuple[list[dict], bool]:
        """
        最新のローソク足を部分的に生成して返す（未来データ非表示対応）

        指定時刻より前のローソク足データを取得し、最新のローソク足のみを
        current_time までのデータで動的に生成する。

        これにより、上位時間足で未来のデータが表示されることを防ぐ。
        例：current_time が 12:30 の場合、1時間足の 12:00 台のローソク足は
        12:00〜12:30 のデータのみから生成される。

        H1は常にM10データから動的に生成する。これにより、H1 CSVデータに欠損が
        あっても、M10データが存在する限り正しくチャートが表示される。

        Args:
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）
            current_time (datetime): シミュレーション時刻
            limit (int, optional): 取得件数上限。デフォルトは100

        Returns:
            tuple[list[dict], bool]: (ローソク足データのリスト, データ不足フラグ)
                最新のローソク足は動的生成されたもの
                データ不足フラグは、DBに該当時間足のデータが存在しない場合にTrue

        Examples:
            >>> # 1時間足を取得（current_time = 12:30）
            >>> get_candles_with_partial_last('H1', datetime(2024, 12, 30, 12, 30), limit=10)
            ([
                # 11:00台までは完全なOHLC
                {'timestamp': '2024-12-30T11:00:00', 'open': 145.20, ...},
                # 12:00台は12:00〜12:30のみのOHLC（動的生成）
                {'timestamp': '2024-12-30T12:00:00', 'open': 145.50, ...}
            ], False)
        """
        # 10分足は最小単位なので、動的生成は不要（既存ロジックをそのまま使用）
        if timeframe == 'M10':
            candles = self.get_candles_before(timeframe, current_time, limit)
            return candles, len(candles) == 0

        # H1はDBから取得し、欠損箇所のみM10から補完する
        if timeframe == 'H1':
            return self._get_h1_with_gap_fill(current_time, limit)

        # 1. 最新のローソク足の開始時刻を計算
        latest_candle_start = self.calculate_candle_start_time(timeframe, current_time)

        # 2. current_time以前の全てのローソク足を取得
        all_candles = self.get_candles_before(timeframe, current_time, limit)

        # データ不足フラグ: DBに該当時間足のデータが存在しない場合にTrue
        data_missing = len(all_candles) == 0

        if not all_candles:
            # データが0件の場合、空のリストを返す
            return [], True

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

        return filtered_candles, data_missing

    def _get_h1_with_gap_fill(
        self,
        current_time: datetime,
        limit: int = 100,
    ) -> tuple[list[dict], bool]:
        """
        H1データをDBから取得し、欠損箇所のみM10から補完する

        パフォーマンスを考慮したハイブリッド方式：
        - H1データが存在する箇所は直接DBから取得（高速）
        - H1データが欠損している箇所のみM10から動的生成

        Args:
            current_time (datetime): シミュレーション時刻
            limit (int, optional): 取得件数上限。デフォルトは100

        Returns:
            tuple[list[dict], bool]: (ローソク足データのリスト, データ不足フラグ)
        """
        # 1. まずDBからH1データを取得
        h1_candles = self.get_candles_before('H1', current_time, limit)

        # H1データが0件の場合は全てM10から生成
        if not h1_candles:
            return self._generate_h1_from_m10(current_time, limit)

        # 2. H1データの時間範囲を確認
        h1_timestamps = {c['timestamp'] for c in h1_candles}
        oldest_h1 = datetime.fromisoformat(h1_candles[0]['timestamp'])
        newest_h1 = datetime.fromisoformat(h1_candles[-1]['timestamp'])

        # 3. 期待されるH1タイムスタンプを計算（市場営業時間のみ）
        expected_timestamps = set()
        check_time = oldest_h1
        while check_time <= current_time:
            if is_market_open(check_time):
                expected_timestamps.add(check_time.replace(minute=0, second=0, microsecond=0).isoformat())
            check_time += timedelta(hours=1)

        # 4. 欠損しているタイムスタンプを特定
        missing_timestamps = expected_timestamps - h1_timestamps

        # 欠損がない場合は通常の処理（最新の部分ローソク足のみ更新）
        if not missing_timestamps:
            # 最新のローソク足の開始時刻を計算
            latest_candle_start = self.calculate_candle_start_time('H1', current_time)
            latest_candle_start_iso = latest_candle_start.isoformat()

            # 最新のローソク足をリストから除外
            filtered_candles = [c for c in h1_candles if c['timestamp'] != latest_candle_start_iso]

            # 最新のローソク足を10分足から動的生成
            partial_candle = self.generate_partial_candle('H1', latest_candle_start, current_time)
            if partial_candle:
                filtered_candles.append(partial_candle)

            return filtered_candles, False

        # 5. 欠損がある場合、M10から補完データを生成
        logger.debug(f"[H1] {len(missing_timestamps)}件の欠損を検出、M10から補完")

        # 欠損期間のM10データを取得
        missing_times = [datetime.fromisoformat(ts) for ts in missing_timestamps]
        min_missing = min(missing_times)
        max_missing = max(missing_times) + timedelta(hours=1)  # 1時間分のデータが必要

        m10_candles = (
            self.db.query(Candle)
            .filter(Candle.timeframe == 'M10')
            .filter(Candle.timestamp >= min_missing)
            .filter(Candle.timestamp < max_missing)
            .order_by(Candle.timestamp.asc())
            .all()
        )

        # 市場営業時間外のデータを除外
        m10_candles = filter_market_hours(m10_candles, 'M10')

        # M10データを1時間単位でグループ化してH1を生成
        generated_h1 = {}
        for candle in m10_candles:
            h1_start = candle.timestamp.replace(minute=0, second=0, microsecond=0)
            h1_key = h1_start.isoformat()

            # 欠損しているタイムスタンプのみ生成
            if h1_key not in missing_timestamps:
                continue

            if h1_key not in generated_h1:
                generated_h1[h1_key] = {
                    'timestamp': h1_key,
                    'open': float(candle.open),
                    'high': float(candle.high),
                    'low': float(candle.low),
                    'close': float(candle.close),
                    'volume': candle.volume,
                    '_first_time': candle.timestamp,
                    '_last_time': candle.timestamp,
                }
            else:
                h1 = generated_h1[h1_key]
                if candle.timestamp < h1['_first_time']:
                    h1['open'] = float(candle.open)
                    h1['_first_time'] = candle.timestamp
                if candle.timestamp > h1['_last_time']:
                    h1['close'] = float(candle.close)
                    h1['_last_time'] = candle.timestamp
                h1['high'] = max(h1['high'], float(candle.high))
                h1['low'] = min(h1['low'], float(candle.low))
                h1['volume'] += candle.volume

        # 内部用フィールドを削除
        for h1 in generated_h1.values():
            del h1['_first_time']
            del h1['_last_time']

        # 6. DBデータと生成データをマージ
        all_candles = h1_candles + list(generated_h1.values())

        # タイムスタンプでソート
        all_candles.sort(key=lambda x: x['timestamp'])

        # 7. 最新のローソク足を部分データに置き換え
        latest_candle_start = self.calculate_candle_start_time('H1', current_time)
        latest_candle_start_iso = latest_candle_start.isoformat()

        # 最新のローソク足をリストから除外
        filtered_candles = [c for c in all_candles if c['timestamp'] != latest_candle_start_iso]

        # 最新のローソク足を10分足から動的生成
        partial_candle = self.generate_partial_candle('H1', latest_candle_start, current_time)
        if partial_candle:
            filtered_candles.append(partial_candle)

        # limit件に制限
        if len(filtered_candles) > limit:
            filtered_candles = filtered_candles[-limit:]

        return filtered_candles, False

    def _generate_h1_from_m10(
        self,
        current_time: datetime,
        limit: int = 100,
    ) -> tuple[list[dict], bool]:
        """
        M10データからH1ローソク足を動的に生成する

        H1データがDBに存在しない場合に使用する。
        M10データを1時間単位で集約してH1ローソク足を生成する。

        Args:
            current_time (datetime): シミュレーション時刻
            limit (int, optional): 取得件数上限。デフォルトは100

        Returns:
            tuple[list[dict], bool]: (ローソク足データのリスト, データ不足フラグ)
        """
        # M10データを取得（limit * 6 で1時間分のデータを確保）
        # 例: 100本のH1 = 600本のM10が必要
        m10_candles = (
            self.db.query(Candle)
            .filter(Candle.timeframe == 'M10')
            .filter(Candle.timestamp <= current_time)
            .order_by(Candle.timestamp.desc())
            .limit(limit * 6 * 2)  # 市場時間フィルタリングを考慮して多めに取得
            .all()
        )

        if not m10_candles:
            return [], True

        # 市場営業時間外のデータを除外
        m10_candles = filter_market_hours(m10_candles, 'M10')

        # 時系列順に並び替え
        m10_candles.reverse()

        # M10データを1時間単位でグループ化してH1を生成
        h1_candles = {}
        for candle in m10_candles:
            # 1時間足の開始時刻を計算（分を0に）
            h1_start = candle.timestamp.replace(minute=0, second=0, microsecond=0)
            h1_key = h1_start.isoformat()

            if h1_key not in h1_candles:
                h1_candles[h1_key] = {
                    'timestamp': h1_key,
                    'open': float(candle.open),
                    'high': float(candle.high),
                    'low': float(candle.low),
                    'close': float(candle.close),
                    'volume': candle.volume,
                    '_first_time': candle.timestamp,
                    '_last_time': candle.timestamp,
                }
            else:
                h1 = h1_candles[h1_key]
                # 最初のM10データでopenを設定
                if candle.timestamp < h1['_first_time']:
                    h1['open'] = float(candle.open)
                    h1['_first_time'] = candle.timestamp
                # 最後のM10データでcloseを設定
                if candle.timestamp > h1['_last_time']:
                    h1['close'] = float(candle.close)
                    h1['_last_time'] = candle.timestamp
                # high/lowを更新
                h1['high'] = max(h1['high'], float(candle.high))
                h1['low'] = min(h1['low'], float(candle.low))
                h1['volume'] += candle.volume

        # 内部用フィールドを削除してリストに変換
        result = []
        for h1 in h1_candles.values():
            del h1['_first_time']
            del h1['_last_time']
            result.append(h1)

        # タイムスタンプでソート
        result.sort(key=lambda x: x['timestamp'])

        # 最新のローソク足（現在の時間帯）は部分的なデータ
        # 現在の時間帯の開始時刻を計算
        current_h1_start = current_time.replace(minute=0, second=0, microsecond=0)
        current_h1_key = current_h1_start.isoformat()

        # 現在の時間帯を除外（部分データとして再生成するため）
        result = [c for c in result if c['timestamp'] != current_h1_key]

        # 現在の時間帯の部分ローソク足を生成
        partial_candle = self.generate_partial_candle('H1', current_h1_start, current_time)
        if partial_candle:
            result.append(partial_candle)

        # limit件に制限
        if len(result) > limit:
            result = result[-limit:]

        return result, False
