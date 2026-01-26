import { useState, useMemo } from 'react'
import { ordersApi } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'

/** 1ロットあたりの通貨単位（10,000通貨） */
const LOT_UNIT = 10000

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
  const [lotSize, setLotSize] = useState('0.1')
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
   * 選択されたロットサイズに必要な資金を計算
   * 計算式: ロット数 × LOT_UNIT × 現在価格
   */
  const requiredCapital = useMemo(() => {
    if (currentPrice <= 0) return 0
    return parseFloat(lotSize) * LOT_UNIT * currentPrice
  }, [lotSize, currentPrice])

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
        lot_size: parseFloat(lotSize),
      })

      if (res.success && res.data) {
        const action = side === 'buy' ? '買い' : '売り'
        setOrderMessage(
          `${action}注文: ${res.data.lot_size}ロット @ ${res.data.entry_price}`
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
            className="px-4 py-1 bg-btn-primary rounded text-sm hover:opacity-80 disabled:opacity-50"
          >
            {isIdle || isStopped
              ? '▶ 開始待ち'
              : isRunning
              ? '⏸ 一時停止'
              : '▶ 再開'}
          </button>
          <span className="text-text-primary ml-2">速度:</span>
          <select
            value={speed.toString()}
            onChange={(e) => handleSpeedChange(e.target.value)}
            disabled={!canControl}
            className="px-2 py-1 bg-bg-primary text-text-primary border border-border rounded text-sm disabled:opacity-50"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="5">5x</option>
            <option value="10">10x</option>
          </select>
          <span className="text-text-secondary text-sm ml-2">
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
          <span className="text-text-primary">Lot:</span>
          <select
            value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
            disabled={!canTrade || isOrdering}
            className="px-2 py-1 bg-bg-primary text-text-primary border border-border rounded text-sm disabled:opacity-50"
          >
            <option value="0.01">0.01</option>
            <option value="0.05">0.05</option>
            <option value="0.1">0.1</option>
            <option value="0.5">0.5</option>
            <option value="1">1.0</option>
          </select>
          {/* 必要資金の表示 */}
          <span className="text-text-secondary text-xs min-w-[100px]">
            (¥{requiredCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })})
          </span>
          <button
            onClick={() => handleOrder('buy')}
            disabled={!canTrade || isOrdering}
            className="px-4 py-1 bg-buy text-text-strong rounded font-semibold hover:opacity-80 disabled:opacity-50"
          >
            {isOrdering ? '...' : '買い'}
          </button>
          <button
            onClick={() => handleOrder('sell')}
            disabled={!canTrade || isOrdering}
            className="px-4 py-1 bg-sell text-text-strong rounded font-semibold hover:opacity-80 disabled:opacity-50"
          >
            {isOrdering ? '...' : '売り'}
          </button>
        </div>
      </div>

      {/* Order Message */}
      {orderMessage && (
        <div className={`px-4 py-1 text-sm ${orderMessage.startsWith('エラー') ? 'text-sell' : 'text-buy'}`}>
          {orderMessage}
        </div>
      )}
    </div>
  )
}

export default ControlBar
