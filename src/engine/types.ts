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
  /** 去った月（創業からの経過月） */
  month: number;
  /** resignation＝退職、return＝出向者の帰任（離職率には数えない） */
  kind: 'resignation' | 'return';
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
  operatingProfit: number;
  cash: number;
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
};

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
};
