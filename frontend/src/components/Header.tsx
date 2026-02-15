import { useState } from 'react'
import { format } from 'date-fns'

interface HeaderProps {
  currentTime: Date
  status: 'idle' | 'created' | 'running' | 'paused' | 'stopped'
  onDataManagement: () => void
  onAnalysis: () => void
  onSettings: () => void
  onStart: () => void
  onEnd: () => void
}

function Header({ currentTime, status, onDataManagement, onAnalysis, onSettings, onStart, onEnd }: HeaderProps) {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <header className="flex items-center px-4 py-2 bg-bg-card border-b border-border gap-4">
      <h1 className="text-xl font-bold text-text-strong whitespace-nowrap">FX Trade Simulator</h1>
      <span className="text-sm text-text-secondary whitespace-nowrap">
        シミュレーション時刻: {format(currentTime, 'yyyy/MM/dd HH:mm')}
      </span>
      <span className="text-sm text-text-secondary">|</span>
      <span className="text-sm text-text-secondary whitespace-nowrap">
        状態: {
          status === 'running' ? '実行中' :
          status === 'paused' ? '一時停止' :
          status === 'stopped' ? '終了' :
          status === 'created' ? '準備完了' :
          '未開始'
        }
      </span>
      <div className="flex gap-2 ml-auto">
        <button
          onClick={() => setShowHelp(true)}
          className="w-8 h-8 flex items-center justify-center bg-btn-secondary text-text-strong rounded-full text-sm hover:opacity-80"
          title="使い方"
        >
          ℹ
        </button>
        <button
          onClick={onDataManagement}
          className="px-4 py-1 bg-btn-secondary text-text-strong rounded text-sm hover:opacity-80"
        >
          データ管理
        </button>
        <button
          onClick={onAnalysis}
          disabled={status === 'idle'}
          className="px-4 py-1 bg-btn-secondary text-text-strong rounded text-sm hover:opacity-80 disabled:opacity-50"
        >
          分析
        </button>
        <button
          onClick={onSettings}
          className="px-4 py-1 bg-btn-secondary text-text-strong rounded text-sm hover:opacity-80"
        >
          設定
        </button>
        {status !== 'running' && (
          <button
            onClick={onStart}
            className="px-4 py-1 bg-buy text-text-strong rounded text-sm hover:opacity-80"
          >
            開始
          </button>
        )}
        <button
          onClick={onEnd}
          disabled={status === 'idle' || status === 'stopped'}
          className="px-4 py-1 bg-sell text-text-strong rounded text-sm hover:opacity-80 disabled:opacity-50"
        >
          終了
        </button>
      </div>

      {/* 使い方モーダル */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-bg-card rounded-lg p-6 w-[700px] max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-text-strong">FX Trade Simulator 使い方</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-2xl text-text-secondary hover:text-text-strong"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-text-primary">
              <section>
                <h3 className="text-lg font-semibold text-text-strong mb-2">1. シミュレーションの開始</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>データ管理</strong>ボタンから過去のFXデータ（CSVファイル）をインポートします</li>
                  <li>インポート後、<strong>開始</strong>ボタンでシミュレーションを開始します</li>
                  <li>コントロールバーで再生速度を調整できます（x1、x2、x4、x10、x30、x100、日足、週足）</li>
                  <li>一時停止、再開、終了も可能です</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-text-strong mb-2">2. 注文方法</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>成行注文</strong>: 現在価格で即座に注文を執行</li>
                  <li><strong>指値注文</strong>: 指定価格に到達したら自動的に注文を執行（現在価格より有利な価格を指定）</li>
                  <li><strong>逆指値注文</strong>: 指定価格に到達したら自動的に注文を執行（現在価格より不利な価格を指定）</li>
                  <li>通貨単位は 1,000、10,000、100,000 から選択できます</li>
                  <li>トリガー価格入力時に、現在価格との差分がpipsで表示されます</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-text-strong mb-2">3. SL/TP（損切り・利確）の設定</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>成行注文時</strong>: 注文パネルでSL/TPのチェックボックスをオンにして設定</li>
                  <li><strong>既存ポジション</strong>: ポジション一覧の「SL/TP」ボタンから編集</li>
                  <li>価格指定とpips指定の2つのモードがあります</li>
                  <li>pips指定時は、プリセットボタン（-30、-20、+20、+30）で素早く設定可能</li>
                  <li>SL/TPは正負どちらの値でも入力可能（エントリー価格からの差分として計算されます）</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-text-strong mb-2">4. ポジション管理</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>ポジションパネル</strong>で保有中のポジションを確認できます</li>
                  <li>各ポジションの損益（pips・円）がリアルタイムで表示されます</li>
                  <li>個別決済: 各ポジションの「決済」ボタンをクリック</li>
                  <li>一括決済: 「全決済」ボタンで全ポジションを決済</li>
                  <li>ポジションが多い場合はスクロールして確認できます</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-text-strong mb-2">5. 予約注文管理</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>予約注文パネル</strong>で指値・逆指値注文の一覧を確認できます</li>
                  <li>「変更」ボタンでロットサイズとトリガー価格を編集可能</li>
                  <li>「キャンセル」ボタンで個別にキャンセル</li>
                  <li>「全キャンセル」ボタンで全ての予約注文をキャンセル</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-text-strong mb-2">6. 口座情報とパフォーマンス</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>口座情報パネル</strong>で残高、有効証拠金、損益を確認できます</li>
                  <li>簡易パフォーマンス指標（勝率、PF、最大DDなど）も表示されます</li>
                  <li><strong>分析ボタン</strong>から詳細な分析画面にアクセスできます</li>
                  <li>資産曲線、ドローダウンデータなどの詳細情報を確認可能</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-text-strong mb-2">7. その他の機能</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>設定</strong>: APIのベースURLなど基本設定を変更できます</li>
                  <li><strong>一時停止中の操作</strong>: シミュレーション一時停止中も注文や決済が可能です</li>
                  <li><strong>チャート表示</strong>: ローソク足チャートで価格変動を視覚的に確認できます</li>
                </ul>
              </section>

              <div className="mt-6 p-4 bg-bg-primary rounded border border-border">
                <p className="text-sm text-text-secondary">
                  <strong>ヒント:</strong> 初めての方は、まず「データ管理」から少量のデータをインポートし、
                  低速（x1またはx2）で動作を確認しながら操作に慣れることをおすすめします。
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="px-6 py-2 bg-btn-primary text-text-strong rounded hover:opacity-80"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

export default Header
