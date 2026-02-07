import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { marketDataApi, CsvFile, DateRangeResponse } from '../services/api'
import LoadingOverlay from '../components/LoadingOverlay'

type TimeframeLabel = {
  [key: string]: string
}

const TIMEFRAME_LABELS: TimeframeLabel = {
  W1: '週足',
  D1: '日足',
  H1: '1時間足',
  M10: '10分足',
}

function DataManagementPage() {
  const navigate = useNavigate()
  const [csvFiles, setCsvFiles] = useState<CsvFile[]>([])
  const [dateRange, setDateRange] = useState<DateRangeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  // シミュレーション設定のデフォルト値
  const [defaultInitialBalance, setDefaultInitialBalance] = useState(() => {
    return localStorage.getItem('defaultInitialBalance') || '1000000'
  })
  const [defaultSpeed, setDefaultSpeed] = useState(() => {
    return localStorage.getItem('defaultSpeed') || '1'
  })
  const [settingsSaved, setSettingsSaved] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [filesRes, rangeRes] = await Promise.all([
        marketDataApi.getCsvFiles(),
        marketDataApi.getDateRange(),
      ])

      if (filesRes.success && filesRes.data) {
        setCsvFiles(filesRes.data.files)
      }
      if (rangeRes.success && rangeRes.data) {
        setDateRange(rangeRes.data)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleImport = async (timeframe: string) => {
    setImporting(timeframe)
    setImportResult(null)
    try {
      const res = await marketDataApi.importCsv(timeframe)
      if (res.success && res.data) {
        setImportResult(
          `${TIMEFRAME_LABELS[timeframe]}: ${res.data.imported_count}件インポート完了`
        )
        // データを再取得
        await fetchData()
      } else {
        setImportResult(`エラー: ${res.error?.message || 'インポートに失敗しました'}`)
      }
    } catch (error) {
      setImportResult(`エラー: ${error}`)
    } finally {
      setImporting(null)
    }
  }

  const handleImportAll = async () => {
    setImporting('all')
    setImportResult(null)
    try {
      const res = await marketDataApi.importAllCsv()
      if (res.success && res.data) {
        const results = res.data.results
          .map((r) => {
            if (r.error) {
              return `${TIMEFRAME_LABELS[r.timeframe]}: エラー - ${r.error}`
            }
            return `${TIMEFRAME_LABELS[r.timeframe]}: ${r.imported_count}件`
          })
          .join('\n')
        setImportResult(`インポート完了:\n${results}`)
        await fetchData()
      } else {
        setImportResult(`エラー: ${res.error?.message || 'インポートに失敗しました'}`)
      }
    } catch (error) {
      setImportResult(`エラー: ${error}`)
    } finally {
      setImporting(null)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('ja-JP')
  }

  const handleSaveSettings = () => {
    localStorage.setItem('defaultInitialBalance', defaultInitialBalance)
    localStorage.setItem('defaultSpeed', defaultSpeed)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 3000)
  }

  return (
    <div className="min-h-screen bg-bg-primary p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-strong">
          FX Trade Simulator - データ管理
        </h1>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-btn-secondary text-text-strong rounded hover:opacity-80"
        >
          ← 戻る
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-bg-card rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-text-strong mb-4">
          データ配置方法
        </h2>
        <div className="text-text-primary text-sm space-y-2">
          <p>
            CSVファイルを以下のフォルダに配置してください：
          </p>
          <code className="block bg-bg-primary p-2 rounded font-mono">
            backend/data/
          </code>
          <p className="mt-4">必要なファイル：</p>
          <ul className="list-disc list-inside ml-2">
            <li>fx_data_USDJPY_weekly_technical_indicator.csv（週足）</li>
            <li>fx_data_USDJPY_technical_indicator.csv（日足）</li>
            <li>fx_data_USDJPY_1hour_technical_indicator.csv（1時間足）</li>
            <li>fx_data_USDJPY_10minutes_technical_indicator.csv（10分足）</li>
          </ul>
          <p className="mt-4">CSVフォーマット（OHLCV形式）：</p>
          <code className="block bg-bg-primary p-2 rounded font-mono text-xs">
            time,open,high,low,close,Volume
          </code>
        </div>
      </div>

      {/* Simulation Default Settings */}
      <div className="bg-bg-card rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-text-strong mb-4">
          シミュレーション設定（デフォルト値）
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-text-primary text-sm mb-1">初期資金</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-text-primary">¥</span>
              <input
                type="number"
                value={defaultInitialBalance}
                onChange={(e) => setDefaultInitialBalance(e.target.value)}
                min="10000"
                step="10000"
                className="w-full p-2 pl-6 bg-bg-primary text-text-primary border border-border rounded"
              />
            </div>
            <p className="text-xs text-text-secondary mt-1">
              シミュレーション設定画面の初期資金のデフォルト値として使用されます
            </p>
          </div>

          <div>
            <label className="block text-text-primary text-sm mb-1">再生速度</label>
            <select
              value={defaultSpeed}
              onChange={(e) => setDefaultSpeed(e.target.value)}
              className="w-full p-2 bg-bg-primary text-text-primary border border-border rounded"
            >
              <option value="0.1">0.1x</option>
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="5">5x</option>
              <option value="6">6x</option>
              <option value="7.5">7.5x</option>
              <option value="10">10x</option>
            </select>
            <p className="text-xs text-text-secondary mt-1">
              シミュレーション設定画面の再生速度のデフォルト値として使用されます
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveSettings}
              className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
            >
              設定を保存
            </button>
            {settingsSaved && (
              <span className="text-green-400 text-sm">保存しました</span>
            )}
          </div>
        </div>
      </div>

      {/* CSV File Status */}
      <div className="bg-bg-card rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-strong">
            CSVファイル状況
          </h2>
          <button
            onClick={handleImportAll}
            disabled={importing !== null}
            className="px-4 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80 disabled:opacity-50"
          >
            {importing === 'all' ? 'インポート中...' : '全てインポート'}
          </button>
        </div>
        {loading ? (
          <div className="text-text-primary">読み込み中...</div>
        ) : (
          <table className="w-full text-text-primary">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2">時間足</th>
                <th className="text-left py-2">ファイル名</th>
                <th className="text-left py-2">ファイルサイズ</th>
                <th className="text-left py-2">状態</th>
                <th className="text-left py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {csvFiles.map((file) => (
                <tr key={file.timeframe} className="border-b border-border">
                  <td className="py-2">{TIMEFRAME_LABELS[file.timeframe]}</td>
                  <td className="py-2 text-sm font-mono">{file.filename}</td>
                  <td className="py-2">{formatFileSize(file.size_bytes)}</td>
                  <td className="py-2">
                    {file.exists ? (
                      <span className="text-green-400">利用可能</span>
                    ) : (
                      <span className="text-red-400">未配置</span>
                    )}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => handleImport(file.timeframe)}
                      disabled={!file.exists || importing !== null}
                      className="px-3 py-1 bg-btn-secondary text-text-strong rounded text-sm hover:opacity-80 disabled:opacity-50"
                    >
                      {importing === file.timeframe ? '...' : 'インポート'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Database Status */}
      <div className="bg-bg-card rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-text-strong mb-4">
          データベース状況
        </h2>
        {loading ? (
          <div className="text-text-primary">読み込み中...</div>
        ) : (
          <table className="w-full text-text-primary">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2">時間足</th>
                <th className="text-left py-2">データ期間</th>
                <th className="text-left py-2">レコード数</th>
              </tr>
            </thead>
            <tbody>
              {['W1', 'D1', 'H1', 'M10'].map((tf) => {
                const tfData = dateRange?.timeframes?.[tf]
                return (
                  <tr key={tf} className="border-b border-border">
                    <td className="py-2">{TIMEFRAME_LABELS[tf]}</td>
                    <td className="py-2">
                      {tfData
                        ? `${formatDate(tfData.start)} 〜 ${formatDate(tfData.end)}`
                        : '-'}
                    </td>
                    <td className="py-2">
                      {tfData ? tfData.count.toLocaleString() : '0'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="bg-bg-card rounded-lg p-4">
          <h2 className="text-lg font-semibold text-text-strong mb-2">
            インポート結果
          </h2>
          <pre className="text-text-primary whitespace-pre-wrap">{importResult}</pre>
        </div>
      )}

      {/* Loading Overlay */}
      <LoadingOverlay
        isVisible={importing !== null}
        message={
          importing === 'all'
            ? '全てのデータをインポート中...'
            : `${importing ? TIMEFRAME_LABELS[importing] : ''}データをインポート中...`
        }
      />
    </div>
  )
}

export default DataManagementPage
