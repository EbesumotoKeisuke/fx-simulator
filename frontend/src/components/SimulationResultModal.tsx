import { useState, useEffect } from 'react'
import { accountApi, tradesApi, Trade } from '../services/api'
import { logger } from '../utils/logger'

interface SimulationResultModalProps {
  isOpen: boolean
  onClose: () => void
}

function SimulationResultModal({ isOpen, onClose }: SimulationResultModalProps) {
  const [result, setResult] = useState({
    finalBalance: 0,
    initialBalance: 0,
    profitLoss: 0,
    profitLossPercent: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    maxProfit: 0,         // 最大利確幅
    maxLoss: 0,           // 最大損失幅
    avgProfit: 0,         // 平均利確幅
    avgLoss: 0,           // 平均損切幅
    maxProfitPips: 0,     // 最大利確幅（pips）
    maxLossPips: 0,       // 最大損失幅（pips）
    avgProfitPips: 0,     // 平均利確幅（pips）
    avgLossPips: 0,       // 平均損切幅（pips）
  })
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchResults()
    }
  }, [isOpen])

  const fetchResults = async () => {
    setLoading(true)
    try {
      const [accountRes, tradesRes] = await Promise.all([
        accountApi.get(),
        tradesApi.getAll(1000, 0),
      ])

      let finalBalance = 0
      let initialBalance = 0
      let profitLoss = 0

      if (accountRes.success && accountRes.data) {
        finalBalance = accountRes.data.balance
        initialBalance = accountRes.data.initial_balance
        profitLoss = accountRes.data.realized_pnl
      }

      let totalTrades = 0
      let wins = 0
      let losses = 0
      let maxProfit = 0
      let maxLoss = 0
      let avgProfit = 0
      let avgLoss = 0
      let maxProfitPips = 0
      let maxLossPips = 0
      let avgProfitPips = 0
      let avgLossPips = 0

      if (tradesRes.success && tradesRes.data) {
        const tradesData: Trade[] = tradesRes.data.trades
        totalTrades = tradesData.length

        // トレードデータをstateに保存
        setTrades(tradesData)

        // 勝ちトレードと負けトレードを分類
        const winTrades = tradesData.filter((t) => t.realized_pnl > 0)
        const lossTrades = tradesData.filter((t) => t.realized_pnl < 0)

        wins = winTrades.length
        losses = lossTrades.length

        // 最大利確幅を計算（勝ちトレードの中で最大の利益）
        if (winTrades.length > 0) {
          maxProfit = Math.max(...winTrades.map(t => t.realized_pnl))
          // 最大利確のトレードを見つけてそのPips値を取得
          const maxProfitTrade = winTrades.find(t => t.realized_pnl === maxProfit)
          maxProfitPips = maxProfitTrade?.realized_pnl_pips || 0

          // 平均利確幅を計算
          const totalWinPnl = winTrades.reduce((sum, t) => sum + t.realized_pnl, 0)
          avgProfit = totalWinPnl / winTrades.length
          // 平均利確幅（pips）を計算
          const totalWinPips = winTrades.reduce((sum, t) => sum + t.realized_pnl_pips, 0)
          avgProfitPips = totalWinPips / winTrades.length

        }

        // 最大損失幅を計算（負けトレードの中で最大の損失、負の値）
        if (lossTrades.length > 0) {
          maxLoss = Math.min(...lossTrades.map(t => t.realized_pnl))
          // 最大損失のトレードを見つけてそのPips値を取得
          const maxLossTrade = lossTrades.find(t => t.realized_pnl === maxLoss)
          maxLossPips = maxLossTrade?.realized_pnl_pips || 0

          // 平均損切幅を計算
          const totalLossPnl = lossTrades.reduce((sum, t) => sum + t.realized_pnl, 0)
          avgLoss = totalLossPnl / lossTrades.length
          // 平均損切幅（pips）を計算
          const totalLossPips = lossTrades.reduce((sum, t) => sum + t.realized_pnl_pips, 0)
          avgLossPips = totalLossPips / lossTrades.length

        }
      } else {
        logger.warning('SimulationResultModal', 'トレードデータがないか、リクエストに失敗しました')
      }

      const profitLossPercent = initialBalance > 0
        ? ((profitLoss / initialBalance) * 100)
        : 0

      const finalResult = {
        finalBalance,
        initialBalance,
        profitLoss,
        profitLossPercent,
        totalTrades,
        wins,
        losses,
        maxProfit,
        maxLoss,
        avgProfit,
        avgLoss,
        maxProfitPips,
        maxLossPips,
        avgProfitPips,
        avgLossPips,
      }

      // console.log('[SimulationResult] Final result:', finalResult)

      setResult(finalResult)
    } catch (error) {
      logger.error('SimulationResultModal', `fetchResults error : ${error}`, { error })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const handleExportCsv = () => {
    tradesApi.export()
  }

  const winRate = result.totalTrades > 0
    ? ((result.wins / result.totalTrades) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-card rounded-lg p-6 w-[900px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-strong">シミュレーション結果</h2>
          <button onClick={onClose} className="text-text-primary hover:text-text-strong">
            ×
          </button>
        </div>

        {loading ? (
          <div className="text-center text-text-primary py-8">読み込み中...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {/* Row 1: Initial Balance | Final Balance */}
              <div className="bg-bg-primary rounded p-3">
                <div className="text-text-primary text-sm">初期資金</div>
                <div className="text-xl font-bold text-text-strong">
                  ¥{result.initialBalance.toLocaleString()}
                </div>
              </div>
              <div className="bg-bg-primary rounded p-3">
                <div className="text-text-primary text-sm">最終残高</div>
                <div className="text-xl font-bold text-text-strong">
                  ¥{result.finalBalance.toLocaleString()}
                </div>
              </div>

              {/* Row 2: Realized P&L - Full width */}
              <div className="col-span-2 bg-bg-primary rounded p-3">
                <div className="text-text-primary text-sm">確定損益</div>
                <div className={`text-xl font-bold ${result.profitLoss >= 0 ? 'text-buy' : 'text-sell'}`}>
                  {result.profitLoss >= 0 ? '+' : ''}¥{result.profitLoss.toLocaleString()}
                  <span className="text-sm ml-1">
                    ({result.profitLoss >= 0 ? '+' : ''}{result.profitLossPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Row 3: Trade Count | Win/Loss */}
              <div className="bg-bg-primary rounded p-3">
                <div className="text-text-primary text-sm">トレード回数</div>
                <div className="text-xl font-bold text-text-strong">{result.totalTrades} 回</div>
              </div>
              <div className="bg-bg-primary rounded p-3">
                <div className="text-text-primary text-sm">勝敗</div>
                <div className="text-xl font-bold text-text-strong">
                  <span className="text-buy">{result.wins}勝</span>
                  {' '}
                  <span className="text-sell">{result.losses}敗</span>
                  <span className="text-sm text-text-primary ml-2">
                    (勝率: {winRate}%)
                  </span>
                </div>
              </div>

              {/* Row 4-5: Max/Avg Profit & Loss - Conditional */}
              {result.totalTrades > 0 && (
                <>
                  <div className="bg-bg-primary rounded p-3">
                    <div className="text-text-primary text-sm">最大利確幅</div>
                    <div className="text-lg font-bold text-buy">
                      {result.maxProfit > 0 ? '+' : ''}¥{result.maxProfit.toLocaleString()}
                      <span className="text-sm ml-1">
                        ({result.maxProfitPips > 0 ? '+' : ''}{result.maxProfitPips.toFixed(1)} pips)
                      </span>
                    </div>
                  </div>
                  <div className="bg-bg-primary rounded p-3">
                    <div className="text-text-primary text-sm">最大損失幅</div>
                    <div className="text-lg font-bold text-sell">
                      {result.maxLoss >= 0 ? '+' : ''}¥{result.maxLoss.toLocaleString()}
                      <span className="text-sm ml-1">
                        ({result.maxLossPips >= 0 ? '+' : ''}{result.maxLossPips.toFixed(1)} pips)
                      </span>
                    </div>
                  </div>

                  {result.wins > 0 && (
                    <div className="bg-bg-primary rounded p-3">
                      <div className="text-text-primary text-sm">平均利確幅</div>
                      <div className="text-lg font-bold text-buy">
                        +¥{Math.round(result.avgProfit).toLocaleString()}
                        <span className="text-sm ml-1">
                          (+{result.avgProfitPips.toFixed(1)} pips)
                        </span>
                      </div>
                    </div>
                  )}
                  {result.losses > 0 && (
                    <div className="bg-bg-primary rounded p-3">
                      <div className="text-text-primary text-sm">平均損切幅</div>
                      <div className="text-lg font-bold text-sell">
                        ¥{Math.round(result.avgLoss).toLocaleString()}
                        <span className="text-sm ml-1">
                          ({result.avgLossPips.toFixed(1)} pips)
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* トレード履歴テーブル */}
            {trades.length > 0 && (
              <div className="mt-6">
                <h3 className="text-base font-bold text-text-strong mb-3">トレード履歴</h3>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-primary sticky top-0">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left text-text-primary font-semibold">エントリー日時</th>
                        <th className="px-3 py-2 text-left text-text-primary font-semibold">決済日時</th>
                        <th className="px-3 py-2 text-center text-text-primary font-semibold">売買</th>
                        <th className="px-3 py-2 text-right text-text-primary font-semibold">ロット</th>
                        <th className="px-3 py-2 text-right text-text-primary font-semibold">エントリー</th>
                        <th className="px-3 py-2 text-right text-text-primary font-semibold">決済</th>
                        <th className="px-3 py-2 text-right text-text-primary font-semibold">損益(JPY)</th>
                        <th className="px-3 py-2 text-right text-text-primary font-semibold">損益(pips)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade, index) => (
                        <tr key={trade.trade_id || index} className="border-b border-border hover:bg-bg-primary">
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

            <div className="grid grid-cols-2 gap-2 mt-6">
              <button
                onClick={handleExportCsv}
                disabled={loading}
                className="flex-1 py-2 bg-btn-secondary text-text-strong rounded hover:opacity-80 disabled:opacity-50"
                title={result.totalTrades === 0 ? 'トレード履歴がありません' : 'トレード履歴をCSV形式でダウンロード'}
              >
                CSV出力
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default SimulationResultModal
