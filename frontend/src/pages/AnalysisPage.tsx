import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyticsApi, tradesApi, PerformanceMetrics, EquityCurveData, DrawdownData, Trade, Candle } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, MouseEventParams } from 'lightweight-charts'
import { logger } from '../utils/logger'

// 時間足の定義
const TIMEFRAMES = ['W1', 'D1', 'H1', 'M10'] as const
type Timeframe = typeof TIMEFRAMES[number]

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  W1: '週足(W1)',
  D1: '日足(D1)',
  H1: '1時間足(H1)',
  M10: '10分足(M10)',
}

/**
 * パフォーマンス分析ページコンポーネント
 * 詳細なパフォーマンス指標、資産曲線、ドローダウンを表示する
 */
function AnalysisPage() {
  const navigate = useNavigate()
  const { simulationId } = useSimulationStore()
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const [equityCurve, setEquityCurve] = useState<EquityCurveData | null>(null)
  const [drawdown, setDrawdown] = useState<DrawdownData | null>(null)
  const [loading, setLoading] = useState(true)

  // Chart state - 4つの時間足それぞれのデータ
  const [trades, setTrades] = useState<Trade[]>([])
  const [candlesByTimeframe, setCandlesByTimeframe] = useState<Record<Timeframe, Candle[]>>({
    W1: [],
    D1: [],
    H1: [],
    M10: [],
  })
  const [chartLoading, setChartLoading] = useState(false)
  const [selectedTradeIndex, setSelectedTradeIndex] = useState<number | null>(null)

  // マーカー表示/非表示（時間足ごと）
  const [markerVisibility, setMarkerVisibility] = useState<Record<Timeframe, boolean>>({
    W1: true,
    D1: true,
    H1: true,
    M10: true,
  })

  // Chart refs - 4つのチャート
  const chartContainerRefs = useRef<Record<Timeframe, HTMLDivElement | null>>({
    W1: null,
    D1: null,
    H1: null,
    M10: null,
  })
  const chartRefs = useRef<Record<Timeframe, IChartApi | null>>({
    W1: null,
    D1: null,
    H1: null,
    M10: null,
  })
  const candleSeriesRefs = useRef<Record<Timeframe, ISeriesApi<'Candlestick'> | null>>({
    W1: null,
    D1: null,
    H1: null,
    M10: null,
  })
  // ローソク足データをMap形式で保持（クロスヘア同期用）
  const candleDataRefs = useRef<Record<Timeframe, Map<number, CandlestickData>>>({
    W1: new Map(),
    D1: new Map(),
    H1: new Map(),
    M10: new Map(),
  })

  // 資産曲線・ドローダウン選択
  const [selectedEquityIndex, setSelectedEquityIndex] = useState<number | null>(null)
  const [selectedDrawdownIndex, setSelectedDrawdownIndex] = useState<number | null>(null)

  // クロスヘア同期用state
  const [syncedCrosshairTime, setSyncedCrosshairTime] = useState<number | null>(null)
  const [syncedCrosshairPrice, setSyncedCrosshairPrice] = useState<number | null>(null)
  const [activeChart, setActiveChart] = useState<Timeframe | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      if (!simulationId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const [perfRes, equityRes, ddRes] = await Promise.all([
          analyticsApi.getPerformance(),
          analyticsApi.getEquityCurve('trade'),
          analyticsApi.getDrawdown(),
        ])

        if (perfRes.success && perfRes.data) {
          setPerformance(perfRes.data)
        }
        if (equityRes.success && equityRes.data) {
          setEquityCurve(equityRes.data)
        }
        if (ddRes.success && ddRes.data) {
          setDrawdown(ddRes.data)
        }
      } catch (error) {
        logger.error('AnalysisPage', '分析データの取得に失敗しました', { error })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [simulationId])

  // Fetch trades and candles for all timeframes
  useEffect(() => {
    const fetchChartData = async () => {
      if (!simulationId) {
        setTrades([])
        setCandlesByTimeframe({ W1: [], D1: [], H1: [], M10: [] })
        return
      }

      try {
        setChartLoading(true)

        // 全時間足のデータを並列取得
        const results = await Promise.all(
          TIMEFRAMES.map(tf => analyticsApi.getTradesWithCandles(tf))
        )

        // トレードデータは共通（どの時間足からも同じ）
        const tradesData = results[0]?.data?.trades || []
        setTrades(Array.isArray(tradesData) ? tradesData : [])

        // 各時間足のローソク足データを設定
        const newCandlesByTimeframe: Record<Timeframe, Candle[]> = {
          W1: [],
          D1: [],
          H1: [],
          M10: [],
        }

        TIMEFRAMES.forEach((tf, index) => {
          const result = results[index]
          if (result.success && result.data?.candles) {
            const validCandles = result.data.candles.filter((candle: Candle) => {
              if (!candle.timestamp) return false
              const date = new Date(candle.timestamp)
              return !isNaN(date.getTime())
            })
            newCandlesByTimeframe[tf] = validCandles
          }
        })

        setCandlesByTimeframe(newCandlesByTimeframe)
      } catch (error) {
        logger.error('AnalysisPage', 'チャートデータの取得に失敗しました', { error })
      } finally {
        setChartLoading(false)
      }
    }

    fetchChartData()
  }, [simulationId])

  // クロスヘア移動ハンドラ
  const handleCrosshairMove = useCallback((timeframe: Timeframe, time: number | null, price: number | null) => {
    if (activeChart === timeframe) {
      setSyncedCrosshairTime(time)
      setSyncedCrosshairPrice(price)
    }
  }, [activeChart])

  // チャートの作成と描画
  useEffect(() => {
    // 全チャートをクリーンアップ
    const cleanup = () => {
      TIMEFRAMES.forEach(tf => {
        if (chartRefs.current[tf]) {
          chartRefs.current[tf]!.remove()
          chartRefs.current[tf] = null
          candleSeriesRefs.current[tf] = null
        }
      })
    }

    cleanup()

    // 各時間足のチャートを作成
    TIMEFRAMES.forEach(tf => {
      const container = chartContainerRefs.current[tf]
      const candles = candlesByTimeframe[tf]

      if (!container || candles.length === 0) return

      try {
        const chart = createChart(container, {
          width: container.clientWidth,
          height: container.clientHeight || 180,
          layout: {
            background: { color: '#1a1a1a' },
            textColor: '#d1d4dc',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: '#2a2a2a' },
            horzLines: { color: '#2a2a2a' },
          },
          localization: {
            timeFormatter: (timestamp: number) => {
              const date = new Date(timestamp * 1000)
              const month = String(date.getUTCMonth() + 1).padStart(2, '0')
              const day = String(date.getUTCDate()).padStart(2, '0')
              const hour = String(date.getUTCHours()).padStart(2, '0')
              const minute = String(date.getUTCMinutes()).padStart(2, '0')
              return `${month}/${day} ${hour}:${minute}`
            },
          },
          timeScale: {
            borderColor: '#485c7b',
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 5,
          },
          rightPriceScale: {
            borderColor: '#485c7b',
          },
          crosshair: {
            mode: 0,
          },
        })

        chartRefs.current[tf] = chart

        const candleSeries = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        })

        candleSeriesRefs.current[tf] = candleSeries

        // ローソク足データをフォーマット
        const chartData: CandlestickData[] = candles
          .map((candle) => {
            const timestamp = new Date(candle.timestamp).getTime() / 1000
            if (isNaN(timestamp)) return null
            return {
              time: timestamp as Time,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            }
          })
          .filter((data): data is CandlestickData => data !== null)

        if (chartData.length === 0) return

        candleSeries.setData(chartData)

        // Map形式でデータを保持
        candleDataRefs.current[tf].clear()
        chartData.forEach(candle => {
          candleDataRefs.current[tf].set(candle.time as number, candle)
        })

        const validTimes = new Set(chartData.map(d => d.time))

        // 最も近い有効な時刻を探すヘルパー
        const findNearestValidTime = (targetTime: number): number | null => {
          if (validTimes.has(targetTime as Time)) return targetTime
          const times = Array.from(validTimes) as number[]
          if (times.length === 0) return null
          let nearest = times[0]
          let minDiff = Math.abs(times[0] - targetTime)
          for (const time of times) {
            const diff = Math.abs(time - targetTime)
            if (diff < minDiff) {
              minDiff = diff
              nearest = time
            }
          }
          return nearest
        }

        // トレードマーカーを追加（非表示設定でも選択中のトレードは表示）
        const HIGHLIGHT_COLOR = '#FFD700'
        const isMarkersVisible = markerVisibility[tf]
        const markers = trades
          .flatMap((trade, index) => {
            if (!trade.opened_at || !trade.closed_at) return []
            const isSelected = selectedTradeIndex === index
            // 非表示設定の場合、選択中のトレードのみ表示
            if (!isMarkersVisible && !isSelected) return []
            const entryTime = new Date(trade.opened_at).getTime() / 1000
            const exitTime = new Date(trade.closed_at).getTime() / 1000
            if (isNaN(entryTime) || isNaN(exitTime)) return []

            const nearestEntryTime = findNearestValidTime(entryTime)
            const nearestExitTime = findNearestValidTime(exitTime)
            if (nearestEntryTime === null || nearestExitTime === null) return []
            const entryColor = isSelected ? HIGHLIGHT_COLOR : (trade.side === 'buy' ? '#26a69a' : '#ef5350')
            const exitColor = isSelected ? HIGHLIGHT_COLOR : (trade.realized_pnl >= 0 ? '#26a69a' : '#ef5350')
            const markerSize = isSelected ? 2 : 1

            return [
              {
                time: nearestEntryTime as Time,
                position: trade.side === 'buy' ? 'belowBar' : 'aboveBar',
                color: entryColor,
                shape: trade.side === 'buy' ? 'arrowUp' : 'arrowDown',
                text: isSelected ? `★${trade.side === 'buy' ? '買' : '売'}` : `${trade.side === 'buy' ? '買' : '売'}`,
                size: markerSize,
              },
              {
                time: nearestExitTime as Time,
                position: trade.realized_pnl >= 0 ? 'aboveBar' : 'belowBar',
                color: exitColor,
                shape: 'circle',
                text: isSelected ? `★決` : '決',
                size: markerSize,
              },
            ]
          })
          .sort((a, b) => (a.time as number) - (b.time as number))

        candleSeries.setMarkers(markers as any)

        // 選択されたトレードの位置にスクロール
        if (selectedTradeIndex !== null && trades[selectedTradeIndex]) {
          const selectedTrade = trades[selectedTradeIndex]
          const entryTime = new Date(selectedTrade.opened_at).getTime() / 1000
          const nearestTime = findNearestValidTime(entryTime)
          if (nearestTime !== null) {
            const timeScale = chart.timeScale()
            const times = Array.from(validTimes) as number[]
            const selectedIndex = times.findIndex(t => t === nearestTime)
            if (selectedIndex !== -1) {
              const displayBars = tf === 'M10' ? 100 : 80
              const halfBars = Math.floor(displayBars / 2)
              let fromIndex = selectedIndex - halfBars
              let toIndex = selectedIndex + halfBars
              if (fromIndex < 0) {
                fromIndex = 0
                toIndex = Math.min(displayBars, times.length - 1)
              }
              if (toIndex >= times.length) {
                toIndex = times.length - 1
                fromIndex = Math.max(0, toIndex - displayBars)
              }
              timeScale.setVisibleLogicalRange({ from: fromIndex, to: toIndex + 3 })
            }
          }
        } else {
          chart.timeScale().fitContent()
        }

        // クロスヘア移動イベント
        chart.subscribeCrosshairMove((param: MouseEventParams) => {
          if (activeChart === tf && param.time) {
            const data = param.seriesData?.get(candleSeries) as CandlestickData | undefined
            handleCrosshairMove(tf, param.time as number, data?.close || null)
          }
        })

      } catch (error) {
        logger.error('AnalysisPage', `チャート${tf}の作成に失敗しました`, { error })
      }
    })

    // リサイズハンドラ
    const handleResize = () => {
      TIMEFRAMES.forEach(tf => {
        const container = chartContainerRefs.current[tf]
        const chart = chartRefs.current[tf]
        if (container && chart) {
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
        }
      })
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cleanup()
    }
  }, [candlesByTimeframe, trades, selectedTradeIndex, activeChart, handleCrosshairMove, markerVisibility])

  // 他のチャートへのクロスヘア同期
  useEffect(() => {
    if (!syncedCrosshairTime || !activeChart) return

    TIMEFRAMES.forEach(tf => {
      if (tf === activeChart) return
      const chart = chartRefs.current[tf]
      const series = candleSeriesRefs.current[tf]
      if (!chart || !series) return

      // 同期されたクロスヘア位置の更新（setCrosshairPositionは廃止されたのでクロスヘア線は表示しない）
      // 代わりにOHLCデータの同期表示のみ行う
    })
  }, [syncedCrosshairTime, syncedCrosshairPrice, activeChart])

  const handleBack = () => {
    navigate('/')
  }

  const handleExportCSV = () => {
    tradesApi.export('csv')
  }

  const handleExportJSON = () => {
    tradesApi.export('json')
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const result = await tradesApi.import(file)
      if (result.success) {
        alert(result.data.message || 'インポートが完了しました')
        window.location.reload()
      }
    } catch (error) {
      logger.error('AnalysisPage', 'インポートに失敗しました', { error })
      alert(error instanceof Error ? error.message : 'インポートに失敗しました')
    }

    event.target.value = ''
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-xl text-text-primary">読み込み中...</div>
      </div>
    )
  }

  if (!simulationId) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-bg-primary">
        <div className="text-xl text-text-secondary mb-4">シミュレーションが開始されていません</div>
        <button
          onClick={handleBack}
          className="px-6 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
        >
          メイン画面に戻る
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="bg-bg-card border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-strong">パフォーマンス分析</h1>
          <div className="flex gap-2">
            <label className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80 cursor-pointer">
              インポート
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
            <div className="relative group">
              <button className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80">
                エクスポート ▼
              </button>
              <div className="absolute right-0 mt-1 w-32 bg-bg-card border border-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={handleExportCSV}
                  className="w-full px-4 py-2 text-left text-text-primary hover:bg-bg-secondary"
                >
                  CSV形式
                </button>
                <button
                  onClick={handleExportJSON}
                  className="w-full px-4 py-2 text-left text-text-primary hover:bg-bg-secondary"
                >
                  JSON形式
                </button>
              </div>
            </div>
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-btn-secondary text-text-strong rounded hover:opacity-80"
            >
              メイン画面に戻る
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 売買履歴チャートとトレード履歴を横並び表示 */}
        <div className="flex gap-4" style={{height: '85vh'}}>
          {/* 4つのチャート表示セクション */}
          <div className="bg-bg-card rounded-lg p-3 border border-border flex flex-col" style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-text-strong">売買履歴チャート</h2>
              <div className="flex items-center gap-4">
                {/* マーカー表示設定 */}
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>売買表示:</span>
                  {TIMEFRAMES.map(tf => (
                    <label key={tf} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={markerVisibility[tf]}
                        onChange={(e) => setMarkerVisibility(prev => ({ ...prev, [tf]: e.target.checked }))}
                        className="w-3 h-3 accent-blue-500 cursor-pointer"
                      />
                      <span>{TIMEFRAME_LABELS[tf].split('(')[0]}</span>
                    </label>
                  ))}
                </div>
                {/* 凡例 */}
                <div className="flex gap-3 text-xs text-text-secondary">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-buy rounded-full"></span>
                    <span>買い</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-sell rounded-full"></span>
                    <span>売り</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#FFD700' }}></span>
                    <span>選択中</span>
                  </div>
                </div>
              </div>
            </div>

            {chartLoading ? (
              <div className="flex items-center justify-center flex-1 text-text-secondary">
                <div className="text-lg">読み込み中...</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 flex-1" style={{ gridTemplateRows: '1fr 1fr' }}>
                {TIMEFRAMES.map(tf => (
                  <div
                    key={tf}
                    className="border border-border rounded overflow-hidden flex flex-col"
                    onMouseEnter={() => setActiveChart(tf)}
                    onMouseLeave={() => setActiveChart(null)}
                  >
                    <div className="bg-bg-secondary px-2 py-1 text-xs font-semibold text-text-strong border-b border-border">
                      {TIMEFRAME_LABELS[tf]}
                    </div>
                    {candlesByTimeframe[tf].length > 0 ? (
                      <div
                        ref={(el) => { chartContainerRefs.current[tf] = el }}
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <div className="flex items-center justify-center flex-1 text-text-secondary text-sm">
                        データなし
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* トレード履歴テーブル */}
          <div className="bg-bg-card rounded-lg p-3 border border-border flex flex-col" style={{ width: '23%' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-text-strong">トレード履歴</h2>
              {selectedTradeIndex !== null && (
                <button
                  onClick={() => setSelectedTradeIndex(null)}
                  className="px-2 py-1 text-xs bg-btn-secondary text-text-strong rounded hover:opacity-80"
                >
                  選択解除
                </button>
              )}
            </div>
            {trades.length > 0 ? (
              <>
                <div className="text-xs text-text-secondary mb-2">
                  ※ 行クリックでチャートにハイライト
                </div>
                <div className="overflow-x-auto flex-1 overflow-y-auto border border-border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-bg-primary sticky top-0">
                      <tr className="border-b border-border">
                        <th className="px-2 py-1.5 text-left text-text-secondary font-semibold">日時</th>
                        <th className="px-2 py-1.5 text-center text-text-secondary font-semibold">売買</th>
                        <th className="px-2 py-1.5 text-right text-text-secondary font-semibold">損益</th>
                        <th className="px-2 py-1.5 text-right text-text-secondary font-semibold">pips</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade, index) => (
                        <tr
                          key={trade.trade_id || index}
                          className={`border-b border-border cursor-pointer transition-colors ${
                            selectedTradeIndex === index
                              ? 'bg-btn-primary bg-opacity-30 hover:bg-opacity-40'
                              : 'hover:bg-bg-secondary'
                          }`}
                          onClick={() => setSelectedTradeIndex(selectedTradeIndex === index ? null : index)}
                          title={`エントリー: ${trade.entry_price.toFixed(3)} → 決済: ${trade.exit_price.toFixed(3)}`}
                        >
                          <td className="px-2 py-1.5 text-text-primary">
                            {new Date(trade.closed_at).toLocaleString('ja-JP', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              trade.side === 'buy' ? 'bg-buy bg-opacity-20 text-buy' : 'bg-sell bg-opacity-20 text-sell'
                            }`}>
                              {trade.side === 'buy' ? '買' : '売'}
                            </span>
                          </td>
                          <td className={`px-2 py-1.5 text-right font-bold ${
                            trade.realized_pnl >= 0 ? 'text-buy' : 'text-sell'
                          }`}>
                            {trade.realized_pnl >= 0 ? '+' : ''}¥{trade.realized_pnl.toLocaleString()}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-bold ${
                            trade.realized_pnl_pips >= 0 ? 'text-buy' : 'text-sell'
                          }`}>
                            {trade.realized_pnl_pips >= 0 ? '+' : ''}{trade.realized_pnl_pips.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center flex-1 text-text-secondary">
                <div className="text-base">取引データなし</div>
              </div>
            )}
          </div>
        </div>

        {/* 主要指標カード */}
        {performance && performance.basic.total_trades > 0 ? (
          <div className="grid grid-cols-4 gap-4 text-base">
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-text-secondary mb-1">勝率</div>
              <div className={`font-bold ${performance.basic.win_rate >= 50 ? 'text-buy' : 'text-text-strong'}`}>
                {performance.basic.win_rate.toFixed(1)}%
              </div>
              <div className="text-text-secondary mt-2">
                勝{performance.basic.winning_trades} / 負{performance.basic.losing_trades} / 計{performance.basic.total_trades}
              </div>
            </div>
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-text-secondary mb-1">プロフィットファクター</div>
              <div className={`font-bold ${performance.risk_return.profit_factor >= 1 ? 'text-buy' : 'text-sell'}`}>
                {performance.risk_return.profit_factor.toFixed(2)}
              </div>
              <div className="text-text-secondary mt-2">
                総利益 ¥{performance.basic.gross_profit.toLocaleString()} / 総損失 ¥{Math.abs(performance.basic.gross_loss).toLocaleString()}
              </div>
            </div>
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-text-secondary mb-1">最大ドローダウン</div>
              <div className="font-bold text-sell">
                {performance.drawdown.max_drawdown_percent.toFixed(2)}%
              </div>
              <div className="text-text-secondary mt-2">
                ¥{performance.drawdown.max_drawdown.toLocaleString()}
              </div>
            </div>
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-text-secondary mb-1">トータル損益</div>
              <div className={`font-bold ${performance.basic.total_pnl >= 0 ? 'text-buy' : 'text-sell'}`}>
                {performance.basic.total_pnl >= 0 ? '+' : ''}¥{performance.basic.total_pnl.toLocaleString()}
              </div>
              {equityCurve && (
                <div className="text-text-secondary mt-2">
                  開始 ¥{equityCurve.initial_balance.toLocaleString()} → 終了 ¥{equityCurve.final_balance.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <div className="flex items-center justify-center h-32 text-text-secondary">
              <div className="text-center">
                <div className="text-lg mb-2">取引データがありません</div>
                <div className="text-sm">シミュレーションを実行して取引を行ってください</div>
              </div>
            </div>
          </div>
        )}

        {/* リスクリターン指標 / 連続記録 / シミュレーション期間：横並び */}
        {performance && performance.basic.total_trades > 0 && (
          <div className="grid grid-cols-3 gap-4 text-base">
            {/* リスクリターン指標 */}
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <h2 className="font-semibold text-text-strong mb-3">リスクリターン指標</h2>
              <div className="grid gap-y-2" style={{ gridTemplateColumns: 'auto 1fr auto 1fr' }}>
                <span className="text-text-primary pr-2">平均利益:</span>
                <span className="text-buy font-semibold text-right pr-4">¥{performance.risk_return.average_win.toLocaleString()}</span>
                <span className="text-text-primary pr-2">最大利益:</span>
                <span className="text-buy font-semibold text-right">
                  ¥{performance.risk_return.max_win.toLocaleString()} ({performance.risk_return.max_win_pips.toFixed(1)}pips)
                </span>

                <span className="text-text-primary pr-2">平均損失:</span>
                <span className="text-sell font-semibold text-right pr-4">¥{performance.risk_return.average_loss.toLocaleString()}</span>
                <span className="text-text-primary pr-2">最大損失:</span>
                <span className="text-sell font-semibold text-right">
                  ¥{performance.risk_return.max_loss.toLocaleString()} ({performance.risk_return.max_loss_pips.toFixed(1)}pips)
                </span>

                <span className="text-text-primary pr-2">リスクリワード比:</span>
                <span className="text-text-strong font-semibold text-right pr-4">{performance.risk_return.risk_reward_ratio.toFixed(2)}</span>
                <span className="text-text-primary pr-2">DD継続期間:</span>
                <span className="text-text-strong font-semibold text-right">{performance.drawdown.max_drawdown_duration_days}日</span>
              </div>
            </div>

            {/* 連続記録 */}
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <h2 className="font-semibold text-text-strong mb-3">連続記録</h2>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">最大連勝:</span>
                  <span className="text-buy font-bold">{performance.consecutive.max_consecutive_wins}回</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">最大連敗:</span>
                  <span className="text-sell font-bold">{performance.consecutive.max_consecutive_losses}回</span>
                </div>
              </div>
            </div>

            {/* シミュレーション期間 */}
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <h2 className="font-semibold text-text-strong mb-3">シミュレーション期間</h2>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">開始日時</span>
                  <span className="text-text-strong font-semibold">{new Date(performance.period.start_date).toLocaleString('ja-JP')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">終了日時</span>
                  <span className="text-text-strong font-semibold">{new Date(performance.period.end_date).toLocaleString('ja-JP')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">期間</span>
                  <span className="text-text-strong font-bold">{performance.period.duration_days}日間</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 資産曲線 + ドローダウン：4カラム横並び */}
        {(equityCurve && equityCurve.points.length > 0) || (drawdown && drawdown.points.length > 0) ? (
          <div className="flex gap-2" style={{ height: '340px' }}>
            {/* 資産曲線グラフ */}
            {equityCurve && equityCurve.points.length > 0 && (
              <div className="flex-1 min-w-0 bg-bg-card rounded-lg p-2 border border-border flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-text-strong">資産曲線グラフ</h2>
                  {selectedEquityIndex !== null && (
                    <button
                      onClick={() => setSelectedEquityIndex(null)}
                      className="px-1.5 py-0.5 text-xs bg-btn-secondary text-text-strong rounded hover:opacity-80"
                    >
                      選択解除
                    </button>
                  )}
                </div>
                <div className="flex-1 min-h-0 border border-border rounded overflow-hidden bg-[#1a1a1a] p-1">
                  {(() => {
                    const points = equityCurve.points
                    const values = points.map(p => p.equity)
                    const minVal = Math.min(...values)
                    const maxVal = Math.max(...values)
                    const range = maxVal - minVal || 1
                    const svgW = 400
                    const svgH = 280
                    const pad = { top: 15, right: 55, bottom: 25, left: 8 }
                    const w = svgW - pad.left - pad.right
                    const h = svgH - pad.top - pad.bottom
                    const toX = (i: number) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2)
                    const toY = (v: number) => pad.top + h - ((v - minVal) / range) * h
                    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.equity).toFixed(1)}`).join(' ')
                    const gridLines = 4
                    return (
                      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full" preserveAspectRatio="none">
                        {Array.from({ length: gridLines + 1 }, (_, i) => {
                          const val = minVal + (range * i) / gridLines
                          const y = toY(val)
                          return (
                            <g key={i}>
                              <line x1={pad.left} y1={y} x2={svgW - pad.right} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                              <text x={svgW - pad.right + 4} y={y + 3} fill="#8a8a8a" fontSize="9" textAnchor="start">
                                ¥{Math.round(val).toLocaleString()}
                              </text>
                            </g>
                          )
                        })}
                        {[0, points.length - 1].map(i => (
                          <text key={i} x={toX(i)} y={svgH - 4} fill="#8a8a8a" fontSize="8" textAnchor="middle">
                            {new Date(points[i].timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit' })}
                          </text>
                        ))}
                        <path d={pathD} fill="none" stroke="#26a69a" strokeWidth="2" />
                        {points.map((p, i) => (
                          <circle
                            key={i}
                            cx={toX(i)}
                            cy={toY(p.equity)}
                            r={selectedEquityIndex === i ? 6 : 3}
                            fill={selectedEquityIndex === i ? '#FFD700' : '#26a69a'}
                            stroke={selectedEquityIndex === i ? '#FFD700' : 'none'}
                            strokeWidth="2"
                            className="cursor-pointer"
                            onClick={() => setSelectedEquityIndex(selectedEquityIndex === i ? null : i)}
                          />
                        ))}
                        {selectedEquityIndex !== null && points[selectedEquityIndex] && (
                          <text
                            x={toX(selectedEquityIndex)}
                            y={toY(points[selectedEquityIndex].equity) - 10}
                            fill="#FFD700"
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            ¥{points[selectedEquityIndex].equity.toLocaleString()}
                          </text>
                        )}
                      </svg>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* 資産曲線データ一覧 */}
            {equityCurve && equityCurve.points.length > 0 && (
              <div className="flex-1 min-w-0 bg-bg-card rounded-lg p-2 border border-border flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-text-strong">資産曲線データ</h2>
                  <span className="text-xs text-text-secondary">全{equityCurve.points.length}件</span>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0 border border-border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-bg-primary sticky top-0">
                      <tr className="border-b border-border">
                        <th className="px-1.5 py-1 text-left text-text-secondary font-semibold">日時</th>
                        <th className="px-1.5 py-1 text-right text-text-secondary font-semibold">残高</th>
                        <th className="px-1.5 py-1 text-right text-text-secondary font-semibold">有効証拠金</th>
                        <th className="px-1.5 py-1 text-right text-text-secondary font-semibold">累積損益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equityCurve.points.map((point, index) => (
                        <tr
                          key={index}
                          className={`border-b border-border cursor-pointer transition-colors ${
                            selectedEquityIndex === index
                              ? 'bg-btn-primary bg-opacity-30 hover:bg-opacity-40'
                              : 'hover:bg-bg-secondary'
                          }`}
                          onClick={() => setSelectedEquityIndex(selectedEquityIndex === index ? null : index)}
                        >
                          <td className="px-1.5 py-1 text-text-primary">
                            {new Date(point.timestamp).toLocaleString('ja-JP', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-1.5 py-1 text-right text-text-primary">¥{point.balance.toLocaleString()}</td>
                          <td className="px-1.5 py-1 text-right text-text-primary">¥{point.equity.toLocaleString()}</td>
                          <td className={`px-1.5 py-1 text-right font-bold ${point.cumulative_pnl >= 0 ? 'text-buy' : 'text-sell'}`}>
                            {point.cumulative_pnl >= 0 ? '+' : ''}¥{point.cumulative_pnl.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ドローダウングラフ */}
            {drawdown && drawdown.points.length > 0 && (
              <div className="flex-1 min-w-0 bg-bg-card rounded-lg p-2 border border-border flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-text-strong">ドローダウングラフ</h2>
                  {selectedDrawdownIndex !== null && (
                    <button
                      onClick={() => setSelectedDrawdownIndex(null)}
                      className="px-1.5 py-0.5 text-xs bg-btn-secondary text-text-strong rounded hover:opacity-80"
                    >
                      選択解除
                    </button>
                  )}
                </div>
                <div className="flex-1 min-h-0 border border-border rounded overflow-hidden bg-[#1a1a1a] p-1">
                  {(() => {
                    const points = drawdown.points
                    const absValues = points.map(p => Math.abs(p.drawdown_percent))
                    const maxVal = Math.max(...absValues, 0.01)
                    const svgW = 400
                    const svgH = 280
                    const pad = { top: 15, right: 45, bottom: 25, left: 8 }
                    const w = svgW - pad.left - pad.right
                    const h = svgH - pad.top - pad.bottom
                    const toX = (i: number) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2)
                    const toY = (v: number) => pad.top + (v / maxVal) * h
                    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(Math.abs(p.drawdown_percent)).toFixed(1)}`).join(' ')
                    const areaD = pathD + ` L${toX(points.length - 1).toFixed(1)},${pad.top} L${toX(0).toFixed(1)},${pad.top} Z`
                    const gridLines = 4
                    return (
                      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full" preserveAspectRatio="none">
                        {Array.from({ length: gridLines + 1 }, (_, i) => {
                          const val = (maxVal * i) / gridLines
                          const y = toY(val)
                          return (
                            <g key={i}>
                              <line x1={pad.left} y1={y} x2={svgW - pad.right} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                              <text x={svgW - pad.right + 4} y={y + 3} fill="#8a8a8a" fontSize="9" textAnchor="start">
                                {val > 0 ? `-${val.toFixed(1)}%` : '0%'}
                              </text>
                            </g>
                          )
                        })}
                        {[0, points.length - 1].map(i => (
                          <text key={i} x={toX(i)} y={svgH - 4} fill="#8a8a8a" fontSize="8" textAnchor="middle">
                            {new Date(points[i].timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit' })}
                          </text>
                        ))}
                        <path d={areaD} fill="#ef535020" />
                        <path d={pathD} fill="none" stroke="#ef5350" strokeWidth="2" />
                        {points.map((p, i) => (
                          <circle
                            key={i}
                            cx={toX(i)}
                            cy={toY(Math.abs(p.drawdown_percent))}
                            r={selectedDrawdownIndex === i ? 6 : 3}
                            fill={selectedDrawdownIndex === i ? '#FFD700' : '#ef5350'}
                            stroke={selectedDrawdownIndex === i ? '#FFD700' : 'none'}
                            strokeWidth="2"
                            className="cursor-pointer"
                            onClick={() => setSelectedDrawdownIndex(selectedDrawdownIndex === i ? null : i)}
                          />
                        ))}
                        {selectedDrawdownIndex !== null && points[selectedDrawdownIndex] && (
                          <text
                            x={toX(selectedDrawdownIndex)}
                            y={toY(Math.abs(points[selectedDrawdownIndex].drawdown_percent)) + 16}
                            fill="#FFD700"
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {points[selectedDrawdownIndex].drawdown_percent.toFixed(2)}%
                          </text>
                        )}
                      </svg>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* ドローダウンデータ一覧 */}
            {drawdown && drawdown.points.length > 0 && (
              <div className="flex-1 min-w-0 bg-bg-card rounded-lg p-2 border border-border flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-text-strong">ドローダウンデータ</h2>
                  <span className="text-xs text-text-secondary">全{drawdown.points.length}件</span>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0 border border-border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-bg-primary sticky top-0">
                      <tr className="border-b border-border">
                        <th className="px-1.5 py-1 text-left text-text-secondary font-semibold">日時</th>
                        <th className="px-1.5 py-1 text-right text-text-secondary font-semibold">有効証拠金</th>
                        <th className="px-1.5 py-1 text-right text-text-secondary font-semibold">DD金額</th>
                        <th className="px-1.5 py-1 text-right text-text-secondary font-semibold">DD率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawdown.points.map((point, index) => (
                        <tr
                          key={index}
                          className={`border-b border-border cursor-pointer transition-colors ${
                            selectedDrawdownIndex === index
                              ? 'bg-btn-primary bg-opacity-30 hover:bg-opacity-40'
                              : 'hover:bg-bg-secondary'
                          }`}
                          onClick={() => setSelectedDrawdownIndex(selectedDrawdownIndex === index ? null : index)}
                          title={`ピーク証拠金: ¥${point.peak_equity.toLocaleString()}`}
                        >
                          <td className="px-1.5 py-1 text-text-primary">
                            {new Date(point.timestamp).toLocaleString('ja-JP', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-1.5 py-1 text-right text-text-primary">¥{point.equity.toLocaleString()}</td>
                          <td className="px-1.5 py-1 text-right text-sell">¥{point.drawdown.toLocaleString()}</td>
                          <td className="px-1.5 py-1 text-right font-bold text-sell">{point.drawdown_percent.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default AnalysisPage
