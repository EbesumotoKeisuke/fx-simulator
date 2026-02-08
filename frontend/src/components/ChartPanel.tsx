import { useEffect, useRef, useCallback, useState } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, MouseEventParams } from 'lightweight-charts'
import { marketDataApi, Candle, ordersApi, tradesApi } from '../services/api'

/**
 * ISO週番号を取得する関数
 * @param date 対象日時
 * @returns ISO週番号（年と週番号を組み合わせた数値）
 */
const getISOWeek = (date: Date): number => {
  const target = new Date(date.valueOf())
  const dayNr = (date.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
  return date.getFullYear() * 100 + weekNumber
}

/**
 * ローソク足の境界を越えたかをチェックする関数
 *
 * F-002: リアルタイムローソク足更新機能
 * 10分足の境界を越えたときに全時間足を更新する。
 * これにより、上位時間足（H1, D1, W1）の最新のローソク足が
 * 10分足が更新されるたびにリアルタイムで更新される。
 *
 * @param timeframe タイムフレーム（参照用、実際の判定には使用しない）
 * @param lastTime 前回の更新時刻
 * @param currentTime 現在の時刻
 * @returns 境界を越えた場合はtrue
 */
const shouldUpdateCandle = (
  timeframe: 'W1' | 'D1' | 'H1' | 'M10',
  lastTime: Date,
  currentTime: Date
): boolean => {
  // 全時間足で10分足の境界を跨いだかチェック
  // 例: 9:05 → 9:10, 9:20 → 9:30
  // 時間が変わった場合も10分境界を跨いだとみなす
  const lastM10 = Math.floor(lastTime.getTime() / (10 * 60 * 1000))
  const currentM10 = Math.floor(currentTime.getTime() / (10 * 60 * 1000))
  return currentM10 > lastM10
}

/**
 * チャートパネルのプロパティ
 */
interface ChartPanelProps {
  /** チャートのタイトル */
  title: string
  /** 時間足（W1: 週足, D1: 日足, H1: 1時間足, M10: 10分足） */
  timeframe: 'W1' | 'D1' | 'H1' | 'M10'
  /** 現在のシミュレーション時刻（この時刻より前のデータを表示） */
  currentTime?: Date
  /** 同期されたクロスヘア位置（他のチャートから） - 時刻 */
  syncedCrosshairTime?: number | string | null
  /** 同期されたクロスヘア位置（他のチャートから） - 価格 */
  syncedCrosshairPrice?: number | null
  /** クロスヘア移動時のコールバック（時刻と価格を通知） */
  onCrosshairMove?: (time: number | string | null, price: number | null) => void
  /** アクティブなチャート（マウスオーバー中のチャート） */
  activeChart?: string | null
  /** アクティブチャート変更時のコールバック */
  onActiveChange?: (chartId: string | null) => void
  /** データ更新トリガー（注文や決済が行われたときに変更される） */
  refreshTrigger?: number
  /** データ不足通知コールバック（DBに該当時間足のデータが存在しない場合に呼ばれる） */
  onDataMissing?: (timeframe: string) => void
}

/**
 * クロスヘア表示用のOHLCデータ
 */
interface OhlcDisplay {
  time: string
  open: number
  high: number
  low: number
  close: number
}

/**
 * チャートパネルコンポーネント
 * lightweight-chartsを使用してローソク足チャートを表示する
 *
 * @param title - チャートタイトル
 * @param timeframe - 表示する時間足
 * @param currentTime - シミュレーション時刻
 * @param syncedCrosshairTime - 同期されたクロスヘア位置
 * @param onCrosshairMove - クロスヘア移動時のコールバック
 * @param activeChart - アクティブなチャート
 * @param onActiveChange - アクティブチャート変更時のコールバック
 */
function ChartPanel({
  title,
  timeframe,
  currentTime,
  syncedCrosshairTime,
  syncedCrosshairPrice,
  onCrosshairMove,
  activeChart,
  onActiveChange,
  refreshTrigger,
  onDataMissing
}: ChartPanelProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  // クロスヘアに表示するOHLCデータ
  const [ohlcData, setOhlcData] = useState<OhlcDisplay | null>(null)
  // ローソク足データを保持（クロスヘア表示用）
  const candleDataRef = useRef<Map<string | number, CandlestickData>>(new Map())
  // 前回の最新ローソク足のタイムスタンプ（新規ローソク検出用）
  const lastCandleTimeRef = useRef<string | number | null>(null)
  // 初回データ取得完了フラグ
  const initialDataLoadedRef = useRef(false)
  // 最後にデータを更新したシミュレーション時刻（throttle用）
  const lastUpdateTimeRef = useRef<Date | null>(null)
  // カスタムクロスヘアライン位置（他のチャートから同期）
  const [crosshairPosition, setCrosshairPosition] = useState<{ x: number; y: number } | null>(null)
  // データ取得中フラグ（複数リクエストの同時実行を防ぐ）
  const isFetchingRef = useRef(false)
  // データ不足通知済みフラグ（同じ警告を複数回表示しないため）
  const dataMissingNotifiedRef = useRef(false)

  /**
   * Convert a Date to fakeUTC timestamp (same logic as formatCandles)
   * This uses local time components to create a UTC timestamp, ensuring
   * that the chart displays the original JST time correctly.
   *
   * @param date - The date to convert
   * @returns Unix timestamp in seconds
   */
  const convertToFakeUtcTimestamp = (date: Date): number => {
    return Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()  // Include seconds to match candle data
    ) / 1000
  }

  /**
   * Round a date down to the nearest 10-minute boundary
   * Preserves the date and hour, only modifies minutes and seconds
   *
   * Examples:
   * - 09:05:23 → 09:00:00
   * - 09:15:47 → 09:10:00
   * - 09:28:12 → 09:20:00
   *
   * @param date - The date to round
   * @returns New date rounded to 10-minute boundary
   */
  const roundTo10MinuteBoundary = (date: Date): Date => {
    const rounded = new Date(date)
    rounded.setMinutes(Math.floor(date.getMinutes() / 10) * 10, 0, 0)
    return rounded
  }

  /**
   * Find the nearest candle time within a tolerance window
   * Used as fallback when exact timestamp match fails
   *
   * @param targetTime - The target fakeUTC timestamp
   * @param candleMap - Map of candle times to data
   * @param toleranceMinutes - Maximum time difference allowed (default: 5)
   * @returns Nearest candle time or null if none within tolerance
   */
  /**
   * 指定された時刻に最も近いローソク足の時刻を探す
   *
   * マーカー配置時に、注文/トレードの時刻と完全一致するローソク足がない場合に
   * 許容範囲内で最も近いローソク足を探す
   *
   * @param targetTime - 探したい時刻（fakeUTCタイムスタンプ）
   * @param candleMap - ローソク足データのMap
   * @param toleranceMinutes - 許容する時間差（分）。デフォルト15分に拡大
   * @returns 最も近いローソク足の時刻、または見つからない場合はnull
   */
  const findNearestCandleTime = (
    targetTime: number,
    candleMap: Map<string | number, CandlestickData>,
    toleranceMinutes: number = 15  // 5分→15分に拡大（10分足の1.5本分）
  ): number | null => {
    let nearestTime: number | null = null
    let minDiff = toleranceMinutes * 60  // Convert to seconds

    for (const [time] of candleMap.entries()) {
      if (typeof time === 'number') {
        const diff = Math.abs(time - targetTime)
        if (diff < minDiff) {
          minDiff = diff
          nearestTime = time
        }
      }
    }

    return nearestTime
  }

  /**
   * ローソク足データをチャート用にフォーマットする
   *
   * CSVデータはJSTタイムスタンプで保存されているが、タイムゾーン情報がない。
   * JavaScriptのDateはローカル時間として解釈し、getTime()でUTCに変換してしまう。
   * これを防ぐため、ローカル時間の各コンポーネントを使ってUTCタイムスタンプを作成し、
   * チャート上で元のJST時刻が表示されるようにする。
   */
  const formatCandles = (candles: Candle[]): CandlestickData[] => {
    return candles.map((c) => {
      const date = new Date(c.timestamp)

      // 全てのタイムフレームで数値タイムスタンプを使用
      // lightweight-chartsは文字列の場合yyyy-mm-dd形式のみサポートするため、
      // 時刻情報を含めるには数値タイムスタンプを使用する必要がある
      // ローカル時間の各コンポーネントを使ってUTCタイムスタンプを作成し、
      // チャート上で元のJST時刻が表示されるようにする
      const fakeUtcTimestamp = convertToFakeUtcTimestamp(date)
      return {
        time: fakeUtcTimestamp as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }
    })
  }

  /**
   * ローカル時間をISO形式に変換（UTCに変換しない）
   */
  const toLocalISOString = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    const second = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  /**
   * APIからローソク足データを取得してチャートに設定する
   */
  const fetchData = useCallback(async () => {
    // seriesRefが設定されるまで待つ
    if (!seriesRef.current) {
      console.warn('[ChartPanel] Series not ready, skipping data fetch')
      return
    }

    // 前回のリクエストがまだ完了していない場合はスキップ（競合防止）
    if (isFetchingRef.current) {
      console.warn(`[${timeframe}] Skipping data fetch: previous request still in progress`)
      return
    }

    // Throttle: ローソク足の境界を越えたかをチェック
    if (currentTime && lastUpdateTimeRef.current) {
      if (!shouldUpdateCandle(timeframe, lastUpdateTimeRef.current, currentTime)) {
        // まだ境界を越えていないのでスキップ
        return
      }
    }

    // 取得中フラグをセット
    isFetchingRef.current = true

    try {
      let response
      if (currentTime) {
        // M10（10分足）は最小単位なので、既存のgetCandlesBeforeを使用
        // H1、D1、W1は未来データ非表示のため、getCandlesPartialを使用
        if (timeframe === 'M10') {
          response = await marketDataApi.getCandlesBefore(
            timeframe,
            toLocalISOString(currentTime),
            200
          )
        } else {
          // 未来データ非表示対応: 最新のローソク足を部分的に生成
          response = await marketDataApi.getCandlesPartial(
            timeframe,
            toLocalISOString(currentTime),
            200
          )
        }
      } else {
        response = await marketDataApi.getCandles(timeframe, undefined, undefined, 200)
      }

      if (response.success && response.data) {
        // データ不足チェック（DBに該当時間足のデータが存在しない場合）
        if (response.data.data_missing && !dataMissingNotifiedRef.current) {
          dataMissingNotifiedRef.current = true
          if (onDataMissing) {
            onDataMissing(timeframe)
          }
        }

        const formattedData = formatCandles(response.data.candles)
        const lastCandle = formattedData[formattedData.length - 1]
        const newLastTime = lastCandle?.time as string | number | undefined
        const prevLastTime = lastCandleTimeRef.current

        // デバッグ: 取得したデータの最後のローソク足を確認
        console.log(`[${timeframe}] Data fetched:`, {
          count: formattedData.length,
          lastTime: newLastTime,
          prevLastTime: prevLastTime,
          currentTime: currentTime ? toLocalISOString(currentTime) : 'null',
          isNewCandle: newLastTime !== prevLastTime,
          dataMissing: response.data.data_missing
        })

        if (formattedData.length > 0) {
          seriesRef.current.setData(formattedData)
          // クロスヘア用にデータをMapに保存
          candleDataRef.current.clear()
          formattedData.forEach((candle) => {
            candleDataRef.current.set(candle.time as string | number, candle)
          })

          // データ更新成功時に最終更新時刻を記録
          if (currentTime) {
            lastUpdateTimeRef.current = currentTime
          }

          // 新しいローソク足が追加された場合、または初回読み込み時に最新位置へスクロール
          const isNewCandle = newLastTime !== prevLastTime
          if (isNewCandle && chartRef.current) {
            // 前回の最新時刻を更新
            lastCandleTimeRef.current = newLastTime ?? null

            // 初回読み込み後のみスクロール（初回は全体表示のためスキップ）
            if (initialDataLoadedRef.current) {
              // 新規ローソク足が追加されたら最新位置へスクロール
              // scrollToRealTimeはfakeUTCタイムスタンプと相性が悪いためfitContentを使用
              // ただし、ユーザーのスクロール位置を維持するため、
              // 最新のローソク足が見える位置にいる場合のみスクロール
              const timeScale = chartRef.current.timeScale()
              const visibleRange = timeScale.getVisibleLogicalRange()
              if (visibleRange) {
                // 表示範囲の右端がデータの末尾に近い場合のみスクロール
                const dataLength = formattedData.length
                const visibleRight = visibleRange.to
                // 右端から5本以内にいる場合はスクロール（右に7本分の余白を作る）
                if (dataLength - visibleRight < 5) {
                  timeScale.scrollToPosition(7, false)
                }
              }
            } else {
              // 初回読み込み完了時：最新のローソク足の右側に7本分の余白を作る
              initialDataLoadedRef.current = true
              const timeScale = chartRef.current.timeScale()
              timeScale.scrollToPosition(7, false)
            }
          }
        }
      }
    } catch (error) {
      console.error('[ChartPanel] Failed to fetch candle data:', error)
    } finally {
      // 取得完了フラグをクリア
      isFetchingRef.current = false
    }

  }, [timeframe, currentTime, onDataMissing])

  /**
   * トレードマーカーを更新する（内部使用）
   *
   * 注文/トレードの時刻を10分単位に丸め、ローソク足データと同じ
   * タイムスタンプ変換ロジックを使用してマーカーを配置する
   *
   * マーカーの種類:
   * - エントリーマーカー: 買い=緑↑「買」、売り=赤↓「売」
   * - 決済マーカー: 青丸「決」
   */
  const updateMarkers = useCallback(async () => {
    // 10分足以外、またはseriesが未設定の場合はスキップ
    if (timeframe !== 'M10' || !seriesRef.current) return

    // ローソク足データがない場合はスキップ（後で再試行される）
    if (candleDataRef.current.size === 0) {
      console.log('[ChartPanel] updateMarkers: No candle data available yet, skipping')
      return
    }

    try {
      const [ordersRes, tradesRes] = await Promise.all([
        ordersApi.getAll(1000, 0),
        tradesApi.getAll(1000, 0)
      ])

      const markers: any[] = []
      let exactMatchCount = 0
      let fallbackMatchCount = 0
      let failedMatchCount = 0

      // エントリーマーカー（注文データから）
      if (ordersRes.success && ordersRes.data?.orders) {
        ordersRes.data.orders.forEach((order) => {
          const orderDate = new Date(order.executed_at)
          const roundedDate = roundTo10MinuteBoundary(orderDate)
          const markerTime = convertToFakeUtcTimestamp(roundedDate)

          // 1. 完全一致を試す
          let finalTime: number | null = null
          if (candleDataRef.current.has(markerTime)) {
            finalTime = markerTime
            exactMatchCount++
          } else {
            // 2. フォールバック: 最も近いローソク足を探す
            finalTime = findNearestCandleTime(markerTime, candleDataRef.current)
            if (finalTime !== null) {
              fallbackMatchCount++
              console.log(
                `[Marker Fallback] Order ${order.order_id}: ` +
                `${order.executed_at} → rounded to ${roundedDate.toISOString()} → ` +
                `target ${markerTime} → found nearest ${finalTime} ` +
                `(diff: ${Math.abs(finalTime - markerTime)}s)`
              )
            } else {
              failedMatchCount++
              console.warn(
                `[Marker Failed] Order ${order.order_id}: ` +
                `${order.executed_at} → no matching candle found for ${markerTime}`
              )
            }
          }

          if (finalTime !== null) {
            const priceText = order.entry_price.toFixed(3)
            markers.push({
              time: finalTime as Time,
              position: order.side === 'buy' ? 'belowBar' : 'aboveBar',
              color: order.side === 'buy' ? '#26a69a' : '#ef5350',
              shape: order.side === 'buy' ? 'arrowUp' : 'arrowDown',
              text: `${order.side === 'buy' ? '買' : '売'}\n${priceText}`
            })
          }
        })
      }

      // 決済マーカー（トレードデータから）
      if (tradesRes.success && tradesRes.data?.trades) {
        tradesRes.data.trades.forEach((trade) => {
          const tradeDate = new Date(trade.closed_at)
          const roundedDate = roundTo10MinuteBoundary(tradeDate)
          const markerTime = convertToFakeUtcTimestamp(roundedDate)

          // 1. 完全一致を試す
          let finalTime: number | null = null
          if (candleDataRef.current.has(markerTime)) {
            finalTime = markerTime
            exactMatchCount++
          } else {
            // 2. フォールバック: 最も近いローソク足を探す
            finalTime = findNearestCandleTime(markerTime, candleDataRef.current)
            if (finalTime !== null) {
              fallbackMatchCount++
              console.log(
                `[Marker Fallback] Trade ${trade.trade_id}: ` +
                `${trade.closed_at} → rounded to ${roundedDate.toISOString()} → ` +
                `target ${markerTime} → found nearest ${finalTime} ` +
                `(diff: ${Math.abs(finalTime - markerTime)}s)`
              )
            } else {
              failedMatchCount++
              console.warn(
                `[Marker Failed] Trade ${trade.trade_id}: ` +
                `${trade.closed_at} → no matching candle found for ${markerTime}`
              )
            }
          }

          if (finalTime !== null) {
            const pnlText = `${trade.realized_pnl_pips >= 0 ? '+' : ''}${trade.realized_pnl_pips.toFixed(1)}p`
            const priceText = trade.exit_price.toFixed(3)
            const markerColor = trade.realized_pnl >= 0 ? '#26a69a' : '#ef5350'
            markers.push({
              time: finalTime as Time,
              position: trade.side === 'buy' ? 'aboveBar' : 'belowBar',
              color: markerColor,
              shape: 'circle',
              text: `決\n${priceText}\n${pnlText}`
            })
          }
        })
      }

      // マーカーを時刻順にソート
      markers.sort((a, b) => (a.time as number) - (b.time as number))

      // デバッグログ出力
      console.log('[ChartPanel] Marker Summary:', {
        total: markers.length,
        exactMatches: exactMatchCount,
        fallbackMatches: fallbackMatchCount,
        failed: failedMatchCount,
        candlesAvailable: candleDataRef.current.size
      })

      seriesRef.current.setMarkers(markers)
    } catch (error) {
      console.error('[ChartPanel] Failed to update markers:', error)
    }
  }, [timeframe])

  /**
   * チャート表示時の初期実行処理
   */
  useEffect(() => {
    if (!chartContainerRef.current) return

    // チャート再作成時にrefsをリセット
    lastCandleTimeRef.current = null
    initialDataLoadedRef.current = false
    lastUpdateTimeRef.current = null

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#16213e' },
        textColor: '#e6e6e6',
        fontSize: 16,
      },
      grid: {
        vertLines: { color: '#2d4263' },
        horzLines: { color: '#2d4263' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      localization: {
        // 時刻表示を yyyy/mm/dd(曜日) HH:mm 形式にカスタマイズ
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000)
          const year = date.getUTCFullYear()
          const month = String(date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(date.getUTCDate()).padStart(2, '0')
          const hour = String(date.getUTCHours()).padStart(2, '0')
          const minute = String(date.getUTCMinutes()).padStart(2, '0')
          const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
          return `${year}/${month}/${day}(${dayOfWeek}) ${hour}:${minute}`
        },
      },
      timeScale: {
        timeVisible: true, // すべてのタイムフレームで時刻を表示
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#2d4263',
      },
      crosshair: {
        mode: 0, // 0 = Normal mode (カーソル位置に十字を表示)
        vertLine: {
          labelVisible: true,
        },
        horzLine: {
          labelVisible: true,
        },
      },
      watermark: {
        visible: false,
        color: 'rgba(0, 0, 0, 0)',
        text: '',
      },
    })

    /**
     * チャート画面で表示するカラーコード一覧
     */
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    })

    chartRef.current = chart
    seriesRef.current = candlestickSeries

    // チャート作成後、初期データを取得
    fetchData()

    /**
     * クロスヘア移動時のイベントハンドラ
     * マウス位置のローソク足データを取得してOHLC表示を更新
     *
     * タイムスタンプは「疑似UTC」（実際はJST値をUTCとして格納）なので、
     * getUTC*メソッドで取得するとJST時刻が得られる
     */
    const handleCrosshairMove = (param: MouseEventParams) => {
      // 他のチャートにクロスヘア位置を通知（時刻と価格の両方）
      if (onCrosshairMove) {
        // マウス位置の実際の価格を取得
        let price: number | null = null
        // ローソク足データから価格を取得（close価格を使用）
        if (param.seriesData && param.seriesData.has(candlestickSeries)) {
          const data = param.seriesData.get(candlestickSeries) as CandlestickData | undefined
          if (data) {
            price = data.close
          }
        }

        // Time型をstring | number | nullに変換
        let time: string | number | null = null
        if (param.time !== undefined && param.time !== null) {
          if (typeof param.time === 'string' || typeof param.time === 'number') {
            time = param.time
          } else {
            // BusinessDay型の場合は文字列に変換
            const bd = param.time as { year: number; month: number; day: number }
            time = `${bd.year}-${String(bd.month).padStart(2, '0')}-${String(bd.day).padStart(2, '0')}`
          }
        }

        onCrosshairMove(time, price)
      }

      if (!param.time || !param.seriesData) {
        setOhlcData(null)
        return
      }

      const data = param.seriesData.get(candlestickSeries) as CandlestickData | undefined
      if (data) {
        let timeStr: string
        if (typeof param.time === 'string') {
          // 文字列形式の場合（万が一のフォールバック）
          const parts = param.time.split(' ')
          const dateParts = parts[0].split('-')
          const timePart = parts.length > 1 ? parts[1] : '00:00'
          const date = new Date(param.time)
          const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
          timeStr = `${dateParts[0]}/${dateParts[1]}/${dateParts[2]}(${dayOfWeek}) ${timePart}`
        } else {
          // 数値タイムスタンプの場合：疑似UTCタイムスタンプからJST時刻を表示
          // yyyy/mm/dd(曜日) HH:MM 形式で表示
          const date = new Date((param.time as number) * 1000)
          const year = date.getUTCFullYear()
          const month = String(date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(date.getUTCDate()).padStart(2, '0')
          const hour = String(date.getUTCHours()).padStart(2, '0')
          const minute = String(date.getUTCMinutes()).padStart(2, '0')
          const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
          timeStr = `${year}/${month}/${day}(${dayOfWeek}) ${hour}:${minute}`
        }
        setOhlcData({
          time: timeStr,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        })
      }
    }

    chart.subscribeCrosshairMove(handleCrosshairMove)

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.unsubscribeCrosshairMove(handleCrosshairMove)
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe])

  // データ取得
  useEffect(() => {
    const loadData = async () => {
      await fetchData()
      // データ取得後、10分足の場合はマーカーも更新
      if (timeframe === 'M10') {
        await updateMarkers()
      }
    }
    loadData()
  }, [fetchData, timeframe, updateMarkers])

  // トレードマーカーの取得と表示（10分足のみ）- refreshTrigger変更時
  useEffect(() => {
    if (timeframe === 'M10' && refreshTrigger !== undefined) {
      updateMarkers()
    }
  }, [timeframe, updateMarkers, refreshTrigger])

  // 他のチャートからのクロスヘア同期
  useEffect(() => {
    // このチャートがアクティブな場合は同期しない（自分のクロスヘアを表示）
    if (activeChart === timeframe || !syncedCrosshairTime || !chartRef.current || !seriesRef.current) {
      setCrosshairPosition(null)
      return
    }

    // ローソク足データがない場合は何もしない
    if (candleDataRef.current.size === 0) {
      setCrosshairPosition(null)
      return
    }

    // syncedCrosshairTimeに対応するローソク足を探す
    // すべてのタイムフレームが数値タイムスタンプを使用する
    let candleData: CandlestickData | undefined
    let candleTime: Time | undefined

    if (typeof syncedCrosshairTime === 'number') {
      // 数値タイムスタンプの場合
      // 完全一致を試す
      candleData = candleDataRef.current.get(syncedCrosshairTime)
      candleTime = syncedCrosshairTime as Time

      // 完全一致しない場合、最も近い時刻のデータを探す（許容範囲なし）
      if (!candleData) {
        let closestTime: number | null = null
        let minDiff = Infinity
        for (const [time] of candleDataRef.current.entries()) {
          if (typeof time === 'number') {
            const diff = Math.abs(time - syncedCrosshairTime)
            if (diff < minDiff) {
              minDiff = diff
              closestTime = time
            }
          }
        }
        if (closestTime !== null) {
          candleData = candleDataRef.current.get(closestTime)
          candleTime = closestTime as Time
        }
      }
    } else if (typeof syncedCrosshairTime === 'string') {
      // 文字列形式の場合（後方互換性のため残す）
      candleData = candleDataRef.current.get(syncedCrosshairTime)
      candleTime = syncedCrosshairTime as Time
    }

    if (candleData && candleTime !== undefined) {
      // OHLC表示を更新
      let timeStr: string
      if (typeof candleTime === 'string') {
        // 文字列形式の場合（万が一のフォールバック）
        const parts = candleTime.split(' ')
        const dateParts = parts[0].split('-')
        const timePart = parts.length > 1 ? parts[1] : '00:00'
        const date = new Date(candleTime)
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
        timeStr = `${dateParts[0]}/${dateParts[1]}/${dateParts[2]}(${dayOfWeek}) ${timePart}`
      } else if (typeof candleTime === 'number') {
        // 数値タイムスタンプの場合：yyyy/mm/dd(曜日) HH:MM 形式で表示
        const date = new Date(candleTime * 1000)
        const year = date.getUTCFullYear()
        const month = String(date.getUTCMonth() + 1).padStart(2, '0')
        const day = String(date.getUTCDate()).padStart(2, '0')
        const hour = String(date.getUTCHours()).padStart(2, '0')
        const minute = String(date.getUTCMinutes()).padStart(2, '0')
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
        timeStr = `${year}/${month}/${day}(${dayOfWeek}) ${hour}:${minute}`
      } else {
        // BusinessDay型の場合
        const bd = candleTime as { year: number; month: number; day: number }
        const date = new Date(bd.year, bd.month - 1, bd.day)
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
        timeStr = `${bd.year}/${String(bd.month).padStart(2, '0')}/${String(bd.day).padStart(2, '0')}(${dayOfWeek}) 00:00`
      }

      setOhlcData({
        time: timeStr,
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
      })

      // クロスヘアラインの位置を計算
      try {
        const timeScale = chartRef.current.timeScale()

        const x = timeScale.timeToCoordinate(candleTime)
        // 同期された価格から座標を計算
        // syncedCrosshairPriceがある場合はそれを使用、ない場合はclose価格を使用
        const priceToUse = syncedCrosshairPrice !== null && syncedCrosshairPrice !== undefined
          ? syncedCrosshairPrice
          : candleData.close
        const y = seriesRef.current.priceToCoordinate(priceToUse)

        if (x !== null && y !== null) {
          setCrosshairPosition({ x, y })
        } else {
          // 座標が取得できない場合（画面外など）でもOHLC表示は維持
          // 縦線のみ表示できる場合もある
          if (x !== null) {
            // 縦線は表示可能、横線は中央に
            const chartHeight = chartContainerRef.current?.clientHeight || 200
            setCrosshairPosition({ x, y: chartHeight / 2 })
          } else {
            setCrosshairPosition(null)
          }
        }
      } catch (error) {
        console.error('Failed to calculate crosshair position:', error)
        setCrosshairPosition(null)
      }
    } else {
      // ローソク足データが見つからない場合
      setOhlcData(null)
      setCrosshairPosition(null)
    }
  }, [syncedCrosshairTime, syncedCrosshairPrice, activeChart, timeframe])

  // 最新のローソク足にスクロール
  const scrollToLatest = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime()
    }
  }

  return (
    <div className="bg-bg-card rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-1.5 text-base font-semibold text-text-strong border-b border-border flex justify-between items-center">
        <span>{title}</span>
        {/* クロスヘアホバー時のOHLC表示 */}
        {ohlcData && (
          <div className="flex items-center gap-2 text-base font-normal">
            <span className="text-text-secondary text-sm">{ohlcData.time}</span>
            <span className="text-text-primary">O:</span>
            <span className="text-text-strong font-semibold">{ohlcData.open.toFixed(3)}</span>
            <span className="text-text-primary">H:</span>
            <span className="text-buy font-semibold">{ohlcData.high.toFixed(3)}</span>
            <span className="text-text-primary">L:</span>
            <span className="text-sell font-semibold">{ohlcData.low.toFixed(3)}</span>
            <span className="text-text-primary">C:</span>
            <span className={`font-semibold ${ohlcData.close >= ohlcData.open ? 'text-buy' : 'text-sell'}`}>
              {ohlcData.close.toFixed(3)}
            </span>
          </div>
        )}
        <button
          onClick={scrollToLatest}
          className="text-sm text-text-primary hover:text-text-strong"
          title="最新へ移動"
        >
          →|
        </button>
      </div>
      <div
        ref={chartContainerRef}
        className="flex-1 min-h-0 relative"
        onMouseEnter={() => onActiveChange?.(timeframe)}
        onMouseLeave={() => onActiveChange?.(null)}
      >
        {crosshairPosition && activeChart !== timeframe && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: crosshairPosition.x,
                top: 0,
                width: 1,
                height: '100%',
                borderLeft: '1px dotted rgba(230, 230, 230, 0.5)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: crosshairPosition.y,
                left: 0,
                width: '100%',
                height: 1,
                borderTop: '1px dotted rgba(230, 230, 230, 0.5)',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default ChartPanel
