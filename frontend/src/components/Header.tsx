import { format } from 'date-fns'

interface HeaderProps {
  currentTime: Date
  onDataManagement: () => void
  onSettings: () => void
  onEnd: () => void
}

function Header({ currentTime, onDataManagement, onSettings, onEnd }: HeaderProps) {
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
        <button
          onClick={onEnd}
          className="px-4 py-1 bg-sell text-text-strong rounded text-sm hover:opacity-80"
        >
          終了
        </button>
      </div>
    </header>
  )
}

export default Header
