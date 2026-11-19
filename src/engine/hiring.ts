/**
 * 採用（§2.1 の2）。ステップ3では「簡単な自動採用」。
 *
 * - 需要に対して売上を生む社員が足りなければ、その職種の求人を出す
 * - 事務・管理は、必要な人数（performance.ts の supportRequirement）に足りなければ求人を出す
 * - 1か月に出せる求人の数には上限がある（採用の強さで増える）
 * - 求人が埋まるかどうかは、職種と地域の採用難度で決まる
 * - 採用しても人件費の数か月分の資金が残るときだけ採用する
 *
 * 採用方針（新卒／中途／パート中心）と働き方で、埋まりやすさ・採用費・年齢・パートの割合が変わる。
 * 採用の強さは、イベント（ステップ8）の一時的な効果で上げ下げする。強めると求人の数・埋まりやすさ・採用費がともに増える。
 */
import { coef } from './coefficients';
import { createEmployee } from './employees';
import { fte, nominalOutputPerRevenueStaff, supportRequirement } from './performance';
import { marketSalaryFor } from './employees';
import {
  bonusMonthlyFor,
  fillRateMultiplier,
  hireChannelFor,
  marketCompensation,
  monthlyCompensation,
  policyEffect,
} from './policies';
import type { Rng } from './rng';
import type { Employee, EmploymentType, IndustryData, IndustryVariant, LocationData, PolicySet, RoleId } from './types';
import { MONTHS_PER_YEAR } from './types';

export type HiringInput = {
  rng: Rng;
  employees: readonly Employee[];
  industry: IndustryData;
  variant: IndustryVariant;
  location: LocationData;
  partTimeRatio: number;
  /** その月の需要上限（円） */
  demand: number;
  /** 残業なしで売れる上限（円） */
  capacity: number;
  cash: number;
  intensity: number;
  nextEmployeeId: number;
  policies: PolicySet;
  /** 創業からの経過月（新卒の入社月の判定に使う） */
  month: number;
  /** 少し先（新卒を見込みで採るときの月数先）の需要（円）。省略すると今月の需要 */
  projectedDemand?: number;
  /** 評判による求人の埋まりやすさの倍率（イベントの一時的な効果）。省略すると1 */
  reputation?: number;
  /** 組織の形による、管理職1人が見る人数の倍率（§14.4）。省略すると1 */
  spanMult?: number;
};

/**
 * 会社の報酬水準（フルタイムのプロパー社員の「報酬 ÷ 相場の報酬」の平均）。
 * 社員がいなければ1.0（相場どおり）とみなす
 */
export function payCompetitiveness(
  employees: readonly Employee[],
  industry: IndustryData,
  location: LocationData,
  policies: PolicySet,
): number {
  let sum = 0;
  let n = 0;
  for (const e of employees) {
    if (e.employmentType === 'part' || e.affiliation !== 'proper') continue;
    const market = marketSalaryFor(industry, location, e.role, e.age, e.employmentType);
    sum += monthlyCompensation(e, policies) / marketCompensation(market, e.employmentType, industry);
    n++;
  }
  return n > 0 ? sum / n : 1;
}

/** 報酬水準による求人の埋まりやすさの倍率（相場どおりで1.0） */
export function payAttraction(competitiveness: number): number {
  return Math.min(coef('hiring.pay_ratio_max'), Math.pow(competitiveness, coef('hiring.pay_elasticity')));
}

export type HiringResult = {
  hires: Employee[];
  /** 採用費の合計（円） */
  cost: number;
  /** 出した求人の数（職種ごと） */
  openings: Record<RoleId, number>;
};

/** 職種ごとに「あと何人ほしいか」 */
export function desiredOpenings(
  input: Pick<HiringInput, 'employees' | 'industry' | 'variant' | 'demand' | 'capacity' | 'spanMult'>,
): Record<RoleId, number> {
  const { employees, industry, variant, demand, capacity } = input;
  const out: Record<RoleId, number> = {};
  const fteByRole = new Map<RoleId, number>();
  for (const e of employees) fteByRole.set(e.role, (fteByRole.get(e.role) ?? 0) + fte(e));

  // 売上を生む職種：需要に足りないぶんを1人あたりの売上で割った人数を、いま人数の少ない職種から順に割り振る
  // （職種ごとに割ってから切り捨てると、売上を生む職種が2つある業種（SaaS）で小さい不足がいつも0人になる）
  const revenueRoles = industry.roles.filter((r) => r.kind === 'revenue');
  const shortage = Math.max(0, demand - capacity);
  const meanOutput =
    revenueRoles.reduce((s, r) => s + nominalOutputPerRevenueStaff(industry, variant, r.id), 0) / Math.max(1, revenueRoles.length);
  const totalNeed = meanOutput > 0 ? Math.floor(shortage / meanOutput) : 0;
  for (const role of revenueRoles) out[role.id] = 0;
  for (let k = 0; k < totalNeed; k++) {
    let pick = revenueRoles[0];
    for (const role of revenueRoles) {
      const cur = (fteByRole.get(role.id) ?? 0) + (out[role.id] ?? 0);
      const best = pick ? (fteByRole.get(pick.id) ?? 0) + (out[pick.id] ?? 0) : Infinity;
      if (cur < best) pick = role;
    }
    if (pick) out[pick.id] = (out[pick.id] ?? 0) + 1;
  }
  let revenueFteAfter = 0;
  for (const role of revenueRoles) revenueFteAfter += (fteByRole.get(role.id) ?? 0) + (out[role.id] ?? 0);

  // 事務・管理：採用後の人数に対して必要な人数に足りないぶん
  const headcountAfter = employees.length + Object.values(out).reduce((s, n) => s + n, 0);
  // 店舗のある業種は、いまの社員数で店舗の数（＝要る店長の数）を数える（採りたい人数で数えると、店ができる前に店長を採ってしまう）
  const required = supportRequirement(industry, revenueFteAfter, industry.store ? employees.length : headcountAfter, input.spanMult ?? 1);
  for (const kind of ['admin', 'management'] as const) {
    const roles = industry.roles.filter((r) => r.kind === kind);
    if (roles.length === 0) continue;
    const current = roles.reduce((s, r) => s + (fteByRole.get(r.id) ?? 0), 0);
    const need = Math.max(0, Math.round(required[kind] - current));
    // 同じ種類の職種が複数ある業種では、先頭の職種で採る（必要になったら配分を見直す）
    const first = roles[0];
    if (first) out[first.id] = need;
  }
  return out;
}

export function runHiring(input: HiringInput): HiringResult {
  const { rng, employees, industry, location, intensity, policies } = input;
  // 新卒中心では、正社員は年1回の入社月にまとめて、少し先の需要を見込んで採る。
  // 入社月以外は、足りないぶんを中途で少しだけ採る
  const newGradPolicy = policies.hiring === 'new_grad';
  const batchMonth = input.month % MONTHS_PER_YEAR === coef('policy.hiring.new_grad.batch_month');
  const newGradBatch = newGradPolicy && batchMonth;
  const batchMult = newGradPolicy
    ? batchMonth
      ? coef('policy.hiring.new_grad.batch_multiplier')
      : coef('policy.hiring.new_grad.offcycle_ratio')
    : 1;
  const desiredInput = newGradBatch ? { ...input, demand: input.projectedDemand ?? input.demand } : input;
  const policyPartShare = policyEffect('hiring', policies.hiring, 'part_share');
  // 採用のうちパートの割合（-1 は業種・会社のパート比率に従う）
  const partShare = policyPartShare < 0 ? input.partTimeRatio : policyPartShare;
  const desired = desiredOpenings(desiredInput);

  // 1か月に出せる求人の上限
  const cap = Math.max(
    coef('hiring.min_openings'),
    Math.floor(employees.length * coef('hiring.max_openings_ratio')),
  );
  const maxOpenings = Math.round(cap * intensity * batchMult);
  // 報酬が相場より低い会社は、求人が埋まりにくい
  const attraction =
    payAttraction(payCompetitiveness(employees, industry, location, policies)) * (input.reputation ?? 1);

  // 不足の大きい職種から順に、上限まで求人を割り当てる。
  // 店舗のある業種（飲食）だけは店長を先に埋める。店舗スタッフの不足はいつも大きいので、
  // そちらを先にすると店長がいつまでも採れず、店が回らない（ステップ12）
  const openings: Record<RoleId, number> = {};
  const remaining = { ...desired };
  const isSupport = new Map(industry.roles.map((r) => [r.id, !!industry.store && r.kind === 'management']));
  for (let i = 0; i < maxOpenings; i++) {
    let best: RoleId | undefined;
    for (const role of industry.roles) {
      const need = remaining[role.id] ?? 0;
      if (need <= 0) continue;
      const b = best === undefined ? undefined : best;
      const better =
        b === undefined ||
        (isSupport.get(role.id) && !isSupport.get(b)) ||
        (isSupport.get(role.id) === isSupport.get(b) && need > (remaining[b] ?? 0));
      if (better) best = role.id;
    }
    if (best === undefined) break;
    remaining[best] = (remaining[best] ?? 0) - 1;
    openings[best] = (openings[best] ?? 0) + 1;
  }

  const welfare = 1 + coef('labor.legal_welfare_rate');
  let payroll = employees.reduce((s, e) => s + e.salaryMonthly, 0) * welfare;
  let cash = input.cash;
  let cost = 0;
  let nextId = input.nextEmployeeId;
  const hires: Employee[] = [];

  for (const role of industry.roles) {
    for (let i = 0; i < (openings[role.id] ?? 0); i++) {
      // 乱数は求人1件につき決まった回数だけ引く（結果で乱数列がずれないように）
      const partRoll = rng.next();
      const fillRoll = rng.next();
      const employmentType: EmploymentType = partRoll < partShare && role.partTimeAllowed ? 'part' : 'full';
      // 新卒中心でも、入社月以外の正社員は中途で採る
      const channel = newGradPolicy && !batchMonth && employmentType === 'full' ? 'mid_career' : hireChannelFor(policies, employmentType);
      const newGrad = channel === 'new_grad';
      const fillRate = Math.min(
        1,
        (coef('hiring.fill_rate_base') * intensity * fillRateMultiplier(channel, policies) * attraction) /
          (role.hiringDifficulty.value * location.hiringDifficulty.value),
      );
      if (fillRoll >= fillRate) continue;
      const candidate = createEmployee({
        rng,
        id: `e${nextId}`,
        industry,
        location,
        role: role.id,
        employmentType,
        affiliation: 'proper',
        hireChannel: channel,
        age: newGrad
          ? { mean: coef('policy.hiring.new_grad.age_mean'), sd: coef('policy.hiring.new_grad.age_sd') }
          : undefined,
        abilityOffset: newGrad ? coef('policy.hiring.new_grad.ability_offset') : 0,
      });
      // 賞与は次の評価まで「平均的な評価」として決める（業績連動は次の決算までなし）
      candidate.bonusMonthly = bonusMonthlyFor(candidate, {
        policies,
        marketBonusMonths: industry.marketBonusMonths.value,
        percentile: 0.5,
        lastYearProfit: 0,
        totalSalaries: 0,
      });
      // 採用を強めると、1人あたりの採用費も上がる（求人広告・紹介手数料の上乗せ）
      const fee =
        candidate.salaryMonthly *
        policyEffect('hiring', channel, 'fee_salary_months') *
        Math.pow(intensity, coef('hiring.intensity_fee_elasticity'));
      const payrollAfter = payroll + candidate.salaryMonthly * welfare;
      if (cash - fee < payrollAfter * coef('hiring.cash_runway_months')) continue; // 資金が足りないので見送る

      hires.push(candidate);
      nextId++;
      cost += fee;
      cash -= fee;
      payroll = payrollAfter;
    }
  }
  return { hires, cost, openings };
}
