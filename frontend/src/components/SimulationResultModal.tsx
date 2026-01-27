import { useState, useEffect } from 'react'
import { accountApi, tradesApi, Trade } from '../services/api'

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
  })
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

      if (tradesRes.success && tradesRes.data) {
        const trades: Trade[] = tradesRes.data.trades
        totalTrades = trades.length
        wins = trades.filter((t) => t.realized_pnl > 0).length
        losses = trades.filter((t) => t.realized_pnl < 0).length
      }

      const profitLossPercent = initialBalance > 0
        ? ((profitLoss / initialBalance) * 100)
        : 0

      setResult({
        finalBalance,
        initialBalance,
        profitLoss,
        profitLossPercent,
        totalTrades,
        wins,
        losses,
      })
    } catch (error) {
      console.error('Failed to fetch results:', error)
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
      <div className="bg-bg-card rounded-lg p-6 w-96">
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
            <div className="space-y-3">
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

              <div className="bg-bg-primary rounded p-3">
                <div className="text-text-primary text-sm">確定損益</div>
                <div className={`text-xl font-bold ${result.profitLoss >= 0 ? 'text-buy' : 'text-sell'}`}>
                  {result.profitLoss >= 0 ? '+' : ''}¥{result.profitLoss.toLocaleString()}
                  <span className="text-sm ml-1">
                    ({result.profitLoss >= 0 ? '+' : ''}{result.profitLossPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

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
            </div>

            <div className="flex gap-2 mt-6">
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
