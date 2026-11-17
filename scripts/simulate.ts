// UIなしでシミュレーションを回すスクリプト。
// ステップ3の時点では、1社を生成して終了条件まで回し、年ごとの数字を表示する（大量に回す集計はステップ6）。
//   npx tsx scripts/simulate.ts --seed 42
//   npx tsx scripts/simulate.ts --industry trading --founding subsidiary --seed 7
//   npx tsx scripts/simulate.ts --seed 7 --employees      （創業時の社員の一覧も出す）
//   npx tsx scripts/simulate.ts --seed 7 --overtime special （残業の方針：none / limit20 / limit45 / special）
//   npx tsx scripts/simulate.ts --seed 7 --policy pay=performance,bonus=individual_linked,evaluation=mbo
//   npx tsx scripts/simulate.ts --seed 7 --months 60 --detail （60か月で止め、在籍者の納得感の内訳を出す）
import { getFoundingPattern, getIndustry, getLocation } from '../src/engine/data';
import { generateCompany } from '../src/engine/generate';
import { validatePolicies } from '../src/engine/policies';
import { runToEnd } from '../src/engine/tick';
import {
  ENGAGEMENT_FACTORS,
  MONTHS_PER_YEAR,
  type AttritionReason,
  type EngagementFactor,
  type FoundingPatternId,
  type IndustryId,
  type OvertimePolicy,
  type PolicySet,
} from '../src/engine/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const seed = Number(arg('seed') ?? 1);
const c = generateCompany({
  seed,
  industryId: arg('industry') as IndustryId | undefined,
  foundingPatternId: arg('founding') as FoundingPatternId | undefined,
  locationId: arg('location'),
});
const overtime = arg('overtime') as OvertimePolicy | undefined;
if (overtime) c.policies.overtime = overtime;
for (const pair of (arg('policy') ?? '').split(',').filter(Boolean)) {
  const [key, value] = pair.split('=');
  if (!key || !value || !(key in c.policies)) throw new Error(`--policy の指定が不正です: ${pair}`);
  (c.policies as Record<string, string>)[key] = value;
}
validatePolicies(c.policies as PolicySet, getIndustry(c.profile.industryId));
const p = c.profile;
const industry = getIndustry(p.industryId);
const variant = industry.variants.find((v) => v.id === p.variantId);
const roleName = (id: string) => industry.roles.find((r) => r.id === id)?.name ?? id;
const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const man = (n: number) => `${Math.round(n / 1e4).toLocaleString('ja-JP')}`; // 万円
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`シード ${seed}`);
console.log(`${p.name}（${industry.name}／${variant?.name}）`);
console.log(`  創業：${getFoundingPattern(p.foundingPatternId).name}　社長：${p.founderName}　所在地：${getLocation(p.locationId).name}`);
console.log(`  創業資金：${yen(p.initialCash)}　粗利率：${pct(p.grossMargin)}　景気感応度：${p.cyclicality.toFixed(2)}　市場の成長性：${p.marketPotential.toFixed(2)}`);
console.log(`  職種構成：${Object.entries(p.roleMix).map(([r, s]) => `${roleName(r)} ${pct(s)}`).join('、')}`);
if (p.stableDemandShare > 0) console.log(`  底堅い需要（親会社向け・既存顧客）の割合：${pct(p.stableDemandShare)}`);
console.log(`  創業時の社員 ${c.employees.length}人`);
if (flag('employees')) {
  for (const e of c.employees) {
    const tags = [e.isKeyPerson ? '主要' : '', e.affiliation === 'secondee' ? '出向' : '', e.employmentType === 'part' ? 'パート' : '']
      .filter(Boolean)
      .join('・');
    console.log(
      `    ${e.id.padEnd(4)} ${e.name}（${e.age}歳・${e.gender}）${roleName(e.role)} 月給${yen(e.salaryMonthly)} 実力${e.ability.toFixed(0)} 納得感${e.engagement.toFixed(0)}${tags ? ` [${tags}]` : ''}`,
    );
  }
}

const end = runToEnd(c, arg('months') ? Number(arg('months')) : Infinity);
const statusName = { running: '進行中', matured: '成熟', timeout: '25年経過', bankrupt: '倒産' }[end.status];
console.log(`\n制度：${Object.entries(end.policies).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`結果：${statusName}（${Math.floor(end.month / MONTHS_PER_YEAR)}年${end.month % MONTHS_PER_YEAR}か月）　金額は万円`);
console.log('  年  社員  採用  退職  離職率     売上   人件費  人件費率  営業利益   手元資金  残業h  納得感   景気');
for (let y = 0; y * MONTHS_PER_YEAR < end.history.length; y++) {
  const rows = end.history.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const last = rows[rows.length - 1];
  if (!last) continue;
  const revenue = sum((r) => r.revenue);
  const labor = sum((r) => r.labor.total);
  console.log(
    [
      String(y + 1).padStart(4),
      String(last.headcount).padStart(5),
      String(sum((r) => r.hires)).padStart(5),
      String(sum((r) => r.resignations)).padStart(5),
      pct(sum((r) => r.resignations) / (sum((r) => r.headcount) / rows.length || 1)).padStart(7),
      man(revenue).padStart(8),
      man(labor).padStart(8),
      (revenue > 0 ? pct(labor / revenue) : '-').padStart(9),
      man(sum((r) => r.operatingProfit)).padStart(9),
      man(last.cash).padStart(10),
      (sum((r) => r.overtimeHours) / rows.length).toFixed(0).padStart(6),
      (sum((r) => r.avgEngagement) / rows.length).toFixed(1).padStart(7),
      (sum((r) => r.economy) / rows.length).toFixed(2).padStart(6),
    ].join(' '),
  );
}

// 退職理由の内訳
const reasonName: Record<AttritionReason, string> = {
  pay: '給与',
  evaluation: '評価',
  workload: '負荷',
  growth: '成長',
  outlook: '会社の将来',
  relationships: '人間関係',
  family: '家庭の事情',
};
const resignations = end.departures.filter((d) => d.kind === 'resignation');
const counts = new Map<AttritionReason, number>();
for (const d of resignations) if (d.reason) counts.set(d.reason, (counts.get(d.reason) ?? 0) + 1);
console.log(`\n退職 ${resignations.length}人の理由：` +
  [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${reasonName[r]} ${pct(n / resignations.length)}`).join('、'));
const returns = end.departures.filter((d) => d.kind === 'return').length;
if (returns > 0) console.log(`出向者の帰任 ${returns}人（離職率には数えない）`);

// 在籍者の納得感の内訳（低い順に10人）
if (flag('detail')) {
  const factorName: Record<EngagementFactor, string> = {
    externalPay: '社外比較',
    internalFairness: '社内公平',
    evaluation: '評価',
    workload: '負荷',
    growthOpportunity: '成長',
    stability: '安定',
  };
  console.log('\n在籍者の納得感の内訳（納得感の低い順に10人。各要因は0〜100で50が中立）');
  console.log('  社員   納得感  ' + ENGAGEMENT_FACTORS.map((f) => factorName[f].padStart(5)).join(' ') + '   価値観（お金/成長/安定/両立）');
  for (const e of [...end.employees].sort((a, b) => a.engagement - b.engagement).slice(0, 10)) {
    const s = e.factorScores;
    const v = e.values;
    console.log(
      `  ${e.id.padEnd(6)} ${e.engagement.toFixed(0).padStart(5)}  ` +
        ENGAGEMENT_FACTORS.map((f) => (s ? s[f].toFixed(0) : '-').padStart(6)).join(' ') +
        `   ${[v.money, v.growth, v.stability, v.balance].map((x) => x.toFixed(2)).join('/')}　${e.name}（${roleName(e.role)}・残業${e.overtimeHours.toFixed(0)}h）`,
    );
  }
}
