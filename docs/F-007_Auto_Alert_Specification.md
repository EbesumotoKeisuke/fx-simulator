# F-007: 自動アラート機能 仕様書

## 1. 概要

トレード中のリアルタイムアラート機能。特定のパターンや状況を検出した際に、ユーザーに警告を表示し、感情的なトレードや過度なリスクを防止する。

## 2. アラート種類

### 2.1 連敗アラート

| アラート条件 | メッセージ | 重要度 |
|------------|---------|--------|
| 3連敗 | 「本日3連敗しています。冷静に判断していますか？」 | 警告 |
| 5連敗 | 「5連敗中です。一度休憩を取ることをお勧めします」 | 危険 |

### 2.2 ロットサイズアラート

| アラート条件 | メッセージ | 重要度 |
|------------|---------|--------|
| 平均の2倍以上 | 「通常より大きいロットサイズです（平均: {avg}ロット）」 | 警告 |
| 証拠金の50%以上 | 「証拠金の50%以上を使用する注文です」 | 危険 |

### 2.3 時間帯アラート

| アラート条件 | メッセージ | 重要度 |
|------------|---------|--------|
| 勝率が低い時間帯 | 「この時間帯（{hour}時台）の勝率は{rate}%です」 | 情報 |
| 週末前 | 「週末クローズまで残り{hours}時間です」 | 情報 |

### 2.4 トレード間隔アラート

| アラート条件 | メッセージ | 重要度 |
|------------|---------|--------|
| 5分以内の連続注文 | 「前回のトレードから{minutes}分しか経っていません」 | 警告 |
| 損切り直後の即座の注文 | 「損切り直後です。感情的になっていませんか？」 | 警告 |

### 2.5 損益アラート

| アラート条件 | メッセージ | 重要度 |
|------------|---------|--------|
| 本日の損失が初期資金の5%超 | 「本日の損失が{pct}%に達しました」 | 危険 |
| ドローダウン10%超 | 「ドローダウンが10%を超えました」 | 危険 |

## 3. UI設計

### 3.1 アラート表示位置

```
┌──────────────────────────────────────────────────────────────┐
│ [Header]                                                      │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ⚠️ 本日3連敗しています。冷静に判断していますか？         │ │  ← アラートバナー
│ │                                          [×閉じる]       │ │
│ └──────────────────────────────────────────────────────────┘ │
│ [Charts...]                                                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 アラートコンポーネント

```typescript
interface Alert {
  id: string
  type: 'info' | 'warning' | 'danger'
  message: string
  timestamp: Date
  dismissed: boolean
}
```

### 3.3 表示スタイル

| 重要度 | 背景色 | アイコン |
|-------|--------|---------|
| 情報 | 青 (#3b82f6) | ℹ️ |
| 警告 | 黄 (#f59e0b) | ⚠️ |
| 危険 | 赤 (#ef4444) | 🚨 |

## 4. バックエンド実装

### 4.1 アラートサービス

```python
# backend/src/services/alert_service.py

class AlertService:
    """トレードアラートを管理するサービス"""

    def check_alerts(self, simulation_id: str) -> List[Alert]:
        """現在のトレード状況に基づいてアラートを生成"""
        alerts = []
        alerts.extend(self._check_consecutive_losses())
        alerts.extend(self._check_lot_size_alert())
        alerts.extend(self._check_time_alert())
        alerts.extend(self._check_trading_interval())
        alerts.extend(self._check_daily_loss())
        return alerts

    def _check_consecutive_losses(self) -> List[Alert]:
        """連敗チェック"""
        pass

    def _check_lot_size_alert(self, lot_size: float) -> List[Alert]:
        """ロットサイズチェック"""
        pass
```

### 4.2 APIエンドポイント

```python
# GET /api/alerts
# 現在のアラートを取得

# POST /api/alerts/{alert_id}/dismiss
# アラートを閉じる

# GET /api/alerts/settings
# アラート設定を取得

# PUT /api/alerts/settings
# アラート設定を更新
```

### 4.3 データモデル

```python
class AlertSetting(Base):
    """アラート設定"""
    __tablename__ = "alert_settings"

    id = Column(UUID, primary_key=True)
    simulation_id = Column(UUID, ForeignKey("simulations.id"))
    consecutive_loss_threshold = Column(Integer, default=3)
    lot_size_multiplier_threshold = Column(Float, default=2.0)
    daily_loss_percent_threshold = Column(Float, default=5.0)
    trading_interval_minutes = Column(Integer, default=5)
    enabled = Column(Boolean, default=True)
```

## 5. フロントエンド実装

### 5.1 アラートストア

```typescript
// frontend/src/store/alertStore.ts

interface AlertState {
  alerts: Alert[]
  settings: AlertSettings
  fetchAlerts: () => Promise<void>
  dismissAlert: (id: string) => Promise<void>
  updateSettings: (settings: Partial<AlertSettings>) => Promise<void>
}
```

### 5.2 アラートコンポーネント

```typescript
// frontend/src/components/AlertBanner.tsx

function AlertBanner() {
  const { alerts, dismissAlert } = useAlertStore()

  const activeAlerts = alerts.filter(a => !a.dismissed)

  if (activeAlerts.length === 0) return null

  return (
    <div className="alert-banner">
      {activeAlerts.map(alert => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onDismiss={() => dismissAlert(alert.id)}
        />
      ))}
    </div>
  )
}
```

### 5.3 注文時のアラートチェック

```typescript
// OrderPanel.tsx 内での実装

const handleOrder = async (side: 'buy' | 'sell') => {
  // 注文前にアラートをチェック
  const alerts = await alertsApi.checkPreOrder({
    side,
    lot_size: actualLotSize
  })

  if (alerts.some(a => a.type === 'danger')) {
    // 危険アラートがある場合は確認ダイアログを表示
    if (!confirm('警告があります。注文を続行しますか？')) {
      return
    }
  }

  // 注文処理を続行
  // ...
}
```

## 6. アラート設定画面

### 6.1 UI設計

```
┌────────────────────────────────────────┐
│  アラート設定                           │
├────────────────────────────────────────┤
│                                        │
│  ☑ アラート機能を有効にする            │
│                                        │
│  連敗アラート                          │
│  ├─ ☑ 有効                            │
│  └─ 警告する連敗数: [3] 回             │
│                                        │
│  ロットサイズアラート                   │
│  ├─ ☑ 有効                            │
│  └─ 平均の [2.0] 倍以上で警告          │
│                                        │
│  時間帯アラート                        │
│  ├─ ☑ 有効                            │
│  └─ 勝率 [40] %以下の時間帯で警告      │
│                                        │
│  トレード間隔アラート                   │
│  ├─ ☑ 有効                            │
│  └─ 間隔が [5] 分未満で警告            │
│                                        │
│  損失アラート                          │
│  ├─ ☑ 有効                            │
│  └─ 本日損失 [5] %以上で警告           │
│                                        │
│            [保存] [キャンセル]          │
└────────────────────────────────────────┘
```

## 7. 実装優先度

### Phase 1（MVP）

- [x] アラートサービスの基本実装
- [x] 連敗アラート
- [x] 損失アラート
- [x] アラートバナーUI

### Phase 2

- [ ] ロットサイズアラート
- [ ] トレード間隔アラート
- [ ] 時間帯アラート
- [ ] アラート設定画面

### Phase 3

- [ ] アラート履歴の保存
- [ ] アラート統計（どのアラートが何回表示されたか）
- [ ] カスタムアラートルールの作成

## 8. 技術的考慮事項

### 8.1 パフォーマンス

- アラートチェックは注文時とポーリング（5秒間隔）で実行
- 重い計算（時間帯分析など）はキャッシュを使用

### 8.2 ユーザー体験

- 同じアラートは一定時間（5分）表示しない
- 危険アラートは自動で閉じない
- アラート音は設定でオン/オフ可能

### 8.3 データ永続化

- アラート設定はシミュレーションごとに保存
- 閉じたアラートのIDをセッションストレージに保存
