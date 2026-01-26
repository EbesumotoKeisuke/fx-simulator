import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { marketDataApi, CsvFile, DateRangeResponse } from '../services/api'

type TimeframeLabel = {
  [key: string]: string
}

const TIMEFRAME_LABELS: TimeframeLabel = {
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
              {['D1', 'H1', 'M10'].map((tf) => {
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
        <div className="bg-bg-card rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-text-strong mb-2">
            インポート結果
          </h2>
          <pre className="text-text-primary whitespace-pre-wrap">{importResult}</pre>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-bg-card rounded-lg p-4">
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
    </div>
  )
}

export default DataManagementPage
