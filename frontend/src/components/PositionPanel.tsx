import { useState, useEffect, useCallback } from 'react'
import { positionsApi, Position, SetSLTPRequest, AccountInfo } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import { logger } from '../utils/logger'
import LoadingSpinner from './LoadingSpinner'
import { SL_PIPS_PRESETS, calculateSlPipsDifference } from '../constants/presets'

interface PositionPanelProps {
  refreshTrigger?: number
  account?: AccountInfo | null
  currentPrice?: number
}

function PositionPanel({ refreshTrigger, account, currentPrice }: PositionPanelProps) {
  const [positions, setPositions] = useState<Position[]>([])
  const [totalPnl, setTotalPnl] = useState(0)
  const [loading, setLoading] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)
  const [enableSL, setEnableSL] = useState(false)
  const [enableTP, setEnableTP] = useState(false)
  const [slType, setSlType] = useState<'price' | 'pips'>('pips')
  const [tpType, setTpType] = useState<'price' | 'pips'>('pips')
  const [slPrice, setSlPrice] = useState('')
  const [tpPrice, setTpPrice] = useState('')
  const [slPips, setSlPips] = useState('')
  const [tpPips, setTpPips] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const { status } = useSimulationStore()

  // デバッグ用：ステータスを確認
  logger.debug('PositionPanel', `status: ${status}`)

  // 証拠金を計算する関数
  const calculateMargin = (price: number, lotSize: number): number => {
    const CURRENCY_PER_LOT = 100000 // 1ロット = 100,000通貨
    const LEVERAGE = 25 // レバレッジ25倍
    return (price * lotSize * CURRENCY_PER_LOT) / LEVERAGE
  }

  // 合計証拠金を計算
  const totalMargin = positions.reduce((sum: number, pos: Position) => {
    return sum + calculateMargin(pos.entry_price, pos.lot_size)
  }, 0)

  const fetchPositions = useCallback(async () => {
    if (status === 'idle') return

    try {
      const res = await positionsApi.getAll()
      if (res.success && res.data) {
        setPositions(res.data.positions)
        setTotalPnl(res.data.total_unrealized_pnl)
      }
    } catch (error) {
      logger.error('PositionPanel', `fetchPositions error : ${error}`, { error })
    }
  }, [status])

  useEffect(() => {
    fetchPositions()
  }, [fetchPositions, refreshTrigger])

  // 定期的にポジションを更新（5秒ごと）
  useEffect(() => {
    if (status !== 'running') return

    const interval = setInterval(() => {
      fetchPositions()
    }, 5000)

    return () => clearInterval(interval)
  }, [status, fetchPositions])

  const handleClose = async (positionId: string) => {
    setClosingId(positionId)
    try {
      const res = await positionsApi.close(positionId)
      if (res.success) {
        await fetchPositions()
      } else {
        alert(`決済エラー: ${res.error?.message}`)
      }
    } catch (error) {
      logger.error('PositionPanel', `handleClose error : ${error}`, { error })
      alert(`決済エラー: ${error}`)
    } finally {
      setClosingId(null)
    }
  }

  const handleCloseAll = async () => {
    if (positions.length === 0) return
    if (!confirm('すべてのポジションを決済しますか？')) return

    setLoading(true)
    try {
      logger.info('PositionPanel', `全ポジション決済開始: ${positions.length}件`)
      for (const pos of positions) {
        await positionsApi.close(pos.position_id)
      }
      logger.info('PositionPanel', '全ポジション決済完了')
      await fetchPositions()
    } catch (error) {
      logger.error('PositionPanel', `handleCloseAll error : ${error}`, { error })
      alert(`決済エラー: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleEditSltp = (position: Position) => {
    setEditingPosition(position)

    // 既存のSL/TP値を設定（常にpips指定をデフォルトにする）
    setSlType('pips')
    setTpType('pips')

    if (position.sl_price) {
      setEnableSL(true)
      // 価格からpips値を逆算
      const pips = calculateSlPipsDifference(position.entry_price, position.sl_price, position.side)
      setSlPips(String(Math.round(pips)))
      setSlPrice('')
    } else if (position.sl_pips) {
      setEnableSL(true)
      setSlPips(String(position.sl_pips))
      setSlPrice('')
    } else {
      setEnableSL(false)
      setSlPrice('')
      setSlPips('')
    }

    if (position.tp_price) {
      setEnableTP(true)
      // 価格からpips値を逆算（TPはSLの逆方向）
      const pips = calculateSlPipsDifference(position.entry_price, position.tp_price, position.side)
      setTpPips(String(Math.round(pips)))
      setTpPrice('')
    } else if (position.tp_pips) {
      setEnableTP(true)
      setTpPips(String(position.tp_pips))
      setTpPrice('')
    } else {
      setEnableTP(false)
      setTpPrice('')
      setTpPips('')
    }
  }

  const handleSaveSltp = async () => {
    if (!editingPosition) return

    setIsSaving(true)
    try {
      const request: SetSLTPRequest = {}

      // SL設定（チェックボックスがオンの場合のみ）
      if (enableSL) {
        if (slType === 'price') {
          const price = parseFloat(slPrice)
          if (price > 0) {
            // 価格指定の場合のバリデーション：正の価格のみ確認（方向の制約は削除）
            request.sl_price = price
          }
        } else {
          const pips = parseFloat(slPips)
          if (!isNaN(pips) && pips !== 0) {
            // pips指定の場合、バックエンドで適切に計算される
            request.sl_pips = pips
          }
        }
      }

      // TP設定（チェックボックスがオンの場合のみ）
      if (enableTP) {
        if (tpType === 'price') {
          const price = parseFloat(tpPrice)
          if (price > 0) {
            // 価格指定の場合のバリデーション：正の価格のみ確認（方向の制約は削除）
            request.tp_price = price
          }
        } else {
          const pips = parseFloat(tpPips)
          if (!isNaN(pips) && pips !== 0) {
            // pips指定の場合、バックエンドで適切に計算される
            request.tp_pips = pips
          }
        }
      }

      const res = await positionsApi.setSltp(editingPosition.position_id, request)

      if (res.success) {
        logger.info('PositionPanel', `SL/TP設定成功: position_id=${editingPosition.position_id}`)
        await fetchPositions()
        setEditingPosition(null)
      } else {
        logger.warning('PositionPanel', `SL/TP設定エラー: ${res.error?.message}`)
        alert(`SL/TP設定エラー: ${res.error?.message}`)
      }
    } catch (error) {
      logger.error('PositionPanel', `handleSaveSltp error : ${error}`, { error })
      alert(`SL/TP設定エラー: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingPosition(null)
    setSlPrice('')
    setTpPrice('')
    setSlPips('')
    setTpPips('')
  }

  return (
    <div className="bg-bg-card rounded-lg p-3 h-full flex flex-col overflow-hidden">
      {/* 固定ヘッダー */}
      <div className="flex items-center justify-between mb-2 whitespace-nowrap overflow-hidden">
        <h3 className="text-lg font-semibold text-text-strong flex-shrink-0">
          ポジション
          {positions.length > 0 && (
            <span className="ml-2 text-text-secondary">({positions.length})</span>
          )}
        </h3>
        <div className="flex items-center gap-2 min-w-0">
          {positions.length > 0 && (
            <span className="text-xs text-text-secondary">
              証拠金: ¥{totalMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              {account?.margin_available !== undefined && currentPrice && currentPrice > 0 && (
                <>
                  {' '}(残: ¥{account.margin_available.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {' / '}
                  {((account.margin_available * 25) / currentPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}通貨)
                </>
              )}
            </span>
          )}
          <span className={`text-lg font-semibold flex-shrink-0 ${totalPnl >= 0 ? 'text-buy' : 'text-sell'}`}>
            損益: {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString()}円
          </span>
          {positions.length > 0 && (
            <button
              onClick={handleCloseAll}
              disabled={loading || (status !== 'running' && status !== 'paused')}
              className="px-3 py-1 bg-sell text-text-strong rounded text-sm hover:opacity-80 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
            >
              {loading && <LoadingSpinner size="sm" />}
              {loading ? '処理中...' : '全決済'}
            </button>
          )}
        </div>
      </div>

      {/* テーブルエリア */}
      {positions.length === 0 ? (
        <div className="text-center text-text-secondary text-lg py-4">
          ポジションなし
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 固定テーブルヘッダー */}
          <table className="w-full text-xs text-text-primary table-fixed">
            <colgroup>
              <col className="w-10" />
              <col className="w-8" />
              <col className="w-14" />
              <col className="w-16" />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 px-1">方向</th>
                <th className="text-right py-1 px-1">通貨</th>
                <th className="text-right py-1 px-1 text-sm">証拠金</th>
                <th className="text-right py-1 px-1">Entry</th>
                <th className="text-right py-1 px-1">現在</th>
                <th className="text-right py-1 px-1 text-sm">SL</th>
                <th className="text-right py-1 px-1 text-sm">TP</th>
                <th className="text-right py-1 px-1">損益(pips)</th>
                <th className="text-right py-1 px-1">損益(円)</th>
                <th className="text-center py-1 px-1">操作</th>
              </tr>
            </thead>
          </table>

          {/* スクロール可能なテーブルボディ */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs text-text-primary table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-8" />
                <col className="w-14" />
                <col className="w-16" />
                <col className="w-16" />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-32" />
              </colgroup>
              <tbody>
                {positions.map((pos) => {
                  const margin = calculateMargin(pos.entry_price, pos.lot_size)
                  const currencyUnits = pos.lot_size * 100000
                  return (
                    <tr key={pos.position_id} className="border-b border-border">
                      <td className={`py-1 px-1 ${pos.side === 'buy' ? 'text-buy' : 'text-sell'}`}>
                        {pos.side === 'buy' ? '買' : '売'}
                      </td>
                      <td className="text-right py-1 px-1">{currencyUnits.toLocaleString()}</td>
                      <td className="text-right py-1 px-1 text-sm text-text-secondary">
                        ¥{margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="text-right py-1 px-1">{pos.entry_price.toFixed(3)}</td>
                      <td className="text-right py-1 px-1">{pos.current_price?.toFixed(3) || '-'}</td>
                      <td className="text-right py-1 px-1 text-sm text-sell">
                        {pos.sl_price ? (
                          <>
                            {pos.sl_price.toFixed(3)}
                            <span className="text-text-secondary ml-0.5">
                              ({calculateSlPipsDifference(pos.entry_price, pos.sl_price, pos.side).toFixed(0)}p)
                            </span>
                          </>
                        ) : pos.sl_pips ? `${pos.sl_pips}p` : '-'}
                      </td>
                      <td className="text-right py-1 px-1 text-sm text-buy">
                        {pos.tp_price ? pos.tp_price.toFixed(3) : pos.tp_pips ? `${pos.tp_pips}p` : '-'}
                      </td>
                      <td className={`text-right py-1 px-1 ${(pos.unrealized_pnl_pips ?? 0) >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {(pos.unrealized_pnl_pips ?? 0) >= 0 ? '+' : ''}{(pos.unrealized_pnl_pips ?? 0).toFixed(1)}
                      </td>
                      <td className={`text-right py-1 px-1 ${(pos.unrealized_pnl ?? 0) >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {(pos.unrealized_pnl ?? 0) >= 0 ? '+' : ''}{(pos.unrealized_pnl ?? 0).toLocaleString()}
                      </td>
                      <td className="text-center py-1 px-1">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => handleEditSltp(pos)}
                            disabled={status !== 'running' && status !== 'paused'}
                            className="px-2 py-0.5 bg-btn-primary rounded text-xs hover:opacity-80 disabled:opacity-50"
                          >
                            SL/TP
                          </button>
                          <button
                            onClick={() => handleClose(pos.position_id)}
                            disabled={closingId === pos.position_id || (status !== 'running' && status !== 'paused')}
                            className="px-2 py-0.5 bg-btn-secondary rounded text-xs hover:opacity-80 disabled:opacity-50 flex items-center gap-1"
                          >
                            {closingId === pos.position_id && <LoadingSpinner size="sm" />}
                            {closingId === pos.position_id ? '...' : '決済'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SL/TP設定モーダル */}
      {editingPosition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-card rounded-lg p-6 w-[500px]">
            <h3 className="text-xl font-semibold text-text-strong mb-4">
              SL/TP設定
            </h3>

            <div className="mb-4">
              <div className="text-sm text-text-secondary mb-2">
                <div>方向: {editingPosition.side === 'buy' ? '買' : '売'}</div>
                <div>エントリー価格: {editingPosition.entry_price.toFixed(3)}</div>
                <div>現在価格: {editingPosition.current_price?.toFixed(3) || '-'}</div>
              </div>
            </div>

            {/* SL設定 */}
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm text-sell font-semibold mb-2">
                <input
                  type="checkbox"
                  checked={enableSL}
                  onChange={(e) => setEnableSL(e.target.checked)}
                />
                損切り（Stop Loss）
              </label>
              {enableSL && (
                <>
                  <div className="flex items-center gap-2">
                    <select
                      value={slType}
                      onChange={(e) => setSlType(e.target.value as 'price' | 'pips')}
                      className="px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                    >
                      <option value="pips">pips指定</option>
                      <option value="price">価格指定</option>
                    </select>
                    {slType === 'price' ? (
                      <input
                        type="number"
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        placeholder={editingPosition.current_price?.toFixed(3)}
                        className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                        step="0.001"
                      />
                    ) : (
                      <>
                        <input
                          type="number"
                          value={slPips}
                          onChange={(e) => setSlPips(e.target.value)}
                          placeholder="-20"
                          className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                          step="1"
                        />
                        <span className="text-sm text-text-secondary">pips</span>
                      </>
                    )}
                  </div>
                  {/* SLプリセットボタン（共通定数使用） */}
                  {slType === 'pips' && (
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs text-text-secondary">プリセット:</span>
                      {SL_PIPS_PRESETS.map(pips => (
                        <button
                          key={pips}
                          type="button"
                          onClick={() => setSlPips(String(pips))}
                          className="px-3 py-1 bg-bg-primary border border-border rounded text-sm hover:bg-border"
                        >
                          {pips}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-text-secondary mt-1">
                    ※ 負の値を設定（バックエンドで自動計算されます）
                  </div>
                </>
              )}
            </div>

            {/* TP設定 */}
            <div className="mb-6">
              <label className="flex items-center gap-2 text-sm text-buy font-semibold mb-2">
                <input
                  type="checkbox"
                  checked={enableTP}
                  onChange={(e) => setEnableTP(e.target.checked)}
                />
                利確（Take Profit）
              </label>
              {enableTP && (
                <>
                  <div className="flex items-center gap-2">
                    <select
                      value={tpType}
                      onChange={(e) => setTpType(e.target.value as 'price' | 'pips')}
                      className="px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                    >
                      <option value="pips">pips指定</option>
                      <option value="price">価格指定</option>
                    </select>
                    {tpType === 'price' ? (
                      <input
                        type="number"
                        value={tpPrice}
                        onChange={(e) => setTpPrice(e.target.value)}
                        placeholder={editingPosition.current_price?.toFixed(3)}
                        className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                        step="0.001"
                      />
                    ) : (
                      <input
                        type="number"
                        value={tpPips}
                        onChange={(e) => setTpPips(e.target.value)}
                        placeholder="30"
                        className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                        step="1"
                      />
                    )}
                    {tpType === 'pips' && <span className="text-sm text-text-secondary">pips</span>}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    ※ 買いは正の値、売りは負の値（バックエンドで自動計算されます）
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-4 py-2 bg-btn-secondary text-text-strong rounded hover:opacity-80 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveSltp}
                disabled={isSaving}
                className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving && <LoadingSpinner size="sm" />}
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PositionPanel
