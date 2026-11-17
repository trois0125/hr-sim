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
