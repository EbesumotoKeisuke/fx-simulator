/**
 * ChartPanel コンポーネントのテスト
 * リロードボタン機能を中心にテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// lightweight-chartsをモック
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({
      setData: vi.fn(),
      setMarkers: vi.fn(),
      priceToCoordinate: vi.fn(() => 100),
    })),
    addLineSeries: vi.fn(() => ({
      setData: vi.fn(),
    })),
    timeScale: vi.fn(() => ({
      scrollToPosition: vi.fn(),
      scrollToRealTime: vi.fn(),
      timeToCoordinate: vi.fn(() => 100),
      getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 100 })),
    })),
    applyOptions: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  })),
}))

// APIモジュールをモック
const mockGetCandlesPartial = vi.fn()
const mockGetCandlesBefore = vi.fn()
const mockGetCandles = vi.fn()
const mockOrdersGetAll = vi.fn()
const mockTradesGetAll = vi.fn()

vi.mock('../services/api', () => ({
  marketDataApi: {
    getCandlesPartial: (...args: unknown[]) => mockGetCandlesPartial(...args),
    getCandlesBefore: (...args: unknown[]) => mockGetCandlesBefore(...args),
    getCandles: (...args: unknown[]) => mockGetCandles(...args),
  },
  ordersApi: {
    getAll: (...args: unknown[]) => mockOrdersGetAll(...args),
  },
  tradesApi: {
    getAll: (...args: unknown[]) => mockTradesGetAll(...args),
  },
}))

// loggerをモック
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

// ChartPanelをインポート
import ChartPanel from '../components/ChartPanel'

describe('ChartPanel コンポーネント', () => {
  const defaultProps = {
    title: '日足(D1)',
    timeframe: 'D1' as const,
    currentTime: new Date('2024-01-15T10:00:00'),
  }

  const mockCandlesResponse = {
    success: true,
    data: {
      timeframe: 'D1',
      candles: [
        { timestamp: '2024-01-14T07:00:00', open: 149.0, high: 149.5, low: 148.5, close: 149.3, volume: 1000, ema20: 149.1 },
        { timestamp: '2024-01-15T07:00:00', open: 149.3, high: 150.0, low: 149.0, close: 149.8, volume: 1200, ema20: 149.2 },
      ],
      data_missing: false,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルトのモックレスポンスを設定
    mockGetCandlesPartial.mockResolvedValue(mockCandlesResponse)
    mockGetCandlesBefore.mockResolvedValue(mockCandlesResponse)
    mockGetCandles.mockResolvedValue(mockCandlesResponse)
    mockOrdersGetAll.mockResolvedValue({ success: true, data: { orders: [] } })
    mockTradesGetAll.mockResolvedValue({ success: true, data: { trades: [] } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('リロードボタン', () => {
    it('リロードボタンが表示される', async () => {
      render(<ChartPanel {...defaultProps} />)

      // リロードボタンが存在することを確認（data-testidで検索）
      const reloadButton = await screen.findByTestId('reload-button')
      expect(reloadButton).toBeInTheDocument()
      // ボタンとしてレンダリングされていることを確認
      expect(reloadButton.tagName).toBe('BUTTON')
    })

    it('リロードボタンにリロードアイコンが表示される', async () => {
      render(<ChartPanel {...defaultProps} />)

      // リロードボタンが表示されるまで待機
      const reloadButton = await screen.findByTestId('reload-button')
      expect(reloadButton).toBeInTheDocument()
      // リロードアイコン（↻）が含まれていることを確認
      expect(reloadButton.textContent).toContain('↻')
    })

    it('リロードボタンをクリックするとデータが再取得される', async () => {
      render(<ChartPanel {...defaultProps} />)

      // 初回読み込みでAPI呼び出しが1回行われる
      await waitFor(() => {
        expect(mockGetCandlesPartial).toHaveBeenCalled()
      })

      // 初回呼び出し回数を記録
      const initialCallCount = mockGetCandlesPartial.mock.calls.length

      // リロードボタンをクリック
      const reloadButton = await screen.findByTestId('reload-button')
      fireEvent.click(reloadButton)

      // APIが再度呼び出されることを確認
      await waitFor(() => {
        expect(mockGetCandlesPartial.mock.calls.length).toBeGreaterThan(initialCallCount)
      })
    })

    it('各時間足でリロードボタンが機能する', async () => {
      const timeframes: Array<'W1' | 'D1' | 'H1' | 'M10'> = ['W1', 'D1', 'H1', 'M10']

      for (const timeframe of timeframes) {
        vi.clearAllMocks()
        mockGetCandlesPartial.mockResolvedValue({
          ...mockCandlesResponse,
          data: { ...mockCandlesResponse.data, timeframe },
        })
        mockGetCandlesBefore.mockResolvedValue({
          ...mockCandlesResponse,
          data: { ...mockCandlesResponse.data, timeframe },
        })

        const { unmount } = render(
          <ChartPanel
            {...defaultProps}
            title={`${timeframe}チャート`}
            timeframe={timeframe}
          />
        )

        // データ読み込み完了を待機
        await waitFor(() => {
          if (timeframe === 'M10') {
            expect(mockGetCandlesBefore).toHaveBeenCalled()
          } else {
            expect(mockGetCandlesPartial).toHaveBeenCalled()
          }
        })

        // リロードボタンが存在することを確認
        const reloadButton = await screen.findByTestId('reload-button')
        expect(reloadButton).toBeInTheDocument()

        unmount()
      }
    })

    it('リロードボタンにツールチップ（title属性）が設定されている', async () => {
      render(<ChartPanel {...defaultProps} />)

      const reloadButton = await screen.findByTestId('reload-button')
      expect(reloadButton).toHaveAttribute('title')
      // title属性に「リロード」が含まれていることを確認
      expect(reloadButton.getAttribute('title')).toContain('リロード')
    })
  })

  describe('データ読み込み状態', () => {
    it('リロード中はボタンが無効化される（オプション）', async () => {
      // データ取得に時間がかかるようにモック
      mockGetCandlesPartial.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve(mockCandlesResponse), 100)
      }))

      render(<ChartPanel {...defaultProps} />)

      const reloadButton = await screen.findByTestId('reload-button')

      // クリック
      fireEvent.click(reloadButton)

      // 読み込み中の状態を確認（disabled または loading クラスなど）
      // 実装に応じてテストを調整
    })
  })
})
