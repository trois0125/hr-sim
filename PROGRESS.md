# PROGRESS

## 2026-11-17 ステップ1：プロジェクトの立ち上げ、シード付き乱数、型定義

### やったこと
- Vite + React + TypeScript の土台を作成（Zustand、Recharts、Vitest、tsx も導入）。`npm run dev` で仮の画面が出る
- `src/engine/rng.ts`：mulberry32 によるシード付き乱数
  - `next` / `range` / `int` / `chance` / `pick` / `weightedPick` / `normal` / `shuffle`
  - 用途ごとの独立した系列（generation, market, hiring, performance, attrition, evaluation, laws, events, voices）。1つのシードから派生させ、ある系列を多く引いても他の系列はずれない
  - 状態の保存と復元（セーブ用）
- `src/engine/types.ts`：仕様が明確な型だけ定義（Employee、PolicySet と各制度の選択肢、Coefficient / Sourced、IndustryData、CompanyState、SaveData）
- `src/engine/rng.test.ts`：14件。同じシードで同じ乱数列になること、系列が独立していること、保存・復元で続きが一致することなど
- `src/ui/strings.ts` に画面の文言を集約。`src/data/coefficients.json` は空の配列で用意
- `vite.config.ts` の base を `/hr-sim/` にした（GitHub Pages で公開する前提）

### 確認
- `npm test`：14件すべて成功
- `tsc -b`：エラーなし
- `vite build`：成功

### 残った課題
- イベント・法令・層・社史レポートの型は、それぞれのステップ（7、8、10、11）で追加する
- 係数台帳は空。ステップ2以降で業種データとともに埋める
- GitHub Pages への自動デプロイは未設定（必要になったら相談する）

## 2026-11-17 ステップ2：業種データ（商社）と、会社と社員の生成

### 決めたこと（ユーザーと確認）
- 始める時の社員数は「創業パターン」で変える：個人創業（1人）／共同創業（2〜4人）／大企業の子会社（10人前後）／事業の切り出し（20〜30人）。DESIGN.md に §3.4 を追加し、ステップ2の完了条件を書き換えた
- 子会社は「親会社からの出向者（給与が高い）」「資金と親会社向けの売上」「法令の義務が初月から発生」を持つ。制度は親会社準拠にしない
- 所在地は代表的な9都道府県（都市5・地方4）で、最低賃金・賃金水準・採用難度を持つ
- 統計サイトにはこの環境からつながらないため、数値はすべて仮置き（assumption）にし、`docs/DATA_TODO.md` に確認が必要な値をまとめた

### やったこと
- データ：`industries/trading.json`（職種3つ、商材4つ）、`foundings.json`、`locations.json`、`names.json`、`policies.json`（標準の制度）、`coefficients.json`（生成用の係数20件）
- エンジン：`data.ts`（JSONの型付き読み込み）、`coefficients.ts`（IDで係数を取り出す。無いIDはエラー）、`employees.ts`（社員の生成）、`generate.ts`（会社の生成）
  - 価値観はディリクレ分布で抽選（そのため `rng.ts` にガンマ乱数を追加）
  - 給与は 相場×地域差×年齢×ばらつき（出向者は上乗せ）。最低賃金を下回らない
  - 指定があっても必ず一度抽選してから上書きする。創業パターンだけ変えても商材や所在地は変わらない
- 型：`Employee` に `affiliation`（プロパー／出向）を追加。`FoundingPattern`、`LocationData` を追加
- `scripts/simulate.ts`：今は会社を生成して表示するだけ（`--seed` `--industry` `--founding` `--location`）
- テスト：40件（データの数値に根拠が付いているかの検査、各創業パターンの人数・特徴、同じシードで同じ会社、最低賃金、セーブできる形かなど）

### 仮の扱い（違っていたら直す）
- 創業社長は役員なので社員に数えず、プロフィールに名前だけ持つ。プレイヤー（人事担当）も社員に数えない
- 出向者も社員数に含めている（法令上の人数の数え方はステップ7で確認）
- 評価制度が入るまでは「評価で見える成果＝本当の実力」

### 残った課題
- `docs/DATA_TODO.md` の30項目を統計で確認して差し替える（ステップ6の前）
- 最低賃金は記憶からの仮置き。発効日も都道府県ごとに確認が必要
- 子会社の「親会社向け売上」とカーブアウトの「当初からの売上」はステップ3の業績計算で使う
