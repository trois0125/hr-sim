# 統計で確認が必要な値（DATA_TODO）

source に `TODO` が付いた値の一覧（14件。根拠付きの数値は全部で336件で、いまはすべて `basis: "assumption"`）。
統計で確認できたら値を直し、`basis` を `statistic` にして source を統計名・表番号に書き換える。ステップ6（バランス確認）の前にまとめて差し替える予定。

このファイルは `npx tsx scripts/data-todo.ts` で作り直す（手で編集しない）。

| ファイル | 項目 | 仮の値 | 単位 | 確認する統計 |
|---|---|---|---|---|
| `industries/trading.json` | `roles[sales].productivityMonthly` | 12000000 | 円/月 | 法人企業統計（卸売業の1人あたり売上高）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `roles[admin].marketSalaryMonthly` | 211000 | 円/月（20歳） | 仮置き。卸売業の賃金カーブ（賃金構造基本統計調査 令和7年（厚生労働省）一般労働者 産業中分類「I50〜55 卸売業」企業規模計（10人以上）、年齢階級別所定内給与額（e-Stat 統計表ID 000040420851））の0.9倍。TODO: 要確認（職種別の事務従事者の賃金） |
| `industries/trading.json` | `partTimeRatioRange` | 0〜0.1 | 比 | 労働力調査（卸売業の非正規比率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `grossMarginRange` | 0.05〜0.2 | 比 | DESIGN.md §3.3 の例。法人企業統計（卸売業の売上総利益率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `revenuePerEmployeeRange` | 30000000〜150000000 | 円/年 | 法人企業統計（卸売業の1人あたり売上高）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `laborCostRatioTypical` | 0.06 | 比 | 法人企業統計（卸売業の売上高人件費率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `variants[food].productivityMultiplier` | 1.8 | 倍 | 仮置き。粗利率の低い商材ほど1人あたりの取扱高が大きい。TODO: 要確認（法人企業統計・商業動態統計の業種別1人あたり売上） |
| `industries/trading.json` | `variants[machinery].productivityMultiplier` | 0.8 | 倍 | 仮置き。粗利率の低い商材ほど1人あたりの取扱高が大きい。TODO: 要確認（法人企業統計・商業動態統計の業種別1人あたり売上） |
| `industries/trading.json` | `variants[chemicals].productivityMultiplier` | 1.1 | 倍 | 仮置き。粗利率の低い商材ほど1人あたりの取扱高が大きい。TODO: 要確認（法人企業統計・商業動態統計の業種別1人あたり売上） |
| `industries/trading.json` | `variants[it_equipment].productivityMultiplier` | 1 | 倍 | 仮置き。粗利率の低い商材ほど1人あたりの取扱高が大きい。TODO: 要確認（法人企業統計・商業動態統計の業種別1人あたり売上） |
| `coefficients.json` | `[generation.gender.female_share]` | 0.4 | 比 | 労働力調査（卸売業の女性比率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `coefficients.json` | `[labor.legal_welfare_rate]` | 0.16 | 比 | 事業主負担の合計の目安：厚生年金 9.15%（保険料率18.3%の半分）＋健康保険 約5%＋介護保険（40歳以上）約0.8%＋雇用保険 約0.9%＋労災保険 約0.3%＋子ども・子育て拠出金 0.36%。TODO: 要確認（健康保険・介護保険は協会けんぽの都道府県別料率、雇用保険・労災保険は年度と業種で変わる） |
| `coefficients.json` | `[policy.overtime.cap.special]` | 80 | 時間/月 | 仮置き。特別条項つき36協定の上限（月100時間未満・複数月平均80時間以内・年720時間以内、月45時間超は年6か月まで）を月80時間に単純化。TODO: 要確認（年6か月の制限をゲームでどう扱うかはステップ7で決める） |
| `coefficients.json` | `[market.recession.monthly_probability]` | 0.01 | 確率/月 | 仮置き。景気後退が始まる確率（平均で約8年に1回）。TODO: 要確認（景気基準日付の後退局面の頻度） |
