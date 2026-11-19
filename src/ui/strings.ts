/** 画面の文言（日本語）。UI の文字列はすべてここに置く。 */
export const strings = {
  appTitle: '人事部、創業から。',
  appSubtitle: '人事・経営を学ぶシミュレーション',
  newGame: 'はじめから',
  continueGame: 'つづきから',
  continueDetail: (name: string, date: string, ended: boolean) => `${name}（${date}${ended ? '・社史を見る' : ''}）`,
  overwriteTitle: '保存している会社があります',
  overwriteBody: (name: string) => `はじめから遊ぶと、保存している「${name}」は消えます。`,
  overwriteYes: '消して、はじめから遊ぶ',
  overwriteNo: 'やめる',
  saveBroken: '保存したデータを読めませんでした。はじめから遊んでください。',
  saveNewer: '新しい版のゲームで保存したデータなので、この版では読めません。',
  saveFailed: '自動セーブできませんでした（ブラウザの保存の容量が足りないか、保存が止められています）。',
  saveNote: '進み具合は、このブラウザに自動で保存されます。',
  saveUnavailable: 'このページでは保存が使えないため、閉じると進み具合は残りません。',
  evidence: '数字の根拠',
  howTo: '遊び方',
  back: 'もどる',
  next: '次へ',
  start: 'この制度で始める',
  close: '閉じる',
  confirm: '決める',
} as const;

/** 遊び方 */
export const howToStrings = {
  title: '遊び方',
  sections: [
    {
      heading: 'あなたは人事担当です',
      body: '創業したばかりの会社に、人事担当として入りました。社長は営業で忙しく、人のことはあなたに任されています。',
    },
    {
      heading: '時間は自動で進みます',
      body: '1か月ずつ時間が進み、採用・退職・売上・納得感が動きます。速度は上のボタンで変えられ、いつでも一時停止できます。',
    },
    {
      heading: '止まるのは、判断が必要なとき',
      body: '社員が一定の人数になったとき（法令の節目）、出来事が起きたとき、毎年の決算月（制度の見直し）に止まります。選ぶと、また進みます。',
    },
    {
      heading: '制度を選び、変える',
      body: '等級・評価・給与・賞与・採用・労働時間・育成・働き方・残業の9つの制度を選びます。変えると社員の反応が起き、給与が下がる人がいれば進め方も選びます。',
    },
    {
      heading: '終わり方',
      body: '会社が成熟する（社員数が伸びなくなる）か、創業から25年たつか、資金が尽きて倒産すると終わります。点数はありません。',
    },
  ],
  note: '数字は統計や研究を参考にしていますが、多くは仮の値です。現実の会社の将来を予測するものではありません。',
} as const;

/** 会社の生成 */
export const generateStrings = {
  title: '会社をつくる',
  lead: 'どんな会社に入るかを決めます。',
  random: 'おまかせ',
  chooseIndustry: '業種を選ぶ',
  reroll: '別の会社にする',
  profile: '会社のプロフィール',
  fields: {
    name: '社名',
    industry: '業種',
    variant: '商材',
    location: '所在地',
    founder: '社長',
    founding: '始まり方',
    headcount: '創業時の社員',
    cash: '創業資金',
    grossMargin: '粗利率',
  },
  policiesTitle: '最初の制度を選ぶ',
  policiesLead: 'はじめは「標準」の制度になっています。始めたあとでも、制度はいつでも見直せます（そのときは社員の反応が起きます）。',
} as const;

/** 制度の名前と、選択肢の短い説明（§5） */
export const policyStrings = {
  categories: {
    grade: '等級制度',
    evaluation: '評価制度',
    pay: '給与の決め方',
    bonus: '賞与',
    hiring: '採用方針',
    workHours: '労働時間',
    training: '育成投資',
    workStyle: '働き方',
    overtime: '残業の方針',
  },
  options: {
    grade: {
      none: ['なし', '運用の手間はないが、昇格の道筋が見えにくい'],
      skill: ['職能等級', '能力で等級を決める。年功的になりやすい'],
      job: ['職務等級', '仕事の中身で等級を決める。評価のずれが最も小さい'],
      role: ['役割等級', '役割の大きさで等級を決める'],
    },
    evaluation: {
      ceo: ['社長が決める', '手間はかからないが、社員が増えるほどずれる'],
      mbo: ['目標管理（MBO）', '目標の達成度で評価する'],
      competency: ['行動評価', '仕事ぶり（行動）で評価する'],
      multi_rater: ['360度評価', '上司・同僚・部下が評価する。ずれは小さいが手間と費用がかかる'],
    },
    pay: {
      seniority: ['年功で昇給', '毎年みんな上がる。見通しは立つが、人件費が伸びる'],
      performance: ['成果に連動', '評価で差がつく。評価の低い人は下がることもある'],
      market: ['相場に連動', '同じ仕事の相場との差を、少しずつ埋める'],
    },
    bonus: {
      none: ['なし', '人件費は下がるが、相場より報酬が低く見える'],
      fixed_months: ['一律（年2か月分）', '全員に同じ月数。業績が悪くても費用は下がらない'],
      company_linked: ['業績連動', '利益が出た年だけ出る。赤字なら0'],
      individual_linked: ['個人成果連動', '評価の順位で額が変わる'],
    },
    hiring: {
      new_grad: ['新卒中心', '採用費は安いが、年1回の入社で、育つまで時間がかかる'],
      mid_career: ['中途中心', 'すぐ戦力になるが、採用費は高い'],
      part_time: ['パート・アルバイト中心', '人件費は低いが、任せられる仕事が限られる'],
    },
    workHours: {
      standard: ['通常', '1日8時間・週40時間'],
      fixed_overtime: ['固定残業代', '一定の残業代を毎月払う。超えた分の精算を忘れると違法'],
      variable: ['変形労働時間制', '忙しい時期に合わせて時間を配分する。割増の付く残業が減る'],
      flex: ['フレックス', '働く時間を本人が決める。負荷の受け止め方がよくなる'],
    },
    training: {
      '0': ['なし', '育成の費用はかからない'],
      '0.5': ['売上の0.5%', '実力が伸び、成長の機会が増える'],
      '1': ['売上の1%', 'さらに伸びるが、費用も大きい'],
    },
    workStyle: {
      office: ['出社', '一体感があり、新人が育ちやすい'],
      hybrid: ['ハイブリッド', '採用しやすく、オフィス代も下がるが、一体感は少し落ちる'],
      remote: ['フルリモート', 'この業種では選べないことがある'],
    },
    overtime: {
      none: ['残業なし', '負荷は小さいが、忙しい時期は受注を取りこぼす'],
      limit20: ['月20時間まで', ''],
      limit45: ['月45時間まで', '36協定の限度時間'],
      special: ['特別条項つき（月80時間まで）', '受注を取りこぼしにくいが、負荷と健康被害のリスクが大きい'],
    },
  },
  standard: '標準',
  notAllowed: 'この業種では選べません',
} as const;

/** 納得感の6要因（§4.3） */
export const factorNames = {
  externalPay: '報酬（社外と比べて）',
  internalFairness: '報酬（社内の公平さ）',
  evaluation: '評価の正確さ',
  workload: '働く負荷',
  growthOpportunity: '成長の機会',
  stability: '雇用の安定',
} as const;

/** 退職理由（§4.4） */
export const reasonNames = {
  pay: '給与',
  evaluation: '評価',
  workload: '負荷',
  growth: '成長',
  outlook: '会社の将来',
  relationships: '人間関係',
  family: '家庭の事情',
} as const;

/** 終わり方 */
export const statusNames = {
  running: '進行中',
  matured: '成熟',
  timeout: '25年経過',
  bankrupt: '倒産',
} as const;

/** メイン画面 */
export const mainStrings = {
  speed: '速度',
  pause: '一時停止',
  play: '再開',
  cash: '手元資金',
  metricsTitle: '主な指標',
  metrics: {
    headcount: '社員数',
    revenue: '売上（月）',
    profit: '営業利益（月）',
    laborCostRatio: '人件費率',
    attrition: '離職率（直近12か月）',
    engagement: '納得感（平均）',
    overtime: '残業（月）',
    onLeave: '休職中',
    stores: '店舗',
    storesValue: (stores: number, without: number) => (without > 0 ? `${stores}店（店長のいない店 ${without}）` : `${stores}店`),
    runway: '資金がもつ期間',
    runwayValue: (months: number | null) => (months === null ? '黒字' : `約${Math.floor(months)}か月`),
  },
  employeesTitle: '社員',
  feedTitle: '従業員の声と出来事',
  policiesTitle: '今の制度',
  reviewPolicies: '制度を見直す',
  chartTitle: 'この1年',
  sortBy: '並べ方',
  sorts: { engagement: '納得感の低い順', ability: '実力の高い順', tenure: '勤続の長い順' },
  columns: { name: '名前', role: '職種', age: '年齢', engagement: '納得感', salary: '月給' },
  partTime: 'パート',
  secondee: '出向',
  keyPerson: '主要',
  waiting: '判断を待っています',
  progressRunning: '時間が進んでいます',
  progressStopped: '時間は止まっています',
  showMore: (n: number) => `ほか${n}人を表示`,
} as const;

/** フィードの文言 */
export const feedStrings = {
  hires: (n: number) => `${n}人が入社しました`,
  decision: (title: string, label: string) => `${title}：「${label}」を選んだ`,
  policyChange: (names: string) => `制度を変えた：${names}`,
  programInstalled: (name: string) => `個別制度「${name}」を整えた`,
  reorg: (from: string, to: string, method: string) => `組織を改編した：${from}→${to}（${method}）`,
  programStopped: (name: string) => `個別制度「${name}」を止めた`,
  mitigated: (name: string, text: string) => `【${name}】${text}`,
  yearEnd: (year: number, revenue: string, profit: string, resignations: number) =>
    `${year}年目の決算：売上${revenue}、営業利益${profit}、退職${resignations}人`,
} as const;

/** 判断のモーダル */
export const decisionStrings = {
  impactTitle: '予想される影響',
  noImpact: '大きな変化はなさそう',
  happened: '起きたこと',
  lessonTitle: '学び',
  peek: 'いったん閉じて画面を見る（時間は止まったまま）',
  waitingBar: (n: number) => `判断待ちが${n}件あります。時間は止まっています。`,
  reopen: '稟議書を開く',
  continue: '続ける',
  reflectionTitle: '問いかけ（任意）',
  reflectionPrompt: '人事として、今いちばん大事にしたいことは何ですか？',
  reflectionPlaceholder: '短く書いてみましょう（あとで社史に残ります）',
  impacts: {
    cash: ['資金が増える', '資金が減る'],
    laborCost: ['人件費が増える', '人件費が減る'],
    engagement: ['社員の納得感が上がる', '社員の納得感が下がる'],
    target: ['本人の納得感が上がる', '本人の納得感が下がる'],
    headcount: ['', '人が辞める'],
    leave: ['休職に入る', ''],
    hiring: ['採用が強まる（人数も採用費も増える）', '採用が弱まる'],
    reputation: ['採用での評判が上がる', '採用での評判が下がる'],
    demand: ['需要が増える', '需要が減る'],
    compliance: ['法令違反が解消する', ''],
    ability: ['実力が伸びる', '実力が下がる'],
    program: ['個別制度が加わる（毎月の維持費がかかる）', ''],
  },
} as const;

/** 毎年の制度の見直し */
export const reviewStrings = {
  /** 組織の形の効き目の一行（改編の画面） */
  orgEffects: (spanMult: number, speed: number, coordination: number) =>
    `管理職1人が見る人数 ×${spanMult.toFixed(2)}・判断の速さ ×${speed.toFixed(2)}・調整の手間 −${Math.round(coordination * 1000) / 10}%（いまの人数で）`,
  title: (year: number) => `${year}年目の決算`,
  lead: 'この1年をふり返って、制度を変えるか決めます。',
  keep: 'このまま続ける',
  change: '制度を変える',
  summary: {
    revenue: '売上',
    profit: '営業利益',
    hires: '入社',
    resignations: '退職',
    engagement: '納得感（平均）',
    headcount: '年度末の社員数',
  },
  editorTitle: '制度を見直す',
  forecastTitle: (months: number) => `変えた場合の試算（この先${months}か月、変えない場合と比べて）`,
  forecast: {
    laborCost: '人件費',
    netProfit: '利益',
    engagement: '納得感',
    resignations: '退職者',
  },
  up: '増える',
  down: '減る',
  same: 'ほぼ変わらない',
  cuts: (n: number) => `給与や賞与が下がる人：${n}人`,
  methodTitle: '給与や賞与が下がる人がいます。進め方を選んでください',
  methods: {
    consent: ['一人ひとりの合意を取る', '説明と面談に費用がかかるが、納得感の下がり方が小さい'],
    rules: ['就業規則の変更で進める', '費用はかからないが、合理性が足りないと後で紛争になる'],
  },
  transition: '激変緩和を付ける（2年かけて少しずつ下げる）',
  apply: 'この内容で変える',
  noChange: '変更がありません',
  forecastNote: '試算は今の会社をそのまま先まで回した結果で、方向の目安です。',
} as const;

/** 社員の詳細 */
export const employeeStrings = {
  title: '社員の詳細',
  profile: 'プロフィール',
  age: '年齢',
  gender: { M: '男性', F: '女性', X: 'その他' },
  role: '職種',
  employment: { full: '正社員', part: 'パート', contract: '契約社員' },
  affiliation: { proper: 'プロパー', secondee: '親会社からの出向' },
  tenure: '勤続',
  grade: '等級',
  salary: '月給',
  bonus: '賞与（月割り）',
  overtime: '残業（月）',
  evaluation: '評価',
  engagement: '納得感',
  factorsTitle: '納得感の内訳（50が中立。低いほど不満）',
  biggestDrag: 'いちばん納得感を下げている要因',
  values: '大事にしていること',
  valueNames: { growth: '成長', stability: '安定', money: 'お金', balance: '仕事と生活の両立' },
  voicesTitle: '最近の声',
  noFactors: 'まだ1か月たっていないので、内訳はありません',
} as const;

/** 終了画面（社史レポートはステップ11） */
export const endStrings = {
  title: 'ゲーム終了',
  result: (status: string, years: number, months: number) => `${status}（創業から${years}年${months}か月）`,
  summary: {
    finalHeadcount: '最後の社員数',
    totalHires: '採用した人数',
    resignations: '退職した人数',
    attrition: '平均の離職率',
    engagement: '平均の納得感',
    profit: '営業利益の合計',
  },
  chartTitle: '社員数と納得感の推移',
  reasonsTitle: '退職理由の内訳',
  reflectionsTitle: 'あなたの問いかけへの答え',
  reportNote: '社史レポート（年表・同期の他社との比較・人事スタイル診断）はステップ11で作ります。',
  again: 'もう一度遊ぶ',
} as const;

/** 金額の表示 */
export const unitStrings = {
  man: '万円',
  oku: '億円',
  people: '人',
  hours: '時間',
  years: '年',
  months: 'か月',
  yearOld: '歳',
} as const;

/** 法令の画面の文言 */
export const lawStrings = {
  milestoneTitle: (headcount: number) => `社員が${headcount}人になりました`,
  milestoneLead: '新しく生じた義務があります。対応を選んでください。',
  responses: {
    immediate: { label: 'すぐ対応する', note: '費用と手間がかかる。自社で対応すると、まれに不備が残る' },
    outsource: { label: '社労士に依頼する', note: '費用は高めだが確実' },
    postpone: { label: '後回しにする', note: '費用はかからないが、違反の状態になる。臨検や退職者の申告で発覚すると是正勧告を受ける' },
  },
  /** 安衛法の義務を表示するときに必ず出す注記（CLAUDE.md） */
  workplaceUnitNote:
    '※ 労働安全衛生法の義務は、本来は会社全体ではなく事業場（支店・工場など）ごとの人数で決まります。このゲームでは「1社＝1事業場」に単純化しています。',
  overtimeWarning: 'このまま残業させると、36協定なしの残業になります（労働基準法違反）。',
} as const;

/** イベントの画面の文言 */
export const eventStrings = {
  categories: {
    people: '人',
    market: '市場',
    hiring: '採用',
    law: '法令',
    industry: '業種',
  },
  /** 判断の傾向の4軸（自動で進めるときの選び方）。[プラス側, マイナス側] */
  axes: {
    reward: ['個人に報いる', '公平を守る'],
    horizon: ['将来への投資', '今の利益'],
    rules: ['法令・ルール重視', '柔軟さ重視'],
    people: ['人を守る', '入れ替える'],
  },
  /** 人事スタイル診断の4軸（§9）。[プラス側, マイナス側] */
  diagnosisAxes: {
    outcome: ['成果', '安定'],
    control: ['統制', '自律'],
    develop: ['育成', '獲得'],
    proactive: ['先手', '後手'],
  },
  leaveKinds: {
    parental: '育児休業',
    care: '介護休業',
    sick: '私傷病の休職',
  },
  onLeave: (kind: string, untilLabel: string) => `${kind}中（${untilLabel}まで）`,
  /** 休職中の扱いの注記 */
  leaveNote:
    '※ 休職中は給与を払いません（育児休業給付・介護休業給付は雇用保険、傷病手当金は健康保険から出ます）。社会保険料の会社負担は、育児休業中だけ免除されます。',
} as const;

/** 層の表示（社員が100人を超えたとき。§4.1） */
export const layerStrings = {
  lead: (n: number) => `社員が${n}人になったので、職種と年代ごとの層でまとめて表示しています。層を押すと内訳が見られます。`,
  keyPeopleTitle: '主要人物',
  reasons: { key: '主要', founding: '創業メンバー', ace: 'エース' },
  layersTitle: '層',
  band: (band: number | null) => (band === null ? 'パート' : band <= 20 ? '20代以下' : band >= 60 ? '60代以上' : `${band}代`),
  name: (role: string, band: number | null) => `${role}・${layerStrings.band(band)}`,
  gradeFilter: '等級',
  allGrades: 'すべて',
  gradeOption: (g: number) => `等級${g}`,
  columns: {
    layer: '層',
    count: '人数',
    engagement: '納得感',
    drag: 'いちばんの不満',
    resignations: '退職（12か月）',
    salary: '平均月給',
  },
  detailTitle: '層の内訳',
  spread: (sd: number) => `ばらつき ±${sd.toFixed(0)}`,
  low: (n: number) => `不満の強い人 ${n}人`,
  onLeave: (n: number) => `休職中 ${n}人`,
  lowestTitle: '納得感の低い人',
  factorsTitle: '納得感の内訳（層の平均。50が中立）',
  none: '-',
} as const;

/** 社史レポート（§9。ステップ11） */
export const reportStrings = {
  title: '社史',
  blocks: {
    life: '会社の一生',
    numbers: '数字の推移',
    rival: '同期創業の他社との比較',
    voices: '従業員の声',
    style: '人事スタイル診断',
    turning: '分岐点の解説',
  },
  timeline: {
    founding: (n: number) => `創業（社員${n}人）`,
    headcount: (n: number) => `社員が${n}人を超えた`,
    obligation: (names: string) => `法令の節目：${names}`,
    violation: (text: string) => `発覚：${text}`,
    policy: (text: string) => `制度を変えた：${text}`,
    recession: '景気後退が始まった',
    event: (title: string, label: string) => `${title}：「${label}」`,
    reflection: (text: string) => `問いかけへの答え「${text}」`,
    end: (status: string) => `${status}で幕を閉じた`,
  },
  charts: {
    revenue: '売上（年）',
    operatingProfit: '営業利益（年）',
    laborCostRatio: '人件費率',
    headcount: '社員数（年度末）',
    attritionRate: '離職率',
    engagement: '納得感（平均）',
  },
  you: 'あなたの会社',
  rival: '同期の会社（標準の制度）',
  rivalLead: '同じ年に、同じ条件で創業し、標準の制度のまま経営した会社です。出来事の起き方は同じですが、判断は自動で選ばれています。',
  rivalRows: {
    result: '終わり方',
    years: '期間',
    finalHeadcount: '最後の社員数',
    totalProfit: '営業利益の合計',
    attrition: '平均の離職率',
    engagement: '平均の納得感',
  },
  yearsMonths: (y: number, m: number) => `${y}年${m}か月`,
  voicePeriod: (from: number, to: number) => {
    const end = Math.max(from, Math.ceil(to));
    return end === from ? `${from}年目` : `${from}〜${end}年目`;
  },
  voiceKinds: { voice: '', farewell: '退職のあいさつ', return: '復帰', secondment: '帰任', retirement: '定年' },
  styleLead: '制度の選び方（選んでいた期間の長さ）と、出来事での判断を半々で合わせて判定しています。',
  strength: '強み',
  pitfall: '落とし穴',
  axisFrom: (from: string) => `材料：${from}・出来事での判断`,
  turningLead: '主な判断を挙げ、この場面で一般にどうなりやすいかを解説します。別の選択をしていたらどうなったかの試算はしません。',
  turning: {
    policy: (text: string) => `制度の変更：${text}`,
    method: { consent: '（合意を取って）', rules: '（就業規則の変更で）' },
    law: (name: string, months: number) => `${name}を後回しにした（違反の状態が${months}か月）`,
  },
  noVoices: 'この時期の声はありません',
} as const;

/** 数字の根拠（ステップ13） */
export const evidenceStrings = {
  title: '数字の根拠',
  lead: 'このゲームの数字には、それぞれ「統計」「研究」「仮置き」の印と出典があります。仮置きは、統計で確かめる前の仮の値です。',
  basis: { statistic: '統計', research: '研究', assumption: '仮置き' },
  filterAll: 'すべて',
  search: '探す',
  searchPlaceholder: '言葉で絞り込む（例：離職、賞与、残業）',
  groups: { industry: (name: string) => `業種のデータ：${name}`, coefficients: '係数台帳（全業種に共通）' },
  industryLabel: '業種',
  count: (shown: number, all: number) => `${all}件のうち${shown}件`,
  columns: { name: '項目', value: '値', basis: '根拠', source: '出典・説明' },
  reference: (value: string, basis: string) => `目安 ${value}（${basis}）`,
  /** 業種データの項目の名前（場所の [] は職種・業態の名前に置き換える） */
  fields: {
    selectionWeight: '業種を選ぶ重み',
    'roles[].marketSalaryMonthly': '{x}の相場の月給',
    'roles[].productivityMonthly': '{x}1人あたりの月の売上',
    'roles[].hiringDifficulty': '{x}の採用難度',
    'roles[].mixWeightRange': '{x}の人数の割合（重み）',
    partTimeRatioRange: 'パートの割合',
    baseAttritionRate: '離職率（年）',
    grossMarginRange: '粗利率',
    revenuePerEmployeeRange: '1人あたりの売上',
    laborCostRatioTypical: '売上に対する人件費の割合（よくある値）',
    'growthCurve.growthMonths': '成長にかかる月数',
    'growthCurve.capHeadcount': '成長の上限の人数',
    cyclicality: '景気の影響の受けやすさ',
    maturityHeadcount: '成熟したとみなす人数',
    'variants[].productivityMultiplier': '{x}の売上の倍率',
    'variants[].grossMarginRange': '{x}の粗利率',
    'variants[].cyclicalityRange': '{x}の景気の影響の受けやすさ',
    adminPerRevenueStaff: '売上を生む社員1人あたりの事務の人数',
    managementSpan: '管理職1人が見る人数',
    marketPotentialRange: '市場の大きさ',
    marketBonusMonths: '賞与の相場（月数）',
    partTimeAttritionMult: 'パートの離職のしやすさ（倍）',
    partTimeProductivity: 'パートの働きの割合',
    'salaryCurve.ageSlope': '年齢で給与が上がる速さ',
    'salaryCurve.agePeak': '給与が最も高くなる年齢',
    'salaryCurve.post60Ratio': '60歳を過ぎた後の給与の割合',
    ageMean: '社員の平均年齢',
    'store.staffPerStore': '1店舗あたりの人数',
    'recurringRevenue.convergence': '積み上がる売上が需要に近づく速さ',
    'recurringRevenue.initialShare': '創業時の積み上がる売上の割合',
    'recurringRevenue.hiringHeadroom': '採用で先回りする余裕',
    experienceElasticity: '経験が売上に効く強さ',
  } as Record<string, string>,
  close: '閉じる',
} as const;

/** 施策と個別制度（§14.1。ステップ14） */
export const initiativeStrings = {
  sectionTitle: '施策と個別制度',
  open: '施策を打つ',
  menuTitle: '施策を打つ',
  menuLead: '施策を選ぶと稟議書が出て、そこで中身を選びます。メニューを開いている間は時間が止まります。',
  slipKind: '施策',
  run: 'この施策を打つ',
  close: '閉じる',
  unavailable: {
    waiting: '判断待ちに答えてから打てます',
    ended: '会社の歩みは終わりました',
    cooldown: (months: number) => `あと${months}か月で打てます`,
    headcount: (n: number) => `社員が${n}人になったら打てます`,
    conditions: 'いまは打てません',
  },
  programsTitle: '個別制度',
  noPrograms: 'まだありません。「施策を打つ」の「個別制度を整える」や、出来事の選択肢から整えられます。',
  monthlyCost: (cost: string) => `維持費 月${cost}`,
  since: (date: string) => `${date}から`,
  stop: '止める',
  stopConfirm: (name: string) => `「${name}」を止めますか？ しばらく社員の納得感が下がります。`,
  stopYes: '止める',
  stopNo: 'やめる',
  alreadyInstalled: 'もう整えてあります',
} as const;

/** 事業タブ・組織タブ（§14.2。ステップ15） */
export const dashboardStrings = {
  tabs: { floor: '現場', business: '事業', org: '組織' },
  tabsLabel: '画面の切り替え',
  period: '期間',
  periods: { year1: '直近12か月（月ごと）', year5: '直近5年（四半期ごと）', all: '創業から（年ごと）' },
  periodShort: { year1: '直近12か月', year5: '直近5年', all: '創業から' },
  bucket: {
    month: (m: number) => `${m}月`,
    quarter: (year: number, q: number) => `${year}年目${q}Q`,
    year: (year: number) => `${year}年目`,
  },
  showTable: '表で見る',
  showChart: 'グラフで見る',
  noData: 'まだ記録がありません。1か月進めると出ます。',
  noOrgData: 'この期間には記録がありません（前の版で遊んだ期間）。',
  business: {
    title: '事業の様子',
    economyNow: 'いまの景気',
    economyLabels: { boom: '好況', normal: '平常', slump: '不況' },
    utilizationNow: '稼働率（今月）',
    coverageNow: '需要を売上にできた割合（今月）',
    utilizationHelp: '稼働率＝売上÷残業なしで出せる上限。100%を超えたぶんは残業で出しています',
    demandTitle: '需要と売上',
    demand: '需要',
    revenue: '売上',
    capacity: '残業なしで出せる上限',
    rateTitle: '稼働率と、需要を売上にできた割合',
    utilization: '稼働率',
    coverage: '需要を売上にできた割合',
    profitTitle: '粗利と営業利益',
    grossProfit: '粗利',
    operatingProfit: '営業利益',
    economyTitle: '景気（100が平常）',
    economy: '景気',
    orgChartTitle: '組織図（いまの職種と人数）',
    orgChartNote: '部署と組織の形はステップ17で入ります。いまは職種ごとの人数です。',
    ceo: '社長',
    kinds: { management: '管理職', revenue: '売上を生む職種', admin: '事務・管理' },
    roleCount: (full: number, part: number) => (part > 0 ? `${full}人＋パート${part}人` : `${full}人`),
    onLeave: (n: number) => `うち休職${n}人`,
  },
  org: {
    title: '組織の様子',
    headcountNow: '社員数',
    attritionNow: '離職率（この期間）',
    onLeaveNow: '休職中',
    factorsTitle: '納得感の6要因（50が中立）',
    rolesTitle: '職種ごとの人数（期末）',
    part: 'うちパート',
    ageTitle: 'いまの年齢構成',
    full: 'フルタイム',
    partTime: 'パート',
    ageBand: (band: number) => `${band}代`,
    gradeTitle: 'いまの等級ごとの人数',
    grade: (g: number) => `等級${g}`,
    flowTitle: '入社と退職',
    hires: '入社',
    resignations: '退職',
    retirements: '定年',
    reasonsTitle: '退職の理由（この期間の合計）',
    attritionTitle: '離職率（年あたり）',
    attrition: '離職率',
    laborTitle: '人件費の内訳',
    laborParts: {
      salaries: '給与',
      bonus: '賞与',
      legalWelfare: '社会保険料（会社負担）',
      overtime: '残業代',
      hiring: '採用費',
      training: '育成費',
    },
    overtimeTitle: '残業（売上を生む社員、月あたり）',
    overtime: '残業',
    overtimeCap: (h: number) => `残業の方針の上限 ${h}時間`,
  },
  columns: { period: '期間' },
  people: (n: number) => `${n}人`,
  hours: (n: number) => `${Math.round(n)}時間`,
} as const;

/** 人事の辞典（§14.3。ステップ16） */
export const guideStrings = {
  title: '人事の辞典',
  open: '人事の辞典',
  lead: '制度・法令・個別制度・施策の、しくみとメリット・デメリット。法令は公式のページで確かめた内容と出典を載せています。',
  help: (name: string) => `「${name}」の解説`,
  helpShort: '？',
  back: '一覧へ',
  close: '閉じる',
  search: '探す',
  searchPlaceholder: '言葉で絞り込む（例：残業、賞与、育休）',
  sections: { policies: '制度', org: '組織の形', laws: '法令', programs: '個別制度', initiatives: '施策' },
  kinds: {
    category: '制度のカテゴリ',
    option: '制度',
    law: '法令',
    program: '個別制度',
    initiative: '施策',
    orgCategory: '組織の形',
    orgForm: '組織の形',
  },
  headings: {
    considerations: '選ぶときに考えること',
    options: '選択肢',
    merits: 'メリット',
    demerits: 'デメリット',
    fits: '向いている会社',
    cautions: '導入するときの注意',
    pitfalls: 'よくある失敗',
    legal: '法令のポイント',
    who: '対象',
    duties: '会社がすること',
    practice: '実務の注意',
    sources: '出典',
    todo: '確かめきれなかったこと',
    effectiveFrom: (date: string) => {
      const [y, m, d] = date.split('-').map(Number);
      return `施行：${y}年${m}月${d}日`;
    },
  },
  checkedAt: (date: string) => `法令の内容は${date}時点で確かめたものです。最新の情報は出典のページで確かめてください。`,
  related: '関係する解説',
  noResult: '見つかりませんでした。',
} as const;

/** 組織の形と組織改編（§14.4。ステップ17） */
export const orgStrings = {
  forms: {
    direct: '社長直下',
    functional: '機能別',
    divisional: '事業部制',
    flat: 'フラット（チーム制）',
    matrix: 'マトリクス',
  },
  formNotes: {
    direct: '全員が社長に直接相談する。小さいうちは速いが、30人前後から判断が社長に集まって遅れ、評価が行き届かなくなる',
    functional: '仕事の種類で部署を分ける。専門性が伸び、評価が正確になるが、部署の壁ができやすい',
    divisional: '店舗群・工場・プロダクトなどの単位で事業部を作る。判断が速く、任される機会が増えるが、管理職が増える',
    flat: '階層を減らし、少人数のチームで動く。管理職が少なく速いが、人が増えると評価が行き届かなくなる',
    matrix: '仕事の種類と事業の2つの軸で組む。柔軟だが、上司が2人になり、管理職と調整の手間が最も多い',
  },
  methods: { careful: '丁寧に進める', abrupt: '一気に切り替える' },
  methodNotes: {
    careful: (months: number, loss: string, cost: string) => `説明会・面談・引き継ぎをして進める。混乱は${months}か月、売れる上限は${loss}下がる。費用${cost}`,
    abrupt: (months: number, loss: string) => `すぐに新しい形に切り替える。混乱は${months}か月と短いが、売れる上限は${loss}下がり、納得感も大きく下がる`,
  },
  slipKind: '組織改編',
  slipTitle: '組織の形を選ぶ',
  lead: '組織の形と、改編の進め方を選びます。形を変えると、管理職の数・判断の速さ・評価や成長の機会・部署どうしの調整の手間が変わります。',
  formTitle: '組織の形',
  methodTitle: '改編の進め方',
  current: '今の形',
  apply: 'この形に改編する',
  keep: '今の形のままにする',
  same: '今の形と同じです',
  // 右の欄・フィード
  row: '組織の形',
  inTransition: (months: number) => `改編の混乱 あと${months}か月`,
  feed: (from: string, to: string, method: string) => `組織を改編した：${from}→${to}（${method}）`,
  // 組織図
  chartTitle: (form: string) => `組織図（${form}）`,
  ceo: '社長',
  unitNames: {
    trading: (n: number) => `第${n}事業部`,
    restaurant: (n: number) => `第${n}エリア`,
    saas: (n: number) => `プロダクト${n}`,
    manufacturing: (n: number) => `第${n}工場`,
  },
  teamName: (n: number) => `チーム${n}`,
  departmentOf: { revenue: (roles: string) => `${roles}部門`, admin: '管理部', management: '管理職' },
  headOf: '責任者',
  more: (n: number) => `ほか${n}`,
  people: (n: number) => `${n}人`,
} as const;
