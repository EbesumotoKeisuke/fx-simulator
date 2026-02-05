import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyticsApi, PerformanceMetrics, EquityCurveData, DrawdownData } from '../services/api'
import { useSimulationStore } from '../store/simulationStore'

/**
 * パフォーマンス分析ページコンポーネント
 * 詳細なパフォーマンス指標、資産曲線、ドローダウンを表示する
 */
function AnalysisPage() {
  const navigate = useNavigate()
  const { simulationId, status } = useSimulationStore()
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const [equityCurve, setEquityCurve] = useState<EquityCurveData | null>(null)
  const [drawdown, setDrawdown] = useState<DrawdownData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!simulationId || status === 'idle') {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const [perfRes, equityRes, ddRes] = await Promise.all([
          analyticsApi.getPerformance(),
          analyticsApi.getEquityCurve('trade'),
          analyticsApi.getDrawdown(),
        ])

        if (perfRes.success && perfRes.data) {
          setPerformance(perfRes.data)
        }
        if (equityRes.success && equityRes.data) {
          setEquityCurve(equityRes.data)
        }
        if (ddRes.success && ddRes.data) {
          setDrawdown(ddRes.data)
        }
      } catch (error) {
        console.error('Failed to fetch analytics data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [simulationId, status])

  const handleBack = () => {
    navigate('/')
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-xl text-text-primary">読み込み中...</div>
      </div>
    )
  }

  if (!simulationId || status === 'idle') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-bg-primary">
        <div className="text-xl text-text-secondary mb-4">シミュレーションが開始されていません</div>
        <button
          onClick={handleBack}
          className="px-6 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
        >
          メイン画面に戻る
        </button>
      </div>
    )
  }

  if (!performance || performance.basic.total_trades === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-bg-primary">
        <div className="text-xl text-text-secondary mb-4">取引データがありません</div>
        <button
          onClick={handleBack}
          className="px-6 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
        >
          メイン画面に戻る
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="bg-bg-card border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-strong">パフォーマンス分析</h1>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-btn-secondary text-text-strong rounded hover:opacity-80"
          >
            メイン画面に戻る
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* 主要指標カード */}
        <div className="grid grid-cols-4 gap-4">
          {/* 勝率カード */}
          <div className="bg-bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-text-secondary mb-1">勝率</div>
            <div className={`text-3xl font-bold ${performance.basic.win_rate >= 50 ? 'text-buy' : 'text-text-strong'}`}>
              {performance.basic.win_rate.toFixed(1)}%
            </div>
            <div className="text-xs text-text-secondary mt-2">
              勝{performance.basic.winning_trades} / 負{performance.basic.losing_trades} / 計{performance.basic.total_trades}
            </div>
          </div>

          {/* プロフィットファクターカード */}
          <div className="bg-bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-text-secondary mb-1">プロフィットファクター</div>
            <div className={`text-3xl font-bold ${performance.risk_return.profit_factor >= 1 ? 'text-buy' : 'text-sell'}`}>
              {performance.risk_return.profit_factor.toFixed(2)}
            </div>
            <div className="text-xs text-text-secondary mt-2">
              総利益 ¥{performance.basic.gross_profit.toLocaleString()} / 総損失 ¥{Math.abs(performance.basic.gross_loss).toLocaleString()}
            </div>
          </div>

          {/* 最大ドローダウンカード */}
          <div className="bg-bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-text-secondary mb-1">最大ドローダウン</div>
            <div className="text-3xl font-bold text-sell">
              {performance.drawdown.max_drawdown_percent.toFixed(2)}%
            </div>
            <div className="text-xs text-text-secondary mt-2">
              ¥{performance.drawdown.max_drawdown.toLocaleString()}
            </div>
          </div>

          {/* トータル損益カード */}
          <div className="bg-bg-card rounded-lg p-4 border border-border">
            <div className="text-sm text-text-secondary mb-1">トータル損益</div>
            <div className={`text-3xl font-bold ${performance.basic.total_pnl >= 0 ? 'text-buy' : 'text-sell'}`}>
              {performance.basic.total_pnl >= 0 ? '+' : ''}¥{performance.basic.total_pnl.toLocaleString()}
            </div>
            {equityCurve && (
              <div className="text-xs text-text-secondary mt-2">
                開始 ¥{equityCurve.initial_balance.toLocaleString()} → 終了 ¥{equityCurve.final_balance.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* リスク・リターン指標 */}
        <div className="bg-bg-card rounded-lg p-6 border border-border">
          <h2 className="text-xl font-semibold text-text-strong mb-4">リスク・リターン指標</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">平均利益:</span>
                  <span className="text-buy font-semibold">¥{performance.risk_return.average_win.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">平均損失:</span>
                  <span className="text-sell font-semibold">¥{performance.risk_return.average_loss.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">リスクリワード比:</span>
                  <span className="text-text-strong font-semibold">{performance.risk_return.risk_reward_ratio.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">最大利益:</span>
                  <span className="text-buy font-semibold">
                    ¥{performance.risk_return.max_win.toLocaleString()} ({performance.risk_return.max_win_pips.toFixed(1)}pips)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">最大損失:</span>
                  <span className="text-sell font-semibold">
                    ¥{performance.risk_return.max_loss.toLocaleString()} ({performance.risk_return.max_loss_pips.toFixed(1)}pips)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">DD継続期間:</span>
                  <span className="text-text-strong font-semibold">{performance.drawdown.max_drawdown_duration_days}日</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 連続記録 */}
        <div className="bg-bg-card rounded-lg p-6 border border-border">
          <h2 className="text-xl font-semibold text-text-strong mb-4">連続記録</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex justify-between items-center">
              <span className="text-text-primary">最大連勝:</span>
              <span className="text-buy font-semibold text-2xl">{performance.consecutive.max_consecutive_wins}回</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-primary">最大連敗:</span>
              <span className="text-sell font-semibold text-2xl">{performance.consecutive.max_consecutive_losses}回</span>
            </div>
          </div>
        </div>

        {/* 期間情報 */}
        <div className="bg-bg-card rounded-lg p-6 border border-border">
          <h2 className="text-xl font-semibold text-text-strong mb-4">シミュレーション期間</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-text-secondary mb-1">開始日時</div>
              <div className="text-lg text-text-strong">{new Date(performance.period.start_date).toLocaleString('ja-JP')}</div>
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">終了日時</div>
              <div className="text-lg text-text-strong">{new Date(performance.period.end_date).toLocaleString('ja-JP')}</div>
            </div>
            <div>
              <div className="text-sm text-text-secondary mb-1">期間</div>
              <div className="text-lg text-text-strong">{performance.period.duration_days}日間</div>
            </div>
          </div>
        </div>

        {/* 資産曲線データテーブル */}
        {equityCurve && equityCurve.points.length > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">資産曲線データ（最新10件）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-text-secondary">日時</th>
                    <th className="text-right py-2 text-text-secondary">残高</th>
                    <th className="text-right py-2 text-text-secondary">有効証拠金</th>
                    <th className="text-right py-2 text-text-secondary">累積損益</th>
                  </tr>
                </thead>
                <tbody>
                  {equityCurve.points.slice(-10).reverse().map((point, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="py-2 text-text-primary">
                        {new Date(point.timestamp).toLocaleString('ja-JP', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="text-right py-2 text-text-primary">¥{point.balance.toLocaleString()}</td>
                      <td className="text-right py-2 text-text-primary">¥{point.equity.toLocaleString()}</td>
                      <td className={`text-right py-2 ${point.cumulative_pnl >= 0 ? 'text-buy' : 'text-sell'}`}>
                        {point.cumulative_pnl >= 0 ? '+' : ''}¥{point.cumulative_pnl.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ドローダウンデータテーブル */}
        {drawdown && drawdown.points.length > 0 && (
          <div className="bg-bg-card rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-text-strong mb-4">ドローダウンデータ（最新10件）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-text-secondary">日時</th>
                    <th className="text-right py-2 text-text-secondary">有効証拠金</th>
                    <th className="text-right py-2 text-text-secondary">ピーク証拠金</th>
                    <th className="text-right py-2 text-text-secondary">DD金額</th>
                    <th className="text-right py-2 text-text-secondary">DD率</th>
                  </tr>
                </thead>
                <tbody>
                  {drawdown.points.slice(-10).reverse().map((point, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="py-2 text-text-primary">
                        {new Date(point.timestamp).toLocaleString('ja-JP', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="text-right py-2 text-text-primary">¥{point.equity.toLocaleString()}</td>
                      <td className="text-right py-2 text-text-primary">¥{point.peak_equity.toLocaleString()}</td>
                      <td className="text-right py-2 text-sell">¥{point.drawdown.toLocaleString()}</td>
                      <td className="text-right py-2 text-sell">{point.drawdown_percent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AnalysisPage
