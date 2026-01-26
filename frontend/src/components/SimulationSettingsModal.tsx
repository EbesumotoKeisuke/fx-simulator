import { useState, useEffect } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { marketDataApi } from '../services/api'

interface SimulationSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

function SimulationSettingsModal({ isOpen, onClose }: SimulationSettingsModalProps) {
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [initialBalance, setInitialBalance] = useState('1000000')
  const [speed, setSpeed] = useState('1')
  const [minDate, setMinDate] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { startSimulation, isLoading } = useSimulationStore()

  useEffect(() => {
    if (isOpen) {
      fetchDateRange()
    }
  }, [isOpen])

  const fetchDateRange = async () => {
    try {
      const res = await marketDataApi.getDateRange()
      if (res.success && res.data) {
        const m10 = res.data.timeframes?.M10
        if (m10) {
          setMinDate(m10.start.split('T')[0])
          setMaxDate(m10.end.split('T')[0])
          // デフォルトで開始日を設定
          if (!startDate) {
            setStartDate(m10.start.split('T')[0])
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch date range:', error)
    }
  }

  if (!isOpen) return null

  const handleStart = async () => {
    if (!startDate) {
      setError('開始日を選択してください')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const startDateTime = new Date(`${startDate}T${startTime}:00`)
      await startSimulation(
        startDateTime,
        parseFloat(initialBalance),
        parseFloat(speed)
      )
      onClose()
    } catch (error) {
      setError(`エラー: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-card rounded-lg p-6 w-96">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-strong">シミュレーション設定</h2>
          <button onClick={onClose} className="text-text-primary hover:text-text-strong">
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-text-primary text-sm mb-1">開始日時</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 p-2 bg-bg-primary text-text-primary border border-border rounded"
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-24 p-2 bg-bg-primary text-text-primary border border-border rounded"
              />
            </div>
            {minDate && maxDate && (
              <p className="text-xs text-text-secondary mt-1">
                利用可能期間: {minDate} 〜 {maxDate}
              </p>
            )}
          </div>

          <div>
            <label className="block text-text-primary text-sm mb-1">初期資金</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-text-primary">¥</span>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                min="10000"
                step="10000"
                className="w-full p-2 pl-6 bg-bg-primary text-text-primary border border-border rounded"
              />
            </div>
          </div>

          <div>
            <label className="block text-text-primary text-sm mb-1">再生速度</label>
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className="w-full p-2 bg-bg-primary text-text-primary border border-border rounded"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="5">5x</option>
              <option value="10">10x</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-2 bg-sell bg-opacity-20 text-sell rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={loading || isLoading}
            className="flex-1 py-2 bg-btn-secondary text-text-strong rounded hover:opacity-80 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleStart}
            disabled={loading || isLoading}
            className="flex-1 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80 disabled:opacity-50"
          >
            {loading || isLoading ? '開始中...' : '開始する'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SimulationSettingsModal
