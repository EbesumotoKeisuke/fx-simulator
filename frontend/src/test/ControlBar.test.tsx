/**
 * ControlBar コンポーネントのテスト
 * 再生制御パネル（簡素化後）のテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
const mockPauseSimulation = vi.fn()
const mockResumeSimulation = vi.fn()
const mockSetSpeed = vi.fn()

vi.mock('../store/simulationStore', () => ({
  useSimulationStore: () => ({
    status: mockStatus,
    speed: mockSpeed,
    pauseSimulation: mockPauseSimulation,
    resumeSimulation: mockResumeSimulation,
    setSpeed: mockSetSpeed,
  }),
}))

let mockStatus: string = 'paused'
let mockSpeed: number = 1

import ControlBar from '../components/ControlBar'

describe('ControlBar コンポーネント', () => {
  const defaultProps = {
    currentPrice: 152.239,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockStatus = 'paused'
    mockSpeed = 1
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('再生制御の表示', () => {
    it('再開ボタンが表示される（一時停止状態）', () => {
      render(<ControlBar {...defaultProps} />)
      expect(screen.getByText(/再開/)).toBeInTheDocument()
    })

    it('一時停止ボタンが表示される（実行中状態）', () => {
      mockStatus = 'running'
      render(<ControlBar {...defaultProps} />)
      expect(screen.getByText(/一時停止/)).toBeInTheDocument()
    })

    it('速度セレクタが表示される', () => {
      render(<ControlBar {...defaultProps} />)
      expect(screen.getByText('速度:')).toBeInTheDocument()
      const select = screen.getByDisplayValue('1x')
      expect(select).toBeInTheDocument()
    })

    it('状態テキストが表示される', () => {
      render(<ControlBar {...defaultProps} />)
      expect(screen.getByText(/状態:/)).toBeInTheDocument()
      expect(screen.getByText(/一時停止/)).toBeInTheDocument()
    })
  })

  describe('注文関連の要素が含まれないこと（簡素化後）', () => {
    it('Lot入力が表示されない', () => {
      render(<ControlBar {...defaultProps} />)
      expect(screen.queryByText('Lot:')).not.toBeInTheDocument()
    })

    it('買い/売りボタンが表示されない', () => {
      render(<ControlBar {...defaultProps} />)
      // 再開/一時停止ボタンのテキストと区別するため、単独の「買い」「売り」がないことを確認
      const buyButtons = screen.queryAllByRole('button').filter(b => b.textContent === '買い')
      const sellButtons = screen.queryAllByRole('button').filter(b => b.textContent === '売り')
      expect(buyButtons.length).toBe(0)
      expect(sellButtons.length).toBe(0)
    })

    it('価格表示が含まれない', () => {
      render(<ControlBar {...defaultProps} />)
      expect(screen.queryByText(/価格:/)).not.toBeInTheDocument()
    })

    it('証拠金表示が含まれない', () => {
      render(<ControlBar {...defaultProps} />)
      expect(screen.queryByText(/証拠金/)).not.toBeInTheDocument()
    })
  })

  describe('再生制御の操作', () => {
    it('再開ボタンクリックでresumeSimulationが呼ばれる', () => {
      render(<ControlBar {...defaultProps} />)
      const button = screen.getByText(/再開/)
      fireEvent.click(button)
      expect(mockResumeSimulation).toHaveBeenCalled()
    })

    it('一時停止ボタンクリックでpauseSimulationが呼ばれる', () => {
      mockStatus = 'running'
      render(<ControlBar {...defaultProps} />)
      const button = screen.getByText(/一時停止/)
      fireEvent.click(button)
      expect(mockPauseSimulation).toHaveBeenCalled()
    })

    it('速度変更でsetSpeedが呼ばれる', () => {
      render(<ControlBar {...defaultProps} />)
      const select = screen.getByDisplayValue('1x')
      fireEvent.change(select, { target: { value: '5' } })
      expect(mockSetSpeed).toHaveBeenCalledWith(5)
    })
  })

  describe('propsが不要になった項目', () => {
    it('lotQuantity/lotUnit props無しで正常にレンダリングされる', () => {
      render(<ControlBar {...defaultProps} />)
      expect(screen.getByText(/再開/)).toBeInTheDocument()
    })
  })
})
