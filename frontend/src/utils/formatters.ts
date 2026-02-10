/**
 * 数値フォーマットユーティリティ
 *
 * アプリケーション全体で使用する数値フォーマット関数を提供します。
 */

/**
 * 金額を日本円形式でフォーマット
 * @param value - フォーマットする金額
 * @param showSign - プラス記号を表示するかどうか (デフォルト: false)
 * @returns フォーマットされた金額文字列 (例: "¥1,000,000" or "+¥1,000,000")
 */
export function formatCurrency(value: number, showSign: boolean = false): string {
  const sign = showSign && value >= 0 ? '+' : ''
  return `${sign}¥${value.toLocaleString()}`
}

/**
 * パーセンテージをフォーマット
 * @param value - フォーマットするパーセンテージ値
 * @param decimals - 小数点以下の桁数 (デフォルト: 2)
 * @param showSign - プラス記号を表示するかどうか (デフォルト: false)
 * @returns フォーマットされたパーセンテージ文字列 (例: "12.34%" or "+12.34%")
 */
export function formatPercent(value: number, decimals: number = 2, showSign: boolean = false): string {
  const sign = showSign && value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

/**
 * pips値をフォーマット
 * @param value - フォーマットするpips値
 * @param decimals - 小数点以下の桁数 (デフォルト: 1)
 * @param showSign - プラス記号を表示するかどうか (デフォルト: true)
 * @returns フォーマットされたpips文字列 (例: "+15.5 pips" or "-10.0 pips")
 */
export function formatPips(value: number, decimals: number = 1, showSign: boolean = true): string {
  const sign = showSign && value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)} pips`
}

/**
 * 価格をフォーマット
 * @param value - フォーマットする価格
 * @param decimals - 小数点以下の桁数 (デフォルト: 3)
 * @returns フォーマットされた価格文字列 (例: "150.123")
 */
export function formatPrice(value: number, decimals: number = 3): string {
  return value.toFixed(decimals)
}

/**
 * ロットサイズをフォーマット
 * @param value - フォーマットするロット数
 * @param decimals - 小数点以下の桁数 (デフォルト: 2)
 * @returns フォーマットされたロット文字列 (例: "0.10")
 */
export function formatLotSize(value: number, decimals: number = 2): string {
  return value.toFixed(decimals)
}

/**
 * 日時をフォーマット
 * @param date - フォーマットする日時 (Date | string)
 * @param format - フォーマット形式 ('datetime' | 'date' | 'time')
 * @returns フォーマットされた日時文字列
 */
export function formatDateTime(
  date: Date | string,
  format: 'datetime' | 'date' | 'time' = 'datetime'
): string {
  const d = typeof date === 'string' ? new Date(date) : date

  if (format === 'date') {
    return d.toLocaleDateString('ja-JP')
  }

  if (format === 'time') {
    return d.toLocaleTimeString('ja-JP')
  }

  return d.toLocaleString('ja-JP')
}

/**
 * 数値を短縮形式でフォーマット (k単位)
 * @param value - フォーマットする数値
 * @returns フォーマットされた文字列 (例: "70k", "100k")
 */
export function formatShortNumber(value: number): string {
  if (value >= 1000) {
    return `${Math.floor(value / 1000)}k`
  }
  return value.toString()
}
