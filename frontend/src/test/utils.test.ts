/**
 * ユーティリティ関数のテスト
 * ロット計算、証拠金計算などのビジネスロジックをテスト
 */

import { describe, it, expect } from 'vitest'

/** 1ロットあたりの通貨単位（100,000通貨） */
const LOT_UNIT = 100000
/** レバレッジ（日本のFX標準） */
const LEVERAGE = 25

/**
 * ロットサイズを計算する（通貨単位 / 100,000）
 */
function calculateActualLotSize(quantity: number, unit: number): number {
  const totalUnits = quantity * unit
  return totalUnits / LOT_UNIT
}

/**
 * 必要証拠金を計算する
 * 計算式: (ロット数 × 100,000 × 現在価格) / レバレッジ
 */
function calculateRequiredMargin(actualLotSize: number, currentPrice: number): number {
  if (currentPrice <= 0) return 0
  return (actualLotSize * LOT_UNIT * currentPrice) / LEVERAGE
}

/**
 * 1%リスクロットサイズを計算する
 */
function calculateRiskBasedLotSize(balance: number, slPips: number): number {
  const RISK_RATE = 0.01 // 1%
  const PIP_VALUE_PER_UNIT = 0.01 // 1通貨あたり0.01円

  // ロットサイズ = (資産 × リスク率) / (SL pips × 1pip値)
  const lotSize = (balance * RISK_RATE) / (slPips * PIP_VALUE_PER_UNIT)

  // 1,000通貨未満は切り捨て
  return Math.floor(lotSize / 1000) * 1000
}

/**
 * pip値を計算する
 * USD/JPYの場合: 1pip = 0.01円
 */
function calculatePipDifference(currentPrice: number, triggerPrice: number): number {
  return (triggerPrice - currentPrice) / 0.01
}

describe('ロット計算', () => {
  it('1 × 10,000 = 0.1ロット', () => {
    const result = calculateActualLotSize(1, 10000)
    expect(result).toBe(0.1)
  })

  it('2 × 10,000 = 0.2ロット', () => {
    const result = calculateActualLotSize(2, 10000)
    expect(result).toBe(0.2)
  })

  it('1 × 1,000 = 0.01ロット', () => {
    const result = calculateActualLotSize(1, 1000)
    expect(result).toBe(0.01)
  })

  it('1 × 100,000 = 1ロット', () => {
    const result = calculateActualLotSize(1, 100000)
    expect(result).toBe(1)
  })

  it('5 × 10,000 = 0.5ロット', () => {
    const result = calculateActualLotSize(5, 10000)
    expect(result).toBe(0.5)
  })
})

describe('必要証拠金計算', () => {
  it('0.1ロット × 150円 / 25倍 = 60,000円', () => {
    const lotSize = 0.1 // 10,000通貨
    const price = 150
    const result = calculateRequiredMargin(lotSize, price)
    expect(result).toBe(60000)
  })

  it('0.2ロット × 150円 / 25倍 = 120,000円', () => {
    const lotSize = 0.2 // 20,000通貨
    const price = 150
    const result = calculateRequiredMargin(lotSize, price)
    expect(result).toBe(120000)
  })

  it('1ロット × 150円 / 25倍 = 600,000円', () => {
    const lotSize = 1 // 100,000通貨
    const price = 150
    const result = calculateRequiredMargin(lotSize, price)
    expect(result).toBe(600000)
  })

  it('価格が0以下の場合は0を返す', () => {
    const result = calculateRequiredMargin(0.1, 0)
    expect(result).toBe(0)
  })
})

describe('1%リスクロットサイズ計算', () => {
  it('資産1,000,000円、SL 10pipsの場合 = 100,000通貨', () => {
    // 1,000,000 × 0.01 / (10 × 0.01) = 10,000 / 0.1 = 100,000
    const result = calculateRiskBasedLotSize(1000000, 10)
    expect(result).toBe(100000)
  })

  it('資産1,000,000円、SL 20pipsの場合 = 50,000通貨', () => {
    // 1,000,000 × 0.01 / (20 × 0.01) = 10,000 / 0.2 = 50,000
    const result = calculateRiskBasedLotSize(1000000, 20)
    expect(result).toBe(50000)
  })

  it('資産500,000円、SL 20pipsの場合 = 25,000通貨', () => {
    // 500,000 × 0.01 / (20 × 0.01) = 5,000 / 0.2 = 25,000
    const result = calculateRiskBasedLotSize(500000, 20)
    expect(result).toBe(25000)
  })

  it('資産750,000円、SL 30pipsの場合 = 25,000通貨', () => {
    // 750,000 × 0.01 / (30 × 0.01) = 7,500 / 0.3 = 25,000
    const result = calculateRiskBasedLotSize(750000, 30)
    expect(result).toBe(25000)
  })

  it('1,000通貨未満は切り捨て', () => {
    // 100,000 × 0.01 / (30 × 0.01) = 1,000 / 0.3 = 3,333...
    const result = calculateRiskBasedLotSize(100000, 30)
    expect(result).toBe(3000)
  })
})

describe('pip計算', () => {
  it('150.00から150.10への変化 = 10pips', () => {
    const result = calculatePipDifference(150.00, 150.10)
    expect(result).toBeCloseTo(10, 5)
  })

  it('150.00から149.90への変化 = -10pips', () => {
    const result = calculatePipDifference(150.00, 149.90)
    expect(result).toBeCloseTo(-10, 5)
  })

  it('149.50から149.483への変化 = -1.7pips', () => {
    const result = calculatePipDifference(149.50, 149.483)
    expect(result).toBeCloseTo(-1.7, 1)
  })
})
