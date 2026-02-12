/**
 * シミュレーション状態管理ストア
 *
 * Zustandを使用してシミュレーションの状態をグローバルに管理する。
 * シミュレーションの開始、停止、一時停止、再開などの操作を提供し、
 * アプリケーション全体で状態を共有する。
 *
 * @module simulationStore
 */

import { create } from 'zustand'
import { simulationApi, accountApi, positionsApi, Position, AccountInfo } from '../services/api'
import { logger } from '../utils/logger'

/**
 * シミュレーション状態のインターフェース
 */
interface SimulationState {
  /** シミュレーションID（nullの場合は未開始） */
  simulationId: string | null
  /** シミュレーション状態 */
  status: 'idle' | 'created' | 'running' | 'paused' | 'stopped'
  /** 現在のシミュレーション時刻 */
  currentTime: Date | null
  /** 再生速度倍率 */
  speed: number
  /** 口座情報 */
  account: AccountInfo | null
  /** 保有ポジション一覧 */
  positions: Position[]
  /** 合計含み損益 */
  totalUnrealizedPnl: number
  /** ローディング状態 */
  isLoading: boolean
  /** エラーメッセージ */
  error: string | null
}

/**
 * シミュレーション操作アクションのインターフェース
 */
interface SimulationActions {
  /** シミュレーションを開始する */
  startSimulation: (startTime: Date, initialBalance: number, speed?: number) => Promise<void>
  /** シミュレーションを停止する */
  stopSimulation: () => Promise<void>
  /** シミュレーションを一時停止する */
  pauseSimulation: () => Promise<void>
  /** シミュレーションを再開する */
  resumeSimulation: () => Promise<void>
  /** 再生速度を変更する */
  setSpeed: (speed: number) => Promise<void>
  /** シミュレーション状態を取得する */
  fetchStatus: () => Promise<void>
  /** 口座情報を取得する */
  fetchAccount: () => Promise<void>
  /** ポジション情報を取得する */
  fetchPositions: () => Promise<void>
  /** シミュレーション時刻を更新する */
  advanceTime: (newTime: Date) => void
  /** 状態を初期化する */
  reset: () => void
}

/**
 * ローカル時間をISO形式の文字列に変換する（UTCに変換しない）
 * CSVデータがJSTで保存されているため、JSTのままAPIに送信する必要がある
 */
function toLocalISOString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

/** 初期状態 */
const initialState: SimulationState = {
  simulationId: null,
  status: 'idle',
  currentTime: null,
  speed: 1.0,
  account: null,
  positions: [],
  totalUnrealizedPnl: 0,
  isLoading: false,
  error: null,
}

/**
 * シミュレーション状態管理フック
 *
 * Zustandストアを使用してシミュレーションの状態とアクションを提供する。
 *
 * @example
 * ```tsx
 * const { status, currentTime, startSimulation } = useSimulationStore()
 *
 * // シミュレーション開始
 * await startSimulation(new Date('2024-01-01'), 1000000, 1.0)
 * ```
 */
export const useSimulationStore = create<SimulationState & SimulationActions>((set, get) => ({
  ...initialState,

  /**
   * シミュレーションを開始する
   *
   * @param startTime - 開始時刻
   * @param initialBalance - 初期資金（円）
   * @param speed - 再生速度倍率（デフォルト: 1.0）
   */
  startSimulation: async (startTime, initialBalance, speed = 1.0) => {
    set({ isLoading: true, error: null })
    logger.info('SimulationStore', `シミュレーション開始: startTime=${startTime.toISOString()}, initialBalance=${initialBalance}`)
    try {
      const res = await simulationApi.start({
        // JSTのままAPIに送信（UTCに変換しない）
        start_time: toLocalISOString(startTime),
        initial_balance: initialBalance,
        speed,
      })
      if (res.success && res.data) {
        logger.info('SimulationStore', `シミュレーション開始成功: id=${res.data.simulation_id}`)
        set({
          simulationId: res.data.simulation_id,
          status: res.data.status,
          currentTime: new Date(res.data.current_time),
          speed: res.data.speed,
          isLoading: false,
        })
        // 口座情報を取得
        await get().fetchAccount()
      } else {
        const errorMsg = res.error?.message || 'Failed to start simulation'
        logger.error('SimulationStore', `startSimulation error : ${errorMsg}`)
        set({ error: errorMsg, isLoading: false })
      }
    } catch (error) {
      logger.error('SimulationStore', `startSimulation error : ${error}`, { error })
      set({ error: String(error), isLoading: false })
    }
  },

  stopSimulation: async () => {
    // 楽観的更新: 即座にstatusを'stopped'に設定してUIを即座に反応させる
    const previousStatus = get().status
    set({ status: 'stopped', isLoading: true, error: null })
    logger.info('SimulationStore', 'シミュレーション停止')
    try {
      const res = await simulationApi.stop()
      if (res.success && res.data) {
        logger.info('SimulationStore', 'シミュレーション停止成功')
        set({ isLoading: false })
      } else {
        // API失敗時は元の状態に戻す
        const errorMsg = res.error?.message || 'Failed to stop simulation'
        logger.error('SimulationStore', `stopSimulation error : ${errorMsg}`)
        set({ status: previousStatus, error: errorMsg, isLoading: false })
      }
    } catch (error) {
      // エラー時は元の状態に戻す
      logger.error('SimulationStore', `stopSimulation error : ${error}`, { error })
      set({ status: previousStatus, error: String(error), isLoading: false })
    }
  },

  pauseSimulation: async () => {
    // 楽観的更新: 即座にstatusを'paused'に設定してUIを即座に反応させる
    // これによりタイマーが即座に停止し、チャート更新も停止する
    const previousStatus = get().status
    set({ status: 'paused', isLoading: true, error: null })
    try {
      const res = await simulationApi.pause()
      if (res.success && res.data) {
        // API成功時はisLoadingをfalseに
        set({ isLoading: false })
      } else {
        // API失敗時は元の状態に戻す
        logger.error('SimulationStore', `pauseSimulation error : ${res.error?.message || 'Failed to pause simulation'}`)
        set({ status: previousStatus, error: res.error?.message || 'Failed to pause simulation', isLoading: false })
      }
    } catch (error) {
      // エラー時は元の状態に戻す
      logger.error('SimulationStore', `pauseSimulation error : ${error}`, { error })
      set({ status: previousStatus, error: String(error), isLoading: false })
    }
  },

  resumeSimulation: async () => {
    // 楽観的更新: 即座にstatusを'running'に設定してUIを即座に反応させる
    const previousStatus = get().status
    set({ status: 'running', isLoading: true, error: null })
    try {
      const res = await simulationApi.resume()
      if (res.success && res.data) {
        // API成功時はisLoadingをfalseに
        set({ isLoading: false })
      } else {
        // API失敗時は元の状態に戻す
        logger.error('SimulationStore', `resumeSimulation error : ${res.error?.message || 'Failed to resume simulation'}`)
        set({ status: previousStatus, error: res.error?.message || 'Failed to resume simulation', isLoading: false })
      }
    } catch (error) {
      // エラー時は元の状態に戻す
      logger.error('SimulationStore', `resumeSimulation error : ${error}`, { error })
      set({ status: previousStatus, error: String(error), isLoading: false })
    }
  },

  setSpeed: async (speed) => {
    try {
      const res = await simulationApi.setSpeed(speed)
      if (res.success && res.data) {
        set({ speed: res.data.speed })
      }
    } catch (error) {
      logger.error('SimulationStore', `setSpeed error : ${error}`, { error })
    }
  },

  fetchStatus: async () => {
    try {
      const res = await simulationApi.getStatus()
      if (res.success && res.data) {
        set({
          simulationId: res.data.simulation_id,
          status: res.data.status as SimulationState['status'],
          currentTime: res.data.current_time ? new Date(res.data.current_time) : null,
          speed: res.data.speed,
        })
      }
    } catch (error) {
      logger.error('SimulationStore', `fetchStatus error : ${error}`, { error })
    }
  },

  fetchAccount: async () => {
    try {
      const res = await accountApi.get()
      if (res.success && res.data) {
        set({ account: res.data })
      }
    } catch (error) {
      logger.error('SimulationStore', `fetchAccount error : ${error}`, { error })
    }
  },

  fetchPositions: async () => {
    try {
      const res = await positionsApi.getAll()
      if (res.success && res.data) {
        set({
          positions: res.data.positions,
          totalUnrealizedPnl: res.data.total_unrealized_pnl,
        })
      }
    } catch (error) {
      logger.error('SimulationStore', `fetchPositions error : ${error}`, { error })
    }
  },

  advanceTime: (newTime) => {
    set({ currentTime: newTime })
  },

  reset: () => {
    set(initialState)
  },
}))
