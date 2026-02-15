/**
 * AnalysisPage コンポーネントのテスト
 * 資産曲線・ドローダウンのグラフ+テーブル表示、マーカー表示制御を中心にテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// lightweight-chartsをモック
const mockSetData = vi.fn()
const mockSetMarkers = vi.fn()
const mockFitContent = vi.fn()
const mockSetVisibleLogicalRange = vi.fn()
const mockRemove = vi.fn()
const mockApplyOptions = vi.fn()
const mockSubscribeCrosshairMove = vi.fn()

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({
      setData: mockSetData,
      setMarkers: mockSetMarkers,
    })),
    addLineSeries: vi.fn(() => ({
      setData: mockSetData,
      setMarkers: mockSetMarkers,
    })),
    timeScale: vi.fn(() => ({
      fitContent: mockFitContent,
      setVisibleLogicalRange: mockSetVisibleLogicalRange,
    })),
    applyOptions: mockApplyOptions,
    subscribeCrosshairMove: mockSubscribeCrosshairMove,
    remove: mockRemove,
  })),
}))

// simulationStoreをモック
const mockSimulationId = vi.fn(() => 'test-sim-id')
vi.mock('../store/simulationStore', () => ({
  useSimulationStore: () => ({
    simulationId: mockSimulationId(),
  }),
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

// APIモック
const mockGetPerformance = vi.fn()
const mockGetEquityCurve = vi.fn()
const mockGetDrawdown = vi.fn()
const mockGetTradesWithCandles = vi.fn()
const mockExport = vi.fn()
const mockImport = vi.fn()

vi.mock('../services/api', () => ({
  analyticsApi: {
    getPerformance: (...args: unknown[]) => mockGetPerformance(...args),
    getEquityCurve: (...args: unknown[]) => mockGetEquityCurve(...args),
    getDrawdown: (...args: unknown[]) => mockGetDrawdown(...args),
    getTradesWithCandles: (...args: unknown[]) => mockGetTradesWithCandles(...args),
  },
  tradesApi: {
    export: (...args: unknown[]) => mockExport(...args),
    import: (...args: unknown[]) => mockImport(...args),
  },
}))

import AnalysisPage from '../pages/AnalysisPage'

// テストデータ
const mockPerformanceData = {
  basic: {
    total_trades: 5,
    winning_trades: 3,
    losing_trades: 2,
    win_rate: 60.0,
    total_pnl: 15000,
    gross_profit: 30000,
    gross_loss: -15000,
  },
  risk_return: {
    profit_factor: 2.0,
    average_win: 10000,
    average_loss: -7500,
    risk_reward_ratio: 1.33,
    max_win: 15000,
    max_win_pips: 30.0,
    max_loss: -10000,
    max_loss_pips: -20.0,
  },
  drawdown: {
    max_drawdown: 5000,
    max_drawdown_percent: 5.0,
    max_drawdown_duration_days: 3,
  },
  consecutive: {
    max_consecutive_wins: 3,
    max_consecutive_losses: 1,
  },
  period: {
    start_date: '2024-01-01T00:00:00',
    end_date: '2024-01-31T00:00:00',
    duration_days: 30,
  },
}

const mockEquityCurveData = {
  points: [
    { timestamp: '2024-01-10T10:00:00', balance: 100000, equity: 100000, cumulative_pnl: 0 },
    { timestamp: '2024-01-15T10:00:00', balance: 105000, equity: 105000, cumulative_pnl: 5000 },
    { timestamp: '2024-01-20T10:00:00', balance: 110000, equity: 110000, cumulative_pnl: 10000 },
    { timestamp: '2024-01-25T10:00:00', balance: 115000, equity: 115000, cumulative_pnl: 15000 },
  ],
  initial_balance: 100000,
  final_balance: 115000,
}

const mockDrawdownData = {
  points: [
    { timestamp: '2024-01-10T10:00:00', equity: 100000, peak_equity: 100000, drawdown: 0, drawdown_percent: 0 },
    { timestamp: '2024-01-15T10:00:00', equity: 98000, peak_equity: 105000, drawdown: 7000, drawdown_percent: 6.67 },
    { timestamp: '2024-01-20T10:00:00', equity: 110000, peak_equity: 110000, drawdown: 0, drawdown_percent: 0 },
  ],
  max_drawdown: 7000,
  max_drawdown_percent: 6.67,
}

const mockTradesData = {
  trades: [
    {
      trade_id: 'trade-1',
      side: 'buy',
      opened_at: '2024-01-10T10:00:00',
      closed_at: '2024-01-15T10:00:00',
      entry_price: 148.0,
      exit_price: 149.0,
      realized_pnl: 10000,
      realized_pnl_pips: 10.0,
    },
    {
      trade_id: 'trade-2',
      side: 'sell',
      opened_at: '2024-01-16T10:00:00',
      closed_at: '2024-01-20T10:00:00',
      entry_price: 149.5,
      exit_price: 150.0,
      realized_pnl: -5000,
      realized_pnl_pips: -5.0,
    },
  ],
  candles: [
    { timestamp: '2024-01-10T00:00:00', open: 148.0, high: 148.5, low: 147.5, close: 148.3 },
    { timestamp: '2024-01-15T00:00:00', open: 149.0, high: 149.5, low: 148.5, close: 149.2 },
  ],
}

function renderWithRouter(component: React.ReactElement) {
  return render(
    <MemoryRouter>
      {component}
    </MemoryRouter>
  )
}

describe('AnalysisPage コンポーネント', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSimulationId.mockReturnValue('test-sim-id')
    mockGetPerformance.mockResolvedValue({ success: true, data: mockPerformanceData })
    mockGetEquityCurve.mockResolvedValue({ success: true, data: mockEquityCurveData })
    mockGetDrawdown.mockResolvedValue({ success: true, data: mockDrawdownData })
    mockGetTradesWithCandles.mockResolvedValue({ success: true, data: mockTradesData })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基本表示', () => {
    it('シミュレーションIDがない場合は開始メッセージを表示', async () => {
      mockSimulationId.mockReturnValue(null)
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('シミュレーションが開始されていません')).toBeInTheDocument()
      })
    })

    it('ヘッダーが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('パフォーマンス分析')).toBeInTheDocument()
      })
    })

    it('売買履歴チャートセクションが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('売買履歴チャート')).toBeInTheDocument()
      })
    })

    it('トレード履歴セクションが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('トレード履歴')).toBeInTheDocument()
      })
    })
  })

  describe('マーカー表示チェックボックス', () => {
    it('売買表示チェックボックスが4つ表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('売買表示:')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      // 4つの時間足チェックボックスが存在
      expect(checkboxes.length).toBeGreaterThanOrEqual(4)
    })

    it('全チェックボックスがデフォルトでON', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('売買表示:')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach(cb => {
        expect(cb).toBeChecked()
      })
    })

    it('チェックボックスのON/OFF切り替えができる', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('売買表示:')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      const firstCheckbox = checkboxes[0]

      // OFFにする
      fireEvent.click(firstCheckbox)
      expect(firstCheckbox).not.toBeChecked()

      // ONに戻す
      fireEvent.click(firstCheckbox)
      expect(firstCheckbox).toBeChecked()
    })

    it('時間足ラベルが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('週足')).toBeInTheDocument()
        expect(screen.getByText('日足')).toBeInTheDocument()
        expect(screen.getByText('1時間足')).toBeInTheDocument()
        expect(screen.getByText('10分足')).toBeInTheDocument()
      })
    })
  })

  describe('資産曲線セクション', () => {
    it('資産曲線データのタイトルが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('資産曲線データ')).toBeInTheDocument()
      })
    })

    it('資産曲線テーブルに全データが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('資産曲線データ')).toBeInTheDocument()
      })

      // 全件数表示テキスト
      expect(screen.getByText(/全4件/)).toBeInTheDocument()
    })

    it('資産曲線テーブルのヘッダーが正しい', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('資産曲線データ')).toBeInTheDocument()
      })

      // テーブルヘッダー確認（複数テーブルがあるのでqueryAllByText）
      expect(screen.getAllByText('残高').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('有効証拠金').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('累積損益').length).toBeGreaterThanOrEqual(1)
    })

    it('資産曲線の行をクリックすると選択状態になる', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('資産曲線データ')).toBeInTheDocument()
      })

      // テーブル内のtd要素を探してクリック（SVG内のtextではなくtable内のtd）
      const balanceCells = screen.getAllByText('¥100,000')
      const tableCell = balanceCells.find(el => el.closest('tr'))
      expect(tableCell).toBeTruthy()
      fireEvent.click(tableCell!.closest('tr')!)

      // 選択解除ボタンが表示される
      await waitFor(() => {
        const deselectButtons = screen.getAllByText('選択解除')
        expect(deselectButtons.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('選択解除ボタンで選択を解除できる', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('資産曲線データ')).toBeInTheDocument()
      })

      // テーブル行をクリックして選択
      const balanceCells = screen.getAllByText('¥100,000')
      const tableCell = balanceCells.find(el => el.closest('tr'))
      expect(tableCell).toBeTruthy()
      fireEvent.click(tableCell!.closest('tr')!)

      await waitFor(() => {
        const deselectButtons = screen.getAllByText('選択解除')
        expect(deselectButtons.length).toBeGreaterThanOrEqual(1)
      })

      // 資産曲線セクション内の選択解除ボタンをクリック
      const deselectButtons = screen.getAllByText('選択解除')
      fireEvent.click(deselectButtons[deselectButtons.length - 1])
    })
  })

  describe('ドローダウンセクション', () => {
    it('ドローダウンデータのタイトルが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('ドローダウンデータ')).toBeInTheDocument()
      })
    })

    it('ドローダウンテーブルに全データが表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('ドローダウンデータ')).toBeInTheDocument()
      })

      expect(screen.getByText(/全3件/)).toBeInTheDocument()
    })

    it('ドローダウンテーブルのヘッダーが正しい', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('ドローダウンデータ')).toBeInTheDocument()
      })

      expect(screen.getAllByText('DD金額').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('DD率').length).toBeGreaterThanOrEqual(1)
    })

    it('ドローダウンの行をクリックすると選択状態になる', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('ドローダウンデータ')).toBeInTheDocument()
      })

      // DD率セルをクリック
      const ddCells = screen.getAllByText('6.67%')
      fireEvent.click(ddCells[0].closest('tr')!)

      await waitFor(() => {
        const deselectButtons = screen.getAllByText('選択解除')
        expect(deselectButtons.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('トレード履歴', () => {
    it('トレード一覧が表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('トレード履歴')).toBeInTheDocument()
      })

      // トレードデータが表示される（複数箇所に表示される可能性あり）
      await waitFor(() => {
        expect(screen.getAllByText('+¥10,000').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('トレードをクリックするとハイライト表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getAllByText('+¥10,000').length).toBeGreaterThanOrEqual(1)
      })

      // トレード行をクリック
      const pnlCells = screen.getAllByText('+¥10,000')
      fireEvent.click(pnlCells[0].closest('tr')!)

      // 選択解除ボタンが表示
      await waitFor(() => {
        expect(screen.getAllByText('選択解除').length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('主要指標カード', () => {
    it('パフォーマンス指標が表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('勝率')).toBeInTheDocument()
        expect(screen.getByText('プロフィットファクター')).toBeInTheDocument()
        expect(screen.getByText('最大ドローダウン')).toBeInTheDocument()
        expect(screen.getByText('トータル損益')).toBeInTheDocument()
      })

      // 数値が表示される
      expect(screen.getByText('60.0%')).toBeInTheDocument()
      expect(screen.getByText('2.00')).toBeInTheDocument()
      expect(screen.getByText('5.00%')).toBeInTheDocument()
      expect(screen.getAllByText('+¥15,000').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('データなし状態', () => {
    it('トレードデータがない場合は取引データなしを表示', async () => {
      mockGetTradesWithCandles.mockResolvedValue({
        success: true,
        data: { trades: [], candles: [] },
      })

      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('取引データなし')).toBeInTheDocument()
      })
    })

    it('資産曲線データがない場合はセクションが非表示', async () => {
      mockGetEquityCurve.mockResolvedValue({ success: true, data: { points: [], initial_balance: 0, final_balance: 0 } })

      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('パフォーマンス分析')).toBeInTheDocument()
      })

      expect(screen.queryByText('資産曲線データ')).not.toBeInTheDocument()
    })

    it('ドローダウンデータがない場合はセクションが非表示', async () => {
      mockGetDrawdown.mockResolvedValue({ success: true, data: { points: [], max_drawdown: 0, max_drawdown_percent: 0 } })

      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('パフォーマンス分析')).toBeInTheDocument()
      })

      expect(screen.queryByText('ドローダウンデータ')).not.toBeInTheDocument()
    })
  })

  describe('凡例表示', () => {
    it('チャート凡例が表示される', async () => {
      renderWithRouter(<AnalysisPage />)

      await waitFor(() => {
        expect(screen.getByText('買い')).toBeInTheDocument()
        expect(screen.getByText('売り')).toBeInTheDocument()
        expect(screen.getByText('選択中')).toBeInTheDocument()
      })
    })
  })
})
