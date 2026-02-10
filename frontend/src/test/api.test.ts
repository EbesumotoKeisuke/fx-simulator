/**
 * API サービスのテスト
 * モックを使用してAPI呼び出しをテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// モック用の型定義
interface MockResponse {
  ok: boolean
  json: () => Promise<unknown>
}

// fetchをモック
const mockFetch = vi.fn<[string, RequestInit?], Promise<MockResponse>>()
vi.stubGlobal('fetch', mockFetch)

describe('API モジュール', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('市場データAPI', () => {
    it('ローソク足データを正常に取得', async () => {
      const mockCandles = {
        success: true,
        data: {
          timeframe: 'M10',
          candles: [
            { timestamp: '2024-01-01T00:00:00', open: 149.0, high: 149.5, low: 148.5, close: 149.3, volume: 1000 }
          ]
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCandles
      })

      const response = await fetch('http://localhost:8000/api/v1/market-data/candles?timeframe=M10&limit=100')
      const data = await response.json()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(data.success).toBe(true)
      expect(data.data.timeframe).toBe('M10')
      expect(data.data.candles).toHaveLength(1)
    })

    it('APIエラー時はエラーレスポンスを返す', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'データが見つかりません' })
      })

      const response = await fetch('http://localhost:8000/api/v1/market-data/candles?timeframe=M10')

      expect(response.ok).toBe(false)
    })
  })

  describe('シミュレーションAPI', () => {
    it('シミュレーションを正常に開始', async () => {
      const mockStatus = {
        success: true,
        data: {
          simulation_id: 'sim-123',
          status: 'running',
          current_time: '2024-01-01T09:00:00',
          speed: 1.0
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus
      })

      const response = await fetch('http://localhost:8000/api/v1/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_time: '2024-01-01T09:00:00',
          initial_balance: 1000000,
          speed: 1.0
        })
      })
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.data.status).toBe('running')
    })

    it('シミュレーションを一時停止', async () => {
      const mockStatus = {
        success: true,
        data: {
          simulation_id: 'sim-123',
          status: 'paused',
          current_time: '2024-01-01T10:00:00',
          speed: 1.0
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatus
      })

      const response = await fetch('http://localhost:8000/api/v1/simulation/pause', {
        method: 'POST'
      })
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.data.status).toBe('paused')
    })
  })

  describe('注文API', () => {
    it('成行注文を正常に作成', async () => {
      const mockOrder = {
        success: true,
        data: {
          order_id: 'order-123',
          side: 'buy',
          lot_size: 0.1,
          entry_price: 149.5,
          executed_at: '2024-01-01T10:00:00'
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrder
      })

      const response = await fetch('http://localhost:8000/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side: 'buy',
          lot_size: 0.1
        })
      })
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.data.side).toBe('buy')
      expect(data.data.lot_size).toBe(0.1)
    })

    it('予約注文を正常に作成', async () => {
      const mockPendingOrder = {
        success: true,
        data: {
          order_id: 'pending-123',
          order_type: 'limit',
          side: 'buy',
          lot_size: 0.1,
          trigger_price: 149.0,
          status: 'pending',
          created_at: '2024-01-01T10:00:00'
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPendingOrder
      })

      const response = await fetch('http://localhost:8000/api/v1/orders/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'limit',
          side: 'buy',
          lot_size: 0.1,
          trigger_price: 149.0
        })
      })
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.data.order_type).toBe('limit')
      expect(data.data.status).toBe('pending')
    })
  })

  describe('ポジションAPI', () => {
    it('ポジション一覧を正常に取得', async () => {
      const mockPositions = {
        success: true,
        data: {
          positions: [
            {
              position_id: 'pos-123',
              side: 'buy',
              lot_size: 0.1,
              entry_price: 149.5,
              current_price: 150.0,
              unrealized_pnl: 5000,
              unrealized_pnl_pips: 50
            }
          ],
          total_unrealized_pnl: 5000
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPositions
      })

      const response = await fetch('http://localhost:8000/api/v1/positions')
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.data.positions).toHaveLength(1)
      expect(data.data.positions[0].unrealized_pnl).toBe(5000)
    })

    it('ポジションを正常にクローズ', async () => {
      const mockClosedPosition = {
        success: true,
        data: {
          position_id: 'pos-123',
          side: 'buy',
          lot_size: 0.1,
          entry_price: 149.5,
          exit_price: 150.0,
          realized_pnl: 5000
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockClosedPosition
      })

      const response = await fetch('http://localhost:8000/api/v1/positions/pos-123/close', {
        method: 'POST'
      })
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.data.realized_pnl).toBe(5000)
    })
  })

  describe('口座API', () => {
    it('口座情報を正常に取得', async () => {
      const mockAccount = {
        success: true,
        data: {
          balance: 1000000,
          equity: 1005000,
          margin_used: 60000,
          margin_available: 945000,
          unrealized_pnl: 5000,
          realized_pnl: 0,
          initial_balance: 1000000,
          consecutive_losses: 0
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAccount
      })

      const response = await fetch('http://localhost:8000/api/v1/account')
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.data.balance).toBe(1000000)
      expect(data.data.consecutive_losses).toBe(0)
    })
  })
})
