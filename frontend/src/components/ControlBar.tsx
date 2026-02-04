import { useState, useMemo } from 'react'
import { ordersApi } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'

/** 1ロットあたりの通貨単位（100,000通貨） */
const LOT_UNIT = 100000
/** レバレッジ（日本のFX標準） */
const LEVERAGE = 25

/**
 * コントロールバーのプロパティ
 */
interface ControlBarProps {
  /** 現在の価格 */
  currentPrice: number
  /** データ更新時のコールバック */
  onRefresh?: () => void
}

/**
 * コントロールバーコンポーネント
 * シミュレーションの再生制御と注文機能を提供する
 *
 * @param currentPrice - 現在の為替レート
 * @param onRefresh - 注文後にデータを更新するためのコールバック
 */
function ControlBar({ currentPrice, onRefresh }: ControlBarProps) {
  const [lotQuantity, setLotQuantity] = useState('1')
  const [lotUnit, setLotUnit] = useState('10000')
  const [isOrdering, setIsOrdering] = useState(false)
  const [orderMessage, setOrderMessage] = useState<string | null>(null)

  const {
    status,
    speed,
    pauseSimulation,
    resumeSimulation,
    setSpeed,
  } = useSimulationStore()

  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'
  const isStopped = status === 'stopped'
  const canTrade = isRunning || isPaused
  // シミュレーション開始後のみボタンを有効化
  const canControl = isRunning || isPaused

  // デバッグ用：ステータスとボタン有効化状態を確認
  console.log('[ControlBar] status:', status, 'canTrade:', canTrade, 'canControl:', canControl)

  /**
   * 実際のロット数を計算（通貨単位 / 100,000）
   */
  const actualLotSize = useMemo(() => {
    const quantity = parseFloat(lotQuantity) || 0
    const unit = parseFloat(lotUnit) || 0
    const totalUnits = quantity * unit
    return totalUnits / LOT_UNIT
  }, [lotQuantity, lotUnit])

  /**
   * 必要証拠金を計算
   * 計算式: (ロット数 × 100,000 × 現在価格) / レバレッジ
   */
  const requiredMargin = useMemo(() => {
    if (currentPrice <= 0) return 0
    return (actualLotSize * LOT_UNIT * currentPrice) / LEVERAGE
  }, [actualLotSize, currentPrice])

  const handlePlayPause = async () => {
    if (isRunning) {
      await pauseSimulation()
    } else if (isPaused) {
      await resumeSimulation()
    }
  }

  const handleSpeedChange = async (newSpeed: string) => {
    await setSpeed(parseFloat(newSpeed))
  }

  const handleOrder = async (side: 'buy' | 'sell') => {
    if (!canTrade) {
      setOrderMessage('シミュレーションが実行中ではありません')
      return
    }

    setIsOrdering(true)
    setOrderMessage(null)

    try {
      const res = await ordersApi.create({
        side,
        lot_size: actualLotSize,
      })

      if (res.success && res.data) {
        const action = side === 'buy' ? '買い' : '売り'
        const units = actualLotSize * LOT_UNIT
        setOrderMessage(
          `${action}注文: ${units.toLocaleString()}通貨 (${res.data.lot_size}ロット) @ ${res.data.entry_price}`
        )
        onRefresh?.()
      } else {
        setOrderMessage(`エラー: ${res.error?.message || '注文に失敗しました'}`)
      }
    } catch (error) {
      setOrderMessage(`エラー: ${error}`)
    } finally {
      setIsOrdering(false)
      // メッセージを3秒後にクリア
      setTimeout(() => setOrderMessage(null), 3000)
    }
  }

  return (
    <div className="flex flex-col bg-bg-card border-t border-b border-border">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            disabled={!canControl}
            className="px-4 py-2 bg-btn-primary rounded text-base hover:opacity-80 disabled:opacity-50"
          >
            {isIdle || isStopped
              ? '▶ 開始待ち'
              : isRunning
              ? '⏸ 一時停止'
              : '▶ 再開'}
          </button>
          <span className="text-text-primary ml-2 text-base">速度:</span>
          <select
            value={speed.toString()}
            onChange={(e) => handleSpeedChange(e.target.value)}
            disabled={!canControl}
            className="px-2 py-2 bg-bg-primary text-text-primary border border-border rounded text-base disabled:opacity-50"
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
          <span className="text-text-secondary text-base ml-2">
            状態: {
              isRunning ? '実行中' :
              isPaused ? '一時停止' :
              isStopped ? '終了' :
              '未開始（設定から開始）'
            }
          </span>
        </div>

        {/* Price Display */}
        <div className="text-lg font-bold text-text-strong">
          価格: {currentPrice > 0 ? currentPrice.toFixed(3) : '---'}
        </div>

        {/* Order Panel */}
        <div className="flex items-center gap-2">
          <span className="text-text-primary text-base">Lot:</span>
          <input
            type="number"
            value={lotQuantity}
            onChange={(e) => setLotQuantity(e.target.value)}
            disabled={!canTrade || isOrdering}
            min="1"
            max="999"
            className="w-16 px-2 py-2 bg-bg-primary text-text-primary border border-border rounded text-base disabled:opacity-50 text-right"
          />
          <span className="text-text-primary text-base">×</span>
          <select
            value={lotUnit}
            onChange={(e) => setLotUnit(e.target.value)}
            disabled={!canTrade || isOrdering}
            className="px-2 py-2 bg-bg-primary text-text-primary border border-border rounded text-base disabled:opacity-50"
          >
            <option value="1000">1,000</option>
            <option value="10000">10,000</option>
            <option value="100000">100,000</option>
          </select>
          <span className="text-text-secondary text-base">
            = {(actualLotSize * LOT_UNIT).toLocaleString()}通貨
          </span>
          {/* 必要証拠金の表示 */}
          <span className="text-text-secondary text-sm min-w-[120px]">
            (証拠金: ¥{requiredMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })})
          </span>
          <button
            onClick={() => handleOrder('buy')}
            disabled={!canTrade || isOrdering}
            className="px-4 py-2 bg-buy text-text-strong rounded font-semibold hover:opacity-80 disabled:opacity-50"
          >
            {isOrdering ? '...' : '買い'}
          </button>
          <button
            onClick={() => handleOrder('sell')}
            disabled={!canTrade || isOrdering}
            className="px-4 py-2 bg-sell text-text-strong rounded font-semibold hover:opacity-80 disabled:opacity-50"
          >
            {isOrdering ? '...' : '売り'}
          </button>
        </div>
      </div>

      {/* Order Message */}
      {orderMessage && (
        <div className={`px-4 py-1 text-base ${orderMessage.startsWith('エラー') ? 'text-sell' : 'text-buy'}`}>
          {orderMessage}
        </div>
      )}
    </div>
  )
}

export default ControlBar
