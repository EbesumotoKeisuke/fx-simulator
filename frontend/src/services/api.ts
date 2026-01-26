/**
 * API通信モジュール
 *
 * バックエンドAPIとの通信を行うための関数とインターフェースを提供する。
 * 全てのAPIレスポンスは統一された形式（ApiResponse<T>）で返される。
 *
 * @module api
 */

/** APIのベースURL（環境変数で上書き可能） */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

/**
 * APIレスポンスの共通インターフェース
 * @template T レスポンスデータの型
 */
interface ApiResponse<T> {
  /** リクエスト成功フラグ */
  success: boolean
  /** レスポンスデータ */
  data?: T
  /** エラー情報 */
  error?: {
    code: string
    message: string
  }
}

/**
 * API通信を行う共通関数
 *
 * @template T レスポンスデータの型
 * @param endpoint - APIエンドポイント（例: '/market-data/candles'）
 * @param options - fetch APIのオプション
 * @returns APIレスポンス
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: data.detail || 'An error occurred',
      },
    }
  }

  return data
}

// ============================================
// 市場データ API
// ============================================

/**
 * ローソク足データのインターフェース
 */
export interface Candle {
  /** タイムスタンプ（ISO形式） */
  timestamp: string
  /** 始値 */
  open: number
  /** 高値 */
  high: number
  /** 安値 */
  low: number
  /** 終値 */
  close: number
  /** 出来高 */
  volume: number
}

export interface CandlesResponse {
  timeframe: string
  candles: Candle[]
}

export interface DateRangeResponse {
  start_date: string | null
  end_date: string | null
  timeframes: Record<string, {
    start: string
    end: string
    count: number
  }>
}

export interface CsvFile {
  timeframe: string
  filename: string
  exists: boolean
  size_bytes: number
}

export interface ImportResult {
  timeframe: string
  imported_count?: number
  start_date?: string
  end_date?: string
  error?: string
}

export const marketDataApi = {
  getCandles: (
    timeframe: string,
    startTime?: string,
    endTime?: string,
    limit: number = 100
  ) => {
    const params = new URLSearchParams({ timeframe, limit: String(limit) })
    if (startTime) params.append('start_time', startTime)
    if (endTime) params.append('end_time', endTime)
    return fetchApi<CandlesResponse>(`/market-data/candles?${params}`)
  },

  getCandlesBefore: (
    timeframe: string,
    beforeTime: string,
    limit: number = 100
  ) => {
    const params = new URLSearchParams({
      timeframe,
      before_time: beforeTime,
      limit: String(limit),
    })
    return fetchApi<CandlesResponse>(`/market-data/candles/before?${params}`)
  },

  getTimeframes: () => {
    return fetchApi<{ timeframes: string[] }>('/market-data/timeframes')
  },

  getDateRange: () => {
    return fetchApi<DateRangeResponse>('/market-data/date-range')
  },

  getCsvFiles: () => {
    return fetchApi<{ files: CsvFile[] }>('/market-data/files')
  },

  importCsv: (timeframe: string) => {
    return fetchApi<ImportResult>(`/market-data/import/${timeframe}`, {
      method: 'POST',
    })
  },

  importAllCsv: () => {
    return fetchApi<{ results: ImportResult[] }>('/market-data/import-all', {
      method: 'POST',
    })
  },
}

// ============================================
// シミュレーション API
// ============================================

/**
 * シミュレーション開始リクエストのインターフェース
 */
export interface SimulationStartRequest {
  /** 開始時刻（ISO形式） */
  start_time: string
  /** 初期資金（円） */
  initial_balance: number
  /** 再生速度倍率（0.5〜10.0） */
  speed?: number
}

export interface SimulationStatus {
  simulation_id: string
  status: 'created' | 'running' | 'paused' | 'stopped'
  current_time: string
  speed: number
}

export const simulationApi = {
  start: (data: SimulationStartRequest) => {
    return fetchApi<SimulationStatus>('/simulation/start', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  stop: () => {
    return fetchApi<SimulationStatus>('/simulation/stop', {
      method: 'POST',
    })
  },

  pause: () => {
    return fetchApi<SimulationStatus>('/simulation/pause', {
      method: 'POST',
    })
  },

  resume: () => {
    return fetchApi<SimulationStatus>('/simulation/resume', {
      method: 'POST',
    })
  },

  setSpeed: (speed: number) => {
    return fetchApi<SimulationStatus>('/simulation/speed', {
      method: 'PUT',
      body: JSON.stringify({ speed }),
    })
  },

  getStatus: () => {
    return fetchApi<SimulationStatus>('/simulation/status')
  },

  /** シミュレーション時刻を進める */
  advanceTime: (newTime: string) => {
    return fetchApi<{ simulation_id: string; current_time: string }>('/simulation/advance-time', {
      method: 'POST',
      body: JSON.stringify({ new_time: newTime }),
    })
  },
}

// ============================================
// 注文 API
// ============================================

/**
 * 注文リクエストのインターフェース
 */
export interface OrderRequest {
  /** 売買方向（'buy': 買い, 'sell': 売り） */
  side: 'buy' | 'sell'
  /** ロットサイズ（0.01〜1.0） */
  lot_size: number
}

export interface Order {
  order_id: string
  side: 'buy' | 'sell'
  lot_size: number
  entry_price: number
  executed_at: string
}

export const ordersApi = {
  create: (data: OrderRequest) => {
    return fetchApi<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  getAll: (limit: number = 50, offset: number = 0) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    return fetchApi<{ orders: Order[]; total: number }>(`/orders?${params}`)
  },
}

// ============================================
// ポジション API
// ============================================

/**
 * ポジション情報のインターフェース
 */
export interface Position {
  /** ポジションID */
  position_id: string
  /** 売買方向 */
  side: 'buy' | 'sell'
  /** ロットサイズ */
  lot_size: number
  /** エントリー価格 */
  entry_price: number
  /** 現在価格 */
  current_price?: number
  /** 含み損益（円） */
  unrealized_pnl?: number
  /** 含み損益（pips） */
  unrealized_pnl_pips?: number
  /** ポジションオープン時刻 */
  opened_at: string
}

export const positionsApi = {
  getAll: () => {
    return fetchApi<{ positions: Position[]; total_unrealized_pnl: number }>(
      '/positions'
    )
  },

  close: (positionId: string) => {
    return fetchApi<Position>(`/positions/${positionId}/close`, {
      method: 'POST',
    })
  },
}

// ============================================
// 口座 API
// ============================================

/**
 * 口座情報のインターフェース
 */
export interface AccountInfo {
  /** 口座残高（円） */
  balance: number
  /** 有効証拠金（残高 + 含み損益） */
  equity: number
  /** 使用中証拠金 */
  margin_used?: number
  /** 利用可能証拠金 */
  margin_available?: number
  /** 含み損益（円） */
  unrealized_pnl: number
  /** 確定損益（円） */
  realized_pnl: number
  /** 初期資金（円） */
  initial_balance: number
}

export const accountApi = {
  get: () => {
    return fetchApi<AccountInfo>('/account')
  },

  setBalance: (initialBalance: number) => {
    return fetchApi<{ balance: number }>('/account/balance', {
      method: 'PUT',
      body: JSON.stringify({ initial_balance: initialBalance }),
    })
  },
}

// ============================================
// トレード履歴 API
// ============================================

/**
 * トレード履歴のインターフェース
 */
export interface Trade {
  /** トレードID */
  trade_id: string
  /** 売買方向 */
  side: 'buy' | 'sell'
  /** ロットサイズ */
  lot_size: number
  /** エントリー価格 */
  entry_price: number
  /** 決済価格 */
  exit_price: number
  /** 確定損益（円） */
  realized_pnl: number
  /** 確定損益（pips） */
  realized_pnl_pips: number
  /** ポジションオープン時刻 */
  opened_at: string
  /** 決済時刻 */
  closed_at: string
}

export const tradesApi = {
  getAll: (limit: number = 50, offset: number = 0) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    return fetchApi<{ trades: Trade[]; total: number }>(`/trades?${params}`)
  },

  export: () => {
    const url = `${API_BASE_URL}/trades/export`
    window.open(url, '_blank')
  },
}
