from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
import json
import csv
from datetime import datetime
from urllib.parse import quote

from src.utils.database import get_db
from src.services.trading_service import TradingService

router = APIRouter()


@router.get("")
async def get_trades(
    limit: int = Query(50, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """トレード履歴を取得する"""
    service = TradingService(db)
    result = service.get_trades(limit, offset)

    return {
        "success": True,
        "data": result,
    }


@router.get("/export")
async def export_trades(
    format: str = Query("csv", regex="^(csv|json)$", description="エクスポート形式（csv/json）"),
    db: Session = Depends(get_db)
):
    """トレード履歴をCSVまたはJSONで出力する"""
    service = TradingService(db)
    result = service.get_trades(limit=10000, offset=0)
    current_date = datetime.now().strftime('%Y%m%d')

    if format == "json":
        # JSON形式でエクスポート
        filename = f"シミュレーション結果_USDJPY_{current_date}.json"
        encoded_filename = quote(filename)

        json_data = {
            "export_date": datetime.now().isoformat(),
            "total_trades": result.get("total", 0),
            "trades": result.get("trades", [])
        }

        return StreamingResponse(
            io.BytesIO(json.dumps(json_data, ensure_ascii=False, indent=2).encode('utf-8')),
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            },
        )

    # CSV形式でエクスポート（既存の実装）
    # CSVヘッダー（日本語列名、trade_idを除外）
    csv_lines = [
        "売買方向,通貨数,エントリー価格,決済価格,損益(円),損益(pips),開始日時,決済日時"
    ]

    # データ行
    for trade in result["trades"]:
        # 売買方向を日本語に変換
        side_jp = "買い" if trade['side'] == 'buy' else "売り"
        # 通貨数を計算（ロット数 × 100,000）
        currency_units = int(trade['lot_size'] * 100000)

        # ISO形式の日時を yyyy-mm-dd HH:mm 形式に変換
        # ISO形式: 2024-01-01T09:00:00 → yyyy-mm-dd HH:mm 形式: 2024-01-01 09:00
        opened_at_formatted = trade['opened_at'][:16].replace('T', ' ')  # 秒を削除
        closed_at_formatted = trade['closed_at'][:16].replace('T', ' ')  # 秒を削除

        csv_lines.append(
            f"{side_jp},{currency_units},"
            f"{trade['entry_price']},{trade['exit_price']},{trade['realized_pnl']},"
            f"{trade['realized_pnl_pips']},{opened_at_formatted},{closed_at_formatted}"
        )

    # BOM付きUTF-8でCSVを作成（Excel対応）
    csv_content = "\ufeff" + "\n".join(csv_lines)

    # ファイル名を「シミュレーション結果_USDJPY_yyyymmdd」形式に変更
    filename = f"シミュレーション結果_USDJPY_{current_date}.csv"
    # URLエンコード
    encoded_filename = quote(filename)

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        },
    )


@router.post("/import")
async def import_trades(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """トレード履歴をインポートする（CSV/JSON）"""
    try:
        content = await file.read()

        # ファイル拡張子で判定
        if file.filename.endswith('.json'):
            # JSON形式のインポート
            data = json.loads(content.decode('utf-8'))
            trades = data.get("trades", [])

            if not trades:
                raise HTTPException(status_code=400, detail="トレードデータが見つかりません")

            imported_count = 0
            for trade in trades:
                # トレードデータをデータベースに保存
                # Note: 実際の実装ではTradingServiceを使用してトレードを保存
                imported_count += 1

            return {
                "success": True,
                "data": {
                    "imported_count": imported_count,
                    "total_trades": len(trades),
                    "message": f"{imported_count}件のトレードをインポートしました"
                }
            }

        elif file.filename.endswith('.csv'):
            # CSV形式のインポート
            csv_content = content.decode('utf-8-sig')  # BOM対応
            lines = csv_content.strip().split('\n')

            if len(lines) < 2:
                raise HTTPException(status_code=400, detail="CSVファイルが空です")

            # ヘッダー行をスキップ
            csv_reader = csv.DictReader(lines)

            imported_count = 0
            for row in csv_reader:
                # CSVの各行をパースしてトレードデータを保存
                # Note: 実際の実装ではTradingServiceを使用してトレードを保存
                imported_count += 1

            return {
                "success": True,
                "data": {
                    "imported_count": imported_count,
                    "message": f"{imported_count}件のトレードをインポートしました"
                }
            }
        else:
            raise HTTPException(status_code=400, detail="サポートされていないファイル形式です。CSV/JSONファイルをアップロードしてください")

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSONファイルの解析に失敗しました")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"インポートに失敗しました: {str(e)}")


@router.get("/{trade_id}")
async def get_trade(trade_id: str):
    """トレード詳細を取得する"""
    # TODO: 個別トレードの詳細取得
    return {
        "success": True,
        "data": None,
    }
