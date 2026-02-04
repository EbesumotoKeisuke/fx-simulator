import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import ChartPanel from '../components/ChartPanel'
import ControlBar from '../components/ControlBar'
import PositionPanel from '../components/PositionPanel'
import AccountInfo from '../components/AccountInfo'
import SimulationSettingsModal from '../components/SimulationSettingsModal'
import SimulationResultModal from '../components/SimulationResultModal'
import { useSimulationStore } from '../store/simulationStore'
import { marketDataApi, simulationApi } from '../services/api'

/**
 * シミュレーション速度の基準値
 * 1x = 10分足が1秒で1本更新される（10分 = 1秒）
 * つまり、1秒ごとに10分進む
 */
const BASE_INTERVAL_MS = 1000  // 1秒
const BASE_TIME_ADVANCE_MS = 10 * 60 * 1000  // 10分（ミリ秒）

/**
 * メインページコンポーネント
 * FXトレードシミュレーターのメイン画面を表示する
 * チャート、コントロールバー、ポジション情報、口座情報を統合して表示
 */
function MainPage() {
  const navigate = useNavigate()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isResultOpen, setIsResultOpen] = useState(false)
  const [currentPrice, setCurrentPrice] = useState(0)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  // チャート更新用のキー（シミュレーションID変更時にチャートを再作成）
  const [chartKey, setChartKey] = useState(0)
  // チャート間で同期されたクロスヘア位置（時刻）
  const [syncedCrosshairTime, setSyncedCrosshairTime] = useState<number | string | null>(null)
  // チャート間で同期されたクロスヘア位置（価格）
  const [syncedCrosshairPrice, setSyncedCrosshairPrice] = useState<number | null>(null)
  // どのチャートがアクティブ（マウスオーバー中）か
  const [activeChart, setActiveChart] = useState<string | null>(null)
  // シミュレーションタイマー用のref
  const timerRef = useRef<number | null>(null)
  // 現在時刻を保持するref（タイマーコールバック内で使用）
  const currentTimeRef = useRef<Date | null>(null)
  // ステータスを保持するref（タイマーコールバック内で使用）
  const statusRef = useRef<'idle' | 'created' | 'running' | 'paused' | 'stopped'>('idle')

  const {
    simulationId,
    status,
    currentTime,
    speed,
    fetchStatus,
    stopSimulation,
    resumeSimulation,
    advanceTime,
  } = useSimulationStore()

  // 初期化時にシミュレーション状態を取得
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // シミュレーションIDが変更されたらチャートを再作成
  useEffect(() => {
    if (simulationId) {
      setChartKey((prev: number) => prev + 1)
    }
  }, [simulationId])

  // currentTimeが変わったらrefを更新
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  // statusが変わったらrefを更新
  useEffect(() => {
    statusRef.current = status
  }, [status])

  /**
   * シミュレーション自動進行タイマー
   * 1x速度 = 10分足が1秒で1本更新（10分/秒）
   * 速度倍率に応じてインターバルを調整
   *
   * 注意: currentTimeを依存配列に含めると、毎回タイマーが再作成されるため、
   * refを使用して最新の時刻を参照する
   */
  useEffect(() => {
    // 実行中でなければタイマーをクリア
    if (status !== 'running') {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    // タイマーを開始
    const intervalMs = BASE_INTERVAL_MS / speed  // 速度に応じてインターバルを調整

    timerRef.current = window.setInterval(async () => {
      // タイマーコールバック実行時にstatusを再確認（一時停止対策）
      if (statusRef.current !== 'running') {
        return
      }

      const current = currentTimeRef.current
      if (!current) return

      // 10分（BASE_TIME_ADVANCE_MS）進める
      const newTime = new Date(current.getTime() + BASE_TIME_ADVANCE_MS)

      // JSTのまま送信するためにローカルISO文字列を作成
      const year = newTime.getFullYear()
      const month = String(newTime.getMonth() + 1).padStart(2, '0')
      const day = String(newTime.getDate()).padStart(2, '0')
      const hour = String(newTime.getHours()).padStart(2, '0')
      const minute = String(newTime.getMinutes()).padStart(2, '0')
      const second = String(newTime.getSeconds()).padStart(2, '0')
      const localIsoString = `${year}-${month}-${day} ${hour}:${minute}:${second}`

      // バックエンドに時刻更新を通知
      try {
        await simulationApi.advanceTime(localIsoString)
        advanceTime(newTime)
        // チャートはcurrentTimeの変更により自動的にデータを再取得する
      } catch (error) {
        console.error('Failed to advance time:', error)
      }
    }, intervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [status, speed, advanceTime])

  /**
   * ローカル時間をISO形式に変換（UTCに変換しない）
   */
  const toLocalISOString = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    const second = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`
  }

  // 現在価格を取得
  const fetchCurrentPrice = useCallback(async () => {
    if (!currentTime || status === 'idle') return

    try {
      const res = await marketDataApi.getCandlesBefore(
        'M10',
        toLocalISOString(currentTime),
        1
      )
      if (res.success && res.data && res.data.candles.length > 0) {
        setCurrentPrice(res.data.candles[0].close)
      }
    } catch (error) {
      console.error('Failed to fetch current price:', error)
    }
  }, [currentTime, status])

  useEffect(() => {
    fetchCurrentPrice()
  }, [fetchCurrentPrice])

  const handleDataManagement = () => {
    navigate('/data')
  }

  const handleSettings = () => {
    setIsSettingsOpen(true)
  }

  const handleStart = async () => {
    // idle または stopped 状態の場合は設定モーダルを開く
    if (status === 'idle' || status === 'stopped') {
      setIsSettingsOpen(true)
      return
    }
    // created または paused 状態の場合はシミュレーションを開始/再開
    await resumeSimulation()
  }

  const handleEnd = async () => {
    if (status === 'idle' || status === 'stopped') {
      return
    }

    if (confirm('シミュレーションを終了しますか？')) {
      await stopSimulation()
      // ポジションクローズと結果集計の完了を待つ（1.5秒待機）
      await new Promise(resolve => setTimeout(resolve, 1500))
      setIsResultOpen(true)
    }
  }

  const handleRefresh = () => {
    setRefreshTrigger((prev: number) => prev + 1)
    fetchCurrentPrice()
  }

  const handleCrosshairMove = (time: number | string | null, price: number | null) => {
    setSyncedCrosshairTime(time)
    setSyncedCrosshairPrice(price)
  }

  const formatTime = (date: Date | null) => {
    if (!date) return '----/--/-- --:--'
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Header */}
      <Header
        currentTime={currentTime || new Date()}
        status={status}
        onDataManagement={handleDataManagement}
        onSettings={handleSettings}
        onStart={handleStart}
        onEnd={handleEnd}
      />

      {/* Status Bar */}
      <div className="px-4 py-2 bg-bg-card border-b border-border text-base text-text-secondary flex items-center gap-4">
        <span>シミュレーション時刻: {formatTime(currentTime)}</span>
        <span>|</span>
        <span>状態: {
          status === 'running' ? '実行中' :
          status === 'paused' ? '一時停止' :
          status === 'stopped' ? '終了' :
          status === 'created' ? '準備完了' :
          '未開始'
        }</span>
        {status === 'idle' && (
          <span className="text-yellow-400">
            ※ 「設定」ボタンからシミュレーションを開始してください
          </span>
        )}
        {status === 'stopped' && (
          <span className="text-yellow-400">
            ※ 新しいシミュレーションを開始するには「設定」または「開始」ボタンをクリックしてください
          </span>
        )}
        {status === 'created' && (
          <span className="text-green-400">
            ※ 「開始」ボタンをクリックしてシミュレーションを開始してください
          </span>
        )}
      </div>

      {/* Charts */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-2 min-h-0">
        <ChartPanel
          key={`W1-${chartKey}`}
          title="週足 (W1)"
          timeframe="W1"
          currentTime={currentTime || undefined}
          syncedCrosshairTime={syncedCrosshairTime}
          syncedCrosshairPrice={syncedCrosshairPrice}
          onCrosshairMove={handleCrosshairMove}
          activeChart={activeChart}
          onActiveChange={setActiveChart}
          refreshTrigger={refreshTrigger}
        />
        <ChartPanel
          key={`D1-${chartKey}`}
          title="日足 (D1)"
          timeframe="D1"
          currentTime={currentTime || undefined}
          syncedCrosshairTime={syncedCrosshairTime}
          syncedCrosshairPrice={syncedCrosshairPrice}
          onCrosshairMove={handleCrosshairMove}
          activeChart={activeChart}
          onActiveChange={setActiveChart}
          refreshTrigger={refreshTrigger}
        />
        <ChartPanel
          key={`H1-${chartKey}`}
          title="1時間足 (H1)"
          timeframe="H1"
          currentTime={currentTime || undefined}
          syncedCrosshairTime={syncedCrosshairTime}
          syncedCrosshairPrice={syncedCrosshairPrice}
          onCrosshairMove={handleCrosshairMove}
          activeChart={activeChart}
          onActiveChange={setActiveChart}
          refreshTrigger={refreshTrigger}
        />
        <ChartPanel
          key={`M10-${chartKey}`}
          title="10分足 (M10)"
          timeframe="M10"
          currentTime={currentTime || undefined}
          syncedCrosshairTime={syncedCrosshairTime}
          syncedCrosshairPrice={syncedCrosshairPrice}
          onCrosshairMove={handleCrosshairMove}
          activeChart={activeChart}
          onActiveChange={setActiveChart}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Resizable bottom section (Control Bar + Position & Account) */}
      <div className="resize-y overflow-auto border-t-2 border-border flex flex-col" style={{ height: '360px', minHeight: '200px', maxHeight: '600px' }}>
        {/* Control Bar */}
        <ControlBar currentPrice={currentPrice} onRefresh={handleRefresh} />

        {/* Position & Account */}
        <div className="flex-1 grid grid-cols-3 gap-2 p-2">
          <div className="col-span-2">
            <PositionPanel refreshTrigger={refreshTrigger} />
          </div>
          <div>
            <AccountInfo refreshTrigger={refreshTrigger} />
          </div>
        </div>
      </div>

      {/* Modals */}
      <SimulationSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <SimulationResultModal
        isOpen={isResultOpen}
        onClose={() => setIsResultOpen(false)}
      />
    </div>
  )
}

export default MainPage
