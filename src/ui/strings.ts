/** 画面の文言（日本語）。UI の文字列はすべてここに置く。 */
export const strings = {
  appTitle: '人事部、創業から。',
  appSubtitle: '人事・経営を学ぶシミュレーション',
  newGame: 'はじめから',
  continueGame: 'つづきから（準備中）',
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
  layersNote: '※ 100人を超えたら、層ごとの表示に切り替わります（ステップ10で作ります）。',
  showMore: (n: number) => `ほか${n}人を表示`,
} as const;

/** フィードの文言 */
export const feedStrings = {
  hires: (n: number) => `${n}人が入社しました`,
  decision: (title: string, label: string) => `${title}：「${label}」を選んだ`,
  policyChange: (names: string) => `制度を変えた：${names}`,
  yearEnd: (year: number, revenue: string, profit: string, resignations: number) =>
    `${year}年目の決算：売上${revenue}、営業利益${profit}、退職${resignations}人`,
} as const;

/** 判断のモーダル */
export const decisionStrings = {
  impactTitle: '予想される影響',
  noImpact: '大きな変化はなさそう',
  happened: '起きたこと',
  lessonTitle: '学び',
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
  },
} as const;

/** 毎年の制度の見直し */
export const reviewStrings = {
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
