/**
 * AccountInfo コンポーネント
 *
 * 口座情報とパフォーマンス指標を表示します。
 * - 初期資金、残高、有効証拠金
 * - 含み損益、確定損益、トータル損益
 * - 連敗状況（色分け表示）
 * - パフォーマンス指標（勝率、PF、最大DDなど）
 */

import { useState, useEffect, useCallback } from 'react'
import { accountApi, analyticsApi, AccountInfo as AccountInfoType, PerformanceMetrics } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import { formatCurrency, formatPercent } from '../utils/formatters'
import { calculateProfitLossPercent } from '../utils/calculations'
import { cn, getPnLClass, getConsecutiveLossStyle } from '../utils/classNames'
import '../styles/components/AccountInfo.css'

interface AccountInfoProps {
  refreshTrigger?: number
}

function AccountInfo({ refreshTrigger }: AccountInfoProps) {
  const [account, setAccount] = useState<AccountInfoType | null>(null)
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const { status } = useSimulationStore()

  /**
   * 口座情報を取得
   */
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

  /**
   * パフォーマンス情報を取得
   */
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

  // 初回マウント時とrefreshTrigger変更時に取得
  useEffect(() => {
    fetchAccount()
    fetchPerformance()
  }, [fetchAccount, fetchPerformance, refreshTrigger])

  // シミュレーション実行中は5秒ごとに自動更新
  useEffect(() => {
    if (status !== 'running') return

    const interval = setInterval(() => {
      fetchAccount()
      fetchPerformance()
    }, 5000)

    return () => clearInterval(interval)
  }, [status, fetchAccount, fetchPerformance])

  // シミュレーション未開始の場合
  if (!account || status === 'idle') {
    return (
      <div className="account-info">
        <h3 className="account-info__title">口座 / パフォーマンス情報</h3>
        <div className="account-info__empty">シミュレーション未開始</div>
      </div>
    )
  }

  // トータル損益を計算
  const profitLoss = account.equity - account.initial_balance
  const profitLossPercent = calculateProfitLossPercent(profitLoss, account.initial_balance)

  // 連敗表示スタイルを取得
  const consecutiveLossStyle = getConsecutiveLossStyle(account.consecutive_losses ?? 0)

  return (
    <div className="account-info">
      <h3 className="account-info__title">口座 / パフォーマンス情報</h3>

      <div className="account-info__content">
        {/* Row 1: 初期資金、残高、有効証拠金 */}
        <div className="account-info__row">
          <div className="account-info__item">
            <span className="account-info__label">初期資金:</span>
            <span className="account-info__value">
              {formatCurrency(account.initial_balance)}
            </span>
          </div>
          <div className="account-info__item">
            <span className="account-info__label">残高:</span>
            <span className="account-info__value">
              {formatCurrency(account.balance)}
            </span>
          </div>
          <div className="account-info__item">
            <span className="account-info__label">有効証拠金:</span>
            <span className="account-info__value">
              {formatCurrency(account.equity)}
            </span>
          </div>
        </div>

        {/* Row 2: 含み損益、確定損益 */}
        <div className="account-info__row">
          <div className="account-info__item">
            <span className="account-info__label">含み損益:</span>
            <span className={getPnLClass(account.unrealized_pnl)}>
              {formatCurrency(account.unrealized_pnl, true)}
            </span>
          </div>
          <div className="account-info__item">
            <span className="account-info__label">確定損益:</span>
            <span className={getPnLClass(account.realized_pnl)}>
              {formatCurrency(account.realized_pnl, true)}
            </span>
          </div>
        </div>

        {/* Row 3: トータル損益、連敗 */}
        <div className="account-info__row account-info__row--highlight">
          <div className="account-info__item">
            <span className="account-info__label account-info__label--highlight">トータル損益:</span>
            <span className={cn('account-info__value--highlight', getPnLClass(profitLoss))}>
              {formatCurrency(profitLoss, true)}
              <span className="account-info__percent">
                ({formatPercent(profitLossPercent, 2, true)})
              </span>
            </span>
          </div>
          {account.consecutive_losses !== undefined && (
            <span
              className={cn(
                'account-info__consecutive-losses',
                consecutiveLossStyle.bg,
                consecutiveLossStyle.text
              )}
            >
              連敗: {account.consecutive_losses}回 {consecutiveLossStyle.icon}
            </span>
          )}
        </div>

        {/* パフォーマンス指標 */}
        {performance && performance.basic.total_trades > 0 && (
          <>
            {/* Row 3: 取引回数、勝率 */}
            <div className="account-info__row">
              <div className="account-info__item">
                <span className="account-info__label">取引回数:</span>
                <span className="account-info__value">
                  {performance.basic.total_trades}回
                  <span className="account-info__subtitle">
                    (勝{performance.basic.winning_trades}/負{performance.basic.losing_trades})
                  </span>
                </span>
              </div>
              <div className="account-info__item">
                <span className="account-info__label">勝率:</span>
                <span
                  className={cn(
                    'account-info__value',
                    performance.basic.win_rate >= 50 ? 'text-buy' : ''
                  )}
                >
                  {formatPercent(performance.basic.win_rate, 1)}
                </span>
              </div>
            </div>

            {/* Row 4: PF、最大DD、最大連勝/連敗 */}
            <div className="account-info__row">
              <div className="account-info__item">
                <span className="account-info__label">PF:</span>
                <span className={cn('account-info__value', getPnLClass(performance.risk_return.profit_factor - 1))}>
                  {performance.risk_return.profit_factor.toFixed(2)}
                </span>
              </div>
              <div className="account-info__item">
                <span className="account-info__label">最大DD:</span>
                <span className="account-info__value text-sell">
                  {formatCurrency(performance.drawdown.max_drawdown)}
                  <span className="account-info__subtitle">
                    ({formatPercent(performance.drawdown.max_drawdown_percent, 2)})
                  </span>
                </span>
              </div>
              <div className="account-info__item">
                <span className="account-info__label">最大連勝/連敗:</span>
                <span className="account-info__value">
                  {performance.consecutive.max_consecutive_wins}勝 / {performance.consecutive.max_consecutive_losses}敗
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AccountInfo
