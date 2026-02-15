/**
 * OrderPanel コンポーネントのテスト
 * 注文パネル（合計通貨・証拠金表示統合後）のテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// loggerをモック
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

// simulationStoreをモック
let mockStatus: string = 'paused'

vi.mock('../store/simulationStore', () => ({
  useSimulationStore: () => ({
    status: mockStatus,
  }),
}))

// ordersApiをモック
const mockCreateOrder = vi.fn()
const mockCreatePending = vi.fn()

vi.mock('../services/api', () => ({
  ordersApi: {
    create: (...args: unknown[]) => mockCreateOrder(...args),
    createPending: (...args: unknown[]) => mockCreatePending(...args),
  },
}))

import OrderPanel from '../components/OrderPanel'

describe('OrderPanel コンポーネント', () => {
  const defaultProps = {
    currentPrice: 152.239,
    account: {
      balance: 550000,
      equity: 550000,
      used_margin: 0,
      unrealized_pnl: 0,
      realized_pnl: 0,
      initial_balance: 500000,
      margin_level: null,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockStatus = 'paused'
    mockCreateOrder.mockResolvedValue({ success: true, data: { lot_size: 0.1, entry_price: 152.239 } })
    mockCreatePending.mockResolvedValue({ success: true, data: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基本表示', () => {
    it('注文タイプセレクタが表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText('注文:')).toBeInTheDocument()
      expect(screen.getByText('成行')).toBeInTheDocument()
      expect(screen.getByText('指値')).toBeInTheDocument()
      expect(screen.getByText('逆指値')).toBeInTheDocument()
    })

    it('通貨入力が表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText('通貨:')).toBeInTheDocument()
    })

    it('買い注文・売り注文ボタンが表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText('買い注文')).toBeInTheDocument()
      expect(screen.getByText('売り注文')).toBeInTheDocument()
    })

    it('現在価格が表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText('152.239')).toBeInTheDocument()
    })
  })

  describe('合計通貨・証拠金表示', () => {
    it('合計通貨数が表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      // デフォルト: 1 × 10,000 = 10,000通貨
      expect(screen.getByText(/10,000通貨/)).toBeInTheDocument()
    })

    it('証拠金が表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText(/証拠金/)).toBeInTheDocument()
    })
  })

  describe('注文操作', () => {
    it('買い注文ボタンクリックで成行買い注文が発行される', async () => {
      render(<OrderPanel {...defaultProps} />)
      const buyButton = screen.getByText('買い注文')
      fireEvent.click(buyButton)

      await waitFor(() => {
        expect(mockCreateOrder).toHaveBeenCalledWith(
          expect.objectContaining({ side: 'buy' })
        )
      })
    })

    it('売り注文ボタンクリックで成行売り注文が発行される', async () => {
      render(<OrderPanel {...defaultProps} />)
      const sellButton = screen.getByText('売り注文')
      fireEvent.click(sellButton)

      await waitFor(() => {
        expect(mockCreateOrder).toHaveBeenCalledWith(
          expect.objectContaining({ side: 'sell' })
        )
      })
    })
  })

  describe('SL/TP表示', () => {
    it('SLとTPの設定エリアが表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText('SL:')).toBeInTheDocument()
      expect(screen.getByText('TP:')).toBeInTheDocument()
    })
  })

  describe('1%リスクプリセット', () => {
    it('1%リスクプリセットが表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText(/1%リスク/)).toBeInTheDocument()
    })

    it('各SLpipsプリセットボタンが表示される', () => {
      render(<OrderPanel {...defaultProps} />)
      expect(screen.getByText('1p')).toBeInTheDocument()
      expect(screen.getByText('10p')).toBeInTheDocument()
      expect(screen.getByText('20p')).toBeInTheDocument()
      expect(screen.getByText('30p')).toBeInTheDocument()
      expect(screen.getByText('40p')).toBeInTheDocument()
      expect(screen.getByText('50p')).toBeInTheDocument()
    })
  })

  describe('外部ロット制御', () => {
    it('外部からlotQuantityとlotUnitを制御できる', () => {
      render(
        <OrderPanel
          {...defaultProps}
          lotQuantity="5.4"
          lotUnit="10000"
        />
      )
      // 5.4 × 10,000 = 54,000通貨
      expect(screen.getByText(/54,000通貨/)).toBeInTheDocument()
    })
  })
})
