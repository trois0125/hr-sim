/**
 * エンジンの型定義（ステップ1：仕様が明確なものだけ）。
 *
 * イベント（§8）、法令（§7）、層（§4.1 の100人以上）、社史レポート（§9）の型は、
 * それぞれのステップで追加する。
 */
import type { RngStreamsState } from './rng';

// ---------------------------------------------------------------------------
// 業種（§3.2）
// ---------------------------------------------------------------------------

export const INDUSTRY_IDS = ['trading', 'restaurant', 'saas', 'manufacturing'] as const;
export type IndustryId = (typeof INDUSTRY_IDS)[number];

/** 職種ID。業種ごとに定義する（例：商社の 'sales'）。 */
export type RoleId = string;

// ---------------------------------------------------------------------------
// 係数台帳（§6.2）
// ---------------------------------------------------------------------------

/** 数値の根拠の種類：公的統計／研究知見／仮置き */
export type Basis = 'statistic' | 'research' | 'assumption';

/** 根拠付きの数値。係数台帳と業種データの数値はすべてこの形で持つ。 */
export type Sourced<T = number> = {
  value: T;
  unit?: string;
  basis: Basis;
  /** 出典。仮置きの場合はその旨と、確認予定の統計名など */
  source: string;
  note?: string;
};

/** 係数台帳の1行（`src/data/coefficients.json`） */
export type Coefficient = Sourced<number> & {
  /** ドット区切りのID。例：attrition.engagement_multiplier.at20 */
  id: string;
};

/** 範囲で持つ数値（業種の中の要素を抽選するときに使う） */
export type Range = { min: number; max: number };

// ---------------------------------------------------------------------------
// 業種データ（§6.5 `src/data/industries/*.json`）
// ---------------------------------------------------------------------------

export type RoleKind = 'revenue' | 'admin' | 'management';

export type RoleData = {
  id: RoleId;
  name: string;
  /** 売上を生む職種か、それを支える事務・管理か */
  kind: RoleKind;
  /** パートで採用できる職種か（商社の営業などは不可） */
  partTimeAllowed: boolean;
  /** 相場の月給（円） */
  marketSalaryMonthly: Sourced<number>;
  /** 1人1か月あたりの売上への寄与（円） */
  productivityMonthly: Sourced<number>;
  /** 採用難度（1.0 が標準） */
  hiringDifficulty: Sourced<number>;
  /** 職種構成の重み（会社ごとに範囲から抽選し、合計1.0に正規化する） */
  mixWeightRange: Sourced<Range>;
};

/** 業種の中の要素（商材など、§3.3） */
export type IndustryVariant = {
  id: string;
  name: string;
  /** 1人あたりの取扱高の倍率（粗利率の低い商材ほど量が多い） */
  productivityMultiplier: Sourced<number>;
  grossMarginRange: Sourced<Range>;
  cyclicalityRange: Sourced<Range>;
};

export type GrowthCurve = {
  /** 成長期の長さ（月） */
  growthMonths: Sourced<number>;
  /** 上限の社員数 */
  capHeadcount: Sourced<number>;
};

export type IndustryData = {
  id: IndustryId;
  name: string;
  /** おまかせで業種を抽選するときの重み */
  selectionWeight: Sourced<number>;
  /** 社名の末尾（例：商事、物産） */
  companyNameSuffixes: string[];
  roles: RoleData[];
  partTimeRatioRange: Sourced<Range>;
  /** 年間の基本離職率（0〜1） */
  baseAttritionRate: Sourced<number>;
  /** 賞与の相場（所定内給与の何か月分か、年間） */
  marketBonusMonths: Sourced<number>;
  grossMarginRange: Sourced<Range>;
  revenuePerEmployeeRange: Sourced<Range>;
  laborCostRatioTypical: Sourced<number>;
  growthCurve: GrowthCurve;
  cyclicality: Sourced<number>;
  maturityHeadcount: Sourced<number>;
  remoteAllowed: WorkStyle[];
  /** 売上を生む社員1人あたりに必要な事務の人数 */
  adminPerRevenueStaff: Sourced<number>;
  /** 管理職1人（創業期は社長）が見られる人数 */
  managementSpan: Sourced<number>;
  /** 市場の成長性（成熟時の需要の倍率。縮小〜高成長） */
  marketPotentialRange: Sourced<Range>;
  /** 業種ごとのイベントID（イベントの型はステップ8で定義） */
  specialEvents: string[];
  variants: IndustryVariant[];

  // --- ステップ12：業種ごとの違い（省略すると係数台帳の共通の値。商社は省略） ---
  /** 年齢による賃金カーブ（賃金構造基本統計調査の業種別の年齢階級別所定内給与額に当てはめたもの） */
  salaryCurve?: { ageSlope: Sourced<number>; agePeak: Sourced<number>; post60Ratio: Sourced<number> };
  /** 社員の年齢の平均（生成するとき） */
  ageMean?: Sourced<number>;
  /** 経験（年齢）による生産性の伸びの強さ（賃金カーブの何乗か）。製造業は熟練が強く効く */
  experienceElasticity?: Sourced<number>;
  /** パートの辞めやすさ（一般労働者の離職率に対する倍率） */
  partTimeAttritionMult?: Sourced<number>;
  /** パートの時間あたりの生産性（飲食はパートが店舗の中心で、正社員に近い仕事をする） */
  partTimeProductivity?: Sourced<number>;
  /** 店舗（飲食）。店舗ごとに店長（管理の職種）が1人要る。店舗の数＝管理以外の社員数÷1店舗の人数 */
  store?: { staffPerStore: Sourced<number> };
  /** 積み上がる売上（SaaS）。売上は毎月、出せる上限に向かってこの割合だけ近づく（契約が少しずつ増え、少しずつ減る） */
  recurringRevenue?: { convergence: Sourced<number>; initialShare: Sourced<number>; hiringHeadroom: Sourced<number> };
};

// ---------------------------------------------------------------------------
// 創業パターン（§3.4 `src/data/foundings.json`）
// ---------------------------------------------------------------------------

export const FOUNDING_PATTERN_IDS = ['solo', 'cofounders', 'subsidiary', 'carveout'] as const;
export type FoundingPatternId = (typeof FOUNDING_PATTERN_IDS)[number];

export type FoundingPattern = {
  id: FoundingPatternId;
  name: string;
  description: string;
  selectionWeight: Sourced<number>;
  headcountRange: Sourced<Range>;
  initialCashRange: Sourced<Range>;
  /** 主要人物の人数。能力の高い順に選ぶ（共同創業は全員） */
  keyPersonCountRange: Sourced<Range>;
  /** 親会社からの出向者の割合 */
  secondeeShareRange: Sourced<Range>;
  /** 創業時の需要のうち、景気に左右されない底堅い部分の割合（親会社向け・既存顧客） */
  stableDemandShareRange: Sourced<Range>;
  /** 年齢の平均の上乗せ（年） */
  ageShift: Sourced<number>;
  /** 前の会社から引き継ぐ勤続月数 */
  inheritedTenureRange: Sourced<Range>;
  /** 納得感の初期値の上乗せ */
  engagementBonus: Sourced<number>;
  /** 法令の義務が初月から発生するか（判定はステップ7） */
  legalObligationsAtStart: boolean;
};

// ---------------------------------------------------------------------------
// 所在地（`src/data/locations.json`）
// ---------------------------------------------------------------------------

export type LocationType = 'urban' | 'rural';

export type LocationData = {
  id: string;
  name: string;
  type: LocationType;
  selectionWeight: Sourced<number>;
  /** 地域別最低賃金（円／時） */
  minimumWageHourly: Sourced<number>;
  /** 賃金水準の地域差（全国=1.0） */
  wageIndex: Sourced<number>;
  /** 採用難度の地域差（1.0 が標準） */
  hiringDifficulty: Sourced<number>;
};

// ---------------------------------------------------------------------------
// 人事制度（§5 初級＝選択式）
// ---------------------------------------------------------------------------

export const GRADE_SYSTEMS = ['none', 'skill', 'job', 'role'] as const; // なし／職能／職務／役割
export const EVALUATION_SYSTEMS = ['ceo', 'mbo', 'competency', 'multi_rater'] as const; // 社長／MBO／行動評価／360度
export const PAY_POLICIES = ['seniority', 'performance', 'market'] as const; // 年功／成果連動／相場連動
export const BONUS_POLICIES = ['none', 'fixed_months', 'company_linked', 'individual_linked'] as const;
export const HIRING_POLICIES = ['new_grad', 'mid_career', 'part_time'] as const;
export const WORK_HOUR_SYSTEMS = ['standard', 'fixed_overtime', 'variable', 'flex'] as const;
export const TRAINING_INVESTMENTS = ['0', '0.5', '1'] as const; // 売上比（%）
export const WORK_STYLES = ['office', 'hybrid', 'remote'] as const;
/** 残業の方針：なし／月20時間まで／月45時間まで（限度時間）／特別条項つき */
export const OVERTIME_POLICIES = ['none', 'limit20', 'limit45', 'special'] as const;

export type GradeSystem = (typeof GRADE_SYSTEMS)[number];
export type EvaluationSystem = (typeof EVALUATION_SYSTEMS)[number];
export type PayPolicy = (typeof PAY_POLICIES)[number];
export type BonusPolicy = (typeof BONUS_POLICIES)[number];
export type HiringPolicy = (typeof HIRING_POLICIES)[number];
export type WorkHourSystem = (typeof WORK_HOUR_SYSTEMS)[number];
export type TrainingInvestment = (typeof TRAINING_INVESTMENTS)[number];
export type WorkStyle = (typeof WORK_STYLES)[number];
export type OvertimePolicy = (typeof OVERTIME_POLICIES)[number];

export type PolicySet = {
  grade: GradeSystem;
  evaluation: EvaluationSystem;
  pay: PayPolicy;
  bonus: BonusPolicy;
  hiring: HiringPolicy;
  workHours: WorkHourSystem;
  training: TrainingInvestment;
  workStyle: WorkStyle;
  overtime: OvertimePolicy;
};

// ---------------------------------------------------------------------------
// 従業員（§4.2）
// ---------------------------------------------------------------------------

export type Gender = 'M' | 'F' | 'X';
export type EmploymentType = 'full' | 'part' | 'contract';
/** 所属：プロパー社員か、親会社からの出向者か（§3.4 の拡張） */
export type Affiliation = 'proper' | 'secondee';
/** どの経路で入ったか。founding は創業時からいる人 */
export type HireChannel = 'founding' | HiringPolicy;

/** 激変緩和で給与を段階的に下げている途中の状態 */
export type SalaryTransition = {
  /** 下げきったときの月給 */
  target: number;
  /** 1か月に下げる額 */
  stepPerMonth: number;
};

/** 価値観。4つの合計が 1.0 */
export type Values = { growth: number; stability: number; money: number; balance: number };

/** 休職の種類：育児休業／介護休業／私傷病（メンタル不調・長時間労働による健康被害など） */
export const LEAVE_KINDS = ['parental', 'care', 'sick'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

/**
 * 休職中の状態（ステップ8）。休職中は働かず、給与も払わない（育児休業給付・介護休業給付・傷病手当金は
 * 雇用保険・健康保険から出る）。社会保険料の会社負担は、育児休業中だけ免除される
 */
export type Leave = {
  kind: LeaveKind;
  /** 休職に入った月 */
  startMonth: number;
  /** 休職が終わる月（この月のはじめに、復帰するか退職するかが決まる） */
  endsAt: number;
  /** 復帰する確率（会社の支え方で変わる） */
  returnRate: number;
};

export type Employee = {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  role: RoleId;
  employmentType: EmploymentType;
  affiliation: Affiliation;
  hireChannel: HireChannel;
  /** 等級（制度がなければ0） */
  grade: number;
  /** 円 */
  salaryMonthly: number;
  /** 賞与の月割り（円）。評価のたびに決め直す */
  bonusMonthly: number;
  /** 激変緩和で給与を下げている途中なら、その状態 */
  salaryTransition: SalaryTransition | null;
  /** 0-100 本当の実力（プレイヤーには直接見えない） */
  ability: number;
  /** 評価制度を通して見えた成果 */
  perceivedPerformance: number;
  /** 0-100 納得感 */
  engagement: number;
  values: Values;
  tenureMonths: number;
  /** 月の残業時間 */
  overtimeHours: number;
  isKeyPerson: boolean;
  /** 納得感の6要因の点数（0〜100、50が中立）。最初の月の計算までは null */
  factorScores: FactorScores | null;
  /** 出向者が親会社に戻る予定の月（創業からの経過月）。出向者でなければ null */
  secondmentEndsAt: number | null;
  /** 休職中ならその状態。働いていれば null（古い状態には無いので省略可） */
  leave?: Leave | null;
};

/** 納得感の6要因（§4.3） */
export const ENGAGEMENT_FACTORS = [
  'externalPay', // 報酬の社外比較
  'internalFairness', // 報酬の社内公平性
  'evaluation', // 評価の正確さ
  'workload', // 働く負荷
  'growthOpportunity', // 成長の機会
  'stability', // 雇用の安定
] as const;
export type EngagementFactor = (typeof ENGAGEMENT_FACTORS)[number];
export type FactorScores = Record<EngagementFactor, number>;

/** 退職理由（§4.4）。outlook（会社の将来への不安）は「雇用の安定」に対応する理由として足した */
export const ATTRITION_REASONS = [
  'pay',
  'evaluation',
  'workload',
  'growth',
  'outlook',
  'relationships',
  'family',
] as const;
export type AttritionReason = (typeof ATTRITION_REASONS)[number];

/** 会社を去った人の記録。社史レポートの「従業員の声」と退職理由の内訳に使う */
export type Departure = {
  employeeId: string;
  name: string;
  role: RoleId;
  /** 雇用形態（層ごとの離職を数えるため。古い記録には無い） */
  employmentType?: EmploymentType;
  /** 去った月（創業からの経過月） */
  month: number;
  /** resignation＝退職、return＝出向者の帰任、retirement＝定年（帰任と定年は離職率に数えない） */
  kind: 'resignation' | 'return' | 'retirement';
  /** 退職理由。帰任のときは null */
  reason: AttritionReason | null;
  age: number;
  tenureMonths: number;
  salaryMonthly: number;
  engagement: number;
  isKeyPerson: boolean;
  factorScores: FactorScores | null;
};

// ---------------------------------------------------------------------------
// 会社の状態
// ---------------------------------------------------------------------------

/** 会社のプロフィール（§3.3、§3.4、§10 のプロフィールカード） */
export type CompanyProfile = {
  name: string;
  /** 創業社長。役員なので社員としては持たない */
  founderName: string;
  locationId: string;
  industryId: IndustryId;
  variantId: string;
  foundingPatternId: FoundingPatternId;
  /** 以下は抽選で決まった中の要素 */
  grossMargin: number;
  cyclicality: number;
  partTimeRatio: number;
  /** 職種ごとの構成比（合計1.0） */
  roleMix: Record<RoleId, number>;
  /** 創業時の需要のうち底堅い部分の割合（親会社向け・既存顧客。無ければ0） */
  stableDemandShare: number;
  /** 市場の成長性（成熟時の需要の倍率） */
  marketPotential: number;
  legalObligationsAtStart: boolean;
  initialCash: number;
};

/** 1年の月数（暦の定義） */
export const MONTHS_PER_YEAR = 12;

/** 市場の状態（§2.1 の1） */
export type MarketState = {
  /** 景気。0が平常、プラスが好況、マイナスが不況 */
  economy: number;
  /** 創業時の需要（円／月）。S字カーブの出発点 */
  initialDemandMonthly: number;
  /** 成熟時の需要（円／月）。S字カーブの到達点 */
  matureDemandMonthly: number;
  /** 景気に左右されない底堅い需要（円／月） */
  stableDemandMonthly: number;
  /** 市場での取り分（1.0が標準）。需要を取りこぼすと下がり、少しずつ戻る */
  shareFactor: number;
  /** 景気後退が始まった月（記録用） */
  recessionMonths: number[];
  /** 積み上がる売上の業種（SaaS）で、いまの月の売上（契約の合計）。それ以外の業種では使わない */
  recurringRevenue?: number;
};

/** 採用の状態（§2.1 の2） */
export type HiringState = {
  /** 採用の強さ。1.0が標準。イベントや制度で上げ下げする（ステップ5・8） */
  intensity: number;
};

/** 人件費の内訳（§6.3） */
export type LaborCost = {
  salaries: number;
  bonus: number;
  legalWelfare: number;
  overtime: number;
  hiring: number;
  training: number;
  total: number;
};

/** 月ごとの記録（§2.1 の10） */
export type MonthlyRecord = {
  month: number;
  headcount: number;
  hires: number;
  /** 退職した人数（出向者の帰任は含まない） */
  resignations: number;
  /** 親会社に戻った出向者の人数 */
  returns: number;
  /** 月末に在籍している社員の納得感の平均 */
  avgEngagement: number;
  /** 景気 */
  economy: number;
  /** 市場の需要上限（円） */
  demand: number;
  /** 残業なしで売れる上限（円） */
  capacity: number;
  /** 売上を生む社員（フルタイム）の残業時間 */
  overtimeHours: number;
  revenue: number;
  grossProfit: number;
  labor: LaborCost;
  otherFixedCost: number;
  /** その他の固定費のうち、等級・評価の制度の運用コスト */
  hrSystemCost: number;
  /** その他の固定費のうち、法令の義務に対応したあと毎月かかる費用（産業医など） */
  legalCost: number;
  operatingProfit: number;
  /** 営業利益の外の臨時の支出（法令対応の費用、是正、未払い残業代、納付金、イベントの支出など） */
  extraordinaryCost: number;
  /** 違反の状態にある義務の数（月末） */
  violations: number;
  /** 定年で退職した人数（離職率には数えない。古い記録には無い） */
  retirements?: number;
  /** 資金調達で入ったお金（円。利益ではない。古い記録には無い） */
  funding?: number;
  cash: number;
  /** その月の制度（人事スタイル診断で「選んでいた期間の長さ」を数えるため。古い記録には無い） */
  policies?: PolicySet;
};

/** 制度の変更（§5.1）。変更後しばらく納得感が揺れる */
export type PolicyChangeRecord = {
  month: number;
  /** 変えたカテゴリ */
  categories: (keyof PolicySet)[];
  /** 納得感の目標値を一時的に下げる量（点）。月がたつと小さくなる */
  resistance: number;
  method: ChangeMethod | null;
  transition: boolean;
  /** 給与が下がった人数 */
  affected: number;
  /** 給与の下げ幅の平均（%） */
  averageCutPct: number;
};

/** 不利益変更の進め方：合意を取る／就業規則の変更で進める */
export type ChangeMethod = 'consent' | 'rules';

/** 就業規則の変更で不利益変更を進めたときの「紛争の種」。イベント（ステップ8）で使う */
export type DisputeSeed = {
  month: number;
  affectedIds: string[];
  /** 変更の合理性（0〜1。低いほど紛争になりやすい） */
  reasonableness: number;
  averageCutPct: number;
  /** 訴えのイベントで決着がついたか */
  resolved?: boolean;
};

// ---------------------------------------------------------------------------
// 法令（§7 `src/data/laws.json`）
// ---------------------------------------------------------------------------

/** 節目での対応：すぐ対応／後回し／社労士に依頼（§7.2） */
export const LEGAL_RESPONSES = ['immediate', 'postpone', 'outsource'] as const;
export type LegalResponse = (typeof LEGAL_RESPONSES)[number];

/**
 * 人数の数え方。
 * - all：パート・出向者を含む全員（労基法の「常時使用する労働者」、安衛法の事業場の労働者）
 * - disability：障害者雇用率の算定基礎（週所定20時間以上30時間未満のパートは0.5人、20時間未満は数えない。出向者は除く）
 */
export type HeadcountMethod = 'all' | 'disability';

export type LawRule = {
  id: string;
  name: string;
  /** 根拠法と条文 */
  law: string;
  /** 発生する義務の短い説明（節目の画面に出す） */
  description: string;
  /** 義務が生じるきっかけ */
  trigger:
    | { type: 'headcount'; threshold: number; count: HeadcountMethod }
    | { type: 'overtime' }
    | { type: 'firstEmployee' };
  /** 施行日（YYYY-MM-DD）。この日より前のゲーム内日付では適用しない */
  effectiveFrom: string;
  /** この日以降は適用しない（新しい基準に置き換わった場合） */
  effectiveUntil?: string;
  /** 出典（条文名・厚労省のページ名） */
  source: string;
  /** 内容に自信がない点（ある場合だけ。報告用） */
  todo?: string;
  /** 対応の費用（円）：すぐ対応／社労士に依頼 */
  cost: { immediate: Sourced<number>; outsource: Sourced<number> };
  /** 対応したあと毎月かかる費用（円） */
  monthlyCost: Sourced<number>;
  /** 自社で対応したとき、不備が残る確率（社労士に依頼すると0） */
  selfErrorRate: Sourced<number>;
  /** 違反のまま臨検を受けたときに発覚する確率 */
  inspectionDetection: Sourced<number>;
  /** 安衛法の義務（画面に「1社＝1事業場に単純化」の注記を出す） */
  workplaceUnit?: boolean;
  /** 違反が見つかったときのイベント（省略すると労働基準監督署の臨検） */
  violationEvent?: string;
  /** 障害者の法定雇用率（障害者雇用のルールだけ） */
  requiredRate?: Sourced<number>;
  /** 是正するとき、未加入だった期間の社会保険料（会社負担分）をさかのぼって納める（最大2年） */
  backPaySocialInsurance?: boolean;
  /** 違反したときに起きること・本来どうすべきだったか（社史レポートの解説） */
  consequence: string;
  lesson: string;
};

/** 義務ごとの対応の状況 */
export type ComplianceStatus = {
  ruleId: string;
  /** 義務が生じた月 */
  triggeredMonth: number;
  /** compliant＝対応済み、noncompliant＝未対応（違反）、pending＝判断待ち */
  status: 'compliant' | 'noncompliant' | 'pending';
  response: LegalResponse | null;
  /** 違反が発覚したか（発覚すると是正するまでイベントが続く） */
  detected: boolean;
  /** 違反の状態にあった月数の合計 */
  violationMonths: number;
};

/** 社史レポートに載せる法令の出来事 */
export type LegalLogEntry = {
  month: number;
  ruleId: string | null;
  kind: 'obligation' | 'response' | 'violation_detected' | 'corrected' | 'warning' | 'health' | 'unpaid_overtime';
  text: string;
};

export type LegalState = {
  compliance: ComplianceStatus[];
  /** 固定残業代を「含めた時間を超えた分を払わない」運用にしてしまっているか（運用ミス） */
  fixedOvertimeMisoperation: boolean;
  /** 払っていない残業代（月ごと。3年で時効） */
  unpaidOvertime: { month: number; amount: number; employeeIds: string[] }[];
  /** 固定残業代の運用ミスの抽選をしたか（固定残業代を導入した時に1回だけ抽選する） */
  fixedOvertimeRolled: boolean;
  /** 月45時間を超えて残業させた月（特別条項でも年6か月まで） */
  overtimeOver45Months: number[];
  /** 今年度、特別条項の年6か月を超えたか（臨検で見つかると是正される） */
  overtimeCapExceeded: boolean;
  log: LegalLogEntry[];
};

// ---------------------------------------------------------------------------
// イベント（§8 `src/data/events.json`）
// ---------------------------------------------------------------------------

/** 比較の種類 */
export type Comparison = '<' | '<=' | '>' | '>=' | '==' | '!=';

/**
 * 会社の指標（イベントの発生条件に使う）。
 * - headcount：在籍者（休職中を含む）、month：創業からの月数、economy：景気（0が平常）
 * - cash：手元資金（円）、profit12：直近12か月の営業利益（円）
 * - avgEngagement：在籍者の納得感の平均、overtime：直近の月の残業時間（売上を生むフルタイム社員）
 * - overtime3：直近3か月の残業時間の平均、demandCoverage3：直近3か月の需要のうち売上にできた割合
 * - partCount：パートの人数、keyPersons：主要人物の人数、onLeave：休職中の人数
 * - avgEvaluationScore：納得感の要因「評価の正確さ」の平均
 * - disputeRisk：決着していない「紛争の種」のうち、いちばん合理性の低いものの（1−合理性）。無ければ0
 * - recessionAge：直近の景気後退が始まってからの月数（無ければ大きな値）
 * - runway：直近3か月の赤字が続いたら手元資金が何か月もつか（黒字なら大きな値）
 */
export const COMPANY_METRICS = [
  'headcount',
  'month',
  'economy',
  'cash',
  'profit12',
  'avgEngagement',
  'overtime',
  'overtime3',
  'demandCoverage3',
  'partCount',
  'keyPersons',
  'onLeave',
  'avgEvaluationScore',
  'disputeRisk',
  'recessionAge',
  'runway',
] as const;
export type CompanyMetric = (typeof COMPANY_METRICS)[number];

/** 会社についての条件 */
export type CompanyCondition =
  | { metric: CompanyMetric; op: Comparison; value: number }
  /** 制度がこのどれかになっている */
  | { policy: keyof PolicySet; in: string[] };

/**
 * 社員の項目（イベントの対象者の条件に使う）。
 * roleKind は職種の種類（revenue／admin／management）、values.* は価値観、onLeave は休職中なら1
 */
export const EMPLOYEE_FIELDS = [
  'engagement',
  'ability',
  'age',
  'tenureMonths',
  'overtimeHours',
  'isKeyPerson',
  'gender',
  'employmentType',
  'affiliation',
  'hireChannel',
  'roleKind',
  'onLeave',
  'values.growth',
  'values.stability',
  'values.money',
  'values.balance',
] as const;
export type EmployeeField = (typeof EMPLOYEE_FIELDS)[number];
export type EmployeeCondition = { field: EmployeeField; op: Comparison; value: number | string | boolean };

/** 数値で並べられる社員の項目 */
export type EmployeeSortKey = 'engagement' | 'ability' | 'age' | 'tenureMonths' | 'overtimeHours' | 'salaryMonthly';

/** イベントの対象者（エース、創業メンバーなど）の選び方。条件に合う人がいなければ起きない */
export type TargetSpec = {
  where: EmployeeCondition[];
  /** 条件に合う人の中で、この項目がいちばん高い（desc）／低い（asc）人。省略すると無作為 */
  sortBy?: EmployeeSortKey;
  order?: 'asc' | 'desc';
};

/** 社員の集団への効果（「新しい社員」「狙われた営業」など） */
export type GroupEffect = {
  where: EmployeeCondition[];
  /** 対象者を除くか */
  excludeTarget?: boolean;
  /** 人数を絞るときの並べ方と人数（limitShare は在籍者に対する割合） */
  sortBy?: EmployeeSortKey;
  order?: 'asc' | 'desc';
  limit?: number;
  limitShare?: number;
  /** 納得感の増減（点） */
  engagement?: number;
  /** 月給の増減（%） */
  salaryPct?: number;
  /** 賞与の月割りの増減（%。次の評価で決め直すまで） */
  bonusPct?: number;
  /** 実力の増減（点） */
  ability?: number;
  /** 退職させる（理由） */
  resign?: AttritionReason;
  /** 退職させるときの上乗せの退職金（月給の何か月分） */
  severanceMonths?: number;
};

/** 対象者への効果 */
export type TargetEffect = {
  engagement?: number;
  salaryPct?: number;
  ability?: number;
  /** 職種の種類を変える（その種類の最初の職種になる。管理職への登用など） */
  roleKind?: RoleKind;
  isKeyPerson?: boolean;
  /** 休職に入る。monthsMult を省くと種類ごとの標準の期間 */
  leave?: { kind: LeaveKind; monthsMult?: number; returnRateBonus?: number };
  /** すでに休職中なら、復帰する確率を上げ下げする（復職支援の有無など） */
  returnRateDelta?: number;
  /** 退職する（理由） */
  resign?: AttritionReason;
};

/** 判断の傾向の4軸（自動で進めるときの選び方。人事スタイル診断には DIAGNOSIS_AXES を使う）。プラス側／マイナス側 */
export const JUDGMENT_AXES = [
  'reward', // 個人に報いる ↔ 公平を守る
  'horizon', // 将来への投資 ↔ 今の利益
  'rules', // 法令・ルール重視 ↔ 柔軟さ重視
  'people', // 人を守る ↔ 入れ替える
] as const;
export type JudgmentAxis = (typeof JUDGMENT_AXES)[number];
/** 選択肢の軸の印（+1／−1。関係ない軸は書かない） */
export type AxisMarks = Partial<Record<JudgmentAxis, number>>;
/** 会社（プレイヤー）の判断の傾向。各軸 −1〜+1 */
export type JudgmentStyle = Record<JudgmentAxis, number>;

/**
 * 人事スタイル診断の4軸（§9）。プラス側／マイナス側。
 * 診断は制度の選び方と、イベントでの判断の両方から決める（組み合わせ方はステップ11）
 */
export const DIAGNOSIS_AXES = [
  'outcome', // 成果 ↔ 安定
  'control', // 統制 ↔ 自律
  'develop', // 育成 ↔ 獲得
  'proactive', // 先手 ↔ 後手
] as const;
export type DiagnosisAxis = (typeof DIAGNOSIS_AXES)[number];
export type DiagnosisMarks = Partial<Record<DiagnosisAxis, number>>;

/** 選択肢の効果。数値はすべてデータ側に書く */
export type EventEffects = {
  /** 手元資金の増減（円） */
  cash?: number;
  /** 社員1人あたりの手元資金の増減（円） */
  cashPerEmployee?: number;
  /** 直近の月の売上の何か月分を、手元資金から増減するか（取引先の倒産の貸し倒れなど） */
  cashRevenueMonths?: number;
  /** 資金調達：月の給与の合計の何か月分を手元資金に入れる（利益ではないので臨時の支出には入れない） */
  fundingPayrollMonths?: number;
  /** 全員の納得感の増減（点） */
  engagementAll?: number;
  /** 対象者以外の全員の納得感の増減（点） */
  engagementOthers?: number;
  /** 一定期間、納得感の目標値を上げ下げする（点。リストラの不安など、すぐには消えない影響） */
  morale?: { delta: number; months: number };
  /** 一定期間、求人の埋まりやすさに掛ける倍率（評判） */
  hiringAttraction?: { mult: number; months: number };
  /** 一定期間、採用の強さに掛ける倍率（求人の数・埋まりやすさ・採用費がともに増える） */
  hiringIntensity?: { mult: number; months: number };
  /** 一定期間、需要に掛ける倍率 */
  demand?: { mult: number; months: number };
  /** 一定期間、積み上がる売上の業種（SaaS）で「今の売上より何割多い体制まで採るか」を足す（資金調達して先行投資する） */
  hiringHeadroom?: { delta: number; months: number };
  /** 成熟時の需要に掛ける倍率（新規事業など、ずっと続く変化） */
  matureDemandMult?: number;
  /** 対象者への効果 */
  target?: TargetEffect;
  /** 社員の集団への効果 */
  groups?: GroupEffect[];
  /** 決着していない紛争の種を、決着したことにする */
  resolveDisputes?: boolean;
  /** 前の判断を条件にした続きのイベントを予約する（月数がたったら確率で起きる） */
  followUp?: { eventId: string; afterMonths: number; probability: number; sameTarget?: boolean };
  /** 発覚した違反（または指定した義務）を是正する（対応済みにし、是正の費用を払う） */
  correct?: 'detected' | string[];
  /** 是正の費用の倍率（是正勧告を受けてから直すと割高） */
  correctionCostMult?: number;
  /** 未払いの残業代を払う（割合。1なら全額）。払うと運用ミスもなくなる */
  payUnpaidOvertime?: number;
  /** 未払いの残業代の支払額に掛ける倍率（争った場合の付加金・遅延損害金など） */
  unpaidOvertimeMult?: number;
  /** 制度を変える（反応は起きない。是正のための変更） */
  setPolicies?: Partial<PolicySet>;
};

export type EventChoice = {
  label: string;
  effects: EventEffects;
  /** 学びの一言（社史レポートの解説に使う） */
  lesson?: string;
  /** 判断の傾向の軸の印（自動で選ぶときに使う） */
  axes?: AxisMarks;
  /** 人事スタイル診断（§9）の軸の印。どの軸にも当てはまらない選択肢は省く */
  diagnosis?: DiagnosisMarks;
  /** 予想される影響の補足（効果のデータから自動では出せないこと：あとで起きうること、法令上の問題など）。初級の画面に出す */
  hint?: string;
  /** 法令のイベントを自動で進めるとき、この方針ならこの選択肢を選ぶ */
  auto?: LegalResponse[];
};

/**
 * 起き方。
 * - law：エンジンの法令チェックから呼ばれる（抽選しない）
 * - random：毎月の抽選で起きる（条件を満たしているものの中から重みで選ぶ）
 * - followUp：前の判断で予約されたときだけ起きる（連鎖イベント）
 * - condition：条件を満たした月に、毎月の抽選とは別に起きる（景気後退など。probability は月あたりの確率）
 */
export type EventTrigger =
  | { type: 'law' }
  | {
      type: 'random' | 'followUp' | 'condition';
      minHeadcount?: number;
      /** condition のときの月あたりの確率（省略すると1） */
      probability?: number;
      conditions?: CompanyCondition[];
      /** 対象者。指定すると、条件に合う人がいるときだけ起きる */
      target?: TargetSpec;
    };

export type EventDef = {
  id: string;
  category: 'people' | 'market' | 'hiring' | 'law' | 'industry';
  trigger: EventTrigger;
  weight: number;
  /** 同じイベントが次に起きるまで空ける月数（省略すると係数台帳の標準） */
  cooldownMonths?: number;
  /** この業種では起きない（在宅勤務の要望は、在宅勤務を選べない業種では起きない、など） */
  excludeIndustries?: IndustryId[];
  /** 業種ごとの文の差し替え（共通のイベントの、商社向けの言い回しを業種に合わせる）。choices は番号順、null は差し替えなし */
  textByIndustry?: Partial<
    Record<IndustryId, { title?: string; body?: string; choices?: ({ label?: string; lesson?: string; hint?: string } | null)[] }>
  >;
  difficulty: ('beginner' | 'intermediate' | 'advanced')[];
  title: string;
  /** {name} のような差し込みを使える。対象者がいれば name・age・tenure・annual（年収・万円）が入る */
  body: string;
  /** 本文に差し込む追加の数字（対象者の年収の倍率など）。例：{ "offer": { "of": "annual", "mult": 1.2 } } */
  extraVars?: Record<string, { of: 'annual' | 'headcount' | 'revenue'; mult: number }>;
  /** 選ぶ前に起きる効果（需要の急拡大そのものなど） */
  onTrigger?: EventEffects;
  choices: EventChoice[];
};

/** 判断待ち（節目・イベント）。画面はここで時間を止める */
export type PendingDecision = {
  id: string;
  month: number;
  /** milestone：法令の節目、event：イベント、review：毎年の決算月の制度の見直し（画面で遊ぶときだけ） */
  kind: 'milestone' | 'event' | 'review';
  /** milestone：対象の義務、event：イベントのID */
  ruleIds: string[];
  eventId: string | null;
  /** 本文への差し込み */
  vars: Record<string, string | number>;
  /** イベントの対象者（いれば） */
  targetId?: string | null;
};

/** 判断の記録（社史レポートと人事スタイル診断に使う） */
export type DecisionRecord = {
  month: number;
  eventId: string;
  choiceIndex: number;
  targetId: string | null;
  axes: AxisMarks;
  /** 人事スタイル診断の軸の印 */
  diagnosis: DiagnosisMarks;
  /** 自動で選んだか */
  auto: boolean;
};

/** 節目の問いかけ（§2.2「人事として今何を大事にしたいか」）への答え */
export type Reflection = { month: number; text: string };

/** 従業員の声の種類：ふだんの声／退職のあいさつ／休職からの復帰／出向からの帰任 */
export type VoiceKind = 'voice' | 'farewell' | 'return' | 'secondment' | 'retirement';
export type VoiceTone = 'negative' | 'neutral' | 'positive';

/** 従業員の声（メイン画面のフィードと、社史レポートの「従業員の声」に使う） */
export type VoiceRecord = {
  month: number;
  employeeId: string;
  name: string;
  role: RoleId;
  kind: VoiceKind;
  tone: VoiceTone;
  /** どの要因についての声か（ふだんの声のとき） */
  factor: EngagementFactor | null;
  text: string;
};

/** 予約された続きのイベント */
export type ScheduledEvent = {
  eventId: string;
  dueMonth: number;
  probability: number;
  targetId: string | null;
};

/** 一時的な効果（期限つき） */
export type TemporaryModifier = {
  type: 'hiringAttraction' | 'hiringIntensity' | 'demand' | 'morale' | 'hiringHeadroom';
  /** 倍率（morale のときは点数、hiringHeadroom のときは足す割合） */
  mult: number;
  untilMonth: number;
};

/**
 * 自動で進めるときの判断の方針（画面のない simulate.ts と、プレイヤーが任せた場合）。
 * legal は法令の節目と法令のイベント、style はそれ以外のイベント（省略すると無作為に近い選び方）
 */
export type AutoPlay = { legal: LegalResponse; style?: JudgmentStyle };

/** 進行中か、どの終了条件で終わったか（§2.3） */
export type CompanyStatus = 'running' | 'matured' | 'timeout' | 'bankrupt';

/** エンジンが保持する会社の状態。セーブデータの本体になる。 */
export type CompanyState = {
  seed: number;
  /** 創業からの経過月（0 始まり） */
  month: number;
  status: CompanyStatus;
  profile: CompanyProfile;
  policies: PolicySet;
  /** 手元資金（円） */
  cash: number;
  /** 手元資金がマイナスのまま続いている月数 */
  negativeCashMonths: number;
  employees: Employee[];
  /** 次に採番する社員番号 */
  nextEmployeeId: number;
  market: MarketState;
  hiring: HiringState;
  history: MonthlyRecord[];
  departures: Departure[];
  policyChanges: PolicyChangeRecord[];
  disputeSeeds: DisputeSeed[];
  legal: LegalState;
  pendingDecisions: PendingDecision[];
  modifiers: TemporaryModifier[];
  /** イベントで選んだ選択肢の記録 */
  decisions: DecisionRecord[];
  /** 予約された続きのイベント */
  scheduledEvents: ScheduledEvent[];
  /** 節目の問いかけへの答え */
  reflections: Reflection[];
  /** 従業員の声 */
  voices: VoiceRecord[];
  /** 自動で判断する方針。null なら判断待ちで止まる（画面で選ぶ） */
  autoPlay: AutoPlay | null;
  /** 次に採番する判断待ちの番号 */
  nextDecisionId: number;
  /** その月の記録ができる前に払った臨時の支出（次にできる記録に載せる） */
  unrecordedExtraordinaryCost: number;
  /** その月の記録ができる前に入った資金調達（次にできる記録に載せる。古い状態には無い） */
  unrecordedFunding?: number;
  rng: RngStreamsState;
};

// ---------------------------------------------------------------------------
// セーブデータ
// ---------------------------------------------------------------------------

/** 形式を変えたら上げ、読み込み時に変換する */
export const SAVE_VERSION = 1;

export type SaveData = {
  version: typeof SAVE_VERSION;
  savedAt: string;
  company: CompanyState;
  /** 画面の側で一緒に残したいもの（フィードなど）。エンジンは中身を見ない */
  ui?: Record<string, unknown>;
};
