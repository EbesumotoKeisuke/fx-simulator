# F-008: 連敗状況可視化機能

## 1. 概要

トレーダーの心理状態を管理し、連敗時の無理なトレードを防ぐため、メイン画面に現在の連敗数を表示する機能。

## 2. 目的

- 連敗中であることを視覚的に認識させる
- 感情的なトレード（リベンジトレード）を防止
- トレードルールの徹底（連敗時は休憩など）

## 3. 機能要件

### 3.1 連敗カウントロジック

#### カウント更新タイミング
トレード決済時（手動決済、SL/TP約定時）に以下のルールでカウント更新：

| 条件 | 動作 |
|------|------|
| 損失トレード（realized_pnl < 0） | 連敗カウント +1 |
| 30pips以上の利益（realized_pnl_pips >= 30） | 連敗カウント 0にリセット |
| 30pips未満の利益（0 < realized_pnl_pips < 30） | 連敗カウント 維持 |

#### 連敗カウントの計算例

```
初期状態: 連敗 0

トレード1: -10pips → 連敗 1
トレード2: -15pips → 連敗 2
トレード3: +5pips  → 連敗 2（維持）
トレード4: -20pips → 連敗 3
トレード5: +35pips → 連敗 0（リセット）
トレード6: -10pips → 連敗 1
```

### 3.2 表示仕様

#### 表示位置
メイン画面の口座情報エリア（AccountInfo コンポーネント）

#### 表示内容
```
連敗: 3回 ⚠️
```

#### 色分け

| 連敗数 | 背景色 | テキスト色 | アイコン |
|--------|--------|------------|----------|
| 0 | 緑（bg-buy/20） | 緑（text-buy） | ✓ |
| 1-2 | 黄（bg-yellow-900/20） | 黄（text-yellow-500） | ⚠️ |
| 3+ | 赤（bg-sell/20） | 赤（text-sell） | 🚨 |

#### UI例

```
┌─────────────────────────────────────┐
│ 口座情報                             │
├─────────────────────────────────────┤
│ 残高: ¥980,000                      │
│ 評価額: ¥978,500                    │
│ 証拠金: ¥200,000                    │
│ 余剰証拠金: ¥778,500                │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 連敗: 3回 🚨                     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 3.3 シミュレーション開始時の挙動

- 新しいシミュレーション開始時：連敗カウント 0
- シミュレーション終了時：連敗カウント保持（結果表示に含める）

## 4. データ設計

### 4.1 Accountモデル拡張

```python
class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id = Column(UUID(as_uuid=True), ForeignKey("simulations.id"), nullable=False)
    initial_balance = Column(Numeric(15, 2), nullable=False)
    balance = Column(Numeric(15, 2), nullable=False)
    equity = Column(Numeric(15, 2), nullable=False)
    margin_used = Column(Numeric(15, 2), default=Decimal("0.00"))
    margin_available = Column(Numeric(15, 2), default=Decimal("0.00"))
    consecutive_losses = Column(Integer, default=0)  # 追加
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

### 4.2 APIレスポンス

#### GET /api/v1/account

```json
{
  "success": true,
  "data": {
    "account_id": "uuid",
    "simulation_id": "uuid",
    "balance": 980000.00,
    "equity": 978500.00,
    "margin_used": 200000.00,
    "margin_available": 778500.00,
    "consecutive_losses": 3
  }
}
```

## 5. 実装方針

### 5.1 バックエンド

#### 修正対象
1. `backend/src/models/account.py`
   - `consecutive_losses`フィールド追加

2. `backend/src/services/trading_service.py`
   - `close_position()`メソッド
   - トレード決済時に連敗カウント更新ロジック追加

#### 実装例

```python
def close_position(self, position_id: str, close_price: Optional[float] = None):
    # ... 既存のポジション決済処理 ...

    # realized_pnl_pipsを取得
    realized_pnl_pips = trade.realized_pnl_pips

    # 連敗カウント更新
    account = self.db.query(Account).filter(
        Account.simulation_id == position.simulation_id
    ).first()

    if realized_pnl_pips < 0:
        # 損失 → カウント+1
        account.consecutive_losses += 1
    elif realized_pnl_pips >= 30:
        # 30pips以上の利益 → リセット
        account.consecutive_losses = 0
    # 30pips未満の利益 → 維持（何もしない）

    self.db.commit()
```

### 5.2 フロントエンド

#### 修正対象
1. `frontend/src/services/api.ts`
   - AccountInfoインターフェースに`consecutive_losses`追加

2. `frontend/src/components/AccountInfo.tsx`
   - 連敗表示UI追加

#### 実装例

```tsx
// AccountInfo.tsx
const getConsecutiveLossStyle = (count: number) => {
  if (count === 0) {
    return {
      bg: 'bg-buy/20',
      text: 'text-buy',
      icon: '✓'
    }
  } else if (count <= 2) {
    return {
      bg: 'bg-yellow-900/20',
      text: 'text-yellow-500',
      icon: '⚠️'
    }
  } else {
    return {
      bg: 'bg-sell/20',
      text: 'text-sell',
      icon: '🚨'
    }
  }
}

// JSX
{account && (
  <div className={`mt-2 px-3 py-2 rounded ${style.bg}`}>
    <span className={`text-base ${style.text}`}>
      連敗: {account.consecutive_losses}回 {style.icon}
    </span>
  </div>
)}
```

## 6. テストケース

| # | テストケース | 期待結果 |
|---|------------|----------|
| 1 | 新規シミュレーション開始 | 連敗カウント 0 |
| 2 | -10pips決済 | 連敗カウント 1 |
| 3 | さらに-15pips決済 | 連敗カウント 2 |
| 4 | +5pips決済 | 連敗カウント 2（維持） |
| 5 | さらに-20pips決済 | 連敗カウント 3 |
| 6 | +35pips決済 | 連敗カウント 0（リセット） |
| 7 | 連敗3回の状態で表示確認 | 赤背景、🚨アイコン |

## 7. UI/UX考慮事項

### 7.1 視認性
- 連敗数が増えるにつれて目立つ色に変化
- アイコンで直感的に危険度を表現

### 7.2 心理的影響
- 連敗中であることを明確に認識させる
- トレードを一時停止する判断材料を提供

### 7.3 追加検討事項（今後の拡張）
- 連敗3回以上でアラート表示
- 連敗時の自動トレード制限機能
- 過去の最大連敗数の表示

## 8. スケジュール

| フェーズ | 内容 | 期間 |
|---------|------|------|
| 設計 | 本仕様書作成 | - |
| 実装 | バックエンド実装 | 30分 |
| 実装 | フロントエンド実装 | 30分 |
| テスト | 動作確認 | 15分 |
| 合計 | | 1時間15分 |
