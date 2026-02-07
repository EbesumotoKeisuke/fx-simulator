/**
 * ローディングオーバーレイコンポーネント
 *
 * 画面全体を覆うローディング表示。
 * データ読み込み中や処理中に使用する。
 */

interface LoadingOverlayProps {
  /** 表示するメッセージ */
  message?: string
  /** 表示/非表示 */
  isVisible: boolean
}

function LoadingOverlay({ message = 'ローディング中...', isVisible }: LoadingOverlayProps) {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-light p-8 rounded-lg shadow-2xl flex flex-col items-center gap-4 border border-border-light">
        {/* スピナー */}
        <div className="w-16 h-16 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />

        {/* メッセージ */}
        <p className="text-text-primary text-lg font-medium">{message}</p>
      </div>
    </div>
  )
}

export default LoadingOverlay
