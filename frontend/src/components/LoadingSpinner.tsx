/**
 * ローディングスピナーコンポーネント
 *
 * 小さなインラインスピナー。
 * ボタン内やテーブルセル内などに表示する。
 */

interface LoadingSpinnerProps {
  /** スピナーのサイズ */
  size?: 'sm' | 'md' | 'lg'
  /** テキストカラー（スピナーの色） */
  color?: string
}

function LoadingSpinner({ size = 'md', color = 'border-accent-blue' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  }

  return (
    <div
      className={`${sizeClasses[size]} border-gray-600 border-t-transparent rounded-full animate-spin ${color}`}
      style={{ borderTopColor: 'currentColor' }}
    />
  )
}

export default LoadingSpinner
