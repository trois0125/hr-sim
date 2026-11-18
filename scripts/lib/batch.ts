/**
 * 大量シミュレーションの部品（scripts/simulate.ts から使う）。
 * 1社分の実行は runJob、制度の組み合わせの抽選は samplePolicies。
 */
import { getIndustry } from '../../src/engine/data';
import { generateCompany, setFoundingPolicies } from '../../src/engine/generate';
import { createRng, type Rng } from '../../src/engine/rng';
import { summarizeRun, type RunSummary } from '../../src/engine/summary';
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
  type IndustryData,
  type LegalResponse,
  type IndustryId,
  type PolicySet,
} from '../../src/engine/types';

export type Job = { run: number; seed: number; industryId: IndustryId; policies: PolicySet; legal: LegalResponse };

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

/** 実行する会社の一覧をつくる（同じ baseSeed なら同じ一覧） */
export function makeJobs(industryId: IndustryId, runs: number, baseSeed: number): Job[] {
  const industry = getIndustry(industryId);
  const rng = createRng(baseSeed);
  return Array.from({ length: runs }, (_, run) => ({
    run,
    seed: rng.int(1, 2 ** 31 - 1),
    industryId,
    policies: samplePolicies(rng, industry),
    legal: rng.pick(LEGAL_RESPONSES),
  }));
}

export function runJob(job: Job): JobResult {
  const c = setFoundingPolicies(
    generateCompany({ seed: job.seed, industryId: job.industryId, autoPlay: { legal: job.legal } }),
    job.policies,
  );
  const end = runToEnd(c);
  return {
    job,
    foundingPatternId: c.profile.foundingPatternId,
    locationId: c.profile.locationId,
    variantId: c.profile.variantId,
    summary: summarizeRun(end),
  };
}
