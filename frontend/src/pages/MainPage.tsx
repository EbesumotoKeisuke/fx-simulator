import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import ChartPanel from '../components/ChartPanel'
import ControlBar from '../components/ControlBar'
import OrderPanel from '../components/OrderPanel'
import PositionPanel from '../components/PositionPanel'
import PendingOrderPanel from '../components/PendingOrderPanel'
import AccountInfo from '../components/AccountInfo'
import SimulationSettingsModal from '../components/SimulationSettingsModal'
import SimulationResultModal from '../components/SimulationResultModal'
import AlertBanner from '../components/AlertBanner'
import LoadingOverlay from '../components/LoadingOverlay'
import { useSimulationStore } from '../store/simulationStore'
import { marketDataApi, simulationApi, accountApi, AccountInfo as AccountInfoType } from '../services/api'
import { logger } from '../utils/logger'

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
  const [account, setAccount] = useState<AccountInfoType | null>(null)
  // チャート更新用のキー（シミュレーションID変更時にチャートを再作成）
  const [chartKey, setChartKey] = useState(0)
  // チャート間で同期されたクロスヘア位置（時刻）
  const [syncedCrosshairTime, setSyncedCrosshairTime] = useState<number | string | null>(null)
  // チャート間で同期されたクロスヘア位置（価格）
  const [syncedCrosshairPrice, setSyncedCrosshairPrice] = useState<number | null>(null)
  // どのチャートがアクティブ（マウスオーバー中）か
  const [activeChart, setActiveChart] = useState<string | null>(null)
  // データ不足警告の表示状態
  const [missingDataWarning, setMissingDataWarning] = useState<string | null>(null)
  // Lot設定（OrderPanelとControlBarで共有）
  const [sharedLotQuantity, setSharedLotQuantity] = useState('1')
  const [sharedLotUnit, setSharedLotUnit] = useState('10000')
  // シミュレーションタイマー用のref
  const timerRef = useRef<number | null>(null)
  // 現在時刻を保持するref（タイマーコールバック内で使用）
  const currentTimeRef = useRef<Date | null>(null)
  // ステータスを保持するref（タイマーコールバック内で使用）
  const statusRef = useRef<'idle' | 'created' | 'running' | 'paused' | 'stopped'>('idle')
  // 時刻更新処理中フラグ（複数リクエストの同時実行を防ぐ）
  const isAdvancingRef = useRef(false)

  const {
    simulationId,
    status,
    currentTime,
    speed,
    isLoading,
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

      // 前回の処理がまだ完了していない場合はスキップ（競合防止）
      if (isAdvancingRef.current) {
        logger.warning('MainPage', 'Skipping advance_time: previous request still in progress')
        return
      }

      const current = currentTimeRef.current
      if (!current) return

      // 処理中フラグをセット
      isAdvancingRef.current = true

      try {
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
        const response = await simulationApi.advanceTime(localIsoString)

        // バックエンドからの実際の時刻を使用（週末スキップに対応）
        if (response.success && response.data?.current_time) {
          const actualTime = new Date(response.data.current_time)
          advanceTime(actualTime)
        } else {
          // エラー時はフロントエンドで計算した時刻を使用
          advanceTime(newTime)
        }
        // チャートはcurrentTimeの変更により自動的にデータを再取得する
      } catch (error) {
        logger.error('MainPage', '時刻の更新に失敗しました', { error })
      } finally {
        // 処理完了フラグをクリア
        isAdvancingRef.current = false
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
      logger.error('MainPage', '現在価格の取得に失敗しました', { error })
    }
  }, [currentTime, status])

  useEffect(() => {
    fetchCurrentPrice()
  }, [fetchCurrentPrice])

  // 口座情報を取得
  const fetchAccount = useCallback(async () => {
    if (status === 'idle') return

    try {
      const res = await accountApi.get()
      if (res.success && res.data) {
        setAccount(res.data)
      }
    } catch (error) {
      logger.error('MainPage', '口座情報の取得に失敗しました', { error })
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

  const handleDataManagement = () => {
    navigate('/data')
  }

  const handleAnalysis = () => {
    navigate('/analysis')
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

  // データ不足通知ハンドラー
  const handleDataMissing = useCallback((timeframe: string) => {
    const timeframeName = {
      'W1': '週足',
      'D1': '日足',
      'H1': '1時間足',
      'M10': '10分足'
    }[timeframe] || timeframe
    setMissingDataWarning(`${timeframeName}のデータがインポートされていません。「データ管理」から${timeframeName}データをインポートしてください。`)
  }, [])

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
        onAnalysis={handleAnalysis}
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
            ※ 「設定」または「開始」ボタンからシミュレーションを設定してください
          </span>
        )}
        {status === 'stopped' && (
          <span className="text-yellow-400">
            ※ 「設定」または「開始」ボタンから新しいシミュレーションを設定してください
          </span>
        )}
        {status === 'created' && (
          <span className="text-green-400">
            ※ 「開始」ボタンをクリックしてシミュレーションを開始してください
          </span>
        )}
      </div>

      {/* Alert Banner */}
      <AlertBanner />

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
          onDataMissing={handleDataMissing}
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
          onDataMissing={handleDataMissing}
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
          onDataMissing={handleDataMissing}
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
          onDataMissing={handleDataMissing}
        />
      </div>

      {/* Resizable bottom section (Control Bar + Order Panel + Position & Account) */}
      <div className="resize-y border-t-2 border-border flex flex-col" style={{ height: '400px', minHeight: '250px', maxHeight: '650px' }}>
        {/* Control Bar */}
        <ControlBar
          currentPrice={currentPrice}
          onRefresh={handleRefresh}
          lotQuantity={sharedLotQuantity}
          lotUnit={sharedLotUnit}
          onLotQuantityChange={setSharedLotQuantity}
          onLotUnitChange={setSharedLotUnit}
        />

        {/* Order Panel */}
        <OrderPanel
          currentPrice={currentPrice}
          account={account}
          onRefresh={handleRefresh}
          lotQuantity={sharedLotQuantity}
          lotUnit={sharedLotUnit}
          onLotQuantityChange={setSharedLotQuantity}
          onLotUnitChange={setSharedLotUnit}
        />

        {/* Position, Pending Orders & Account */}
        <div className="flex-1 grid grid-cols-10 gap-2 p-2 overflow-hidden">
          <div className="col-span-4 overflow-hidden">
            <PositionPanel
              refreshTrigger={refreshTrigger}
              account={account}
              currentPrice={currentPrice}
            />
          </div>
          <div className="col-span-3 overflow-hidden">
            <PendingOrderPanel refreshTrigger={refreshTrigger} />
          </div>
          <div className="col-span-3 overflow-auto">
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

      {/* Loading Overlay */}
      <LoadingOverlay
        isVisible={isLoading}
        message={
          status === 'idle' ? 'シミュレーションを準備中...' :
          status === 'paused' ? 'チャートデータを読み込み中...' :
          status === 'stopped' ? 'シミュレーションを終了中...' :
          'データを読み込み中...'
        }
      />

      {/* データ不足警告ポップアップ */}
      {missingDataWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-card rounded-lg p-6 w-[500px]">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl text-yellow-400">⚠</span>
              <h2 className="text-lg font-bold text-text-strong">データ不足の警告</h2>
            </div>
            <p className="text-text-primary mb-6">{missingDataWarning}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setMissingDataWarning(null)
                  navigate('/data')
                }}
                className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
              >
                データ管理へ移動
              </button>
              <button
                onClick={() => setMissingDataWarning(null)}
                className="px-4 py-2 bg-btn-secondary text-text-strong rounded hover:opacity-80"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MainPage
