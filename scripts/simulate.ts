// UIなしでシミュレーションを回すスクリプト。
// ステップ2の時点では、会社を生成して中身を表示するだけ（ティック処理はステップ3、集計はステップ6）。
//   npx tsx scripts/simulate.ts --seed 42
//   npx tsx scripts/simulate.ts --industry trading --founding subsidiary --seed 7
import { getFoundingPattern, getIndustry, getLocation } from '../src/engine/data';
import { generateCompany } from '../src/engine/generate';
import type { FoundingPatternId, IndustryId } from '../src/engine/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`シード ${seed}`);
console.log(`${p.name}（${industry.name}／${variant?.name}）`);
console.log(`  創業：${getFoundingPattern(p.foundingPatternId).name}　社長：${p.founderName}　所在地：${getLocation(p.locationId).name}`);
console.log(`  創業資金：${yen(p.initialCash)}　粗利率：${pct(p.grossMargin)}　景気感応度：${p.cyclicality.toFixed(2)}`);
console.log(`  職種構成：${Object.entries(p.roleMix).map(([r, s]) => `${roleName(r)} ${pct(s)}`).join('、')}`);
if (p.parentRevenueShare > 0) console.log(`  親会社向け売上の割合：${pct(p.parentRevenueShare)}`);
console.log(`  社員 ${c.employees.length}人`);
for (const e of c.employees) {
  const tags = [e.isKeyPerson ? '主要' : '', e.affiliation === 'secondee' ? '出向' : '', e.employmentType === 'part' ? 'パート' : '']
    .filter(Boolean)
    .join('・');
  console.log(
    `    ${e.id.padEnd(4)} ${e.name}（${e.age}歳・${e.gender}）${roleName(e.role)} 月給${yen(e.salaryMonthly)} 実力${e.ability.toFixed(0)} 納得感${e.engagement.toFixed(0)}${tags ? ` [${tags}]` : ''}`,
  );
}
