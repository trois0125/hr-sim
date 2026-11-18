/**
 * 大量シミュレーションの結果を集計する（CSV と、Markdown の要約）。
 */
import referencesJson from '../../src/data/references.json';
import { getIndustry } from '../../src/engine/data';
import type { PeriodMetrics } from '../../src/engine/summary';
import { eventDefs } from '../../src/engine/eventData';
import { ATTRITION_REASONS, JUDGMENT_AXES, type IndustryId, type JudgmentAxis, type PolicySet } from '../../src/engine/types';
import { policyOptions, type JobResult } from './batch';

type Sourced = { value: number; source: string; basis: string };
const refs = referencesJson as unknown as {
  industries: Record<string, { attritionRate: Sourced; laborCostRatio: Sourced; overtimeHours: Sourced }>;
  attritionReasons: { value: Record<string, number>; source: string };
};

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const num = (x: number, d = 1) => x.toFixed(d);

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * (pos - lo);
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const POLICY_KEYS: (keyof PolicySet)[] = [
  'grade',
  'evaluation',
  'pay',
  'bonus',
  'hiring',
  'workHours',
  'training',
  'workStyle',
  'overtime',
];
const METRICS: (keyof PeriodMetrics)[] = [
  'attritionRate',
  'laborCostRatio',
  'operatingMargin',
  'engagement',
  'overtimeHours',
  'demandCoverage',
  'endHeadcount',
  'totalNetProfit',
  'totalExtraordinaryCost',
  'violationMonths',
];

export function toCsv(results: JobResult[]): string {
  const head = [
    'run',
    'seed',
    'founding',
    'location',
    'variant',
    ...POLICY_KEYS,
    'legal',
    ...JUDGMENT_AXES.map((a) => `style_${a}`),
    'status',
    'months',
    'finalHeadcount',
    'totalHires',
    ...METRICS.map((m) => `all_${m}`),
    ...METRICS.map((m) => `early_${m}`),
    ...METRICS.map((m) => `late_${m}`),
    ...ATTRITION_REASONS.map((r) => `reason_${r}`),
    'events',
    'leaves',
    'change_month',
    'change_category',
    'change_option',
    'change_method',
    'change_transition',
    'dispute_seeds',
  ];
  const rows = results.map((r) => {
    const s = r.summary;
    const period = (p: PeriodMetrics | null) => METRICS.map((m) => (p ? String(p[m]) : ''));
    return [
      r.job.run,
      r.job.seed,
      r.foundingPatternId,
      r.locationId,
      r.variantId,
      ...POLICY_KEYS.map((k) => r.job.policies[k]),
      r.job.legal,
      ...JUDGMENT_AXES.map((a) => (r.job.style ? r.job.style[a].toFixed(3) : '')),
      s.status,
      s.months,
      s.finalHeadcount,
      s.totalHires,
      ...period(s.all),
      ...period(s.early),
      ...period(s.late),
      ...ATTRITION_REASONS.map((x) => String(s.reasons[x])),
      s.events,
      s.leaves,
      r.job.change?.month ?? '',
      r.job.change?.category ?? '',
      r.job.change?.option ?? '',
      r.job.change?.method ?? '',
      r.job.change ? String(r.job.change.transition) : '',
      s.disputeSeeds,
    ].join(',');
  });
  return [head.join(','), ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// 要約
// ---------------------------------------------------------------------------

type Stage = 'early' | 'late';
const STAGE_NAME: Record<Stage, string> = { early: '創業期（1〜5年目）', late: '成熟期（11年目以降）' };

/** 制度の選択肢ごとの平均（その選択肢を選んだ会社だけで集計） */
function marginal(results: JobResult[], key: keyof PolicySet, option: string, stage: Stage) {
  const rs = results.filter((r) => r.job.policies[key] === option);
  const ps = rs.map((r) => r.summary[stage]).filter((p): p is PeriodMetrics => p !== null);
  return {
    n: ps.length,
    margin: mean(ps.map((p) => p.operatingMargin)),
    /** 期間の利益（営業利益−臨時の支出）の合計の平均（億円）。期間中に倒産した会社は、倒産までの合計 */
    profit: mean(ps.map((p) => p.totalNetProfit)) / 1e8,
    engagement: mean(ps.map((p) => p.engagement)),
    attrition: mean(ps.map((p) => p.attritionRate)),
    survival: rs.length ? rs.filter((r) => r.summary.status !== 'bankrupt').length / rs.length : NaN,
  };
}

export function summarize(results: JobResult[], industryId: IndustryId, label: string): string {
  const industry = getIndustry(industryId);
  const ref = refs.industries[industryId];
  const out: string[] = [];
  const all = results.map((r) => r.summary.all);
  /** 制度の選択肢ごとの集計は、途中で制度を変えなかった会社だけで行う */
  const fixed = results.filter((r) => !r.job.change);

  out.push(`# シミュレーション結果：${industry.name}（${label}）`, '');
  out.push(`- 会社の数：${results.length}`);
  const status = new Map<string, number>();
  for (const r of results) status.set(r.summary.status, (status.get(r.summary.status) ?? 0) + 1);
  const statusName: Record<string, string> = { matured: '成熟', timeout: '25年経過', bankrupt: '倒産', running: '進行中' };
  out.push(
    `- 終わり方：${[...status.entries()].map(([k, v]) => `${statusName[k] ?? k} ${v}社（${pct(v / results.length)}）`).join('、')}`,
  );
  out.push(`- 平均の期間：${num(mean(results.map((r) => r.summary.months)) / 12)}年`, '');

  // 分布と統計の比較
  out.push('## 分布（会社ごとの全期間の値）と統計との比較', '');
  out.push('| 指標 | 10% | 中央値 | 90% | 参照値 | 中央値と参照値の差 | 参照値の根拠 |', '|---|---|---|---|---|---|---|');
  const row = (name: string, xs: number[], fmt: (x: number) => string, r?: Sourced) => {
    const med = quantile(xs, 0.5);
    const diff = r ? `${med >= r.value ? '+' : ''}${fmt(med - r.value)}（${pct(med / r.value - 1, 0)}）` : '';
    out.push(
      `| ${name} | ${fmt(quantile(xs, 0.1))} | ${fmt(med)} | ${fmt(quantile(xs, 0.9))} | ${r ? fmt(r.value) : '-'} | ${diff} | ${r ? `${r.basis === 'statistic' ? '統計' : '仮置き'}：${r.source}` : ''} |`,
    );
  };
  row('離職率（年率）', all.map((a) => a.attritionRate), (x) => pct(x), ref?.attritionRate);
  row('売上高人件費率', all.map((a) => a.laborCostRatio), (x) => pct(x), ref?.laborCostRatio);
  row('残業（売上を生む社員、月）', all.map((a) => a.overtimeHours), (x) => `${num(x)}h`, ref?.overtimeHours);
  row('営業利益率', all.map((a) => a.operatingMargin), (x) => pct(x));
  row('平均の納得感', all.map((a) => a.engagement), (x) => num(x));
  row('需要を売上にできた割合', all.map((a) => a.demandCoverage), (x) => pct(x));
  out.push('');

  // 退職理由
  out.push('## 退職理由の内訳（全社の平均）と統計との比較', '');
  out.push('| 理由 | シミュレーション | 統計 |', '|---|---|---|');
  const reasonName: Record<string, string> = {
    pay: '給与',
    evaluation: '評価',
    workload: '負荷',
    growth: '成長',
    outlook: '会社の将来',
    relationships: '人間関係',
    family: '家庭の事情',
  };
  for (const reason of ATTRITION_REASONS) {
    const sim = mean(results.map((r) => r.summary.reasons[reason]));
    const st = refs.attritionReasons.value[reason];
    out.push(`| ${reasonName[reason]} | ${pct(sim)} | ${st === undefined ? '（統計に項目なし）' : pct(st)} |`);
  }
  out.push('', `統計：${refs.attritionReasons.source}`, '');

  // 制度ごとの平均（段階別）
  const opts = policyOptions(industry);
  const dominance: string[] = [];
  const stageShift: string[] = [];
  for (const stage of ['early', 'late'] as Stage[]) {
    out.push(`## 制度の選択肢ごとの平均：${STAGE_NAME[stage]}`, '');
    out.push(
      '途中で制度を変えなかった会社だけで集計。★ はそのカテゴリで最も良い値（利益・納得感・生存率は高いほど、離職率は低いほど良い）。利益は期間の「営業利益−臨時の支出（法令対応・是正・未払い残業代・納付金など）」の合計の平均。営業利益率は参考（会社の大きさを見ないので、需要を取りこぼしても下がらない）。',
      '',
    );
    out.push(
      '| カテゴリ | 選択肢 | 社数 | 利益の合計（億円） | 営業利益率 | 納得感 | 離職率 | 倒産しない割合 |',
      '|---|---|---|---|---|---|---|---|',
    );
    for (const key of POLICY_KEYS) {
      const ms = (opts[key] as readonly string[]).map((o) => ({ o, ...marginal(fixed, key, o, stage) }));
      const best = (f: (m: (typeof ms)[number]) => number, hi = true) =>
        ms.reduce((a, b) => ((hi ? f(b) > f(a) : f(b) < f(a)) ? b : a)).o;
      const bm = best((m) => m.profit);
      const be = best((m) => m.engagement);
      const ba = best((m) => m.attrition, false);
      const bs = best((m) => m.survival);
      for (const m of ms) {
        const star = (o: string) => (m.o === o ? ' ★' : '');
        out.push(
          `| ${key} | ${m.o} | ${m.n} | ${num(m.profit, 2)}${star(bm)} | ${pct(m.margin, 2)} | ${num(m.engagement)}${star(be)} | ${pct(m.attrition)}${star(ba)} | ${pct(m.survival)}${star(bs)} |`,
        );
      }
      if (bm === be && bm === ba) dominance.push(`${STAGE_NAME[stage]}の ${key}=${bm}（利益・納得感・離職率のすべてで最良）`);
      if (stage === 'late') {
        const early = (opts[key] as readonly string[])
          .map((o) => ({ o, ...marginal(fixed, key, o, 'early') }))
          .reduce((a, b) => (b.profit > a.profit ? b : a)).o;
        stageShift.push(`${key}：創業期は ${early}、成熟期は ${bm}${early === bm ? '（同じ）' : ''}`);
      }
    }
    out.push('');
  }

  out.push('## バランスの確認（DESIGN.md §11「バランス調整の考え方」）', '');
  out.push('### 一つの制度だけが常に強くなっていないか', '');
  out.push(dominance.length ? dominance.map((d) => `- 要注意：${d}`).join('\n') : '- 利益・納得感・離職率のすべてで最良になる選択肢はなかった', '');
  out.push('### 会社の段階で、利益が最も大きくなる選択肢が変わるか', '');
  out.push(stageShift.map((s) => `- ${s}`).join('\n'), '');
  out.push('### 業種ごとに最も良い組み合わせが違うか', '', '- いまは商社だけなので確認できない（ステップ12で4業種そろってから確かめる）', '');
  out.push('### 法令違反を放置すると平均的に損をするか', '');
  out.push(
    '| 法令対応の方針 | 社数 | 利益の合計・創業期（億円） | 利益の合計・成熟期（億円） | 臨時の支出の合計（億円） | 違反の月数 | 発覚の回数 | 納得感 | 倒産 |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  const legalName: Record<string, string> = { immediate: 'すぐ対応', postpone: '後回し', outsource: '社労士に依頼' };
  const legalRows = (['immediate', 'outsource', 'postpone'] as const).map((l) => {
    const rs = results.filter((r) => r.job.legal === l);
    return {
      l,
      n: rs.length,
      early: mean(rs.map((r) => (r.summary.early?.totalNetProfit ?? 0) / 1e8)),
      late: mean(rs.map((r) => (r.summary.late?.totalNetProfit ?? 0) / 1e8)),
      extra: mean(rs.map((r) => r.summary.all.totalExtraordinaryCost / 1e8)),
      vm: mean(rs.map((r) => r.summary.all.violationMonths)),
      det: mean(rs.map((r) => r.summary.detections)),
      eng: mean(rs.map((r) => r.summary.all.engagement)),
      bk: rs.filter((r) => r.summary.status === 'bankrupt').length,
    };
  });
  for (const x of legalRows) {
    out.push(
      `| ${legalName[x.l]} | ${x.n} | ${num(x.early, 2)} | ${num(x.late, 2)} | ${num(x.extra, 2)} | ${num(x.vm, 0)} | ${num(x.det, 1)} | ${num(x.eng)} | ${x.bk} |`,
    );
  }
  const imm = legalRows.find((x) => x.l === 'immediate');
  const post = legalRows.find((x) => x.l === 'postpone');
  if (imm && post) {
    const total = (x: typeof imm) => x.early + x.late;
    out.push(
      '',
      total(post) < total(imm)
        ? `- 後回しの会社は、すぐ対応の会社より利益が平均 ${num(total(imm) - total(post), 2)}億円 少ない（放置すると損をする）`
        : `- 要注意：後回しの会社のほうが、すぐ対応の会社より利益が平均 ${num(total(post) - total(imm), 2)}億円 多い（放置したほうが得になっている）`,
      '',
    );
  }
  out.push(...eventSections(results));
  out.push(...changeSection(results));
  return out.join('\n');
}

/** 途中の制度変更と、不利益変更をめぐる訴え */
function changeSection(results: JobResult[]): string[] {
  const changed = results.filter((r) => r.job.change);
  if (changed.length === 0) return [];
  const applied = changed.filter((r) => r.summary.policyChanges > 0);
  const seeded = applied.filter((r) => r.summary.disputeSeeds > 0);
  const disputed = seeded.filter((r) => (r.summary.eventCounts.dispute_claim ?? 0) > 0);
  const unseededDisputes = results.filter((r) => r.summary.disputeSeeds === 0 && (r.summary.eventCounts.dispute_claim ?? 0) > 0);
  return [
    '## 途中の制度変更',
    '',
    `- 途中で制度を1カテゴリ変える予定の会社：${changed.length}社（変える前に終わった会社を除くと ${applied.length}社）`,
    `- そのうち、就業規則の変更で不利益変更を進めた（紛争の種を残した）会社：${seeded.length}社`,
    `- そのうち、不利益変更をめぐる訴えが起きた会社：${disputed.length}社（${pct(disputed.length / Math.max(1, seeded.length), 0)}）`,
    `- 紛争の種がないのに訴えが起きた会社：${unseededDisputes.length}社（0であること）`,
    '- 上の「制度の選択肢ごとの平均」は、途中で制度を変えなかった会社だけで集計している',
    '',
  ];
}

const AXIS_NAME: Record<JudgmentAxis, [string, string]> = {
  reward: ['個人に報いる', '公平を守る'],
  horizon: ['将来への投資', '今の利益'],
  rules: ['法令・ルール重視', '柔軟さ重視'],
  people: ['人を守る', '入れ替える'],
};

/** イベント（ステップ8）：発生の回数と、判断の傾向による違い */
function eventSections(results: JobResult[]): string[] {
  const out: string[] = [];
  const years = results.reduce((s, r) => s + r.summary.months, 0) / 12;
  out.push('## イベント', '');
  out.push(
    `- 法令以外のイベント：年 ${num(results.reduce((s, r) => s + r.summary.events, 0) / years, 2)} 回（1社あたり ${num(mean(results.map((r) => r.summary.events)), 1)} 回）`,
    `- 休職：1社あたり ${num(mean(results.map((r) => r.summary.leaves)), 1)} 人`,
    '',
  );
  out.push('| イベント | 起き方 | 起きた会社 | 10年あたりの回数 |', '|---|---|---|---|');
  for (const e of eventDefs) {
    const n = results.reduce((s, r) => s + (r.summary.eventCounts[e.id] ?? 0), 0);
    const companies = results.filter((r) => (r.summary.eventCounts[e.id] ?? 0) > 0).length;
    out.push(`| ${e.title}（${e.id}） | ${e.trigger.type} | ${pct(companies / results.length, 0)} | ${num((n / years) * 10, 2)} |`);
  }
  out.push('');

  const styled = results.filter((r) => r.job.style);
  if (styled.length === 0) return out;
  out.push(
    '### 判断の傾向による違い',
    '',
    '各軸の傾向（−1〜+1）が +0.33 より大きい会社と −0.33 より小さい会社を比べる（ほかの軸と制度は抽選なので、その分の誤差を含む）。',
    '',
    '| 軸 | 傾向 | 社数 | 利益の合計・創業期（億円） | 利益の合計・成熟期（億円） | 納得感 | 離職率 | 倒産 |',
    '|---|---|---|---|---|---|---|---|',
  );
  const threshold = 1 / 3;
  for (const a of JUDGMENT_AXES) {
    for (const [side, test] of [
      [0, (v: number) => v > threshold],
      [1, (v: number) => v < -threshold],
    ] as const) {
      const rs = styled.filter((r) => test(r.job.style?.[a] ?? 0));
      out.push(
        `| ${AXIS_NAME[a][0]} ↔ ${AXIS_NAME[a][1]} | ${AXIS_NAME[a][side]} | ${rs.length} | ${num(mean(rs.map((r) => (r.summary.early?.totalNetProfit ?? 0) / 1e8)), 2)} | ${num(mean(rs.map((r) => (r.summary.late?.totalNetProfit ?? 0) / 1e8)), 2)} | ${num(mean(rs.map((r) => r.summary.all.engagement)))} | ${pct(mean(rs.map((r) => r.summary.all.attritionRate)))} | ${pct(rs.filter((r) => r.summary.status === 'bankrupt').length / Math.max(1, rs.length))} |`,
      );
    }
  }
  out.push('');
  return out;
}

/** 標準から1カテゴリだけ変えた比較（同じ会社どうしで比べる） */
export function summarizeOneAtATime(results: JobResult[], industryId: IndustryId, runs: number): string {
  const industry = getIndustry(industryId);
  const groups = new Map<number, JobResult[]>();
  for (const r of results) {
    const v = Math.floor(r.job.run / runs);
    groups.set(v, [...(groups.get(v) ?? []), r]);
  }
  const out: string[] = [`# 標準から1カテゴリだけ変えた比較：${industry.name}（各${runs}社）`, ''];
  out.push(
    '同じ会社（シード）を、標準の制度（法令はすぐ対応）と、1カテゴリだけ変えた制度で回した平均。差は標準との差。利益は「営業利益−臨時の支出」。',
    '',
  );
  out.push(
    '| 変えたもの | 利益の合計・創業期（億円） | 利益の合計・成熟期（億円） | 納得感 | 離職率 | 人件費率 | 倒産 |',
    '|---|---|---|---|---|---|---|',
  );
  const stats = (rs: JobResult[]) => ({
    // 期間の営業利益の合計（億円）。成熟期まで届かなかった会社は0として平均する（倒産も損として数える）
    earlyMargin: mean(rs.map((r) => (r.summary.early?.totalNetProfit ?? 0) / 1e8)),
    lateMargin: mean(rs.map((r) => (r.summary.late?.totalNetProfit ?? 0) / 1e8)),
    engagement: mean(rs.map((r) => r.summary.all.engagement)),
    attrition: mean(rs.map((r) => r.summary.all.attritionRate)),
    labor: mean(rs.map((r) => r.summary.all.laborCostRatio)),
    bankrupt: rs.filter((r) => r.summary.status === 'bankrupt').length,
  });
  const base = stats(groups.get(0) ?? []);
  const d = (x: number, b: number, f: (v: number) => string) => `${f(x)}（${x - b >= 0 ? '+' : ''}${f(x - b)}）`;
  for (const [v, rs] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const first = rs[0];
    if (!first) continue;
    const changed =
      v === 0
        ? '標準'
        : [
            ...(Object.keys(first.job.policies) as (keyof PolicySet)[])
              .filter((k) => first.job.policies[k] !== (groups.get(0)?.[0]?.job.policies[k] ?? ''))
              .map((k) => `${k}=${first.job.policies[k]}`),
            ...(first.job.legal !== groups.get(0)?.[0]?.job.legal ? [`法令=${first.job.legal}`] : []),
          ].join(',');
    const s = stats(rs);
    out.push(
      v === 0
        ? `| 標準 | ${num(s.earlyMargin, 2)} | ${num(s.lateMargin, 2)} | ${num(s.engagement)} | ${pct(s.attrition)} | ${pct(s.labor, 2)} | ${s.bankrupt} |`
        : `| ${changed} | ${d(s.earlyMargin, base.earlyMargin, (x) => num(x, 2))} | ${d(s.lateMargin, base.lateMargin, (x) => num(x, 2))} | ${d(s.engagement, base.engagement, (x) => num(x))} | ${d(s.attrition, base.attrition, (x) => pct(x))} | ${d(s.labor, base.labor, (x) => pct(x, 2))} | ${s.bankrupt} |`,
    );
  }
  return out.join('\n') + '\n';
}
