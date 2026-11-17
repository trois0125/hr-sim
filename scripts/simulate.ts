// UIなしでシミュレーションを回すスクリプト。
//
// 1社を詳しく見る：
//   npx tsx scripts/simulate.ts --seed 42
//   npx tsx scripts/simulate.ts --industry trading --founding subsidiary --seed 7 --employees
//   npx tsx scripts/simulate.ts --seed 7 --policy pay=performance,bonus=individual_linked --months 60 --detail
//
// 大量に回してバランスを見る（結果は out/ に CSV と要約の Markdown を書く）：
//   npx tsx scripts/simulate.ts --industry trading --runs 1000
//     制度の組み合わせとシードを抽選して回す（--base-seed で抽選のシードを変えられる）
//   npx tsx scripts/simulate.ts --industry trading --runs 100 --mode oat
//     標準の制度から1カテゴリだけ変えた組み合わせを、それぞれ同じ100社で回す
import { mkdirSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { defaultPolicies, getFoundingPattern, getIndustry, getLocation } from '../src/engine/data';
import { generateCompany, setFoundingPolicies } from '../src/engine/generate';
import { createRng } from '../src/engine/rng';
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
import { summarize, summarizeOneAtATime, toCsv } from './lib/analyze';
import { makeJobs, policyOptions, type Job, type JobResult } from './lib/batch';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);


// ---------------------------------------------------------------------------
// 大量に回す
// ---------------------------------------------------------------------------

/** ワーカーに分けて並列に回す */
async function runParallel(jobs: Job[]): Promise<JobResult[]> {
  const workers = Math.max(1, Math.min(Number(arg('workers') ?? availableParallelism()), jobs.length));
  const chunks: Job[][] = Array.from({ length: workers }, () => []);
  jobs.forEach((j, i) => chunks[i % workers]?.push(j));
  const results: JobResult[] = [];
  let done = 0;
  const started = Date.now();
  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL('./lib/worker.ts', import.meta.url), {
            workerData: chunk,
            execArgv: ['--import', 'tsx'],
          });
          w.on('message', (m: { type: string; result?: JobResult }) => {
            if (m.type === 'result' && m.result) {
              results.push(m.result);
              done++;
              if (done % 100 === 0) process.stderr.write(`  ${done}/${jobs.length} 社（${((Date.now() - started) / 1000).toFixed(0)}秒）\n`);
            } else if (m.type === 'done') {
              void w.terminate();
              resolve();
            }
          });
          w.on('error', reject);
        }),
    ),
  );
  return results.sort((a, b) => a.job.run - b.job.run);
}

async function batch(): Promise<void> {
  const industryId = (arg('industry') ?? 'trading') as IndustryId;
  const runs = Number(arg('runs'));
  const mode = arg('mode') ?? 'random';
  const baseSeed = Number(arg('base-seed') ?? 1);
  const industry = getIndustry(industryId);

  let jobs: Job[];
  if (mode === 'oat') {
    // 同じ会社（シード）を、標準の制度と「1カテゴリだけ変えた制度」で回す
    const rng = createRng(baseSeed);
    const seeds = Array.from({ length: runs }, () => rng.int(1, 2 ** 31 - 1));
    const variants: PolicySet[] = [{ ...defaultPolicies }];
    const opts = policyOptions(industry);
    for (const key of Object.keys(opts) as (keyof PolicySet)[]) {
      for (const o of opts[key] as readonly string[]) {
        if (o !== defaultPolicies[key]) variants.push({ ...defaultPolicies, [key]: o } as PolicySet);
      }
    }
    jobs = variants.flatMap((policies, v) =>
      seeds.map((seed, i) => ({ run: v * runs + i, seed, industryId, policies })),
    );
  } else {
    jobs = makeJobs(industryId, runs, baseSeed);
  }

  process.stderr.write(`${industry.name}：${jobs.length}社を回します（モード：${mode}）\n`);
  const t0 = Date.now();
  const results = await runParallel(jobs);
  const seconds = (Date.now() - t0) / 1000;

  mkdirSync('out', { recursive: true });
  const base = `out/simulate-${industryId}-${mode}-${runs}`;
  writeFileSync(`${base}.csv`, toCsv(results));
  const label = mode === 'oat' ? `標準から1カテゴリだけ変更、各${runs}社` : `制度の組み合わせを抽選、${runs}社`;
  const md =
    (mode === 'oat' ? summarizeOneAtATime(results, industryId, runs) : summarize(results, industryId, label)) +
    `\n---\n実行時間：${seconds.toFixed(0)}秒（抽選のシード ${baseSeed}）\n`;
  writeFileSync(`${base}.md`, md);
  console.log(md);
  process.stderr.write(`書き出し：${base}.csv / ${base}.md\n`);
}

// ---------------------------------------------------------------------------
// 1社を詳しく見る
// ---------------------------------------------------------------------------

function single(): void {
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
  setFoundingPolicies(c, c.policies);
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

}

if (arg('runs')) {
  await batch();
} else {
  single();
}
