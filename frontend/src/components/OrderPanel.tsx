import { useState } from 'react'
import { ordersApi, PendingOrderRequest, AccountInfo } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import LoadingSpinner from './LoadingSpinner'

interface OrderPanelProps {
  currentPrice: number
  account?: AccountInfo | null
  onRefresh?: () => void
  /** ロット数量（外部から制御する場合） */
  lotQuantity?: string
  /** ロット単位（外部から制御する場合） */
  lotUnit?: string
  /** ロット数量変更時のコールバック */
  onLotQuantityChange?: (value: string) => void
  /** ロット単位変更時のコールバック */
  onLotUnitChange?: (value: string) => void
}

function OrderPanel({
  currentPrice,
  account,
  onRefresh,
  lotQuantity: externalLotQuantity,
  lotUnit: externalLotUnit,
  onLotQuantityChange,
  onLotUnitChange
}: OrderPanelProps) {
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [internalLotQuantity, setInternalLotQuantity] = useState('1')
  const [internalLotUnit, setInternalLotUnit] = useState('10000')

  // 外部制御がある場合は外部の値を使用、なければ内部stateを使用
  const lotQuantity = externalLotQuantity !== undefined ? externalLotQuantity : internalLotQuantity
  const lotUnit = externalLotUnit !== undefined ? externalLotUnit : internalLotUnit

  const setLotQuantity = (value: string) => {
    if (onLotQuantityChange) {
      onLotQuantityChange(value)
    } else {
      setInternalLotQuantity(value)
    }
  }

  const setLotUnit = (value: string) => {
    if (onLotUnitChange) {
      onLotUnitChange(value)
    } else {
      setInternalLotUnit(value)
    }
  }
  const [triggerPrice, setTriggerPrice] = useState('')
  const [enableSL, setEnableSL] = useState(false)
  const [enableTP, setEnableTP] = useState(false)
  const [slType, setSlType] = useState<'price' | 'pips'>('pips')
  const [tpType, setTpType] = useState<'price' | 'pips'>('pips')
  const [slPrice, setSlPrice] = useState('')
  const [tpPrice, setTpPrice] = useState('')
  const [slPips, setSlPips] = useState('-20')
  const [tpPips, setTpPips] = useState('30')
  const [isOrdering, setIsOrdering] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const { status } = useSimulationStore()
  const canTrade = status === 'running' || status === 'paused'

  const actualLotSize = () => {
    const quantity = parseFloat(lotQuantity) || 0
    const unit = parseFloat(lotUnit) || 0
    const totalUnits = quantity * unit
    return totalUnits / 100000
  }

  const handleMarketOrder = async () => {
    if (!canTrade) {
      setMessage('シミュレーションが実行中ではありません')
      return
    }

    setIsOrdering(true)
    setMessage(null)

    try {
      const orderData: any = {
        side,
        lot_size: actualLotSize(),
      }

      // SL/TPの追加
      if (enableSL) {
        if (slType === 'price') {
          const price = parseFloat(slPrice)
          if (price > 0) orderData.sl_price = price
        } else {
          const pips = parseFloat(slPips)
          if (!isNaN(pips)) orderData.sl_pips = pips
        }
      }

      if (enableTP) {
        if (tpType === 'price') {
          const price = parseFloat(tpPrice)
          if (price > 0) orderData.tp_price = price
        } else {
          const pips = parseFloat(tpPips)
          if (!isNaN(pips)) orderData.tp_pips = pips
        }
      }

      const res = await ordersApi.create(orderData)

      if (res.success) {
        setMessage(`${side === 'buy' ? '買い' : '売り'}注文が約定しました`)
        onRefresh?.()
      } else {
        setMessage(`エラー: ${res.error?.message}`)
      }
    } catch (error) {
      setMessage(`エラー: ${error}`)
    } finally {
      setIsOrdering(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handlePendingOrder = async () => {
    if (!canTrade) {
      setMessage('シミュレーションが実行中ではありません')
      return
    }

    const price = parseFloat(triggerPrice)
    if (!price || price <= 0) {
      setMessage('トリガー価格を入力してください')
      return
    }

    setIsOrdering(true)
    setMessage(null)

    try {
      const request: PendingOrderRequest = {
        order_type: orderType as 'limit' | 'stop',
        side,
        lot_size: actualLotSize(),
        trigger_price: price,
      }

      const res = await ordersApi.createPending(request)

      if (res.success) {
        const typeLabel = orderType === 'limit' ? '指値' : '逆指値'
        setMessage(`${typeLabel}注文を作成しました`)
        setTriggerPrice('')
        onRefresh?.()
      } else {
        setMessage(`エラー: ${res.error?.message}`)
      }
    } catch (error) {
      setMessage(`エラー: ${error}`)
    } finally {
      setIsOrdering(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleOrder = () => {
    if (orderType === 'market') {
      handleMarketOrder()
    } else {
      handlePendingOrder()
    }
  }

  // トリガー価格と現在価格の差をpipsで計算
  const calculatePipDifference = () => {
    const price = parseFloat(triggerPrice)
    if (!price || !currentPrice) return null
    const pips = (price - currentPrice) / 0.01
    return pips
  }

  // 1%リスクロットサイズを計算
  const calculateRiskBasedLotSize = (balance: number, slPips: number): number => {
    const RISK_RATE = 0.01 // 1%
    const PIP_VALUE_PER_UNIT = 0.01 // 1通貨あたり0.01円

    // ロットサイズ = (資産 × リスク率) / (SL pips × 1pip値)
    const lotSize = (balance * RISK_RATE) / (slPips * PIP_VALUE_PER_UNIT)

    // 1,000通貨未満は切り捨て
    return Math.floor(lotSize / 1000) * 1000
  }

  // 表示用フォーマット（k単位）
  const formatLotSize = (lotSize: number): string => {
    const k = Math.floor(lotSize / 1000)
    return `${k}k`
  }

  // プリセット定義
  const LOT_PRESETS = [
    { slPips: 10, label: '10p' },
    { slPips: 20, label: '20p' },
    { slPips: 30, label: '30p' },
    { slPips: 40, label: '40p' },
    { slPips: 50, label: '50p' },
  ]

  return (
    <div className="bg-bg-card border-t border-border p-3">
      <div className="flex flex-col gap-2">
        {/* 第1行: 注文タイプ、売買方向、ロット数、トリガー価格 */}
        <div className="flex items-center gap-4">
          {/* 注文タイプ */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">注文:</label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="market"
                checked={orderType === 'market'}
                onChange={(e) => setOrderType(e.target.value as 'market')}
              />
              <span className="text-sm">成行</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="limit"
                checked={orderType === 'limit'}
                onChange={(e) => setOrderType(e.target.value as 'limit')}
              />
              <span className="text-sm">指値</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="stop"
                checked={orderType === 'stop'}
                onChange={(e) => setOrderType(e.target.value as 'stop')}
              />
              <span className="text-sm">逆指値</span>
            </label>
          </div>

          {/* 売買方向 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">方向:</label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}
              className="px-2 py-1 bg-bg-primary border border-border rounded text-sm"
            >
              <option value="buy">買</option>
              <option value="sell">売</option>
            </select>
          </div>

          {/* ロット数 */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">通貨:</label>
            <input
              type="number"
              value={lotQuantity}
              onChange={(e) => setLotQuantity(e.target.value)}
              className="w-16 px-2 py-1 bg-bg-primary border border-border rounded text-sm"
              step="1"
              min="1"
            />
            <span className="text-sm">×</span>
            <select
              value={lotUnit}
              onChange={(e) => setLotUnit(e.target.value)}
              className="px-2 py-1 bg-bg-primary border border-border rounded text-sm"
            >
              <option value="1000">1,000</option>
              <option value="10000">10,000</option>
              <option value="100000">100,000</option>
            </select>
          </div>

          {/* トリガー価格（予約注文のみ） */}
          {orderType !== 'market' && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-secondary">価格:</label>
              <input
                type="number"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                placeholder={currentPrice.toFixed(3)}
                className="w-24 px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                step="0.001"
              />
              {/* 現在価格との差分（pips）を表示 */}
              {triggerPrice && calculatePipDifference() !== null && (
                <span className="text-xs text-text-secondary">
                  ({calculatePipDifference()! > 0 ? '+' : ''}{calculatePipDifference()!.toFixed(1)} pips)
                </span>
              )}
            </div>
          )}

          {/* 現在価格表示 */}
          <div className="text-sm text-text-secondary">
            現在価格: <span className="text-text-primary">{currentPrice.toFixed(3)}</span>
          </div>

          {/* 注文ボタン */}
          <button
            onClick={handleOrder}
            disabled={!canTrade || isOrdering}
            className="px-4 py-1 bg-btn-primary text-text-strong rounded hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
          >
            {isOrdering && <LoadingSpinner size="sm" />}
            {isOrdering ? '処理中...' : '注文'}
          </button>

          {/* 1%リスクプリセット（注文ボタンの横に配置） */}
          {account && orderType === 'market' && (
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <span className="text-xs text-text-secondary whitespace-nowrap">
                1%リスク(¥{(account.balance / 1000).toFixed(0)}k):
              </span>
              <div className="flex gap-1">
                {LOT_PRESETS.map(preset => {
                  const lotSize = calculateRiskBasedLotSize(
                    account.balance,
                    preset.slPips
                  )
                  const quantity = lotSize / 10000

                  return (
                    <button
                      key={preset.slPips}
                      type="button"
                      onClick={() => {
                        setLotQuantity(String(quantity))
                        setLotUnit('10000')
                      }}
                      className="px-1.5 py-0.5 bg-bg-primary border border-border rounded text-xs hover:bg-border"
                    >
                      <span className="font-semibold">{preset.label}</span>
                      <span className="text-text-secondary ml-0.5">{formatLotSize(lotSize)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* メッセージ表示 */}
          {message && (
            <div className={`text-sm ${message.includes('エラー') ? 'text-sell' : 'text-buy'}`}>
              {message}
            </div>
          )}
        </div>

        {/* 第2行: SL/TP設定（成行注文のみ） */}
        {orderType === 'market' && (
          <div className="flex items-center gap-4 pl-2 border-l-2 border-border">
            {/* SL設定 */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={enableSL}
                  onChange={(e) => setEnableSL(e.target.checked)}
                />
                <span className="text-sm text-sell">SL:</span>
              </label>
              {enableSL && (
                <>
                  <select
                    value={slType}
                    onChange={(e) => setSlType(e.target.value as 'price' | 'pips')}
                    className="px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                  >
                    <option value="pips">pips</option>
                    <option value="price">価格</option>
                  </select>
                  {slType === 'price' ? (
                    <input
                      type="number"
                      value={slPrice}
                      onChange={(e) => setSlPrice(e.target.value)}
                      placeholder={currentPrice.toFixed(3)}
                      className="w-24 px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                      step="0.001"
                    />
                  ) : (
                    <>
                      <input
                        type="number"
                        value={slPips}
                        onChange={(e) => setSlPips(e.target.value)}
                        placeholder="±20"
                        className="w-20 px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                        step="1"
                      />
                      <span className="text-xs text-text-secondary">pips</span>
                      {/* SLプリセットボタン */}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setSlPips('-30')}
                          className="px-2 py-0.5 bg-bg-primary border border-border rounded text-xs hover:bg-border"
                        >
                          -30
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlPips('-20')}
                          className="px-2 py-0.5 bg-bg-primary border border-border rounded text-xs hover:bg-border"
                        >
                          -20
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlPips('20')}
                          className="px-2 py-0.5 bg-bg-primary border border-border rounded text-xs hover:bg-border"
                        >
                          +20
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlPips('30')}
                          className="px-2 py-0.5 bg-bg-primary border border-border rounded text-xs hover:bg-border"
                        >
                          +30
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* TP設定 */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={enableTP}
                  onChange={(e) => setEnableTP(e.target.checked)}
                />
                <span className="text-sm text-buy">TP:</span>
              </label>
              {enableTP && (
                <>
                  <select
                    value={tpType}
                    onChange={(e) => setTpType(e.target.value as 'price' | 'pips')}
                    className="px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                  >
                    <option value="pips">pips</option>
                    <option value="price">価格</option>
                  </select>
                  {tpType === 'price' ? (
                    <input
                      type="number"
                      value={tpPrice}
                      onChange={(e) => setTpPrice(e.target.value)}
                      placeholder={currentPrice.toFixed(3)}
                      className="w-24 px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                      step="0.001"
                    />
                  ) : (
                    <input
                      type="number"
                      value={tpPips}
                      onChange={(e) => setTpPips(e.target.value)}
                      placeholder="30"
                      className="w-20 px-2 py-1 bg-bg-primary border border-border rounded text-sm"
                      step="1"
                    />
                  )}
                  {tpType === 'pips' && <span className="text-xs text-text-secondary">pips</span>}
                </>
              )}
            </div>

            <div className="text-xs text-text-secondary">
              ※ SL/TP: pips値で指定（正負どちらも可、エントリー価格からの差分として計算されます）
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default OrderPanel
