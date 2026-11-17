/**
 * 会社の生成（§3、§3.4）。乱数は generation 系列だけを使う。
 */
import { coef } from './coefficients';
import {
  availableIndustries,
  defaultPolicies,
  foundingPatterns,
  getFoundingPattern,
  getIndustry,
  getLocation,
  locations,
  names,
} from './data';
import { createEmployee, sampleGender, sampleName } from './employees';
import { createStreams, getStreamsState, type Rng } from './rng';
import type {
  Affiliation,
  CompanyProfile,
  CompanyState,
  Employee,
  EmploymentType,
  FoundingPatternId,
  IndustryId,
  Range,
  RoleId,
} from './types';

export type GenerateOptions = {
  seed: number;
  /** 指定しなければおまかせ（重み付き抽選） */
  industryId?: IndustryId;
  foundingPatternId?: FoundingPatternId;
  locationId?: string;
};

const sampleRange = (rng: Rng, r: Range) => rng.range(r.min, r.max);
const sampleIntRange = (rng: Rng, r: Range) => rng.int(Math.round(r.min), Math.round(r.max));

/** 構成比に従って n 人の職種を割り振る（最大剰余法。人数が少なくても比率の大きい職種から埋まる） */
export function allocateRoles(n: number, mix: Record<RoleId, number>): RoleId[] {
  const entries = Object.entries(mix);
  const quotas = entries.map(([role, share]) => ({ role, exact: share * n }));
  const counts = new Map(quotas.map((q) => [q.role, Math.floor(q.exact)]));
  let remaining = n - [...counts.values()].reduce((s, c) => s + c, 0);
  const byRemainder = [...quotas].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || b.exact - a.exact,
  );
  for (const q of byRemainder) {
    if (remaining <= 0) break;
    counts.set(q.role, (counts.get(q.role) ?? 0) + 1);
    remaining--;
  }
  const out: RoleId[] = [];
  for (const [role] of entries) for (let i = 0; i < (counts.get(role) ?? 0); i++) out.push(role);
  return out;
}

export function generateCompany(options: GenerateOptions): CompanyState {
  const streams = createStreams(options.seed);
  const rng = streams.generation;

  // 業種・中の要素・創業パターン・所在地。
  // 指定があっても必ず一度抽選してから上書きする（指定の有無で以降の乱数列がずれないように）
  const industryList = availableIndustries();
  const drawnIndustry = rng.weightedPick(industryList, industryList.map((d) => d.selectionWeight.value));
  const industry = options.industryId ? getIndustry(options.industryId) : drawnIndustry;
  const variant = rng.pick(industry.variants);
  const drawnFounding = rng.weightedPick(foundingPatterns, foundingPatterns.map((f) => f.selectionWeight.value));
  const founding = options.foundingPatternId ? getFoundingPattern(options.foundingPatternId) : drawnFounding;
  const drawnLocation = rng.weightedPick(locations, locations.map((l) => l.selectionWeight.value));
  const location = options.locationId ? getLocation(options.locationId) : drawnLocation;

  const grossMargin = sampleRange(rng, variant.grossMarginRange.value);
  const cyclicality = sampleRange(rng, variant.cyclicalityRange.value);
  const partTimeRatio = sampleRange(rng, industry.partTimeRatioRange.value);

  const rawMix = industry.roles.map((r) => [r.id, sampleRange(rng, r.mixWeightRange.value)] as const);
  const mixTotal = rawMix.reduce((s, [, w]) => s + w, 0);
  const roleMix: Record<RoleId, number> = Object.fromEntries(rawMix.map(([id, w]) => [id, w / mixTotal]));

  const cashUnit = coef('generation.cash.rounding_unit');
  const initialCash = Math.round(sampleRange(rng, founding.initialCashRange.value) / cashUnit) * cashUnit;
  const parentRevenueShare = sampleRange(rng, founding.parentRevenueShareRange.value);

  // 社員の人数と内訳
  const headcount = sampleIntRange(rng, founding.headcountRange.value);
  const roles = rng.shuffle(allocateRoles(headcount, roleMix));
  const secondeeCount = Math.round(headcount * sampleRange(rng, founding.secondeeShareRange.value));
  const keyCount = Math.min(headcount, sampleIntRange(rng, founding.keyPersonCountRange.value));
  // パートは主要人物と出向者の枠を除いた人数まで（創業メンバーはパートにしない）
  const partCount = Math.max(
    0,
    Math.min(Math.round(headcount * partTimeRatio), headcount - secondeeCount - keyCount),
  );

  const employees: Employee[] = roles.map((role, i) => {
    const affiliation: Affiliation = i < secondeeCount ? 'secondee' : 'proper';
    const employmentType: EmploymentType =
      i >= headcount - partCount && affiliation === 'proper' ? 'part' : 'full';
    return createEmployee({
      rng,
      id: `e${i + 1}`,
      industry,
      location,
      role,
      employmentType,
      affiliation,
      ageShift: founding.ageShift.value,
      tenureMonths: sampleIntRange(rng, founding.inheritedTenureRange.value),
      engagementBonus: founding.engagementBonus.value,
    });
  });

  // 主要人物：フルタイムの中から能力の高い順
  const eligible = employees
    .filter((e) => e.employmentType === 'full')
    .sort((a, b) => b.ability - a.ability)
    .slice(0, keyCount);
  for (const e of eligible) e.isKeyPerson = true;

  const profile: CompanyProfile = {
    name: `${rng.pick(names.companyStems)}${rng.pick(industry.companyNameSuffixes)}`,
    founderName: sampleName(rng, sampleGender(rng)),
    locationId: location.id,
    industryId: industry.id,
    variantId: variant.id,
    foundingPatternId: founding.id,
    grossMargin,
    cyclicality,
    partTimeRatio,
    roleMix,
    parentRevenueShare,
    legalObligationsAtStart: founding.legalObligationsAtStart,
    initialCash,
  };

  return {
    seed: options.seed,
    month: 0,
    profile,
    policies: { ...defaultPolicies },
    cash: initialCash,
    employees,
    nextEmployeeId: headcount + 1,
    rng: getStreamsState(streams),
  };
}
