/**
 * 共通プリセット定数
 *
 * 成行/指値/逆指値の注文パネルおよびSL/TP設定モーダルで
 * 共通で使用するプリセット値を定義する。
 * メンテナンス性向上のため、1箇所で管理する。
 */

/** SLプリセット（pips値） - 注文パネルとSL/TPモーダル共通 */
export const SL_PIPS_PRESETS = [1, -10, -20, -30, -40, -50] as const

/** TPプリセット（pips値） - 注文パネルのTP設定用（将来拡張用） */
export const TP_PIPS_PRESETS = [10, 20, 30, 40, 50] as const

/** ロットサイズ1%リスクプリセット（SL pips値） */
export const LOT_PRESETS = [
  { slPips: 1, label: '1p' },
  { slPips: 10, label: '10p' },
  { slPips: 20, label: '20p' },
  { slPips: 30, label: '30p' },
  { slPips: 40, label: '40p' },
  { slPips: 50, label: '50p' },
] as const

/**
 * 1%リスクに基づいたロットサイズを計算する
 * @param balance 口座残高（円）
 * @param slPips SLのpips値
 * @returns ロットサイズ（通貨単位、1,000通貨未満切り捨て）
 */
export const calculateRiskBasedLotSize = (balance: number, slPips: number): number => {
  const RISK_RATE = 0.01 // 1%
  const PIP_VALUE_PER_UNIT = 0.01 // 1通貨あたり0.01円

  const lotSize = (balance * RISK_RATE) / (Math.abs(slPips) * PIP_VALUE_PER_UNIT)
  return Math.floor(lotSize / 1000) * 1000
}

/**
 * ロットサイズを表示用にフォーマットする（k単位）
 * @param lotSize ロットサイズ（通貨単位）
 * @returns フォーマット済み文字列（例: "70k"）
 */
export const formatLotSize = (lotSize: number): string => {
  const k = Math.floor(lotSize / 1000)
  return `${k}k`
}

/**
 * エントリー価格とSL価格のpips差を計算する（方向考慮）
 *
 * 正の値 = SLに到達すると利益方向（利確的なSL設定）
 * 負の値 = SLに到達すると損失方向（通常の損切り）
 *
 * @param entryPrice エントリー価格
 * @param slPrice SL価格
 * @param side ポジション方向（'buy' | 'sell'）
 * @returns pips差（正=利益方向、負=損失方向）
 */
export const calculateSlPipsDifference = (entryPrice: number, slPrice: number, side: 'buy' | 'sell'): number => {
  if (side === 'buy') {
    // 買いの場合: SLがエントリーより高い=利益、低い=損失
    return (slPrice - entryPrice) / 0.01
  } else {
    // 売りの場合: SLがエントリーより低い=利益、高い=損失
    return (entryPrice - slPrice) / 0.01
  }
}
