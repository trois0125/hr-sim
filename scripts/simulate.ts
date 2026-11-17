// UIなしでシミュレーションを回すスクリプト。
// ステップ3の時点では、1社を生成して終了条件まで回し、年ごとの数字を表示する（大量に回す集計はステップ6）。
//   npx tsx scripts/simulate.ts --seed 42
//   npx tsx scripts/simulate.ts --industry trading --founding subsidiary --seed 7
//   npx tsx scripts/simulate.ts --seed 7 --employees      （創業時の社員の一覧も出す）
import { getFoundingPattern, getIndustry, getLocation } from '../src/engine/data';
import { generateCompany } from '../src/engine/generate';
import { runToEnd } from '../src/engine/tick';
import { MONTHS_PER_YEAR, type FoundingPatternId, type IndustryId } from '../src/engine/types';

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

const end = runToEnd(c);
const statusName = { running: '進行中', matured: '成熟', timeout: '25年経過', bankrupt: '倒産' }[end.status];
console.log(`\n結果：${statusName}（${Math.floor(end.month / MONTHS_PER_YEAR)}年${end.month % MONTHS_PER_YEAR}か月）　金額は万円`);
console.log('  年  社員  採用     売上     粗利   人件費  人件費率  営業利益   手元資金  残業h   景気');
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
      man(revenue).padStart(8),
      man(sum((r) => r.grossProfit)).padStart(8),
      man(labor).padStart(8),
      (revenue > 0 ? pct(labor / revenue) : '-').padStart(9),
      man(sum((r) => r.operatingProfit)).padStart(9),
      man(last.cash).padStart(10),
      (sum((r) => r.overtimeHours) / rows.length).toFixed(0).padStart(6),
      (sum((r) => r.economy) / rows.length).toFixed(2).padStart(6),
    ].join(' '),
  );
}
