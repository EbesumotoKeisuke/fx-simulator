import { useState, useEffect, useCallback } from 'react'
import { positionsApi, Position } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'

interface PositionPanelProps {
  refreshTrigger?: number
}

function PositionPanel({ refreshTrigger }: PositionPanelProps) {
  const [positions, setPositions] = useState<Position[]>([])
  const [totalPnl, setTotalPnl] = useState(0)
  const [loading, setLoading] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)

  const { status } = useSimulationStore()

  // デバッグ用：ステータスを確認
  console.log('[PositionPanel] status:', status)

  // 証拠金を計算する関数
  const calculateMargin = (price: number, lotSize: number): number => {
    const CURRENCY_PER_LOT = 100000 // 1ロット = 100,000通貨
    const LEVERAGE = 25 // レバレッジ25倍
    return (price * lotSize * CURRENCY_PER_LOT) / LEVERAGE
  }

  // 合計証拠金を計算
  const totalMargin = positions.reduce((sum: number, pos: Position) => {
    return sum + calculateMargin(pos.entry_price, pos.lot_size)
  }, 0)

  const fetchPositions = useCallback(async () => {
    if (status === 'idle') return

    try {
      const res = await positionsApi.getAll()
      if (res.success && res.data) {
        setPositions(res.data.positions)
        setTotalPnl(res.data.total_unrealized_pnl)
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error)
    }
  }, [status])

  useEffect(() => {
    fetchPositions()
  }, [fetchPositions, refreshTrigger])

  // 定期的にポジションを更新（5秒ごと）
  useEffect(() => {
    if (status !== 'running') return

    const interval = setInterval(() => {
      fetchPositions()
    }, 5000)

    return () => clearInterval(interval)
  }, [status, fetchPositions])

  const handleClose = async (positionId: string) => {
    setClosingId(positionId)
    try {
      const res = await positionsApi.close(positionId)
      if (res.success) {
        await fetchPositions()
      } else {
        alert(`決済エラー: ${res.error?.message}`)
      }
    } catch (error) {
      alert(`決済エラー: ${error}`)
    } finally {
      setClosingId(null)
    }
  }

  const handleCloseAll = async () => {
    if (positions.length === 0) return
    if (!confirm('すべてのポジションを決済しますか？')) return

    setLoading(true)
    try {
      for (const pos of positions) {
        await positionsApi.close(pos.position_id)
      }
      await fetchPositions()
    } catch (error) {
      alert(`決済エラー: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-bg-card rounded-lg p-3 h-full overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-text-strong">
          ポジション
          {positions.length > 0 && (
            <span className="ml-2 text-text-secondary">({positions.length})</span>
          )}
        </h3>
        <div className="flex items-center gap-3">
          {positions.length > 0 && (
            <span className="text-base text-text-secondary">
              使用証拠金: ¥{totalMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
          <span className={`text-lg font-semibold ${totalPnl >= 0 ? 'text-buy' : 'text-sell'}`}>
            合計損益: {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()}円
          </span>
          {positions.length > 0 && (
            <button
              onClick={handleCloseAll}
              disabled={loading || (status !== 'running' && status !== 'paused')}
              className="px-3 py-1 bg-sell text-text-strong rounded text-sm hover:opacity-80 disabled:opacity-50"
            >
              {loading ? '...' : '全決済'}
            </button>
          )}
        </div>
      </div>
      <div>
        {positions.length === 0 ? (
          <div className="text-center text-text-secondary text-lg py-4">
            ポジションなし
          </div>
        ) : (
          <table className="w-full text-base text-text-primary">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1">方向</th>
                <th className="text-right py-1">通貨</th>
                <th className="text-right py-1 text-sm">証拠金</th>
                <th className="text-right py-1">Entry</th>
                <th className="text-right py-1">現在</th>
                <th className="text-right py-1">損益(pips)</th>
                <th className="text-right py-1">損益(円)</th>
                <th className="text-center py-1">操作</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const margin = calculateMargin(pos.entry_price, pos.lot_size)
                const currencyUnits = pos.lot_size * 100000
                return (
                  <tr key={pos.position_id} className="border-b border-border">
                    <td className={`py-1 ${pos.side === 'buy' ? 'text-buy' : 'text-sell'}`}>
                      {pos.side === 'buy' ? '買' : '売'}
                    </td>
                    <td className="text-right py-1">{currencyUnits.toLocaleString()}</td>
                    <td className="text-right py-1 text-sm text-text-secondary">
                      ¥{margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="text-right py-1">{pos.entry_price.toFixed(3)}</td>
                    <td className="text-right py-1">{pos.current_price?.toFixed(3) || '-'}</td>
                    <td className={`text-right py-1 ${(pos.unrealized_pnl_pips ?? 0) >= 0 ? 'text-buy' : 'text-sell'}`}>
                      {(pos.unrealized_pnl_pips ?? 0) >= 0 ? '+' : ''}{(pos.unrealized_pnl_pips ?? 0).toFixed(1)}
                    </td>
                    <td className={`text-right py-1 ${(pos.unrealized_pnl ?? 0) >= 0 ? 'text-buy' : 'text-sell'}`}>
                      {(pos.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{(pos.unrealized_pnl ?? 0).toLocaleString()}
                    </td>
                    <td className="text-center py-1">
                      <button
                        onClick={() => handleClose(pos.position_id)}
                        disabled={closingId === pos.position_id || (status !== 'running' && status !== 'paused')}
                        className="px-3 py-1 bg-btn-secondary rounded text-sm hover:opacity-80 disabled:opacity-50"
                      >
                        {closingId === pos.position_id ? '...' : '決済'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default PositionPanel
