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
  const [useRandomDate, setUseRandomDate] = useState(false)

  const { startSimulation, isLoading } = useSimulationStore()

  useEffect(() => {
    if (isOpen) {
      fetchDateRange()
      // モーダルを開くたびにlocalStorageからデフォルト値を読み取る
      const savedBalance = localStorage.getItem('defaultInitialBalance')
      const savedSpeed = localStorage.getItem('defaultSpeed')
      if (savedBalance) {
        setInitialBalance(savedBalance)
      }
      if (savedSpeed) {
        setSpeed(savedSpeed)
      } else {
        setSpeed('1')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const fetchDateRange = async () => {
    try {
      const res = await marketDataApi.getDateRange()
      if (res.success && res.data) {
        const m10 = res.data.timeframes?.M10
        if (m10) {
          setMinDate(m10.start.split(' ')[0])
          setMaxDate(m10.end.split(' ')[0])
          // デフォルトで開始日を設定
          if (!startDate) {
            setStartDate(m10.start.split(' ')[0])
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch date range:', error)
    }
  }

  if (!isOpen) return null

  const handleStart = async () => {
    // ランダム日付選択がOFFの場合は開始日を検証
    if (!useRandomDate && !startDate) {
      setError('開始日を選択してください')
      return
    }

    setError(null)
    setLoading(true)

    try {
      let startDateTime: Date

      if (useRandomDate) {
        // ランダムな日時を生成
        if (!minDate || !maxDate) {
          setError('データ範囲の取得に失敗しました')
          setLoading(false)
          return
        }

        const minTime = new Date(minDate).getTime()
        const maxTime = new Date(maxDate).getTime()
        const randomTime = minTime + Math.random() * (maxTime - minTime)
        const randomDate = new Date(randomTime)

        // ランダムな時刻も設定（9:00〜17:00の間）
        const randomHour = 9 + Math.floor(Math.random() * 9) // 9-17時
        const randomMinute = Math.floor(Math.random() * 6) * 10 // 0, 10, 20, 30, 40, 50分
        randomDate.setHours(randomHour, randomMinute, 0, 0)

        startDateTime = randomDate
      } else {
        // 通常の日時選択
        startDateTime = new Date(`${startDate} ${startTime}:00`)
      }

      // シミュレーションを作成（'created'状態で作成される）
      await startSimulation(
        startDateTime,
        parseFloat(initialBalance),
        parseFloat(speed)
      )
      // モーダルを閉じる（'created'状態のまま）
      // ユーザーが「開始」ボタンをクリックしてシミュレーションを開始する
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
            <label className="flex items-center gap-2 text-text-primary text-sm mb-2">
              <input
                type="checkbox"
                checked={useRandomDate}
                onChange={(e) => setUseRandomDate(e.target.checked)}
                className="w-4 h-4"
              />
              <span>ランダム日付を選択</span>
            </label>
          </div>

          <div>
            <label className="block text-text-primary text-sm mb-1">開始日時</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                min={minDate}
                max={maxDate}
                disabled={useRandomDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 p-2 bg-bg-primary text-text-primary border border-border rounded disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <input
                type="time"
                value={startTime}
                disabled={useRandomDate}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-24 p-2 bg-bg-primary text-text-primary border border-border rounded disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {minDate && maxDate && (
              <p className="text-xs text-text-secondary mt-1">
                {useRandomDate
                  ? `ランダムな日時が選択されます（${minDate} 〜 ${maxDate}）`
                  : `利用可能期間: ${minDate} 〜 ${maxDate}`}
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
              <option value="0.1">0.1x</option>
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="5">5x</option>
              <option value="6">6x</option>
              <option value="7.5">7.5x</option>
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
            {loading || isLoading ? '設定中...' : '設定を確定'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SimulationSettingsModal
