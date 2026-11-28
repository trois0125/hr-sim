# 統計で確認が必要な値（DATA_TODO）

source に `TODO` が付いた値の一覧（58件。根拠付きの数値は全部で601件で、いまはすべて `basis: "assumption"`）。
統計で確認できたら値を直し、`basis` を `statistic` にして source を統計名・表番号に書き換える。ステップ6（バランス確認）の前にまとめて差し替える予定。

このファイルは `npx tsx scripts/data-todo.ts` で作り直す（手で編集しない）。

| ファイル | 項目 | 仮の値 | 単位 | 確認する統計 |
|---|---|---|---|---|
| `industries/manufacturing.json` | `roles[production].productivityMonthly` | 3500000 | 円/月 | 仮置き。製造の社員1人あたりの月の出荷額。製造業の1人あたり付加価値（年1,000万円前後）と粗利率から逆算した。TODO: 要確認（経済構造実態調査） |
| `industries/manufacturing.json` | `roles[office].marketSalaryMonthly` | 214000 | 円/月（20歳） | 賃金構造基本統計調査 令和7年（厚生労働省）一般労働者 企業規模計（10人以上）、年齢階級別所定内給与額及び年間賞与その他特別給与額（e-Stat 統計表ID 000040420843「Ｅ製造業」）。20歳の値の0.95倍。TODO: 要確認 |
| `industries/manufacturing.json` | `roles[supervisor].marketSalaryMonthly` | 248000 | 円/月（20歳） | 賃金構造基本統計調査 令和7年（厚生労働省）一般労働者 企業規模計（10人以上）、年齢階級別所定内給与額及び年間賞与その他特別給与額（e-Stat 統計表ID 000040420843「Ｅ製造業」）。20歳の値の1.1倍。TODO: 要確認 |
| `industries/manufacturing.json` | `grossMarginRange` | 0.22〜0.36 | 比 | 仮置き。売上から材料費などを引いた割合（付加価値率に近い）。TODO: 要確認（法人企業統計・経済構造実態調査） |
| `industries/manufacturing.json` | `revenuePerEmployeeRange` | 15000000〜50000000 | 円/年 | 仮置き。TODO: 要確認（経済構造実態調査） |
| `industries/manufacturing.json` | `laborCostRatioTypical` | 0.15 | 比 | 仮置き。製造業の売上高人件費率は1割台とされる。TODO: 要確認（法人企業統計） |
| `industries/manufacturing.json` | `variants[food].grossMarginRange` | 0.25〜0.35 | 比 | 仮置き。生活必需品で景気の影響は小さいが、利益率は低め。TODO: 要確認（法人企業統計） |
| `industries/manufacturing.json` | `variants[metal_parts].grossMarginRange` | 0.22〜0.32 | 比 | 仮置き。自動車・機械向けで景気に左右される。TODO: 要確認（法人企業統計） |
| `industries/manufacturing.json` | `variants[electronics].grossMarginRange` | 0.24〜0.36 | 比 | 仮置き。需要の波が大きい。TODO: 要確認（法人企業統計） |
| `industries/manufacturing.json` | `variants[chemicals].grossMarginRange` | 0.26〜0.36 | 比 | 仮置き。装置産業で1人あたりの出荷額が大きい。TODO: 要確認（法人企業統計） |
| `industries/restaurant.json` | `roles[store_staff].productivityMonthly` | 1400000 | 円/月 | 仮置き。店舗スタッフ1人（フルタイム換算）あたりの月の売上。パートの時間の短さと、入れ替わりによる立ち上がりの遅さを見込んで、売上高人件費率が3割前後になるよう合わせた。TODO: 要確認（経済センサス・法人企業統計） |
| `industries/restaurant.json` | `roles[hq].marketSalaryMonthly` | 230000 | 円/月（20歳） | 賃金構造基本統計調査 令和7年（厚生労働省）一般労働者 企業規模計（10人以上）、年齢階級別所定内給与額及び年間賞与その他特別給与額（e-Stat 統計表ID 000040420855「Ｍ７６飲食店」）。20歳の値（241.9千円）の0.95倍。TODO: 要確認（職種別の事務従事者の賃金） |
| `industries/restaurant.json` | `roles[store_manager].marketSalaryMonthly` | 278000 | 円/月（20歳） | 賃金構造基本統計調査 令和7年（厚生労働省）一般労働者 企業規模計（10人以上）、年齢階級別所定内給与額及び年間賞与その他特別給与額（e-Stat 統計表ID 000040420855「Ｍ７６飲食店」）。20歳の値（241.9千円）の1.15倍（店長手当を見込む）。TODO: 要確認 |
| `industries/restaurant.json` | `store.staffPerStore` | 12 | 人 | 仮置き。1店舗の社員数（パートを含む）。TODO: 要確認（経済センサスの飲食店の1事業所あたり従業者数） |
| `industries/restaurant.json` | `grossMarginRange` | 0.45〜0.55 | 比 | 仮置き。売上から食材費・店舗の家賃・水道光熱費を引いた割合。TODO: 要確認（法人企業統計・外食産業の原価率） |
| `industries/restaurant.json` | `revenuePerEmployeeRange` | 6000000〜15000000 | 円/年 | 仮置き。TODO: 要確認（経済センサス） |
| `industries/restaurant.json` | `laborCostRatioTypical` | 0.3 | 比 | 仮置き。飲食の売上高人件費率は3割前後とされる。TODO: 要確認（法人企業統計） |
| `industries/restaurant.json` | `variants[izakaya].grossMarginRange` | 0.45〜0.55 | 比 | 仮置き。夜の需要が中心で景気と宴会需要に左右される。TODO: 要確認（法人企業統計） |
| `industries/restaurant.json` | `variants[cafe].grossMarginRange` | 0.5〜0.58 | 比 | 仮置き。客単価は低いが原価率も低い。TODO: 要確認（法人企業統計） |
| `industries/restaurant.json` | `variants[ramen].grossMarginRange` | 0.45〜0.52 | 比 | 仮置き。回転が速く、景気の影響は小さい。TODO: 要確認（法人企業統計） |
| `industries/restaurant.json` | `variants[family].grossMarginRange` | 0.45〜0.53 | 比 | 仮置き。家族連れ中心で安定。TODO: 要確認（法人企業統計） |
| `industries/saas.json` | `roles[engineer].productivityMonthly` | 2000000 | 円/月 | 仮置き。売上を生む社員1人あたりの月の売上（契約を支えられる量）。先行投資で体制が売上より3割ほど大きいことを見込んで、売上高人件費率が4〜5割になるよう合わせた。TODO: 要確認 |
| `industries/saas.json` | `roles[biz].productivityMonthly` | 2000000 | 円/月 | 仮置き。売上を生む社員1人あたりの月の売上（契約を支えられる量）。先行投資で体制が売上より3割ほど大きいことを見込んで、売上高人件費率が4〜5割になるよう合わせた。TODO: 要確認 |
| `industries/saas.json` | `roles[corporate].marketSalaryMonthly` | 240000 | 円/月（20歳） | 賃金構造基本統計調査 令和7年（厚生労働省）一般労働者 企業規模計（10人以上）、年齢階級別所定内給与額及び年間賞与その他特別給与額（e-Stat 統計表ID 000040420849「Ｇ３９情報サービス業」）。20歳の値の0.95倍。TODO: 要確認 |
| `industries/saas.json` | `roles[manager].marketSalaryMonthly` | 290000 | 円/月（20歳） | 賃金構造基本統計調査 令和7年（厚生労働省）一般労働者 企業規模計（10人以上）、年齢階級別所定内給与額及び年間賞与その他特別給与額（e-Stat 統計表ID 000040420849「Ｇ３９情報サービス業」）。20歳の値の1.15倍。TODO: 要確認 |
| `industries/saas.json` | `grossMarginRange` | 0.7〜0.85 | 比 | 仮置き。SaaSの売上総利益率は7〜8割とされる。TODO: 要確認 |
| `industries/saas.json` | `revenuePerEmployeeRange` | 10000000〜30000000 | 円/年 | 仮置き。TODO: 要確認 |
| `industries/saas.json` | `laborCostRatioTypical` | 0.45 | 比 | 仮置き。人件費が最大のコスト。TODO: 要確認（法人企業統計の情報サービス業） |
| `industries/saas.json` | `variants[smb].grossMarginRange` | 0.75〜0.85 | 比 | 仮置き。顧客数は多いが単価が低く、景気の影響を受けやすい。TODO: 要確認（法人企業統計） |
| `industries/saas.json` | `variants[enterprise].grossMarginRange` | 0.7〜0.8 | 比 | 仮置き。単価が高く解約も少ないが、立ち上がりに時間がかかる。TODO: 要確認（法人企業統計） |
| `industries/saas.json` | `variants[vertical].grossMarginRange` | 0.72〜0.85 | 比 | 仮置き。特定の業界向けで、競合は少ないが市場は小さめ。TODO: 要確認（法人企業統計） |
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
| `coefficients.json` | `[law.inspection.monthly_probability]` | 0.003 | 確率/月 | 仮置き。1社が1か月に労働基準監督署の臨検（定期監督）を受ける確率（年3〜4%）。TODO: 要確認（労働基準監督年報の監督実施件数 ÷ 事業場数） |
| `coefficients.json` | `[leave.parental.female_months]` | 12 | か月 | 仮置き。女性の育児休業の期間。雇用均等基本調査（取得期間の分布）で確認する。TODO: 要確認 |
| `coefficients.json` | `[leave.parental.male_months]` | 1 | か月 | 仮置き。男性の育児休業の期間。雇用均等基本調査（取得期間の分布）で確認する。TODO: 要確認 |
| `coefficients.json` | `[leave.parental.return_rate]` | 0.9 | 確率 | 仮置き。育児休業から復帰する割合。雇用均等基本調査（育児休業後の復職者割合）で確認する。TODO: 要確認 |
| `coefficients.json` | `[leave.sick.months]` | 6 | か月 | 仮置き。メンタル不調・健康被害による私傷病休職の期間。労働安全衛生調査・JILPTの調査で確認する。TODO: 要確認 |
| `coefficients.json` | `[leave.sick.return_rate]` | 0.55 | 確率 | 仮置き。私傷病休職から復帰する割合。JILPT「メンタルヘルス、私傷病などの治療と職業生活の両立支援に関する調査」（休職者のうち退職した割合）で確認する。TODO: 要確認 |
| `intermediate/cases/mitsubishi.json` | `initialCash` | 50000000000 | 円 | 仮置き（docs/DATA_TODO.md）。大合同直後の資金の規模は未確認 |
| `intermediate/cases/mitsubishi.json` | `initialAgeShares` | （一覧） |  | 仮置き（docs/DATA_TODO.md）。戦後の復員・学制改革で若い社員が多かったとみなした（人的資本レポート P.5 の記述から） |
| `intermediate/cases/mitsubishi.json` | `headcountPath` | （一覧） |  | 単体の社員数の目安。2020年度 5,361人・2024年度 5,725人は人的資本レポート P.27。それ以前は仮置き（docs/DATA_TODO.md）。需要はこの人数で回る大きさにする |
| `intermediate/cases/mitsubishi.json` | `retirementAges` | （一覧） |  | 定年は55歳から60歳へ延長した（人的資本レポート P.7。年は未確認）。60歳定年は高年齢者雇用安定法で1998年から義務、65歳までの雇用確保は2013年から全員が対象。会社の延長の年は仮置き（docs/DATA_TODO.md） |
| `intermediate/cases/mitsubishi.json` | `economyShocks` | （一覧） |  | 大きな景気の落ち込みの年（第一次石油危機、プラザ合意後の円高不況、バブル崩壊、リーマン・ショック）。人的資本レポート P.6〜9 の時代背景から。落ち込みの大きさは仮置き TODO: 要確認（有価証券報告書・社史のPDFで差し替える） |
| `intermediate/cases/mitsubishi.json` | `grossMargin` | 0.2 | 比 | 仮置き（docs/DATA_TODO.md）。商社（機械）の粗利率の範囲（industries/trading.json）の上の端。各時代の実際の利益率は未確認 |
| `intermediate/cases/mitsubishi.json` | `unconfirmedSceneYears` | 1986・1993・1999・2002 |  | 場面の年を仮置きしたもの：定年延長（1986）、業績連動報酬の導入（1993）、ヒューマンリンクの設立（1999）、新卒採用の一時抑制（2002）。画面には年を出さない。TODO: 要確認 |
