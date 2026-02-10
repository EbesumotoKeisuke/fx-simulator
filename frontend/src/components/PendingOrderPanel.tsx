import { useState, useEffect, useCallback } from 'react'
import { ordersApi, PendingOrder } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import { logger } from '../utils/logger'

interface PendingOrderPanelProps {
  refreshTrigger?: number
}

function PendingOrderPanel({ refreshTrigger }: PendingOrderPanelProps) {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<PendingOrder | null>(null)
  const [editLotSize, setEditLotSize] = useState('')
  const [editTriggerPrice, setEditTriggerPrice] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const { status } = useSimulationStore()

  const fetchPendingOrders = useCallback(async () => {
    if (status === 'idle') return

    try {
      const res = await ordersApi.getPendingOrders(50, 0, 'pending')
      if (res.success && res.data) {
        setOrders(res.data.orders)
      }
    } catch (error) {
      logger.error('PendingOrderPanel', `fetchPendingOrders error : ${error}`, { error })
    }
  }, [status])

  useEffect(() => {
    fetchPendingOrders()
  }, [fetchPendingOrders, refreshTrigger])

  // 定期的に予約注文を更新（5秒ごと）
  useEffect(() => {
    if (status !== 'running') return

    const interval = setInterval(() => {
      fetchPendingOrders()
    }, 5000)

    return () => clearInterval(interval)
  }, [status, fetchPendingOrders])

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId)
    try {
      const res = await ordersApi.cancelPendingOrder(orderId)
      if (res.success) {
        await fetchPendingOrders()
      } else {
        alert(`キャンセルエラー: ${res.error?.message}`)
      }
    } catch (error) {
      logger.error('PendingOrderPanel', `handleCancel error : ${error}`, { orderId, error })
      alert(`キャンセルエラー: ${error}`)
    } finally {
      setCancellingId(null)
    }
  }

  const handleCancelAll = async () => {
    if (orders.length === 0) return
    if (!confirm('すべての予約注文をキャンセルしますか？')) return

    setLoading(true)
    try {
      for (const order of orders) {
        await ordersApi.cancelPendingOrder(order.order_id)
      }
      await fetchPendingOrders()
    } catch (error) {
      logger.error('PendingOrderPanel', `handleCancelAll error : ${error}`, { error })
      alert(`キャンセルエラー: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (order: PendingOrder) => {
    setEditingOrder(order)
    setEditLotSize(String(order.lot_size))
    setEditTriggerPrice(String(order.trigger_price))
  }

  const handleSaveEdit = async () => {
    if (!editingOrder) return

    const newLotSize = parseFloat(editLotSize)
    const newTriggerPrice = parseFloat(editTriggerPrice)

    if (!newLotSize || newLotSize <= 0) {
      alert('ロットサイズを正しく入力してください')
      return
    }

    if (!newTriggerPrice || newTriggerPrice <= 0) {
      alert('トリガー価格を正しく入力してください')
      return
    }

    setIsSaving(true)
    try {
      const res = await ordersApi.updatePendingOrder(editingOrder.order_id, {
        lot_size: newLotSize,
        trigger_price: newTriggerPrice,
      })

      if (res.success) {
        await fetchPendingOrders()
        setEditingOrder(null)
      } else {
        alert(`更新エラー: ${res.error?.message}`)
      }
    } catch (error) {
      logger.error('PendingOrderPanel', `handleSaveEdit error : ${error}`, { orderId: editingOrder.order_id, error })
      alert(`更新エラー: ${error}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingOrder(null)
    setEditLotSize('')
    setEditTriggerPrice('')
  }

  return (
    <div className="bg-bg-card rounded-lg p-3 h-full flex flex-col overflow-hidden">
      {/* 固定ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-text-strong">
          予約注文
          {orders.length > 0 && (
            <span className="ml-2 text-text-secondary">({orders.length})</span>
          )}
        </h3>
        {orders.length > 0 && (
          <button
            onClick={handleCancelAll}
            disabled={loading || (status !== 'running' && status !== 'paused')}
            className="px-3 py-1 bg-sell text-text-strong rounded text-sm hover:opacity-80 disabled:opacity-50"
          >
            {loading ? '...' : '全キャンセル'}
          </button>
        )}
      </div>

      {/* テーブルエリア */}
      {orders.length === 0 ? (
        <div className="text-center text-text-secondary text-lg py-4">
          予約注文なし
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 固定テーブルヘッダー */}
          <table className="w-full text-base text-text-primary table-fixed">
            <colgroup>
              <col className="w-16" />
              <col className="w-12" />
              <col className="w-24" />
              <col className="w-20" />
              <col className="w-24" />
              <col className="w-40" />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 px-1">タイプ</th>
                <th className="text-left py-1 px-1">方向</th>
                <th className="text-right py-1 px-1">通貨</th>
                <th className="text-right py-1 px-1">価格</th>
                <th className="text-left py-1 px-1">作成日時</th>
                <th className="text-center py-1 px-1">操作</th>
              </tr>
            </thead>
          </table>

          {/* スクロール可能なテーブルボディ */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-base text-text-primary table-fixed">
              <colgroup>
                <col className="w-16" />
                <col className="w-12" />
                <col className="w-24" />
                <col className="w-20" />
                <col className="w-24" />
                <col className="w-40" />
              </colgroup>
              <tbody>
                {orders.map((order) => {
                  const currencyUnits = order.lot_size * 100000
                  const orderTypeLabel = order.order_type === 'limit' ? '指値' : '逆指値'
                  const createdDate = new Date(order.created_at)
                  const formattedDate = `${createdDate.getMonth() + 1}/${createdDate.getDate()} ${createdDate.getHours()}:${String(createdDate.getMinutes()).padStart(2, '0')}`

                  return (
                    <tr key={order.order_id} className="border-b border-border">
                      <td className="py-1 px-1 text-text-secondary">{orderTypeLabel}</td>
                      <td className={`py-1 px-1 ${order.side === 'buy' ? 'text-buy' : 'text-sell'}`}>
                        {order.side === 'buy' ? '買' : '売'}
                      </td>
                      <td className="text-right py-1 px-1">{currencyUnits.toLocaleString()}</td>
                      <td className="text-right py-1 px-1">{order.trigger_price.toFixed(3)}</td>
                      <td className="text-left py-1 px-1 text-sm text-text-secondary">{formattedDate}</td>
                      <td className="text-center py-1 px-1">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => handleEdit(order)}
                            disabled={cancellingId === order.order_id || (status !== 'running' && status !== 'paused')}
                            className="px-2 py-0.5 bg-btn-primary rounded text-xs hover:opacity-80 disabled:opacity-50"
                          >
                            変更
                          </button>
                          <button
                            onClick={() => handleCancel(order.order_id)}
                            disabled={cancellingId === order.order_id || (status !== 'running' && status !== 'paused')}
                            className="px-2 py-0.5 bg-btn-secondary rounded text-xs hover:opacity-80 disabled:opacity-50"
                          >
                            {cancellingId === order.order_id ? '...' : 'キャンセル'}
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

      {/* 変更モーダル */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-card rounded-lg p-6 w-96">
            <h3 className="text-xl font-semibold text-text-strong mb-4">
              予約注文の変更
            </h3>

            <div className="mb-4">
              <div className="text-sm text-text-secondary mb-2">
                <div>タイプ: {editingOrder.order_type === 'limit' ? '指値' : '逆指値'}</div>
                <div>方向: {editingOrder.side === 'buy' ? '買' : '売'}</div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-1">
                ロットサイズ
              </label>
              <input
                type="number"
                value={editLotSize}
                onChange={(e) => setEditLotSize(e.target.value)}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                step="0.01"
                min="0.01"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm text-text-secondary mb-1">
                トリガー価格
              </label>
              <input
                type="number"
                value={editTriggerPrice}
                onChange={(e) => setEditTriggerPrice(e.target.value)}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary"
                step="0.001"
                min="0"
              />
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
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80 disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PendingOrderPanel
