/**
 * クラス名生成ユーティリティ
 *
 * 条件に基づいてCSSクラス名を動的に生成します。
 */

/**
 * 条件に基づいてクラス名を結合
 * @param classes - クラス名の配列、オブジェクト、または文字列
 * @returns 結合されたクラス名文字列
 *
 * @example
 * cn('btn', 'btn-primary') // => 'btn btn-primary'
 * cn('btn', { 'btn-active': true, 'btn-disabled': false }) // => 'btn btn-active'
 * cn(['btn', 'btn-primary'], { 'btn-lg': true }) // => 'btn btn-primary btn-lg'
 */
export function cn(
  ...classes: (string | Record<string, boolean> | undefined | null | false)[]
): string {
  const result: string[] = []

  for (const cls of classes) {
    if (!cls) continue

    if (typeof cls === 'string') {
      result.push(cls)
    } else if (typeof cls === 'object') {
      for (const [key, value] of Object.entries(cls)) {
        if (value) {
          result.push(key)
        }
      }
    }
  }

  return result.join(' ')
}

/**
 * 損益に基づいてクラス名を取得
 * @param value - 損益値
 * @param positiveClass - プラス時のクラス名 (デフォルト: 'text-buy')
 * @param negativeClass - マイナス時のクラス名 (デフォルト: 'text-sell')
 * @param zeroClass - ゼロ時のクラス名 (デフォルト: 'text-text-strong')
 * @returns 適切なクラス名
 */
export function getPnLClass(
  value: number,
  positiveClass: string = 'text-buy',
  negativeClass: string = 'text-sell',
  zeroClass: string = 'text-text-strong'
): string {
  if (value > 0) return positiveClass
  if (value < 0) return negativeClass
  return zeroClass
}

/**
 * 連敗数に基づいてスタイルクラスを取得
 * @param consecutiveLosses - 連敗数
 * @returns スタイルオブジェクト { bg, text, icon }
 */
export function getConsecutiveLossStyle(consecutiveLosses: number): {
  bg: string
  text: string
  icon: string
} {
  if (consecutiveLosses === 0) {
    return {
      bg: 'bg-buy/20',
      text: 'text-buy',
      icon: '✓',
    }
  } else if (consecutiveLosses <= 2) {
    return {
      bg: 'bg-yellow-900/20',
      text: 'text-yellow-500',
      icon: '⚠️',
    }
  } else {
    return {
      bg: 'bg-sell/20',
      text: 'text-sell',
      icon: '🚨',
    }
  }
}

/**
 * ボタンスタイルのクラス名を取得
 * @param variant - ボタンの種類 ('primary' | 'secondary' | 'danger' | 'success')
 * @param size - ボタンのサイズ ('sm' | 'md' | 'lg')
 * @param disabled - 無効化状態
 * @returns ボタンのクラス名
 */
export function getButtonClass(
  variant: 'primary' | 'secondary' | 'danger' | 'success' = 'primary',
  size: 'sm' | 'md' | 'lg' = 'md',
  disabled: boolean = false
): string {
  const baseClasses = 'rounded font-medium transition-colors'

  const variantClasses = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-bg-primary border border-border hover:bg-border',
    danger: 'bg-sell text-white hover:bg-sell/90',
    success: 'bg-buy text-white hover:bg-buy/90',
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }

  const disabledClasses = disabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : ''

  return cn(baseClasses, variantClasses[variant], sizeClasses[size], disabledClasses)
}
