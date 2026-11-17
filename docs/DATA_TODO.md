# 統計で確認が必要な値（DATA_TODO）

source に `TODO` が付いた値の一覧。いまはすべて `basis: "assumption"`。統計で確認できたら値を直し、`basis` を `statistic` にして source を統計名・表番号に書き換える。
ステップ6（バランス確認）の前にまとめて差し替える予定。

| ファイル | 項目 | 仮の値 | 単位 | 確認する統計 |
|---|---|---|---|---|
| `industries/trading.json` | `roles[sales].marketSalaryMonthly` | 350000 | 円/月 | 賃金構造基本統計調査（卸売業・営業職）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `roles[sales].productivityMonthly` | 8000000 | 円/月 | 法人企業統計（卸売業の1人あたり売上高）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `roles[admin].marketSalaryMonthly` | 260000 | 円/月 | 賃金構造基本統計調査（事務従事者）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `roles[management].marketSalaryMonthly` | 420000 | 円/月 | 賃金構造基本統計調査（管理的職業従事者）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `partTimeRatioRange` | 0.0〜0.1 | 比 | 労働力調査（卸売業の非正規比率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `baseAttritionRate` | 0.13 | 年率 | 雇用動向調査（卸売業，小売業の離職率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `grossMarginRange` | 0.05〜0.2 | 比 | DESIGN.md §3.3 の例。法人企業統計（卸売業の売上総利益率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `revenuePerEmployeeRange` | 30000000〜150000000 | 円/年 | 法人企業統計（卸売業の1人あたり売上高）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `industries/trading.json` | `laborCostRatioTypical` | 0.06 | 比 | 法人企業統計（卸売業の売上高人件費率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[tokyo].minimumWageHourly` | 1226 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[tokyo].wageIndex` | 1.2 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[kanagawa].minimumWageHourly` | 1225 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[kanagawa].wageIndex` | 1.08 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[osaka].minimumWageHourly` | 1177 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[osaka].wageIndex` | 1.05 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[aichi].minimumWageHourly` | 1140 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[aichi].wageIndex` | 1.02 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[fukuoka].minimumWageHourly` | 1057 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[fukuoka].wageIndex` | 0.95 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[miyagi].minimumWageHourly` | 1038 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[miyagi].wageIndex` | 0.93 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[hiroshima].minimumWageHourly` | 1085 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[hiroshima].wageIndex` | 0.95 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[niigata].minimumWageHourly` | 1050 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[niigata].wageIndex` | 0.9 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `locations.json` | `[kochi].minimumWageHourly` | 1023 | 円/時 | 令和7年度地域別最低賃金（厚生労働省）の値を記憶から仮置き。TODO: 要確認（発効日も都道府県ごとに確認） |
| `locations.json` | `[kochi].wageIndex` | 0.86 | 倍 | 賃金構造基本統計調査（都道府県別の所定内給与）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `coefficients.json` | `[generation.age.mean]` | 36 | 歳 | 労働力調査（就業者の年齢構成）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `coefficients.json` | `[generation.gender.female_share]` | 0.4 | 比 | 労働力調査（卸売業の女性比率）を参考に仮置き。TODO: 要確認（e-Statで確認） |
| `coefficients.json` | `[generation.salary.age_slope]` | 0.012 | 比/年 | 賃金構造基本統計調査（年齢階級別の賃金カーブ）を参考に仮置き。TODO: 要確認（e-Statで確認） |

このファイルは手で更新する。値を差し替えたら行を消す。
