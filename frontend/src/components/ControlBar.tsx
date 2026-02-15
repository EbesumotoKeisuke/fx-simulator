import { useSimulationStore } from '../store/simulationStore'
import { logger } from '../utils/logger'

/**
 * コントロールバーのプロパティ
 */
interface ControlBarProps {
  /** 現在の価格（将来の拡張用に保持） */
  currentPrice: number
}

/**
 * コントロールバーコンポーネント
 * シミュレーションの再生制御（再生/一時停止・速度・状態表示）を提供する
 * 注文機能はOrderPanelに統合済み
 */
function ControlBar({ currentPrice }: ControlBarProps) {
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
  // シミュレーション開始後のみボタンを有効化
  const canControl = isRunning || isPaused

  logger.debug('ControlBar', 'ステータス確認', { status, canControl })

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

  return (
    <div className="flex flex-col justify-center gap-1 px-3 py-2 bg-bg-card border-r border-border flex-shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={handlePlayPause}
          disabled={!canControl}
          className="px-3 py-1.5 bg-btn-primary rounded text-sm hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
        >
          {isIdle || isStopped
            ? '▶ 開始待ち'
            : isRunning
            ? '⏸ 一時停止'
            : '▶ 再開'}
        </button>
        <span className="text-text-primary text-sm whitespace-nowrap">速度:</span>
        <select
          value={speed.toString()}
          onChange={(e) => handleSpeedChange(e.target.value)}
          disabled={!canControl}
          className="px-1 py-1.5 bg-bg-primary text-text-primary border border-border rounded text-sm disabled:opacity-50"
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
      <span className="text-text-secondary text-sm whitespace-nowrap">
        状態: {
          isRunning ? '実行中' :
          isPaused ? '一時停止' :
          isStopped ? '終了' :
          '未開始'
        }
      </span>
    </div>
  )
}

export default ControlBar
