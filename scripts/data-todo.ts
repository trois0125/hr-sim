// source に TODO が付いた数値を集めて docs/DATA_TODO.md を作り直す。
//   npx tsx scripts/data-todo.ts
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = 'src/data';
const files = [
  ...readdirSync(join(dataDir, 'industries')).map((f) => join('industries', f)),
  'locations.json',
  'coefficients.json',
  'foundings.json',
  ...readdirSync(join(dataDir, 'intermediate', 'cases')).map((f) => join('intermediate', 'cases', f)),
].filter((f) => f.endsWith('.json'));

type Row = { file: string; path: string; value: string; unit: string; source: string };
const rows: Row[] = [];
let total = 0;

function walk(node: unknown, path: string, file: string) {
  if (Array.isArray(node)) {
    node.forEach((x, i) => walk(x, `${path}[${(x as { id?: string })?.id ?? i}]`, file));
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    // 値の一覧（追体験の人数の目安など）は value を持たないので、basis と source だけで数える
    if ('basis' in o && 'source' in o && ('value' in o || String(o.source).includes('TODO'))) {
      total++;
      const source = String(o.source);
      if (!source.includes('TODO')) return;
      const v = ('value' in o ? o.value : '（一覧）') as number | string | { min: number; max: number };
      rows.push({
        file,
        path,
        value: typeof v === 'object' ? `${v.min}〜${v.max}` : String(v),
        unit: String(o.unit ?? ''),
        source: source.replaceAll('|', '/'),
      });
      return;
    }
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k, file);
  }
}
for (const f of files) walk(JSON.parse(readFileSync(join(dataDir, f), 'utf-8')), '', f);

const out = [
  '# 統計で確認が必要な値（DATA_TODO）',
  '',
  `source に \`TODO\` が付いた値の一覧（${rows.length}件。根拠付きの数値は全部で${total}件で、いまはすべて \`basis: "assumption"\`）。`,
  '統計で確認できたら値を直し、`basis` を `statistic` にして source を統計名・表番号に書き換える。ステップ6（バランス確認）の前にまとめて差し替える予定。',
  '',
  'このファイルは `npx tsx scripts/data-todo.ts` で作り直す（手で編集しない）。',
  '',
  '| ファイル | 項目 | 仮の値 | 単位 | 確認する統計 |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| \`${r.file}\` | \`${r.path}\` | ${r.value} | ${r.unit} | ${r.source} |`),
  '',
];
writeFileSync('docs/DATA_TODO.md', out.join('\n'));
console.log(`docs/DATA_TODO.md を更新しました（${rows.length}件）`);
