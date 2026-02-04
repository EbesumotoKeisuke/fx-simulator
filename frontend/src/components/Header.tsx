import { format } from 'date-fns'

interface HeaderProps {
  currentTime: Date
  status: 'idle' | 'created' | 'running' | 'paused' | 'stopped'
  onDataManagement: () => void
  onSettings: () => void
  onStart: () => void
  onEnd: () => void
}

function Header({ currentTime, status, onDataManagement, onSettings, onStart, onEnd }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-bg-card border-b border-border">
      <h1 className="text-xl font-bold text-text-strong">FX Trade Simulator</h1>
      <span className="text-text-primary">
        {format(currentTime, 'yyyy/MM/dd HH:mm')}
      </span>
      <div className="flex gap-2">
        <button
          onClick={onDataManagement}
          className="px-4 py-1 bg-btn-secondary text-text-strong rounded text-sm hover:opacity-80"
        >
          データ管理
        </button>
        <button
          onClick={onSettings}
          className="px-4 py-1 bg-btn-secondary text-text-strong rounded text-sm hover:opacity-80"
        >
          設定
        </button>
        {(status === 'created' || status === 'paused' || status === 'stopped') && (
          <button
            onClick={onStart}
            className="px-4 py-1 bg-buy text-text-strong rounded text-sm hover:opacity-80"
          >
            開始
          </button>
        )}
        <button
          onClick={onEnd}
          disabled={status === 'idle' || status === 'stopped'}
          className="px-4 py-1 bg-sell text-text-strong rounded text-sm hover:opacity-80 disabled:opacity-50"
        >
          終了
        </button>
      </div>
    </header>
  )
}

export default Header
