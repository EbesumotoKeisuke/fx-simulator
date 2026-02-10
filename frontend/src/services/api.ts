/**
 * API通信モジュール
 *
 * バックエンドAPIとの通信を行うための関数とインターフェースを提供する。
 * 全てのAPIレスポンスは統一された形式（ApiResponse<T>）で返される。
 *
 * @module api
 */

import { logger } from '../utils/logger'

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
 * この関数はバックエンドAPIとの通信を行うための基盤関数です。
 * 以下の処理を行います：
 * 1. エンドポイントURLの生成
 * 2. HTTPリクエストの送信（Content-Typeヘッダーを自動設定）
 * 3. レスポンスのJSON解析
 * 4. エラーハンドリング（HTTPステータスコードが200番台以外の場合）
 *
 * @template T レスポンスデータの型
 * @param endpoint - APIエンドポイント（例: '/market-data/candles'）
 * @param options - fetch APIのオプション（method, body, headersなど）
 * @returns APIレスポンス（success, data, errorを含む統一形式）
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  // ベースURLとエンドポイントを結合して完全なURLを生成
  const url = `${API_BASE_URL}${endpoint}`

  // fetch APIを使用してHTTPリクエストを送信
  // Content-Typeヘッダーを自動的に設定し、追加のヘッダーやオプションをマージ
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  // レスポンスボディをJSONとして解析
  const data = await response.json()

  // HTTPステータスコードが200番台以外の場合はエラーレスポンスを返す
  if (!response.ok) {
    const errorMessage = data.detail || 'An error occurred'
    logger.error('API', `APIエラー: ${endpoint}`, { status: response.status, message: errorMessage })
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: errorMessage,
      },
    }
  }

  // 成功時はバックエンドから返されたデータをそのまま返す
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
  /** データ不足フラグ（DBに該当時間足のデータが存在しない場合にTrue） */
  data_missing?: boolean
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
  /**
   * ローソク足データを取得する
   *
   * 指定された時間枠のローソク足データを取得します。
   * 開始時刻と終了時刻を指定することで、特定期間のデータを取得できます。
   *
   * @param timeframe - 時間枠（例: '1m', '5m', '1h', '1d'）
   * @param startTime - 取得開始時刻（ISO形式、省略可）
   * @param endTime - 取得終了時刻（ISO形式、省略可）
   * @param limit - 取得する最大件数（デフォルト: 100）
   * @returns ローソク足データの配列を含むレスポンス
   */
  getCandles: (
    timeframe: string,
    startTime?: string,
    endTime?: string,
    limit: number = 100
  ) => {
    // URLパラメータを構築（timeframeとlimitは必須）
    const params = new URLSearchParams({ timeframe, limit: String(limit) })
    // 開始時刻が指定されている場合は追加
    if (startTime) params.append('start_time', startTime)
    // 終了時刻が指定されている場合は追加
    if (endTime) params.append('end_time', endTime)
    return fetchApi<CandlesResponse>(`/market-data/candles?${params}`)
  },

  /**
   * 指定時刻より前のローソク足データを取得する
   *
   * 特定の時刻より前のローソク足データを、指定件数分取得します。
   * チャートのスクロールバック（過去データの読み込み）などに使用します。
   *
   * @param timeframe - 時間枠（例: '1m', '5m', '1h', '1d'）
   * @param beforeTime - この時刻より前のデータを取得（ISO形式）
   * @param limit - 取得する最大件数（デフォルト: 100）
   * @returns ローソク足データの配列を含むレスポンス
   */
  getCandlesBefore: (
    timeframe: string,
    beforeTime: string,
    limit: number = 100
  ) => {
    // URLパラメータを構築
    const params = new URLSearchParams({
      timeframe,
      before_time: beforeTime,
      limit: String(limit),
    })
    return fetchApi<CandlesResponse>(`/market-data/candles/before?${params}`)
  },

  /**
   * 最新のローソク足を部分的に生成して取得する（未来データ非表示対応）
   *
   * 指定時刻より前のローソク足データを取得し、最新のローソク足のみを
   * current_time までのデータで動的に生成します。
   *
   * これにより、上位時間足で未来のデータが表示されることを防ぎます。
   * 例：current_time が 12:30 の場合、1時間足の 12:00 台のローソク足は
   * 12:00〜12:30 のデータのみから生成されます。
   *
   * @param timeframe - 時間枠（例: 'W1', 'D1', 'H1', 'M10'）
   * @param currentTime - 現在時刻（シミュレーション時刻、ISO形式）
   * @param limit - 取得する最大件数（デフォルト: 100）
   * @returns ローソク足データの配列を含むレスポンス
   */
  getCandlesPartial: (
    timeframe: string,
    currentTime: string,
    limit: number = 100
  ) => {
    // URLパラメータを構築
    const params = new URLSearchParams({
      timeframe,
      current_time: currentTime,
      limit: String(limit),
    })
    return fetchApi<CandlesResponse>(`/market-data/candles/partial?${params}`)
  },

  /**
   * 利用可能な時間枠の一覧を取得する
   *
   * データベースに存在する全ての時間枠（1分足、5分足、1時間足など）の
   * 一覧を取得します。
   *
   * @returns 時間枠の文字列配列を含むレスポンス
   */
  getTimeframes: () => {
    return fetchApi<{ timeframes: string[] }>('/market-data/timeframes')
  },

  /**
   * データの日付範囲を取得する
   *
   * データベースに格納されているデータの開始日と終了日、
   * および各時間枠ごとのデータ範囲を取得します。
   *
   * @returns 日付範囲情報（全体の範囲と時間枠ごとの範囲）を含むレスポンス
   */
  getDateRange: () => {
    return fetchApi<DateRangeResponse>('/market-data/date-range')
  },

  /**
   * サーバー上のCSVファイル一覧を取得する
   *
   * バックエンドのdataディレクトリに存在するCSVファイルの一覧を取得します。
   * 各ファイルの存在確認とサイズ情報も含まれます。
   *
   * @returns CSVファイル情報の配列を含むレスポンス
   */
  getCsvFiles: () => {
    return fetchApi<{ files: CsvFile[] }>('/market-data/files')
  },

  /**
   * 指定した時間枠のCSVファイルをデータベースにインポートする
   *
   * サーバー上のCSVファイルを読み込み、データベースに取り込みます。
   * すでにデータが存在する場合は上書きされます。
   *
   * @param timeframe - インポートする時間枠（例: '1m', '5m', '1h'）
   * @returns インポート結果（件数、日付範囲、エラー情報）
   */
  importCsv: (timeframe: string) => {
    return fetchApi<ImportResult>(`/market-data/import/${timeframe}`, {
      method: 'POST',
    })
  },

  /**
   * 全ての時間枠のCSVファイルを一括でデータベースにインポートする
   *
   * サーバー上に存在する全てのCSVファイルを順次読み込み、
   * データベースに取り込みます。複数のファイルを一度に処理するため、
   * 時間がかかる場合があります。
   *
   * @returns 各時間枠のインポート結果の配列を含むレスポンス
   */
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
  /**
   * シミュレーションを開始する
   *
   * 新しいシミュレーションセッションを開始します。
   * 開始時刻、初期資金、再生速度を指定して、トレードシミュレーションを
   * スタートします。既存のシミュレーションがあった場合はリセットされます。
   *
   * @param data - シミュレーション開始パラメータ
   *   - start_time: シミュレーション開始時刻（ISO形式）
   *   - initial_balance: 初期資金（円）
   *   - speed: 再生速度倍率（0.5〜10.0、デフォルト: 1.0）
   * @returns シミュレーションステータス（ID、状態、現在時刻、速度）
   */
  start: (data: SimulationStartRequest) => {
    return fetchApi<SimulationStatus>('/simulation/start', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * シミュレーションを停止する
   *
   * 実行中のシミュレーションを完全に停止します。
   * 停止後は、ポジションや口座情報がリセットされます。
   * 再開する場合は、start()で新しいシミュレーションを開始する必要があります。
   *
   * @returns シミュレーションステータス（停止状態）
   */
  stop: () => {
    return fetchApi<SimulationStatus>('/simulation/stop', {
      method: 'POST',
    })
  },

  /**
   * シミュレーションを一時停止する
   *
   * 実行中のシミュレーションを一時的に停止します。
   * 一時停止中は時刻の進行が止まりますが、ポジションや口座情報は保持されます。
   * resume()で再開できます。
   *
   * @returns シミュレーションステータス（一時停止状態）
   */
  pause: () => {
    return fetchApi<SimulationStatus>('/simulation/pause', {
      method: 'POST',
    })
  },

  /**
   * 一時停止中のシミュレーションを再開する
   *
   * pause()で一時停止したシミュレーションを再開します。
   * 一時停止時の状態（現在時刻、ポジション、口座情報）から続行されます。
   *
   * @returns シミュレーションステータス（実行中状態）
   */
  resume: () => {
    return fetchApi<SimulationStatus>('/simulation/resume', {
      method: 'POST',
    })
  },

  /**
   * シミュレーションの再生速度を変更する
   *
   * 実行中のシミュレーションの時間進行速度を変更します。
   * 例: 2.0 = 2倍速、0.5 = 0.5倍速（スロー再生）
   *
   * @param speed - 再生速度倍率（0.5〜10.0の範囲）
   * @returns シミュレーションステータス（更新された速度情報を含む）
   */
  setSpeed: (speed: number) => {
    return fetchApi<SimulationStatus>('/simulation/speed', {
      method: 'PUT',
      body: JSON.stringify({ speed }),
    })
  },

  /**
   * シミュレーションの現在のステータスを取得する
   *
   * シミュレーションの状態（実行中、一時停止、停止）、現在時刻、
   * 再生速度などの情報を取得します。
   * 定期的にポーリングしてUI更新に使用されます。
   *
   * @returns シミュレーションステータス（ID、状態、現在時刻、速度）
   */
  getStatus: () => {
    return fetchApi<SimulationStatus>('/simulation/status')
  },

  /**
   * シミュレーション時刻を指定した時刻まで進める
   *
   * シミュレーションの現在時刻を、指定した時刻まで一気に進めます。
   * この間の価格変動は処理されますが、リアルタイム再生はされません。
   * 特定の時刻まで早送りしたい場合に使用します。
   *
   * @param newTime - 進める先の時刻（ISO形式）
   * @returns シミュレーションIDと更新後の現在時刻
   */
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
  /** 損切り価格（省略可） */
  sl_price?: number
  /** 利確価格（省略可） */
  tp_price?: number
  /** 損切りpips（省略可） */
  sl_pips?: number
  /** 利確pips（省略可） */
  tp_pips?: number
}

export interface Order {
  order_id: string
  side: 'buy' | 'sell'
  lot_size: number
  entry_price: number
  executed_at: string
}

/**
 * 予約注文リクエストのインターフェース
 */
export interface PendingOrderRequest {
  /** 注文タイプ（'limit': 指値, 'stop': 逆指値） */
  order_type: 'limit' | 'stop'
  /** 売買方向（'buy': 買い, 'sell': 売り） */
  side: 'buy' | 'sell'
  /** ロットサイズ（0.01〜100.0） */
  lot_size: number
  /** トリガー価格 */
  trigger_price: number
}

/**
 * 予約注文更新リクエストのインターフェース
 */
export interface UpdatePendingOrderRequest {
  /** ロットサイズ（省略可） */
  lot_size?: number
  /** トリガー価格（省略可） */
  trigger_price?: number
}

/**
 * 予約注文情報のインターフェース
 */
export interface PendingOrder {
  order_id: string
  order_type: 'limit' | 'stop'
  side: 'buy' | 'sell'
  lot_size: number
  trigger_price: number
  status: 'pending' | 'executed' | 'cancelled'
  created_at: string
  executed_at?: string
  updated_at?: string
}

export const ordersApi = {
  /**
   * 新規注文を作成する
   *
   * 買いまたは売りの成行注文を作成します。
   * 注文は即座に約定され、新しいポジションが開かれます。
   * シミュレーションが実行中の場合、現在のシミュレーション時刻の価格で約定します。
   *
   * @param data - 注文パラメータ
   *   - side: 売買方向（'buy': 買い、'sell': 売り）
   *   - lot_size: ロットサイズ（0.01〜1.0、1ロット = 10,000通貨）
   * @returns 約定した注文情報（注文ID、約定価格、約定時刻など）
   */
  create: (data: OrderRequest) => {
    return fetchApi<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 注文履歴を取得する
   *
   * 過去に実行された注文の一覧を取得します。
   * ページネーションに対応しており、limit（取得件数）とoffset（開始位置）で
   * 表示範囲を制御できます。
   *
   * @param limit - 取得する最大件数（デフォルト: 50）
   * @param offset - 取得開始位置（デフォルト: 0、ページネーション用）
   * @returns 注文の配列と総件数を含むレスポンス
   */
  getAll: (limit: number = 50, offset: number = 0) => {
    // ページネーション用のパラメータを構築
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    return fetchApi<{ orders: Order[]; total: number }>(`/orders?${params}`)
  },

  /**
   * 予約注文（指値・逆指値）を作成する
   *
   * @param data - 予約注文パラメータ
   * @returns 作成された予約注文情報
   */
  createPending: (data: PendingOrderRequest) => {
    return fetchApi<PendingOrder>('/orders/pending', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 未約定の予約注文一覧を取得する
   *
   * @param limit - 取得する最大件数（デフォルト: 50）
   * @param offset - 取得開始位置（デフォルト: 0）
   * @param status - 状態フィルター（省略可）
   * @returns 予約注文の配列と総件数
   */
  getPendingOrders: (limit: number = 50, offset: number = 0, status?: string) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    if (status) {
      params.append('status', status)
    }
    return fetchApi<{ orders: PendingOrder[]; total: number }>(`/orders/pending?${params}`)
  },

  /**
   * 予約注文の詳細を取得する
   *
   * @param orderId - 注文ID
   * @returns 予約注文の詳細情報
   */
  getPendingOrder: (orderId: string) => {
    return fetchApi<PendingOrder>(`/orders/pending/${orderId}`)
  },

  /**
   * 予約注文を変更する
   *
   * @param orderId - 注文ID
   * @param data - 更新パラメータ
   * @returns 更新後の予約注文情報
   */
  updatePendingOrder: (orderId: string, data: UpdatePendingOrderRequest) => {
    return fetchApi<PendingOrder>(`/orders/pending/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 予約注文をキャンセルする
   *
   * @param orderId - 注文ID
   * @returns キャンセル結果
   */
  cancelPendingOrder: (orderId: string) => {
    return fetchApi<{ order_id: string; status: string; cancelled_at: string }>(`/orders/pending/${orderId}`, {
      method: 'DELETE',
    })
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
  /** 損切り価格 */
  sl_price?: number
  /** 利確価格 */
  tp_price?: number
  /** 損切りpips */
  sl_pips?: number
  /** 利確pips */
  tp_pips?: number
  /** ポジションオープン時刻 */
  opened_at: string
}

/**
 * SL/TP設定リクエストのインターフェース
 */
export interface SetSLTPRequest {
  /** 損切り価格（省略可） */
  sl_price?: number
  /** 利確価格（省略可） */
  tp_price?: number
  /** 損切りpips（省略可） */
  sl_pips?: number
  /** 利確pips（省略可） */
  tp_pips?: number
}

export const positionsApi = {
  /**
   * 全ての保有ポジションを取得する
   *
   * 現在保有している全てのポジション情報を取得します。
   * 各ポジションには、エントリー価格、現在価格、含み損益（円・pips）などの
   * 情報が含まれます。また、全ポジションの合計含み損益も返されます。
   *
   * @returns ポジションの配列と合計含み損益を含むレスポンス
   *   - positions: ポジション情報の配列
   *   - total_unrealized_pnl: 全ポジションの合計含み損益（円）
   */
  getAll: () => {
    return fetchApi<{ positions: Position[]; total_unrealized_pnl: number }>(
      '/positions'
    )
  },

  /**
   * 指定したポジションを決済する
   *
   * ポジションIDを指定してポジションを決済（クローズ）します。
   * シミュレーション時刻の現在価格で決済され、損益が確定します。
   * 決済後、トレード履歴に記録されます。
   *
   * @param positionId - 決済するポジションのID
   * @returns 決済されたポジション情報（決済価格、確定損益を含む）
   */
  close: (positionId: string) => {
    return fetchApi<Position>(`/positions/${positionId}/close`, {
      method: 'POST',
    })
  },

  /**
   * ポジションにSL/TPを設定する
   *
   * 既存のポジションに対して損切り（Stop Loss）と利確（Take Profit）を設定します。
   * 価格指定またはpips指定のいずれかで設定できます。
   *
   * @param positionId - ポジションID
   * @param data - SL/TP設定パラメータ
   * @returns 更新後のポジション情報
   */
  setSltp: (positionId: string, data: SetSLTPRequest) => {
    return fetchApi<Position>(`/positions/${positionId}/sl-tp`, {
      method: 'PUT',
      body: JSON.stringify(data),
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
  /** 連敗数 */
  consecutive_losses?: number
}

export const accountApi = {
  /**
   * 口座情報を取得する
   *
   * 現在の口座状態を取得します。残高、有効証拠金、証拠金使用状況、
   * 含み損益、確定損益などの情報が含まれます。
   * UI更新のために定期的にポーリングされます。
   *
   * @returns 口座情報
   *   - balance: 口座残高（円）
   *   - equity: 有効証拠金（残高 + 含み損益）
   *   - margin_used: 使用中証拠金（保有ポジションの必要証拠金合計）
   *   - margin_available: 利用可能証拠金（新規注文に使える証拠金）
   *   - unrealized_pnl: 含み損益（未決済ポジションの損益合計）
   *   - realized_pnl: 確定損益（決済済みトレードの損益合計）
   *   - initial_balance: 初期資金
   */
  get: () => {
    return fetchApi<AccountInfo>('/account')
  },

  /**
   * 口座の初期残高を設定する
   *
   * 口座の初期資金を変更します。
   * シミュレーション開始前に設定することで、異なる資金額でのトレードを
   * シミュレーションできます。
   *
   * @param initialBalance - 設定する初期資金（円）
   * @returns 更新後の残高情報
   */
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
  /**
   * トレード履歴を取得する
   *
   * 決済済みのトレードの履歴を取得します。
   * 各トレードには、エントリー価格、決済価格、確定損益（円・pips）、
   * 取引時刻などの情報が含まれます。
   * ページネーションに対応しており、大量のトレード履歴を効率的に表示できます。
   *
   * @param limit - 取得する最大件数（デフォルト: 50）
   * @param offset - 取得開始位置（デフォルト: 0、ページネーション用）
   * @returns トレードの配列と総件数を含むレスポンス
   *   - trades: トレード履歴の配列
   *   - total: 総トレード件数
   */
  getAll: (limit: number = 50, offset: number = 0) => {
    // ページネーション用のパラメータを構築
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })
    return fetchApi<{ trades: Trade[]; total: number }>(`/trades?${params}`)
  },

  /**
   * トレード履歴をCSVまたはJSON形式でエクスポートする
   *
   * 全てのトレード履歴をファイルとしてダウンロードします。
   * 新しいタブ/ウィンドウが開き、ブラウザのダウンロード機能で
   * ファイルが保存されます。
   * エクスポートされたCSVは、Excelなどのスプレッドシートソフトで
   * 分析することができます。
   */
  export: (format: 'csv' | 'json' = 'csv') => {
    // エクスポート用のエンドポイントURLを構築
    const params = new URLSearchParams({ format })
    const url = `${API_BASE_URL}/trades/export?${params}`
    // 新しいタブでファイルダウンロードを開始
    window.open(url, '_blank')
  },

  /**
   * トレード履歴をインポートする
   *
   * CSVまたはJSON形式のファイルからトレード履歴をインポートします。
   */
  import: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_BASE_URL}/trades/import`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'インポートに失敗しました')
    }

    return response.json()
  },
}

// ============================================
// パフォーマンス分析 API
// ============================================

/**
 * パフォーマンス指標のインターフェース
 */
export interface PerformanceMetrics {
  basic: {
    win_rate: number
    total_pnl: number
    gross_profit: number
    gross_loss: number
    total_trades: number
    winning_trades: number
    losing_trades: number
  }
  risk_return: {
    profit_factor: number
    average_win: number
    average_loss: number
    risk_reward_ratio: number
    max_win: number
    max_loss: number
    max_win_pips: number
    max_loss_pips: number
  }
  drawdown: {
    max_drawdown: number
    max_drawdown_percent: number
    max_drawdown_duration_days: number
  }
  consecutive: {
    max_consecutive_wins: number
    max_consecutive_losses: number
  }
  period: {
    start_date: string
    end_date: string
    duration_days: number
  }
}

/**
 * 資産曲線データポイントのインターフェース
 */
export interface EquityCurvePoint {
  timestamp: string
  balance: number
  equity: number
  cumulative_pnl: number
}

/**
 * 資産曲線データのインターフェース
 */
export interface EquityCurveData {
  points: EquityCurvePoint[]
  initial_balance: number
  final_balance: number
}

/**
 * ドローダウンデータポイントのインターフェース
 */
export interface DrawdownPoint {
  timestamp: string
  equity: number
  peak_equity: number
  drawdown: number
  drawdown_percent: number
}

/**
 * ドローダウンデータのインターフェース
 */
export interface DrawdownData {
  points: DrawdownPoint[]
  max_drawdown: number
  max_drawdown_percent: number
}

// ============================================
// アラート API
// ============================================

/**
 * アラート情報のインターフェース
 */
export interface Alert {
  /** アラートID */
  id: string
  /** 重要度（info, warning, danger） */
  type: 'info' | 'warning' | 'danger'
  /** アラートメッセージ */
  message: string
  /** アラートカテゴリ */
  category: string
  /** 生成時刻 */
  timestamp: string
}

/**
 * 分析サマリーのインターフェース
 */
export interface AnalysisSummary {
  simulation_id: string
  total_trades: number
  hour_analysis: Record<number, { winrate: number; total_trades: number; pnl: number }>
  best_hour: { hour: number; winrate: number; total_trades: number; pnl: number } | null
  worst_hour: { hour: number; winrate: number; total_trades: number; pnl: number } | null
  max_consecutive_losses: number
  suggestions: Array<{
    category: string
    issue: string
    suggestion: string
  }>
}

export const alertsApi = {
  /**
   * 現在のアラートを取得する
   *
   * トレード状況に基づいてアラートを生成し返却します。
   *
   * @param lotSize - 注文しようとしているロットサイズ（オプション）
   * @returns アラートのリスト
   */
  getAlerts: (lotSize?: number) => {
    const params = new URLSearchParams()
    if (lotSize !== undefined) {
      params.append('lot_size', String(lotSize))
    }
    const queryString = params.toString()
    return fetchApi<{ alerts: Alert[] }>(`/alerts${queryString ? `?${queryString}` : ''}`)
  },

  /**
   * 注文前にアラートをチェックする
   *
   * @param lotSize - 注文しようとしているロットサイズ
   * @returns アラートチェック結果
   */
  checkPreOrder: (lotSize: number) => {
    return fetchApi<{ alerts: Alert[]; has_danger: boolean; has_warning: boolean }>('/alerts/check', {
      method: 'POST',
      body: JSON.stringify({ lot_size: lotSize }),
    })
  },

  /**
   * トレード分析サマリーを取得する
   *
   * 時間帯別の勝率、連敗パターン、改善提案などを取得します。
   *
   * @returns 分析サマリー
   */
  getAnalysisSummary: () => {
    return fetchApi<AnalysisSummary>('/alerts/analysis-summary')
  },
}

export const analyticsApi = {
  /**
   * パフォーマンス指標を取得する
   *
   * 勝率、プロフィットファクター、最大ドローダウンなどの
   * パフォーマンス指標を取得します。
   *
   * @returns パフォーマンス指標データ
   */
  getPerformance: () => {
    return fetchApi<PerformanceMetrics>('/analytics/performance')
  },

  /**
   * 資産曲線データを取得する
   *
   * トレードごとの資産推移データを取得します。
   *
   * @param interval - データ間隔（'trade', 'hour', 'day'）
   * @returns 資産曲線データ
   */
  getEquityCurve: (interval: 'trade' | 'hour' | 'day' = 'trade') => {
    const params = new URLSearchParams({ interval })
    return fetchApi<EquityCurveData>(`/analytics/equity-curve?${params}`)
  },

  /**
   * ドローダウンデータを取得する
   *
   * ドローダウンの推移データを取得します。
   *
   * @returns ドローダウンデータ
   */
  getDrawdown: () => {
    return fetchApi<DrawdownData>('/analytics/drawdown')
  },

  /**
   * 売買履歴とローソク足データを一緒に取得する（パフォーマンス分析用）
   *
   * F-003: パフォーマンス分析へのチャート表示機能
   * 売買履歴の時間範囲に対応するローソク足データを取得し、
   * チャート上に売買履歴をマーカーとして表示するために使用します。
   *
   * @param timeframe - 時間足（'W1', 'D1', 'H1', 'M10'）
   * @returns 売買履歴とローソク足データ
   */
  getTradesWithCandles: (timeframe: string = 'H1') => {
    const params = new URLSearchParams({ timeframe })
    return fetchApi<{
      trades: Trade[]
      candles: Candle[]
      timeframe: string
      start_time: string | null
      end_time: string | null
    }>(`/analytics/trades-with-candles?${params}`)
  },
}
