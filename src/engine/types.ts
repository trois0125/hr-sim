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

export type RoleData = {
  id: RoleId;
  name: string;
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
  /** 売上のうち親会社向けで安定している割合（ステップ3で使う） */
  parentRevenueShareRange: Sourced<Range>;
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

export type GradeSystem = (typeof GRADE_SYSTEMS)[number];
export type EvaluationSystem = (typeof EVALUATION_SYSTEMS)[number];
export type PayPolicy = (typeof PAY_POLICIES)[number];
export type BonusPolicy = (typeof BONUS_POLICIES)[number];
export type HiringPolicy = (typeof HIRING_POLICIES)[number];
export type WorkHourSystem = (typeof WORK_HOUR_SYSTEMS)[number];
export type TrainingInvestment = (typeof TRAINING_INVESTMENTS)[number];
export type WorkStyle = (typeof WORK_STYLES)[number];

export type PolicySet = {
  grade: GradeSystem;
  evaluation: EvaluationSystem;
  pay: PayPolicy;
  bonus: BonusPolicy;
  hiring: HiringPolicy;
  workHours: WorkHourSystem;
  training: TrainingInvestment;
  workStyle: WorkStyle;
};

// ---------------------------------------------------------------------------
// 従業員（§4.2）
// ---------------------------------------------------------------------------

export type Gender = 'M' | 'F' | 'X';
export type EmploymentType = 'full' | 'part' | 'contract';
/** 所属：プロパー社員か、親会社からの出向者か（§3.4 の拡張） */
export type Affiliation = 'proper' | 'secondee';

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
  /** 等級（制度がなければ0） */
  grade: number;
  /** 円 */
  salaryMonthly: number;
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
};

/** 退職理由（§4.4） */
export const ATTRITION_REASONS = ['pay', 'evaluation', 'workload', 'growth', 'relationships', 'family'] as const;
export type AttritionReason = (typeof ATTRITION_REASONS)[number];

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
  /** 売上のうち親会社向けの割合（子会社以外は0） */
  parentRevenueShare: number;
  legalObligationsAtStart: boolean;
  initialCash: number;
};

/** エンジンが保持する会社の状態。セーブデータの本体になる。 */
export type CompanyState = {
  seed: number;
  /** 創業からの経過月（0 始まり） */
  month: number;
  profile: CompanyProfile;
  policies: PolicySet;
  /** 手元資金（円） */
  cash: number;
  employees: Employee[];
  /** 次に採番する社員番号 */
  nextEmployeeId: number;
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
