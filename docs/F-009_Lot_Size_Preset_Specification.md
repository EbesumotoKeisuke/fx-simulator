# F-009: ロットサイズプリセット機能

## 1. 概要

資産の1%リスク管理ルールに基づき、SL（損切り）pips値から逆算したロットサイズをワンクリックで設定できるプリセット機能。

## 2. 目的

- 1%リスク管理ルールの徹底
- ロットサイズ計算の手間を削減
- 誤入力によるリスク増大を防止
- SL設定とロットサイズの連動

## 3. 機能要件

### 3.1 計算ロジック

#### 基本計算式

```
ロットサイズ（通貨単位） = (現在資産 × リスク率) / (SL pips × 1pip値)
```

#### パラメータ

| 項目 | 値 | 説明 |
|------|------|------|
| 現在資産 | 口座残高（balance） | リアルタイムで取得 |
| リスク率 | 1% = 0.01 | 固定値 |
| SL pips | 10/20/30/40/50 | プリセット選択 |
| 1pip値 | 0.01円 | USD/JPY、10,000通貨あたり1,000円 = 0.01円/通貨 |

#### 計算例

**資産: 700,000円の場合**

| SL pips | 計算式 | ロットサイズ |
|---------|--------|--------------|
| 10 pips | (700,000 × 0.01) / (10 × 0.01) = 7,000 / 0.1 | 70,000通貨 |
| 20 pips | (700,000 × 0.01) / (20 × 0.01) = 7,000 / 0.2 | 35,000通貨 |
| 30 pips | (700,000 × 0.01) / (30 × 0.01) = 7,000 / 0.3 | 23,333通貨 |
| 40 pips | (700,000 × 0.01) / (40 × 0.01) = 7,000 / 0.4 | 17,500通貨 |
| 50 pips | (700,000 × 0.01) / (50 × 0.01) = 7,000 / 0.5 | 14,000通貨 |

**資産: 1,000,000円の場合**

| SL pips | 計算式 | ロットサイズ |
|---------|--------|--------------|
| 10 pips | (1,000,000 × 0.01) / (10 × 0.01) = 10,000 / 0.1 | 100,000通貨 |
| 20 pips | (1,000,000 × 0.01) / (20 × 0.01) = 10,000 / 0.2 | 50,000通貨 |
| 30 pips | (1,000,000 × 0.01) / (30 × 0.01) = 10,000 / 0.3 | 33,333通貨 |
| 40 pips | (1,000,000 × 0.01) / (40 × 0.01) = 10,000 / 0.4 | 25,000通貨 |
| 50 pips | (1,000,000 × 0.01) / (50 × 0.01) = 10,000 / 0.5 | 20,000通貨 |

### 3.2 表示仕様

#### 表示位置
OrderPanelのロット入力欄の下に配置

#### UI構成

```
┌────────────────────────────────────────────────────────┐
│ 注文パネル                                              │
├────────────────────────────────────────────────────────┤
│ 注文: ◉成行  ○指値  ○逆指値                            │
│ 方向: [買 ▼]                                           │
│ 通貨: [1] × [10,000 ▼]                                │
│                                                        │
│ ┌──────────────────────────────────────────────────┐   │
│ │ 1%リスクプリセット（資産: ¥700,000）               │   │
│ │ SL: [10p] [20p] [30p] [40p] [50p]                 │   │
│ │     70k   35k   23k   17.5k  14k                   │   │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ 現在価格: 145.123                                      │
│ [注文]                                                 │
└────────────────────────────────────────────────────────┘
```

#### プリセットボタン仕様

```tsx
<button className="px-2 py-1 bg-bg-primary border border-border rounded text-xs hover:bg-border">
  <div className="text-center">
    <div className="font-semibold">10p</div>
    <div className="text-text-secondary text-xs">70k</div>
  </div>
</button>
```

#### 選択時の動作
1. プリセットボタンをクリック
2. ロット入力欄に計算されたロットサイズを自動入力
   - 数量: 計算結果を10,000で割った値
   - 単位: 10,000に固定

例：70,000通貨 → 数量: 7、単位: 10,000

### 3.3 動的更新

#### 口座残高変動時
- 口座残高が変わったらプリセット値を自動再計算
- 5秒ごとの定期更新で反映

#### 表示フォーマット
- 1,000通貨未満：切り捨て
- 表示：k（千）単位
  - 70,000 → "70k"
  - 23,333 → "23k"
  - 100,000 → "100k"

## 4. データフロー

```
1. AccountInfoから残高取得
   ↓
2. ロットサイズ計算（5パターン）
   balance × 0.01 / (SL_pips × 0.01)
   ↓
3. プリセットボタン表示
   ↓
4. ユーザーがボタンクリック
   ↓
5. ロット入力欄に自動入力
```

## 5. 実装方針

### 5.1 フロントエンド

#### 修正対象
`frontend/src/components/OrderPanel.tsx`

#### 実装内容

1. **計算関数の追加**

```tsx
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
```

2. **プリセット定義**

```tsx
const LOT_PRESETS = [
  { slPips: 1, label: '1p' },   // SL 1pips時のロットサイズ
  { slPips: 10, label: '10p' },
  { slPips: 20, label: '20p' },
  { slPips: 30, label: '30p' },
  { slPips: 40, label: '40p' },
  { slPips: 50, label: '50p' },
]
```

3. **プリセットボタン実装**

```tsx
{/* 1%リスクプリセット */}
<div className="mt-2 p-2 bg-bg-card border border-border rounded">
  <div className="text-xs text-text-secondary mb-1">
    1%リスクプリセット（資産: ¥{account?.balance.toLocaleString()}）
  </div>
  <div className="flex gap-1">
    {LOT_PRESETS.map(preset => {
      const lotSize = calculateRiskBasedLotSize(
        account?.balance || 0,
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
          className="px-2 py-1 bg-bg-primary border border-border rounded text-xs hover:bg-border flex-1"
        >
          <div className="text-center">
            <div className="font-semibold">{preset.label}</div>
            <div className="text-text-secondary text-xs">
              {formatLotSize(lotSize)}
            </div>
          </div>
        </button>
      )
    })}
  </div>
</div>
```

### 5.2 口座情報の取得

OrderPanelにaccountプロパティを追加：

```tsx
// MainPage.tsx
<OrderPanel
  currentPrice={currentPrice}
  account={account}
  onRefresh={handleRefresh}
/>

// OrderPanel.tsx
interface OrderPanelProps {
  currentPrice: number
  account?: AccountInfo | null
  onRefresh?: () => void
}
```

## 6. テストケース

| # | 初期資産 | SL pips | 期待ロットサイズ | 期待表示 |
|---|---------|---------|-----------------|----------|
| 1 | 700,000円 | 10 pips | 70,000通貨 | 70k |
| 2 | 700,000円 | 20 pips | 35,000通貨 | 35k |
| 3 | 700,000円 | 40 pips | 17,500通貨 | 17k |
| 4 | 1,000,000円 | 10 pips | 100,000通貨 | 100k |
| 5 | 1,000,000円 | 20 pips | 50,000通貨 | 50k |
| 6 | 500,000円 | 10 pips | 50,000通貨 | 50k |
| 7 | プリセットクリック | - | ロット入力欄に反映 | - |

## 7. UI/UX考慮事項

### 7.1 利便性
- ワンクリックでロットサイズ設定
- SL設定に応じた適切なロットサイズを自動計算
- 視覚的にわかりやすい表示

### 7.2 安全性
- 1%リスク管理ルールの徹底
- 計算ミスによるリスク増大を防止
- 常に現在資産に基づいた計算

### 7.3 追加検討事項（今後の拡張）
- リスク率のカスタマイズ（0.5%、2%など）
- カスタムSL pips値の入力
- プリセット保存機能
- 計算式の詳細表示（ツールチップ）

## 8. 既存機能との連携

### 8.1 SL/TP設定との連携
- プリセットボタンをクリック後、SLをpips指定で設定可能
- 例：10pipsプリセット → SLを-10pipsに設定

### 8.2 アラート機能との連携
- ロットサイズが平均の2倍を超える場合、アラート表示
- プリセット使用時は適切なロットサイズのためアラート発生しにくい

## 9. スケジュール

| フェーズ | 内容 | 期間 |
|---------|------|------|
| 設計 | 本仕様書作成 | - |
| 実装 | フロントエンド実装 | 45分 |
| テスト | 動作確認 | 15分 |
| 合計 | | 1時間 |
