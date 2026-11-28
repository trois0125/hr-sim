/**
 * 中級の層（DESIGN.md §15.4）。ステップ20。
 *
 * - 社員の一覧を層にまとめる（toLayers）、新しく入った人を層に合流させる（mergeInto）
 * - 計算のために、層を「代表者×人数」の一覧に広げる（expand。同じオブジェクトを並べるだけなので軽い）
 * - 年に1回：年代を上げる（5歳刻みなので、毎年 1/5 の人が次の年代へ移る）、定年、出向者の帰任
 *
 * 制度が変わったときの層の組み直し（対応表をプレイヤーが決める）はステップ21以降。
 */
import { coef } from '../coefficients';
import { ageSalaryFactor } from '../employees';
import type { Rng } from '../rng';
import type { Employee, IndustryData, Values } from '../types';
import { MONTHS_PER_YEAR } from '../types';
import type { IntermediateLayer } from './types';

/** 年代の幅（歳） */
export function bandWidth(): number {
  return coef('intermediate.layer.age_band_years');
}

/** 年代の下限（例：幅5なら 20〜24歳は20） */
export function ageBandOf(age: number): number {
  const w = bandWidth();
  return Math.floor(age / w) * w;
}

/** 年代の代表の年齢（真ん中。整数） */
export function bandRepresentativeAge(band: number): number {
  return band + Math.floor(bandWidth() / 2);
}

export function layerKey(e: Pick<Employee, 'role' | 'employmentType' | 'affiliation' | 'grade' | 'age'>): string {
  return `${e.role}|${e.employmentType}|${e.affiliation}|${e.grade}|${ageBandOf(e.age)}`;
}

/** 人数で重み付けした平均 */
function wavg(a: number, na: number, b: number, nb: number): number {
  return na + nb > 0 ? (a * na + b * nb) / (na + nb) : a;
}

const NUMERIC_FIELDS = [
  'salaryMonthly',
  'bonusMonthly',
  'ability',
  'perceivedPerformance',
  'engagement',
  'tenureMonths',
  'overtimeHours',
] as const;

/** 層 a に、代表者 b の人を nb 人合流させる（a を書き換える） */
function absorb(a: IntermediateLayer, b: Employee, nb: number): void {
  const na = a.headcount;
  const rep = a.rep;
  const salaryA = rep.salaryMonthly;
  for (const f of NUMERIC_FIELDS) rep[f] = wavg(rep[f], na, b[f], nb);
  const values = { ...rep.values };
  for (const k of Object.keys(values) as (keyof Values)[]) values[k] = wavg(rep.values[k], na, b.values[k], nb);
  rep.values = values;
  rep.factorScores = null;
  // 給与を段階的に下げている途中なら、残りの引き下げ額と1か月の引き下げ額を人数で平均する
  const remaining = (e: Employee, salaryBefore: number) => (e.salaryTransition ? Math.max(0, salaryBefore - e.salaryTransition.target) : 0);
  const remA = remaining(rep, salaryA);
  const remB = remaining(b, b.salaryMonthly);
  const step = wavg(rep.salaryTransition?.stepPerMonth ?? 0, na, b.salaryTransition?.stepPerMonth ?? 0, nb);
  const rem = wavg(remA, na, remB, nb);
  rep.salaryTransition = rem > 0 && step > 0 ? { target: rep.salaryMonthly - rem, stepPerMonth: step } : null;
  a.headcount = na + nb;
}

/** 代表者を新しく作る（層の人の属性を写し、年齢を年代の真ん中にする） */
function newLayer(key: string, e: Employee, n: number): IntermediateLayer {
  const age = bandRepresentativeAge(ageBandOf(e.age));
  const rep: Employee = {
    ...e,
    id: `L:${key}`,
    name: key,
    age,
    isKeyPerson: false,
    salaryTransition: e.salaryTransition ? { ...e.salaryTransition } : null,
    secondmentEndsAt: null,
    leave: null,
    values: { ...e.values },
    factorScores: e.factorScores ? { ...e.factorScores } : null,
  };
  return { key, headcount: n, rep };
}

/** 新しく入った人（一人ひとり）を層に合流させる（layers を書き換える） */
export function mergeInto(layers: IntermediateLayer[], employees: readonly Employee[]): void {
  const byKey = new Map(layers.map((l) => [l.key, l]));
  for (const e of employees) {
    const key = layerKey(e);
    const layer = byKey.get(key);
    if (layer) absorb(layer, e, 1);
    else {
      const created = newLayer(key, e, 1);
      layers.push(created);
      byKey.set(key, created);
    }
  }
}

/** 社員の一覧を層にまとめる */
export function toLayers(employees: readonly Employee[]): IntermediateLayer[] {
  const layers: IntermediateLayer[] = [];
  mergeInto(layers, employees);
  return layers;
}

/** 計算用に「代表者×人数」の一覧に広げる */
export function expand(layers: readonly IntermediateLayer[]): Employee[] {
  const out: Employee[] = [];
  for (const l of layers) for (let i = 0; i < l.headcount; i++) out.push(l.rep);
  return out;
}

export function totalHeadcount(layers: readonly IntermediateLayer[]): number {
  return layers.reduce((s, l) => s + l.headcount, 0);
}

/** n 人のうち確率 p で当たる人数 */
export function binomial(n: number, p: number, rng: Rng): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.chance(p)) k++;
  return k;
}

/** 空になった層を取り除く */
export function pruneEmpty(layers: IntermediateLayer[]): IntermediateLayer[] {
  return layers.filter((l) => l.headcount > 0);
}

/**
 * 1年ぶん年をとらせる（layers を書き換え、定年で辞めた人数を返す）。
 * - 全員の勤続が1年のびる
 * - 年代の幅が w 歳なので、毎年およそ 1/w の人が次の年代へ移る。移った人の給与は相場の年齢カーブに沿って上げ下げする
 * - 次の年代が定年（retirement.age）以上になる人は退職する
 */
export function ageLayers(
  layers: IntermediateLayer[],
  industry: IndustryData,
  rng: Rng,
  /** 定年の年齢（追体験では時代ごとに変わる。省略すると係数台帳の retirement.age） */
  retireAge: number = coef('retirement.age'),
): { layers: IntermediateLayer[]; retirees: number; retired: Employee[] } {
  const w = bandWidth();
  const movers: { from: IntermediateLayer; n: number }[] = [];
  for (const l of layers) {
    l.rep.tenureMonths += MONTHS_PER_YEAR;
    const n = binomial(l.headcount, 1 / w, rng);
    if (n > 0) movers.push({ from: l, n });
  }
  let retirees = 0;
  const retired: Employee[] = [];
  const moved: Employee[] = [];
  for (const { from, n } of movers) {
    from.headcount -= n;
    const nextBand = ageBandOf(from.rep.age) + w;
    if (nextBand >= retireAge && from.rep.affiliation === 'proper') {
      retirees += n;
      const person: Employee = { ...from.rep, age: retireAge };
      for (let i = 0; i < n; i++) retired.push(person);
      continue;
    }
    const age = bandRepresentativeAge(nextBand);
    const ratio = ageSalaryFactor(age, industry) / ageSalaryFactor(from.rep.age, industry);
    const person: Employee = { ...from.rep, age, salaryMonthly: from.rep.salaryMonthly * ratio };
    for (let i = 0; i < n; i++) moved.push(person);
  }
  const kept = pruneEmpty(layers);
  mergeInto(kept, moved);
  return { layers: kept, retirees, retired };
}

/** 出向者が親会社に戻る年の確率（任期の平均の逆数） */
export function secondmentReturnRate(): number {
  const mean = (coef('secondment.term_months_min') + coef('secondment.term_months_max')) / 2;
  return Math.min(1, MONTHS_PER_YEAR / mean);
}
