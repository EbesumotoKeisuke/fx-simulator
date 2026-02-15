import { useState, useMemo } from 'react'
import { ordersApi, PendingOrderRequest, AccountInfo } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'
import { logger } from '../utils/logger'
import LoadingSpinner from './LoadingSpinner'
import { SL_PIPS_PRESETS, LOT_PRESETS, calculateRiskBasedLotSize, formatLotSize } from '../constants/presets'

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

  // 合計通貨数
  const totalUnits = useMemo(() => {
    const quantity = parseFloat(lotQuantity) || 0
    const unit = parseFloat(lotUnit) || 0
    return quantity * unit
  }, [lotQuantity, lotUnit])

  // 必要証拠金（レバレッジ25倍）
  const requiredMargin = useMemo(() => {
    if (currentPrice <= 0) return 0
    return (totalUnits * currentPrice) / 25
  }, [totalUnits, currentPrice])

  const handleMarketOrder = async (side: 'buy' | 'sell') => {
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
        logger.info('OrderPanel', `成行注文約定: side=${side}, lot_size=${actualLotSize()}`)
        setMessage(`${side === 'buy' ? '買い' : '売り'}注文が約定しました`)
        onRefresh?.()
      } else {
        logger.warning('OrderPanel', `成行注文エラー: ${res.error?.message}`)
        setMessage(`エラー: ${res.error?.message}`)
      }
    } catch (error) {
      logger.error('OrderPanel', `handleMarketOrder error : ${error}`, { error })
      setMessage(`エラー: ${error}`)
    } finally {
      setIsOrdering(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handlePendingOrder = async (side: 'buy' | 'sell') => {
    if (!canTrade) {
      setMessage('シミュレーションが実行中ではありません')
      return
    }

    const price = parseFloat(triggerPrice) || currentPrice
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
        logger.info('OrderPanel', `予約注文作成: type=${orderType}, side=${side}, lot_size=${actualLotSize()}`)
        setMessage(`${typeLabel}注文を作成しました`)
        setTriggerPrice('')
        onRefresh?.()
      } else {
        logger.warning('OrderPanel', `予約注文エラー: ${res.error?.message}`)
        setMessage(`エラー: ${res.error?.message}`)
      }
    } catch (error) {
      logger.error('OrderPanel', `handlePendingOrder error : ${error}`, { error })
      setMessage(`エラー: ${error}`)
    } finally {
      setIsOrdering(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleOrder = (side: 'buy' | 'sell') => {
    if (orderType === 'market') {
      handleMarketOrder(side)
    } else {
      handlePendingOrder(side)
    }
  }

  // トリガー価格と現在価格の差をpipsで計算
  const calculatePipDifference = () => {
    const price = parseFloat(triggerPrice)
    if (!price || !currentPrice) return null
    const pips = (price - currentPrice) / 0.01
    return pips
  }

  // 注文タイプ変更時にトリガー価格をプリセット
  const handleOrderTypeChange = (newType: 'market' | 'limit' | 'stop') => {
    setOrderType(newType)
    // 指値/逆指値に切り替え時、トリガー価格が空なら現在価格をプリセット
    if (newType !== 'market' && !triggerPrice && currentPrice > 0) {
      setTriggerPrice(currentPrice.toFixed(3))
    }
  }

  return (
    <div className="bg-bg-card p-3 flex-1 min-w-0">
      <div className="flex flex-col gap-2">
        {/* 第1行: 注文タイプ、ロット数、合計通貨・証拠金、トリガー価格、注文ボタン */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* 注文タイプ */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">注文:</label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="market"
                checked={orderType === 'market'}
                onChange={() => handleOrderTypeChange('market')}
              />
              <span className="text-sm">成行</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="limit"
                checked={orderType === 'limit'}
                onChange={() => handleOrderTypeChange('limit')}
              />
              <span className="text-sm">指値</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                value="stop"
                checked={orderType === 'stop'}
                onChange={() => handleOrderTypeChange('stop')}
              />
              <span className="text-sm">逆指値</span>
            </label>
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

          {/* 合計通貨数・証拠金 */}
          <span className="text-sm text-text-secondary whitespace-nowrap">
            = {totalUnits.toLocaleString()}通貨
          </span>
          <span className="text-sm text-text-secondary whitespace-nowrap">
            (証拠金: ¥{requiredMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })})
          </span>

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

          {/* 注文ボタン（買い/売り） */}
          <button
            onClick={() => handleOrder('buy')}
            disabled={!canTrade || isOrdering}
            className="px-4 py-1 bg-buy text-white rounded hover:opacity-80 disabled:opacity-50 flex items-center gap-2 font-bold"
          >
            {isOrdering && <LoadingSpinner size="sm" />}
            買い注文
          </button>
          <button
            onClick={() => handleOrder('sell')}
            disabled={!canTrade || isOrdering}
            className="px-4 py-1 bg-sell text-white rounded hover:opacity-80 disabled:opacity-50 flex items-center gap-2 font-bold"
          >
            {isOrdering && <LoadingSpinner size="sm" />}
            売り注文
          </button>

          {/* 1%リスクプリセット（全注文タイプで表示） */}
          {account && (
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
                        // SLを有効にしてpips値も連動設定
                        setEnableSL(true)
                        setSlType('pips')
                        setSlPips(String(-preset.slPips))
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

        {/* 第2行: SL/TP設定（全注文タイプで表示） */}
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
                    {/* SLプリセットボタン（共通定数使用） */}
                    <div className="flex gap-1">
                      {SL_PIPS_PRESETS.map(pips => (
                        <button
                          key={pips}
                          type="button"
                          onClick={() => setSlPips(String(pips))}
                          className="px-2 py-0.5 bg-bg-primary border border-border rounded text-xs hover:bg-border"
                        >
                          {pips}
                        </button>
                      ))}
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
      </div>
    </div>
  )
}

export default OrderPanel
