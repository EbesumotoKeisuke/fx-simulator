/**
 * プリセット定数・関数のテスト
 */
import { describe, it, expect } from 'vitest'
import {
  SL_PIPS_PRESETS,
  TP_PIPS_PRESETS,
  LOT_PRESETS,
  calculateRiskBasedLotSize,
  formatLotSize,
  calculateSlPipsDifference,
} from '../constants/presets'

describe('プリセット定数', () => {
  describe('SL_PIPS_PRESETS', () => {
    it('SLプリセットに1, -10, -20, -30, -40, -50が含まれる', () => {
      expect(SL_PIPS_PRESETS).toEqual([1, -10, -20, -30, -40, -50])
    })
  })

  describe('TP_PIPS_PRESETS', () => {
    it('TPプリセットに10, 20, 30, 40, 50が含まれる', () => {
      expect(TP_PIPS_PRESETS).toEqual([10, 20, 30, 40, 50])
    })
  })

  describe('LOT_PRESETS', () => {
    it('1pipsプリセットが含まれる', () => {
      expect(LOT_PRESETS[0]).toEqual({ slPips: 1, label: '1p' })
    })

    it('1p, 10p, 20p, 30p, 40p, 50pプリセットが含まれる', () => {
      expect(LOT_PRESETS.length).toBe(6)
      expect(LOT_PRESETS[0].slPips).toBe(1)
      expect(LOT_PRESETS[1].slPips).toBe(10)
      expect(LOT_PRESETS[2].slPips).toBe(20)
      expect(LOT_PRESETS[3].slPips).toBe(30)
      expect(LOT_PRESETS[4].slPips).toBe(40)
      expect(LOT_PRESETS[5].slPips).toBe(50)
    })
  })
})

describe('calculateRiskBasedLotSize', () => {
  it('資産700,000円、SL 10pipsで70,000通貨を返す', () => {
    expect(calculateRiskBasedLotSize(700000, 10)).toBe(70000)
  })

  it('資産700,000円、SL 20pipsで35,000通貨を返す', () => {
    expect(calculateRiskBasedLotSize(700000, 20)).toBe(35000)
  })

  it('資産700,000円、SL 30pipsで23,000通貨を返す（1000未満切り捨て）', () => {
    expect(calculateRiskBasedLotSize(700000, 30)).toBe(23000)
  })

  it('資産1,000,000円、SL 10pipsで100,000通貨を返す', () => {
    expect(calculateRiskBasedLotSize(1000000, 10)).toBe(100000)
  })

  it('資産1,000,000円、SL 50pipsで20,000通貨を返す', () => {
    expect(calculateRiskBasedLotSize(1000000, 50)).toBe(20000)
  })

  it('資産700,000円、SL 1pipsで700,000通貨を返す', () => {
    expect(calculateRiskBasedLotSize(700000, 1)).toBe(700000)
  })

  it('負のSL pips値でも絶対値で計算する', () => {
    expect(calculateRiskBasedLotSize(700000, -10)).toBe(70000)
  })
})

describe('formatLotSize', () => {
  it('70,000通貨を"70k"に変換', () => {
    expect(formatLotSize(70000)).toBe('70k')
  })

  it('35,000通貨を"35k"に変換', () => {
    expect(formatLotSize(35000)).toBe('35k')
  })

  it('23,333通貨を"23k"に変換（1000未満切り捨て）', () => {
    expect(formatLotSize(23333)).toBe('23k')
  })

  it('100,000通貨を"100k"に変換', () => {
    expect(formatLotSize(100000)).toBe('100k')
  })

  it('700,000通貨を"700k"に変換', () => {
    expect(formatLotSize(700000)).toBe('700k')
  })
})

describe('calculateSlPipsDifference', () => {
  it('買いポジション：SLがエントリーより低い場合は負（損切り）', () => {
    // 買い 145.500、SL 145.300 → -20pips（損失方向）
    const result = calculateSlPipsDifference(145.500, 145.300, 'buy')
    expect(result).toBeCloseTo(-20, 1)
  })

  it('買いポジション：SLがエントリーより高い場合は正（利益方向）', () => {
    // 買い 145.500、SL 145.700 → +20pips（利益方向のSL）
    const result = calculateSlPipsDifference(145.500, 145.700, 'buy')
    expect(result).toBeCloseTo(20, 1)
  })

  it('売りポジション：SLがエントリーより高い場合は負（損切り）', () => {
    // 売り 152.217、SL 152.417 → -20pips（損失方向）
    const result = calculateSlPipsDifference(152.217, 152.417, 'sell')
    expect(result).toBeCloseTo(-20, 1)
  })

  it('売りポジション：SLがエントリーより低い場合は正（利益方向）', () => {
    // 売り 152.217、SL 152.207 → +1pips（利益方向のSL）
    const result = calculateSlPipsDifference(152.217, 152.207, 'sell')
    expect(result).toBeCloseTo(1, 1)
  })

  it('エントリーとSLが同じ場合は0pipsを返す', () => {
    expect(calculateSlPipsDifference(145.500, 145.500, 'buy')).toBeCloseTo(0, 1)
    expect(calculateSlPipsDifference(145.500, 145.500, 'sell')).toBeCloseTo(0, 1)
  })

  it('買い：エントリー150.000、SL 149.600で-40pips', () => {
    const result = calculateSlPipsDifference(150.000, 149.600, 'buy')
    expect(result).toBeCloseTo(-40, 1)
  })
})
