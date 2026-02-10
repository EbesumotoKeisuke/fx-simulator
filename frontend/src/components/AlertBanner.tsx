import { useState, useEffect, useCallback } from 'react'
import { alertsApi, Alert } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import { logger } from '../utils/logger'

/**
 * アラートバナーコンポーネント
 *
 * トレード中の自動アラートを表示する。
 * 連敗、損失、ドローダウンなどの警告をリアルタイムで表示。
 */
function AlertBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const { status } = useSimulationStore()

  const isActive = status === 'running' || status === 'paused'

  // アラートを取得
  const fetchAlerts = useCallback(async () => {
    if (!isActive) {
      setAlerts([])
      return
    }

    try {
      const res = await alertsApi.getAlerts()
      if (res.success && res.data) {
        setAlerts(res.data.alerts)
      }
    } catch (error) {
      logger.error('AlertBanner', `fetchAlerts error : ${error}`, { error })
    }
  }, [isActive])

  // 定期的にアラートを更新（10秒ごと）
  useEffect(() => {
    fetchAlerts()

    if (!isActive) return

    const interval = setInterval(fetchAlerts, 10000)
    return () => clearInterval(interval)
  }, [fetchAlerts, isActive])

  // アラートを閉じる
  const handleDismiss = (alertId: string) => {
    setDismissedIds((prev) => new Set([...prev, alertId]))
  }

  // 表示するアラート（閉じられていないもの）
  const visibleAlerts = alerts.filter((alert) => !dismissedIds.has(alert.id))

  if (visibleAlerts.length === 0) {
    return null
  }

  // 重要度に応じたスタイル
  const getAlertStyle = (type: Alert['type']) => {
    switch (type) {
      case 'danger':
        return {
          bg: 'bg-red-900/80',
          border: 'border-red-500',
          icon: '🚨',
        }
      case 'warning':
        return {
          bg: 'bg-yellow-900/80',
          border: 'border-yellow-500',
          icon: '⚠️',
        }
      case 'info':
      default:
        return {
          bg: 'bg-blue-900/80',
          border: 'border-blue-500',
          icon: 'ℹ️',
        }
    }
  }

  return (
    <div className="px-2 py-1 space-y-1">
      {visibleAlerts.map((alert) => {
        const style = getAlertStyle(alert.type)
        return (
          <div
            key={alert.id}
            className={`flex items-center justify-between px-4 py-2 rounded border ${style.bg} ${style.border}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{style.icon}</span>
              <span className="text-text-primary text-base">{alert.message}</span>
            </div>
            <button
              onClick={() => handleDismiss(alert.id)}
              className="text-text-secondary hover:text-text-primary text-xl px-2"
              title="閉じる"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default AlertBanner
