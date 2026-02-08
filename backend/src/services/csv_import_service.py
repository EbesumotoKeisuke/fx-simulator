"""
CSVインポートサービス

CSVファイルからローソク足データをデータベースにインポートする。
各時間足（週足、日足、1時間足、10分足）に対応したCSVファイルを読み込み、
PostgreSQLのUPSERT機能を使用して重複データを更新する。

使用例:
    service = CSVImportService(db)
    # 日足データをインポート
    result = service.import_csv('D1')
    # すべての時間足をインポート
    results = service.import_all()
"""

import os
from datetime import datetime
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from src.models.candle import Candle


# CSVファイルと時間足のマッピング
# key: 時間足コード, value: CSVファイル名
CSV_FILES = {
    "W1": "fx_data_USDJPY_weekly_technical_indicator.csv",  # 週足
    "D1": "fx_data_USDJPY_technical_indicator.csv",       # 日足
    "H1": "fx_data_USDJPY_1hour_technical_indicator.csv", # 1時間足
    "M10": "fx_data_USDJPY_10minutes_technical_indicator.csv",  # 10分足
}

# データディレクトリのパス（環境変数で上書き可能）
DATA_DIR = os.getenv("DATA_DIR", "/app/data")


class CSVImportService:
    """
    CSVインポートサービスクラス

    CSVファイルからローソク足データを読み込み、データベースに保存する。
    既存データがある場合はUPSERT（INSERT ON CONFLICT UPDATE）で更新する。

    Attributes:
        db (Session): SQLAlchemyデータベースセッション
    """

    def __init__(self, db: Session):
        """
        CSVImportServiceを初期化する

        Args:
            db (Session): SQLAlchemyデータベースセッション
        """
        self.db = db

    def get_csv_path(self, timeframe: str) -> Optional[str]:
        """
        時間足に対応するCSVファイルのパスを取得する

        Args:
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）

        Returns:
            Optional[str]: CSVファイルの絶対パス、不明な時間足の場合はNone
        """
        filename = CSV_FILES.get(timeframe)
        if not filename:
            return None
        return os.path.join(DATA_DIR, filename)

    def import_csv(self, timeframe: str) -> dict:
        """
        CSVファイルからデータをインポートする

        指定された時間足のCSVファイルを読み込み、データベースに保存する。
        既存のデータがある場合はUPSERTで更新される。

        CSVファイルの必須カラム:
            - time: タイムスタンプ
            - open: 始値
            - high: 高値
            - low: 安値
            - close: 終値
            - Volume: 出来高

        Args:
            timeframe (str): 時間足（'W1', 'D1', 'H1', 'M10'）

        Returns:
            dict: インポート結果
                - timeframe (str): 時間足
                - imported_count (int): インポートしたレコード数
                - start_date (str|None): データ開始日（ISO形式）
                - end_date (str|None): データ終了日（ISO形式）

        Raises:
            ValueError: 不明な時間足が指定された場合
            FileNotFoundError: CSVファイルが存在しない場合
        """
        csv_path = self.get_csv_path(timeframe)
        if not csv_path:
            raise ValueError(f"Unknown timeframe: {timeframe}")

        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"CSV file not found: {csv_path}")

        # CSVを読み込み
        df = pd.read_csv(csv_path)

        # タイムスタンプの変換
        df["timestamp"] = pd.to_datetime(df["time"])
        # タイムゾーン情報がある場合はUTCに変換
        if df["timestamp"].dt.tz is not None:
            df["timestamp"] = df["timestamp"].dt.tz_convert("UTC").dt.tz_localize(None)

        # 必要なカラムのみ抽出（ベクトル化された処理）
        # Volumeの値を安全に変換（数値以外の文字が含まれる場合は除去）
        def clean_volume(vol):
            if pd.isna(vol):
                return 0
            try:
                # 数値型の場合はそのまま使用
                if isinstance(vol, (int, float)):
                    return int(vol)
                # 文字列の場合は数字のみを抽出
                volume_str = str(vol)
                volume_numeric = ''.join(filter(str.isdigit, volume_str))
                return int(volume_numeric) if volume_numeric else 0
            except (ValueError, TypeError):
                return 0

        # ベクトル化された処理で高速化
        df["volume_clean"] = df["Volume"].apply(clean_volume)

        # 必要なカラムのみ選択してレコードを作成
        records = df[[
            "timestamp", "open", "high", "low", "close", "volume_clean"
        ]].rename(columns={"volume_clean": "volume"}).to_dict("records")

        # timeframeを追加
        for record in records:
            record["timeframe"] = timeframe

        # バッチ処理で一括UPSERT（重複は更新）
        # 大量のデータを一度に処理するとメモリを大量に消費するため、
        # 10000件ずつに分割して処理する
        BATCH_SIZE = 10000
        total_records = len(records)

        if records:
            for i in range(0, total_records, BATCH_SIZE):
                batch = records[i:i + BATCH_SIZE]
                stmt = insert(Candle).values(batch)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["timeframe", "timestamp"],
                    set_={
                        "open": stmt.excluded.open,
                        "high": stmt.excluded.high,
                        "low": stmt.excluded.low,
                        "close": stmt.excluded.close,
                        "volume": stmt.excluded.volume,
                    }
                )
                self.db.execute(stmt)

                # 各バッチ後にコミット
                self.db.commit()

                # 進行状況をログ出力
                print(f"Imported {min(i + BATCH_SIZE, total_records)}/{total_records} records for {timeframe}")

        return {
            "timeframe": timeframe,
            "imported_count": len(records),
            "start_date": df["timestamp"].min().isoformat() if len(df) > 0 else None,
            "end_date": df["timestamp"].max().isoformat() if len(df) > 0 else None,
        }

    def import_all(self) -> list[dict]:
        """
        すべての時間足のデータをインポートする

        W1（週足）、D1（日足）、H1（1時間足）、M10（10分足）の全てのCSVファイルを
        順番にインポートする。各時間足で発生したエラーは個別に記録され、
        他の時間足のインポートには影響しない。

        Returns:
            list[dict]: 各時間足のインポート結果リスト
                成功時: timeframe, imported_count, start_date, end_date
                失敗時: timeframe, error
        """
        results = []
        for timeframe in CSV_FILES.keys():
            try:
                result = self.import_csv(timeframe)
                results.append(result)
            except Exception as e:
                results.append({
                    "timeframe": timeframe,
                    "error": str(e),
                })
        return results

    def get_available_files(self) -> list[dict]:
        """
        利用可能なCSVファイルの一覧を取得する

        各時間足のCSVファイルの存在確認とファイルサイズを返す。
        データ管理画面でファイルの配置状況を確認するために使用する。

        Returns:
            list[dict]: ファイル情報のリスト
                - timeframe (str): 時間足
                - filename (str): ファイル名
                - exists (bool): ファイルが存在するか
                - size_bytes (int): ファイルサイズ（バイト）
        """
        files = []
        for timeframe, filename in CSV_FILES.items():
            path = os.path.join(DATA_DIR, filename)
            exists = os.path.exists(path)
            size = os.path.getsize(path) if exists else 0
            files.append({
                "timeframe": timeframe,
                "filename": filename,
                "exists": exists,
                "size_bytes": size,
            })
        return files
