import { useEffect, useRef, useCallback, useState } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, MouseEventParams } from 'lightweight-charts'
import { marketDataApi, Candle } from '../services/api'

/**
 * ローソク足の境界を越えたかをチェックする関数
 *
 * @param timeframe タイムフレーム
 * @param lastTime 前回の更新時刻
 * @param currentTime 現在の時刻
 * @returns 境界を越えた場合はtrue
 */
const shouldUpdateCandle = (
  timeframe: 'D1' | 'H1' | 'M10',
  lastTime: Date,
  currentTime: Date
): boolean => {
  switch (timeframe) {
    case 'M10': {
      // 10分の境界を越えたかチェック
      // 例: 9:05 → 9:10, 9:20 → 9:30
      const lastM10 = Math.floor(lastTime.getTime() / (10 * 60 * 1000))
      const currentM10 = Math.floor(currentTime.getTime() / (10 * 60 * 1000))
      return currentM10 > lastM10
    }
    case 'H1': {
      // 時間が変わったかチェック
      // 例: 9時 → 10時
      return (
        lastTime.getFullYear() !== currentTime.getFullYear() ||
        lastTime.getMonth() !== currentTime.getMonth() ||
        lastTime.getDate() !== currentTime.getDate() ||
        lastTime.getHours() !== currentTime.getHours()
      )
    }
    case 'D1': {
      // 日付が変わったかチェック
      // 例: 1日 → 2日
      return (
        lastTime.getFullYear() !== currentTime.getFullYear() ||
        lastTime.getMonth() !== currentTime.getMonth() ||
        lastTime.getDate() !== currentTime.getDate()
      )
    }
  }
}

/**
 * チャートパネルのプロパティ
 */
interface ChartPanelProps {
  /** チャートのタイトル */
  title: string
  /** 時間足（D1: 日足, H1: 1時間足, M10: 10分足） */
  timeframe: 'D1' | 'H1' | 'M10'
  /** 現在のシミュレーション時刻（この時刻より前のデータを表示） */
  currentTime?: Date
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
 */
function ChartPanel({ title, timeframe, currentTime }: ChartPanelProps) {
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

      // 日足の場合は日付文字列を使用
      if (timeframe === 'D1') {
        // ローカル時間（JST）の日付をそのまま使用
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return {
          time: `${year}-${month}-${day}` as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }
      }

      // 時間足の場合：ローカル時間のコンポーネントからUTCタイムスタンプを作成
      // これにより、チャート上で元のJST時刻が表示される
      const fakeUtcTimestamp = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds()
      ) / 1000
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
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`
  }

  /**
   * APIからローソク足データを取得してチャートに設定する
   */
  const fetchData = useCallback(async () => {
    // seriesRefが設定されるまで待つ
    if (!seriesRef.current) {
      console.warn('Series not ready, skipping data fetch')
      return
    }

    // Throttle: ローソク足の境界を越えたかをチェック
    if (currentTime && lastUpdateTimeRef.current) {
      if (!shouldUpdateCandle(timeframe, lastUpdateTimeRef.current, currentTime)) {
        // まだ境界を越えていないのでスキップ
        return
      }
    }

    try {
      let response
      if (currentTime) {
        // JSTのままAPIに送信
        response = await marketDataApi.getCandlesBefore(
          timeframe,
          toLocalISOString(currentTime),
          200
        )
      } else {
        response = await marketDataApi.getCandles(timeframe, undefined, undefined, 200)
      }

      if (response.success && response.data) {
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
          isNewCandle: newLastTime !== prevLastTime
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
                // 右端から5本以内にいる場合はスクロール
                if (dataLength - visibleRight < 5) {
                  timeScale.scrollToPosition(0, false)
                }
              }
            } else {
              // 初回読み込み完了
              initialDataLoadedRef.current = true
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch candle data:', error)
    }
  }, [timeframe, currentTime])

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
      },
      grid: {
        vertLines: { color: '#2d4263' },
        horzLines: { color: '#2d4263' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: timeframe !== 'D1',
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#2d4263',
      },
      crosshair: {
        mode: 1,
      },
    })

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
      if (!param.time || !param.seriesData) {
        setOhlcData(null)
        return
      }

      const data = param.seriesData.get(candlestickSeries) as CandlestickData | undefined
      if (data) {
        let timeStr: string
        if (typeof param.time === 'string') {
          // 日足の場合：日付文字列をそのまま使用
          timeStr = param.time
        } else {
          // 時間足の場合：疑似UTCタイムスタンプからJST時刻を表示
          const date = new Date((param.time as number) * 1000)
          const month = String(date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(date.getUTCDate()).padStart(2, '0')
          const hour = String(date.getUTCHours()).padStart(2, '0')
          const minute = String(date.getUTCMinutes()).padStart(2, '0')
          timeStr = `${month}/${day} ${hour}:${minute}`
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
    fetchData()
  }, [fetchData])

  // 最新のローソク足にスクロール
  const scrollToLatest = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime()
    }
  }

  return (
    <div className="bg-bg-card rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-1 text-sm font-semibold text-text-strong border-b border-border flex justify-between items-center">
        <span>{title}</span>
        {/* クロスヘアホバー時のOHLC表示 */}
        {ohlcData && (
          <div className="flex items-center gap-2 text-xs font-normal">
            <span className="text-text-secondary">{ohlcData.time}</span>
            <span className="text-text-primary">O:</span>
            <span className="text-text-strong">{ohlcData.open.toFixed(3)}</span>
            <span className="text-text-primary">H:</span>
            <span className="text-buy">{ohlcData.high.toFixed(3)}</span>
            <span className="text-text-primary">L:</span>
            <span className="text-sell">{ohlcData.low.toFixed(3)}</span>
            <span className="text-text-primary">C:</span>
            <span className={ohlcData.close >= ohlcData.open ? 'text-buy' : 'text-sell'}>
              {ohlcData.close.toFixed(3)}
            </span>
          </div>
        )}
        <button
          onClick={scrollToLatest}
          className="text-xs text-text-primary hover:text-text-strong"
          title="最新へ移動"
        >
          →|
        </button>
      </div>
      <div ref={chartContainerRef} className="flex-1 min-h-0" />
    </div>
  )
}

export default ChartPanel
