import { useState, useEffect, useCallback } from 'react'
import { accountApi, analyticsApi, AccountInfo as AccountInfoType, PerformanceMetrics } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'

interface AccountInfoProps {
  refreshTrigger?: number
}

function AccountInfo({ refreshTrigger }: AccountInfoProps) {
  const [account, setAccount] = useState<AccountInfoType | null>(null)
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const { status } = useSimulationStore()

  const fetchAccount = useCallback(async () => {
    if (status === 'idle') return

    try {
      const res = await accountApi.get()
      if (res.success && res.data) {
        setAccount(res.data)
      }
    } catch (error) {
      console.error('Failed to fetch account:', error)
    }
  }, [status])

  const fetchPerformance = useCallback(async () => {
    if (status === 'idle') return

    try {
      const res = await analyticsApi.getPerformance()
      if (res.success && res.data) {
        setPerformance(res.data)
      }
    } catch (error) {
      console.error('Failed to fetch performance:', error)
    }
  }, [status])

  useEffect(() => {
    fetchAccount()
    fetchPerformance()
  }, [fetchAccount, fetchPerformance, refreshTrigger])

  // 定期的に口座情報とパフォーマンス情報を更新（5秒ごと）
  useEffect(() => {
    if (status !== 'running') return

    const interval = setInterval(() => {
      fetchAccount()
      fetchPerformance()
    }, 5000)

    return () => clearInterval(interval)
  }, [status, fetchAccount, fetchPerformance])

  if (!account || status === 'idle') {
    return (
      <div className="bg-bg-card rounded-lg p-3 h-full overflow-hidden">
        <h3 className="text-lg font-semibold text-text-strong mb-2">口座情報</h3>
        <div className="text-center text-text-secondary text-lg py-4">
          シミュレーション未開始
        </div>
      </div>
    )
  }

  const profitLoss = account.equity - account.initial_balance
  const profitLossPercent = ((profitLoss / account.initial_balance) * 100).toFixed(2)

  return (
    <div className="bg-bg-card rounded-lg p-2 h-full overflow-hidden">
      <h3 className="text-lg font-semibold text-text-strong mb-3">口座情報</h3>
      <div className="space-y-2 text-lg">
        {/* 初期資金と残高 */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="text-text-primary">初期資金:</span>
            <span className="text-text-strong">¥{account.initial_balance.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-primary">残高:</span>
            <span className="text-text-strong">¥{account.balance.toLocaleString()}</span>
          </div>
        </div>

        {/* 有効証拠金 */}
        <div className="flex items-center gap-2">
          <span className="text-text-primary">有効証拠金:</span>
          <span className="text-text-strong">¥{account.equity.toLocaleString()}</span>
        </div>

        {/* 含み損益と確定損益 */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="text-text-primary">含み損益:</span>
            <span className={account.unrealized_pnl >= 0 ? 'text-buy' : 'text-sell'}>
              {account.unrealized_pnl >= 0 ? '+' : ''}¥{account.unrealized_pnl.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-primary">確定損益:</span>
            <span className={account.realized_pnl >= 0 ? 'text-buy' : 'text-sell'}>
              {account.realized_pnl >= 0 ? '+' : ''}¥{account.realized_pnl.toLocaleString()}
            </span>
          </div>
        </div>

        {/* トータル損益 */}
        <div className="flex items-center gap-2 border-t border-border pt-2">
          <span className="text-text-primary">トータル損益:</span>
          <span className={`font-semibold ${profitLoss >= 0 ? 'text-buy' : 'text-sell'}`}>
            {profitLoss >= 0 ? '+' : ''}¥{profitLoss.toLocaleString()}
            <span className="text-text-secondary ml-2">({profitLossPercent}%)</span>
          </span>
        </div>
      </div>

      {/* パフォーマンス指標 */}
      {performance && performance.total_trades > 0 && (
        <div className="mt-4 pt-3 border-t-2 border-border">
          <h4 className="text-base font-semibold text-text-strong mb-2">パフォーマンス</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-text-primary">取引回数:</span>
              <span className="text-text-strong">
                {performance.total_trades}回
                <span className="text-text-secondary ml-1">
                  (勝{performance.winning_trades}/負{performance.losing_trades})
                </span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-primary">勝率:</span>
              <span className={`font-semibold ${performance.win_rate >= 50 ? 'text-buy' : 'text-text-strong'}`}>
                {performance.win_rate.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-primary">PF:</span>
              <span className={`font-semibold ${performance.profit_factor >= 1 ? 'text-buy' : 'text-sell'}`}>
                {performance.profit_factor.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-primary">最大DD:</span>
              <span className="text-sell font-semibold">
                ¥{performance.max_drawdown_yen.toLocaleString()}
                <span className="text-text-secondary ml-1">({performance.max_drawdown_percent.toFixed(2)}%)</span>
              </span>
            </div>
            <div className="flex justify-between text-xs text-text-secondary">
              <span>最大連勝/連敗:</span>
              <span>{performance.max_consecutive_wins}勝 / {performance.max_consecutive_losses}敗</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountInfo
