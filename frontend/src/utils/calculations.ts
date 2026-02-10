/**
 * FX取引計算ユーティリティ
 *
 * ロットサイズ、証拠金、損益などの計算関数を提供します。
 */

// 定数定義
export const LOT_UNIT = 100000 // 1ロット = 100,000通貨
export const PIPS_UNIT = 0.01 // USD/JPYの1pips = 0.01円
export const LEVERAGE = 25 // レバレッジ (日本の最大レバレッジ)
export const RISK_RATE = 0.01 // デフォルトリスク率 (1%)

/**
 * 必要証拠金を計算
 * @param price - 現在価格
 * @param lotSize - ロットサイズ
 * @returns 必要証拠金 (円)
 */
export function calculateRequiredMargin(price: number, lotSize: number): number {
  return (price * lotSize * LOT_UNIT) / LEVERAGE
}

/**
 * 通貨単位をロット単位に変換
 * @param currencyUnits - 通貨単位
 * @returns ロット数
 */
export function currencyToLots(currencyUnits: number): number {
  return currencyUnits / LOT_UNIT
}

/**
 * ロット単位を通貨単位に変換
 * @param lots - ロット数
 * @returns 通貨単位
 */
export function lotsToCurrency(lots: number): number {
  return lots * LOT_UNIT
}

/**
 * 価格差分をpipsに変換
 * @param priceDiff - 価格差分
 * @returns pips値
 */
export function priceToPips(priceDiff: number): number {
  return priceDiff / PIPS_UNIT
}

/**
 * pipsを価格差分に変換
 * @param pips - pips値
 * @returns 価格差分
 */
export function pipsToPrice(pips: number): number {
  return pips * PIPS_UNIT
}

/**
 * 損益をpips単位で計算
 * @param entryPrice - エントリー価格
 * @param exitPrice - 決済価格
 * @param side - 売買方向 ('buy' | 'sell')
 * @returns 損益pips
 */
export function calculatePnLPips(
  entryPrice: number,
  exitPrice: number,
  side: 'buy' | 'sell'
): number {
  if (side === 'buy') {
    return (exitPrice - entryPrice) / PIPS_UNIT
  } else {
    return (entryPrice - exitPrice) / PIPS_UNIT
  }
}

/**
 * 損益を円単位で計算
 * @param pnlPips - 損益pips
 * @param lotSize - ロットサイズ
 * @returns 損益 (円)
 */
export function calculatePnLYen(pnlPips: number, lotSize: number): number {
  return pnlPips * lotSize * LOT_UNIT * PIPS_UNIT
}

/**
 * リスクベースのロットサイズを計算
 * @param balance - 口座残高
 * @param slPips - 損切りpips
 * @param riskRate - リスク率 (デフォルト: 1% = 0.01)
 * @returns ロットサイズ (通貨単位、1,000通貨未満は切り捨て)
 */
export function calculateRiskBasedLotSize(
  balance: number,
  slPips: number,
  riskRate: number = RISK_RATE
): number {
  const lotSize = (balance * riskRate) / (slPips * PIPS_UNIT)
  // 1,000通貨未満は切り捨て
  return Math.floor(lotSize / 1000) * 1000
}

/**
 * SL/TP価格を計算
 * @param entryPrice - エントリー価格
 * @param pips - pips値 (負の値で損切り、正の値で利確)
 * @param side - 売買方向 ('buy' | 'sell')
 * @returns SL/TP価格
 */
export function calculateSlTpPrice(
  entryPrice: number,
  pips: number,
  side: 'buy' | 'sell'
): number {
  if (side === 'buy') {
    return entryPrice + pipsToPrice(pips)
  } else {
    return entryPrice - pipsToPrice(pips)
  }
}

/**
 * トリガー価格と現在価格の差分をpipsで計算
 * @param triggerPrice - トリガー価格
 * @param currentPrice - 現在価格
 * @returns pips差分
 */
export function calculateTriggerPriceDiff(triggerPrice: number, currentPrice: number): number {
  return (triggerPrice - currentPrice) / PIPS_UNIT
}

/**
 * 損益率を計算
 * @param profitLoss - 損益金額
 * @param initialBalance - 初期資金
 * @returns 損益率 (%)
 */
export function calculateProfitLossPercent(profitLoss: number, initialBalance: number): number {
  return (profitLoss / initialBalance) * 100
}
