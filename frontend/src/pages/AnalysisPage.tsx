import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyticsApi, tradesApi, PerformanceMetrics, EquityCurveData, DrawdownData, Trade, Candle } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts'
import { logger } from '../utils/logger'

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

  // Chart state
  const [trades, setTrades] = useState<Trade[]>([])
  const [candles, setCandles] = useState<Candle[]>([])
  const [timeframe, setTimeframe] = useState<'W1' | 'D1' | 'H1' | 'M10'>('H1')
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

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

  // Fetch trades and candles for chart
  useEffect(() => {
    const fetchChartData = async () => {
      if (!simulationId) {
        setTrades([])
        setCandles([])
        setChartError(null)
        return
      }

      try {
        setChartLoading(true)
        setChartError(null)

        const result = await analyticsApi.getTradesWithCandles(timeframe)

        if (result.success && result.data) {
          // データ検証: trades と candles が配列であることを確認
          const validTrades = Array.isArray(result.data.trades) ? result.data.trades : []
          const validCandles = Array.isArray(result.data.candles) ? result.data.candles : []

          // タイムスタンプの検証
          const filteredCandles = validCandles.filter(candle => {
            if (!candle.timestamp) {
              logger.warning('AnalysisPage', 'Invalid candle: missing timestamp', { candle })
              return false
            }
            const date = new Date(candle.timestamp)
            if (isNaN(date.getTime())) {
              logger.warning('AnalysisPage', 'Invalid candle: invalid timestamp', { timestamp: candle.timestamp })
              return false
            }
            return true
          })

          setTrades(validTrades)
          setCandles(filteredCandles)
        } else {
          // データ取得に失敗した場合、空配列にリセット
          logger.warning('AnalysisPage', 'チャートデータの取得に失敗またはデータなし')
          setTrades([])
          setCandles([])
        }
      } catch (error) {
        logger.error('AnalysisPage', 'チャートデータの取得に失敗しました', { error })
        setChartError(error instanceof Error ? error.message : 'チャートデータの取得に失敗しました')
        // エラーが発生した場合も空配列にリセット
        setTrades([])
        setCandles([])
      } finally {
        setChartLoading(false)
      }
    }

    fetchChartData()
  }, [simulationId, timeframe])

  // Create and render chart
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) {
      return
    }

    try {
      // Create chart
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 500,
        layout: {
          background: { color: '#1a1a1a' },
          textColor: '#d1d4dc',
          fontSize: 16,
        },
        grid: {
          vertLines: { color: '#2a2a2a' },
          horzLines: { color: '#2a2a2a' },
        },
        localization: {
          // 時刻表示を yyyy/mm/dd HH:mm 形式にカスタマイズ
          timeFormatter: (timestamp: number) => {
            const date = new Date(timestamp * 1000)
            const year = date.getUTCFullYear()
            const month = String(date.getUTCMonth() + 1).padStart(2, '0')
            const day = String(date.getUTCDate()).padStart(2, '0')
            const hour = String(date.getUTCHours()).padStart(2, '0')
            const minute = String(date.getUTCMinutes()).padStart(2, '0')
            return `${year}/${month}/${day} ${hour}:${minute}`
          },
        },
        timeScale: {
          borderColor: '#485c7b',
          timeVisible: true, // すべてのタイムフレームで時刻を表示
          secondsVisible: false,
        },
      })

      chartRef.current = chart

      // Create candlestick series
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      })

      candleSeriesRef.current = candleSeries

      // Convert candles to chart data format with validation
      const chartData: CandlestickData[] = candles
        .map((candle) => {
          const timestamp = new Date(candle.timestamp).getTime() / 1000
          if (isNaN(timestamp)) {
            logger.warning('AnalysisPage', 'Invalid timestamp in candle', { candle })
            return null
          }
          return {
            time: timestamp as Time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }
        })
        .filter((data): data is CandlestickData => data !== null)

      if (chartData.length === 0) {
        logger.warning('AnalysisPage', 'フィルタリング後に有効なチャートデータがありません')
        chart.remove()
        return
      }

      candleSeries.setData(chartData)

      // Create a set of valid times from chart data for marker validation
      const validTimes = new Set(chartData.map(d => d.time))

      // Helper function to find the nearest valid candle time
      const findNearestValidTime = (targetTime: number): number | null => {
        // If the exact time exists, use it
        if (validTimes.has(targetTime as Time)) {
          return targetTime
        }

        // Find the nearest time
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

      // Add trade markers with validation and time adjustment
      const markers = trades
        .flatMap((trade) => {
          if (!trade.opened_at || !trade.closed_at) {
            logger.warning('AnalysisPage', 'Trade missing timestamps', { trade })
            return []
          }

          const entryTime = new Date(trade.opened_at).getTime() / 1000
          const exitTime = new Date(trade.closed_at).getTime() / 1000

          if (isNaN(entryTime) || isNaN(exitTime)) {
            logger.warning('AnalysisPage', 'Invalid trade timestamps', { trade })
            return []
          }

          // Find nearest valid times for markers
          const nearestEntryTime = findNearestValidTime(entryTime)
          const nearestExitTime = findNearestValidTime(exitTime)

          if (nearestEntryTime === null || nearestExitTime === null) {
            logger.warning('AnalysisPage', 'Could not find valid times for trade markers', { trade })
            return []
          }

          return [
            // Entry marker
            {
              time: nearestEntryTime as Time,
              position: trade.side === 'buy' ? 'belowBar' : 'aboveBar',
              color: trade.side === 'buy' ? '#26a69a' : '#ef5350',
              shape: trade.side === 'buy' ? 'arrowUp' : 'arrowDown',
              text: `${trade.side === 'buy' ? '買' : '売'}\n${trade.entry_price.toFixed(3)}`,
            },
            // Exit marker
            {
              time: nearestExitTime as Time,
              position: trade.realized_pnl >= 0 ? 'aboveBar' : 'belowBar',
              color: trade.realized_pnl >= 0 ? '#26a69a' : '#ef5350',
              shape: 'circle',
              text: `${trade.exit_price.toFixed(3)}（${trade.realized_pnl >= 0 ? '+' : ''}${trade.realized_pnl_pips.toFixed(1)}p：${trade.realized_pnl >= 0 ? '+' : ''}¥${trade.realized_pnl.toLocaleString()}）`,
            },
          ]
        })
        // Sort markers by time to ensure they are in chronological order
        .sort((a, b) => (a.time as number) - (b.time as number))

      if (markers.length > 0) {
        candleSeries.setMarkers(markers as any)
      }

      // Fit content
      chart.timeScale().fitContent()

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
          })
        }
      }

      window.addEventListener('resize', handleResize)

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize)
        chart.remove()
        chartRef.current = null
        candleSeriesRef.current = null
      }
    } catch (error) {
      logger.error('AnalysisPage', 'チャートの作成または描画に失敗しました', { error })
      setChartError('チャートの描画に失敗しました')
    }
  }, [candles, trades])

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
        // ページをリロードしてデータを更新
        window.location.reload()
      }
    } catch (error) {
      logger.error('AnalysisPage', 'インポートに失敗しました', { error })
      alert(error instanceof Error ? error.message : 'インポートに失敗しました')
    }

    // ファイル入力をリセット
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

  // 取引データが0件でも分析画面を表示する（チャートと統計情報は空の状態で表示）

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="bg-bg-card border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-strong">パフォーマンス分析</h1>
          <div className="flex gap-2">
            {/* インポートボタン */}
            <label className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80 cursor-pointer">
              インポート
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleImport}
                className="hidden"
              />
            </label>

            {/* エクスポートボタン（ドロップダウン） */}
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

      <div className="p-6 space-y-6">
        {/* チャート表示セクション */}
        <div className="bg-bg-card rounded-lg p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text-strong">売買履歴チャート</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeframe('M10')}
                className={`px-3 py-1 rounded text-sm ${
                  timeframe === 'M10'
                    ? 'bg-btn-primary text-text-strong'
                    : 'bg-bg-secondary text-text-primary hover:opacity-80'
                }`}
              >
                10分足
              </button>
              <button
                onClick={() => setTimeframe('H1')}
                className={`px-3 py-1 rounded text-sm ${
                  timeframe === 'H1'
                    ? 'bg-btn-primary text-text-strong'
                    : 'bg-bg-secondary text-text-primary hover:opacity-80'
                }`}
              >
                1時間足
              </button>
              <button
                onClick={() => setTimeframe('D1')}
                className={`px-3 py-1 rounded text-sm ${
                  timeframe === 'D1'
                    ? 'bg-btn-primary text-text-strong'
                    : 'bg-bg-secondary text-text-primary hover:opacity-80'
                }`}
              >
                日足
              </button>
              <button
                onClick={() => setTimeframe('W1')}
                className={`px-3 py-1 rounded text-sm ${
                  timeframe === 'W1'
                    ? 'bg-btn-primary text-text-strong'
                    : 'bg-bg-secondary text-text-primary hover:opacity-80'
                }`}
              >
                週足
              </button>
            </div>
          </div>

          {/* チャートエリア */}
          {chartLoading ? (
            <div className="flex items-center justify-center h-[500px] text-text-secondary">
              <div className="text-center">
                <div className="text-lg mb-2">読み込み中...</div>
                <div className="text-sm">チャートデータを取得しています</div>
              </div>
            </div>
          ) : chartError ? (
            <div className="flex items-center justify-center h-[500px] text-text-secondary">
              <div className="text-center">
                <div className="text-lg mb-2 text-sell">エラーが発生しました</div>
                <div className="text-sm">{chartError}</div>
              </div>
            </div>
          ) : candles.length > 0 ? (
            <>
              <div ref={chartContainerRef} className="w-full" />
              <div className="mt-4 text-sm text-text-secondary">
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 bg-buy rounded-full"></span>
                    <span>買いエントリー</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 bg-sell rounded-full"></span>
                    <span>売りエントリー</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-text-secondary rounded-full"></span>
                    <span>決済</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[500px] text-text-secondary">
              <div className="text-center">
                <div className="text-lg mb-2">データがありません</div>
                <div className="text-sm">この時間足では表示できるデータがありません</div>
              </div>
            </div>
          )}
        </div>

        {/* トレード履歴テーブル */}
        {trades.length > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">トレード履歴</h2>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-border rounded">
              <table className="w-full text-sm">
                <thead className="bg-bg-primary sticky top-0">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-text-secondary font-semibold">エントリー日時</th>
                    <th className="px-3 py-2 text-left text-text-secondary font-semibold">決済日時</th>
                    <th className="px-3 py-2 text-center text-text-secondary font-semibold">売買</th>
                    <th className="px-3 py-2 text-right text-text-secondary font-semibold">ロット</th>
                    <th className="px-3 py-2 text-right text-text-secondary font-semibold">エントリー</th>
                    <th className="px-3 py-2 text-right text-text-secondary font-semibold">決済</th>
                    <th className="px-3 py-2 text-right text-text-secondary font-semibold">損益(JPY)</th>
                    <th className="px-3 py-2 text-right text-text-secondary font-semibold">損益(pips)</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade, index) => (
                    <tr key={trade.trade_id || index} className="border-b border-border hover:bg-bg-secondary">
                      <td className="px-3 py-2 text-text-primary">
                        {new Date(trade.opened_at).toLocaleString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-3 py-2 text-text-primary">
                        {new Date(trade.closed_at).toLocaleString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          trade.side === 'buy' ? 'bg-buy bg-opacity-20 text-buy' : 'bg-sell bg-opacity-20 text-sell'
                        }`}>
                          {trade.side === 'buy' ? '買い' : '売り'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-text-primary">{trade.lot_size}</td>
                      <td className="px-3 py-2 text-right text-text-primary">{trade.entry_price.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right text-text-primary">{trade.exit_price.toFixed(3)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${
                        trade.realized_pnl >= 0 ? 'text-buy' : 'text-sell'
                      }`}>
                        {trade.realized_pnl >= 0 ? '+' : ''}¥{trade.realized_pnl.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${
                        trade.realized_pnl_pips >= 0 ? 'text-buy' : 'text-sell'
                      }`}>
                        {trade.realized_pnl_pips >= 0 ? '+' : ''}{trade.realized_pnl_pips.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 主要指標カード */}
        {performance && performance.basic.total_trades > 0 ? (
          <div className="grid grid-cols-4 gap-4">
            {/* 勝率カード */}
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-sm text-text-secondary mb-1">勝率</div>
              <div className={`text-3xl font-bold ${performance.basic.win_rate >= 50 ? 'text-buy' : 'text-text-strong'}`}>
                {performance.basic.win_rate.toFixed(1)}%
              </div>
              <div className="text-xs text-text-secondary mt-2">
                勝{performance.basic.winning_trades} / 負{performance.basic.losing_trades} / 計{performance.basic.total_trades}
              </div>
            </div>

            {/* プロフィットファクターカード */}
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-sm text-text-secondary mb-1">プロフィットファクター</div>
              <div className={`text-3xl font-bold ${performance.risk_return.profit_factor >= 1 ? 'text-buy' : 'text-sell'}`}>
                {performance.risk_return.profit_factor.toFixed(2)}
              </div>
              <div className="text-xs text-text-secondary mt-2">
                総利益 ¥{performance.basic.gross_profit.toLocaleString()} / 総損失 ¥{Math.abs(performance.basic.gross_loss).toLocaleString()}
              </div>
            </div>

            {/* 最大ドローダウンカード */}
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-sm text-text-secondary mb-1">最大ドローダウン</div>
              <div className="text-3xl font-bold text-sell">
                {performance.drawdown.max_drawdown_percent.toFixed(2)}%
              </div>
              <div className="text-xs text-text-secondary mt-2">
                ¥{performance.drawdown.max_drawdown.toLocaleString()}
              </div>
            </div>

            {/* トータル損益カード */}
            <div className="bg-bg-card rounded-lg p-4 border border-border">
              <div className="text-sm text-text-secondary mb-1">トータル損益</div>
              <div className={`text-3xl font-bold ${performance.basic.total_pnl >= 0 ? 'text-buy' : 'text-sell'}`}>
                {performance.basic.total_pnl >= 0 ? '+' : ''}¥{performance.basic.total_pnl.toLocaleString()}
              </div>
              {equityCurve && (
                <div className="text-xs text-text-secondary mt-2">
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

        {/* リスク・リターン指標 */}
        {performance && performance.basic.total_trades > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">リスク・リターン指標</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-text-primary">平均利益:</span>
                    <span className="text-buy font-semibold">¥{performance.risk_return.average_win.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-primary">平均損失:</span>
                    <span className="text-sell font-semibold">¥{performance.risk_return.average_loss.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-primary">リスクリワード比:</span>
                    <span className="text-text-strong font-semibold">{performance.risk_return.risk_reward_ratio.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-text-primary">最大利益:</span>
                    <span className="text-buy font-semibold">
                      ¥{performance.risk_return.max_win.toLocaleString()} ({performance.risk_return.max_win_pips.toFixed(1)}pips)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-primary">最大損失:</span>
                    <span className="text-sell font-semibold">
                      ¥{performance.risk_return.max_loss.toLocaleString()} ({performance.risk_return.max_loss_pips.toFixed(1)}pips)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-primary">DD継続期間:</span>
                    <span className="text-text-strong font-semibold">{performance.drawdown.max_drawdown_duration_days}日</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 連続記録 */}
        {performance && performance.basic.total_trades > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">連続記録</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex justify-between items-center">
                <span className="text-text-primary">最大連勝:</span>
                <span className="text-buy font-semibold text-2xl">{performance.consecutive.max_consecutive_wins}回</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-primary">最大連敗:</span>
                <span className="text-sell font-semibold text-2xl">{performance.consecutive.max_consecutive_losses}回</span>
              </div>
            </div>
          </div>
        )}

        {/* 期間情報 */}
        {performance && performance.basic.total_trades > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">シミュレーション期間</h2>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-text-secondary mb-1">開始日時</div>
                <div className="text-lg text-text-strong">{new Date(performance.period.start_date).toLocaleString('ja-JP')}</div>
              </div>
              <div>
                <div className="text-sm text-text-secondary mb-1">終了日時</div>
                <div className="text-lg text-text-strong">{new Date(performance.period.end_date).toLocaleString('ja-JP')}</div>
              </div>
              <div>
                <div className="text-sm text-text-secondary mb-1">期間</div>
                <div className="text-lg text-text-strong">{performance.period.duration_days}日間</div>
              </div>
            </div>
          </div>
        )}

        {/* 資産曲線データテーブル */}
        {equityCurve && equityCurve.points.length > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">資産曲線データ（最新10件）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-text-secondary">日時</th>
                    <th className="text-right py-2 text-text-secondary">残高</th>
                    <th className="text-right py-2 text-text-secondary">有効証拠金</th>
                    <th className="text-right py-2 text-text-secondary">累積損益</th>
                  </tr>
                </thead>
                <tbody>
                  {equityCurve.points.slice(-10).reverse().map((point, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="py-2 text-text-primary">
                        {new Date(point.timestamp).toLocaleString('ja-JP', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="text-right py-2 text-text-primary">¥{point.balance.toLocaleString()}</td>
                      <td className="text-right py-2 text-text-primary">¥{point.equity.toLocaleString()}</td>
                      <td className={`text-right py-2 ${point.cumulative_pnl >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {point.cumulative_pnl >= 0 ? '+' : ''}¥{point.cumulative_pnl.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ドローダウンデータテーブル */}
        {drawdown && drawdown.points.length > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">ドローダウンデータ（最新10件）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-text-secondary">日時</th>
                    <th className="text-right py-2 text-text-secondary">有効証拠金</th>
                    <th className="text-right py-2 text-text-secondary">ピーク証拠金</th>
                    <th className="text-right py-2 text-text-secondary">DD金額</th>
                    <th className="text-right py-2 text-text-secondary">DD率</th>
                  </tr>
                </thead>
                <tbody>
                  {drawdown.points.slice(-10).reverse().map((point, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="py-2 text-text-primary">
                        {new Date(point.timestamp).toLocaleString('ja-JP', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="text-right py-2 text-text-primary">¥{point.equity.toLocaleString()}</td>
                      <td className="text-right py-2 text-text-primary">¥{point.peak_equity.toLocaleString()}</td>
                      <td className="text-right py-2 text-sell">¥{point.drawdown.toLocaleString()}</td>
                      <td className="text-right py-2 text-sell">{point.drawdown_percent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AnalysisPage
