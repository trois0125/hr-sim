/**
 * 大量シミュレーションの部品（scripts/simulate.ts から使う）。
 * 1社分の実行は runJob、制度の組み合わせの抽選は samplePolicies。
 */
import { getIndustry } from '../../src/engine/data';
import { generateCompany, setFoundingPolicies } from '../../src/engine/generate';
import { createRng, deriveSeed, type Rng } from '../../src/engine/rng';
import { summarizeRun, type RunSummary } from '../../src/engine/summary';
import { changePolicies } from '../../src/engine/policyChange';
import { runToEnd } from '../../src/engine/tick';
import {
  BONUS_POLICIES,
  EVALUATION_SYSTEMS,
  GRADE_SYSTEMS,
  HIRING_POLICIES,
  OVERTIME_POLICIES,
  PAY_POLICIES,
  TRAINING_INVESTMENTS,
  WORK_HOUR_SYSTEMS,
  LEGAL_RESPONSES,
  JUDGMENT_AXES,
  type IndustryData,
  type ChangeMethod,
  type JudgmentStyle,
  type LegalResponse,
  type IndustryId,
  type PolicySet,
} from '../../src/engine/types';

export type Job = {
  run: number;
  seed: number;
  industryId: IndustryId;
  policies: PolicySet;
  legal: LegalResponse;
  /** イベントの判断の傾向（省略すると傾向なし＝無作為に近い選び方） */
  style?: JudgmentStyle;
  /** 途中の制度変更（省略すると変えない） */
  change?: PolicyChangePlan;
};

/** 途中で1カテゴリだけ制度を変える計画 */
export type PolicyChangePlan = {
  month: number;
  category: keyof PolicySet;
  option: string;
  /** 給与や賞与が下がる人がいるときの進め方 */
  method: ChangeMethod;
  transition: boolean;
};

/** 途中で制度を変える月の範囲（2年目〜15年目） */
const CHANGE_MONTH_RANGE = { min: 24, max: 180 };

/** 途中の制度変更を抽選する（今の制度と違う選択肢を1つ選ぶ） */
export function sampleChange(rng: Rng, industry: IndustryData, policies: PolicySet): PolicyChangePlan {
  const opts = policyOptions(industry);
  // 選択肢が1つしかないカテゴリ（飲食・製造の働き方など）は変えられないので除く
  const category = rng.pick((Object.keys(opts) as (keyof PolicySet)[]).filter((k) => opts[k].length > 1));
  const others = (opts[category] as readonly string[]).filter((o) => o !== policies[category]);
  return {
    month: rng.int(CHANGE_MONTH_RANGE.min, CHANGE_MONTH_RANGE.max),
    category,
    option: rng.pick(others),
    method: rng.pick(['consent', 'rules'] as const),
    transition: rng.chance(0.5),
  };
}

/** 判断の傾向を抽選する（4軸それぞれ −1〜+1 の一様分布） */
export function sampleStyle(rng: Rng): JudgmentStyle {
  const s = {} as JudgmentStyle;
  for (const a of JUDGMENT_AXES) s[a] = rng.range(-1, 1);
  return s;
}

export type JobResult = {
  job: Job;
  foundingPatternId: string;
  locationId: string;
  variantId: string;
  summary: RunSummary;
};

/** 制度のカテゴリと選択肢（業種で選べない働き方は除く） */
export function policyOptions(industry: IndustryData): { [K in keyof PolicySet]: readonly PolicySet[K][] } {
  return {
    grade: GRADE_SYSTEMS,
    evaluation: EVALUATION_SYSTEMS,
    pay: PAY_POLICIES,
    bonus: BONUS_POLICIES,
    hiring: HIRING_POLICIES,
    workHours: WORK_HOUR_SYSTEMS,
    training: TRAINING_INVESTMENTS,
    workStyle: industry.remoteAllowed,
    overtime: OVERTIME_POLICIES,
  };
}

/** 制度の組み合わせを1つ抽選する */
export function samplePolicies(rng: Rng, industry: IndustryData): PolicySet {
  const o = policyOptions(industry);
  return {
    grade: rng.pick(o.grade),
    evaluation: rng.pick(o.evaluation),
    pay: rng.pick(o.pay),
    bonus: rng.pick(o.bonus),
    hiring: rng.pick(o.hiring),
    workHours: rng.pick(o.workHours),
    training: rng.pick(o.training),
    workStyle: rng.pick(o.workStyle),
    overtime: rng.pick(o.overtime),
  };
}

/**
 * 実行する会社の一覧をつくる（同じ baseSeed なら同じ一覧）。
 * changeShare の割合の会社は、途中で制度を1カテゴリ変える（変更の抽選は別の乱数なので、会社と制度の抽選はずれない）
 */
export function makeJobs(industryId: IndustryId, runs: number, baseSeed: number, changeShare = 0): Job[] {
  const industry = getIndustry(industryId);
  const rng = createRng(baseSeed);
  const changeRng = createRng(deriveSeed(baseSeed, 'policy-change'));
  return Array.from({ length: runs }, (_, run) => {
    const job: Job = {
      run,
      seed: rng.int(1, 2 ** 31 - 1),
      industryId,
      policies: samplePolicies(rng, industry),
      legal: rng.pick(LEGAL_RESPONSES),
      style: sampleStyle(rng),
    };
    const change = sampleChange(changeRng, industry, job.policies);
    if (changeRng.next() < changeShare) job.change = change;
    return job;
  });
}

export function runJob(job: Job): JobResult {
  const c = setFoundingPolicies(
    generateCompany({ seed: job.seed, industryId: job.industryId, autoPlay: { legal: job.legal, style: job.style } }),
    job.policies,
  );
  let end = runToEnd(c, job.change?.month ?? Infinity);
  if (job.change && end.status === 'running') {
    const next = { ...end.policies, [job.change.category]: job.change.option } as PolicySet;
    end = runToEnd(changePolicies(end, next, { method: job.change.method, transition: job.change.transition }));
  }
  return {
    job,
    foundingPatternId: c.profile.foundingPatternId,
    locationId: c.profile.locationId,
    variantId: c.profile.variantId,
    summary: summarizeRun(end),
  };
}
