import { useState, useEffect, useCallback } from 'react'
import { accountApi, AccountInfo as AccountInfoType } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'

interface AccountInfoProps {
  refreshTrigger?: number
}

function AccountInfo({ refreshTrigger }: AccountInfoProps) {
  const [account, setAccount] = useState<AccountInfoType | null>(null)
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

  useEffect(() => {
    fetchAccount()
  }, [fetchAccount, refreshTrigger])

  // 定期的に口座情報を更新（5秒ごと）
  useEffect(() => {
    if (status !== 'running') return

    const interval = setInterval(() => {
      fetchAccount()
    }, 5000)

    return () => clearInterval(interval)
  }, [status, fetchAccount])

  if (!account || status === 'idle') {
    return (
      <div className="bg-bg-card rounded-lg p-3">
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
    <div className="bg-bg-card rounded-lg p-3 h-full overflow-auto">
      <h3 className="text-lg font-semibold text-text-strong mb-2">口座情報</h3>
      <div className="space-y-2 text-lg">
        <div className="flex justify-between">
          <span className="text-text-primary">初期資金:</span>
          <span className="text-text-strong">¥{account.initial_balance.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-primary">残高:</span>
          <span className="text-text-strong">¥{account.balance.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-primary">有効証拠金:</span>
          <span className="text-text-strong">¥{account.equity.toLocaleString()}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
          <span className="text-text-primary">含み損益:</span>
          <span className={account.unrealized_pnl >= 0 ? 'text-buy' : 'text-sell'}>
            {account.unrealized_pnl >= 0 ? '+' : ''}¥{account.unrealized_pnl.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-primary">確定損益:</span>
          <span className={account.realized_pnl >= 0 ? 'text-buy' : 'text-sell'}>
            {account.realized_pnl >= 0 ? '+' : ''}¥{account.realized_pnl.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 mt-1.5">
          <span className="text-text-primary">トータル損益:</span>
          <span className={`font-semibold ${profitLoss >= 0 ? 'text-buy' : 'text-sell'}`}>
            {profitLoss >= 0 ? '+' : ''}¥{profitLoss.toLocaleString()}
            <span className="text-text-secondary ml-1">({profitLossPercent}%)</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export default AccountInfo
