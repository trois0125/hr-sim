/**
 * 採用（§2.1 の2）。ステップ3では「簡単な自動採用」。
 *
 * - 需要に対して売上を生む社員が足りなければ、その職種の求人を出す
 * - 事務・管理は、必要な人数（performance.ts の supportRequirement）に足りなければ求人を出す
 * - 1か月に出せる求人の数には上限がある（採用の強さで増える）
 * - 求人が埋まるかどうかは、職種と地域の採用難度で決まる
 * - 採用しても人件費の数か月分の資金が残るときだけ採用する
 *
 * 採用方針（新卒／中途／パート中心）による違いはステップ5、
 * 採用を強化しないといけないイベントはステップ8で足す。そのために「採用の強さ」を持つ。
 */
import { coef } from './coefficients';
import { createEmployee } from './employees';
import { fte, nominalOutputPerRevenueStaff, supportRequirement } from './performance';
import type { Rng } from './rng';
import type { Employee, IndustryData, IndustryVariant, LocationData, RoleId } from './types';

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
};

export type HiringResult = {
  hires: Employee[];
  /** 採用費の合計（円） */
  cost: number;
  /** 出した求人の数（職種ごと） */
  openings: Record<RoleId, number>;
};

/** 職種ごとに「あと何人ほしいか」 */
export function desiredOpenings(
  input: Pick<HiringInput, 'employees' | 'industry' | 'variant' | 'demand' | 'capacity'>,
): Record<RoleId, number> {
  const { employees, industry, variant, demand, capacity } = input;
  const out: Record<RoleId, number> = {};
  const fteByRole = new Map<RoleId, number>();
  for (const e of employees) fteByRole.set(e.role, (fteByRole.get(e.role) ?? 0) + fte(e));

  // 売上を生む職種：需要に足りないぶんを、その職種1人あたりの売上で割る
  const revenueRoles = industry.roles.filter((r) => r.kind === 'revenue');
  const shortage = Math.max(0, demand - capacity);
  let revenueFteAfter = 0;
  for (const role of revenueRoles) {
    const share = 1 / revenueRoles.length;
    const need = Math.floor((shortage * share) / nominalOutputPerRevenueStaff(industry, variant, role.id));
    out[role.id] = need;
    revenueFteAfter += (fteByRole.get(role.id) ?? 0) + need;
  }

  // 事務・管理：採用後の人数に対して必要な人数に足りないぶん
  const headcountAfter = employees.length + Object.values(out).reduce((s, n) => s + n, 0);
  const required = supportRequirement(industry, revenueFteAfter, headcountAfter);
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
  const { rng, employees, industry, location, intensity } = input;
  const desired = desiredOpenings(input);

  // 1か月に出せる求人の上限
  const cap = Math.max(
    coef('hiring.min_openings'),
    Math.floor(employees.length * coef('hiring.max_openings_ratio')),
  );
  const maxOpenings = Math.round(cap * intensity);

  // 不足の大きい職種から順に、上限まで求人を割り当てる
  const openings: Record<RoleId, number> = {};
  const remaining = { ...desired };
  for (let i = 0; i < maxOpenings; i++) {
    let best: RoleId | undefined;
    for (const role of industry.roles) {
      if ((remaining[role.id] ?? 0) > 0 && (best === undefined || (remaining[role.id] ?? 0) > (remaining[best] ?? 0))) {
        best = role.id;
      }
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
      const fillRate = Math.min(
        1,
        (coef('hiring.fill_rate_base') * intensity) /
          (role.hiringDifficulty.value * location.hiringDifficulty.value),
      );
      // 応募があったかどうかは、資金の判定より先に抽選する（資金の有無で乱数列がずれないように）
      if (!rng.chance(fillRate)) continue;

      const candidate = createEmployee({
        rng,
        id: `e${nextId}`,
        industry,
        location,
        role: role.id,
        employmentType: rng.chance(input.partTimeRatio) && role.kind !== 'management' ? 'part' : 'full',
        affiliation: 'proper',
      });
      const fee = candidate.salaryMonthly * coef('hiring.cost_salary_months');
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
