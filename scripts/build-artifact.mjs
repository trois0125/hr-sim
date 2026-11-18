// claude.ai のページ（Artifact）として公開するためのビルド。
//   npm run build:artifact
// 1. 相対パス（./assets/...）でビルドする（GitHub Pages 用の /hr-sim/ ではなく）
// 2. index.html から <html>・<head>・<body> の枠を外したページ（dist-artifact/page.html）をつくる
//    （公開するときに枠が付け直されるため）。スクリプトとスタイルは assets/ のファイルとして一緒に公開する
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const OUT = 'dist-artifact';
execSync(`npx vite build --base ./ --outDir ${OUT} --emptyOutDir`, { stdio: 'inherit' });

const html = readFileSync(`${OUT}/index.html`, 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
// 文字コードと viewport の meta は公開のときに付くので外す
const headKept = head
  .split('\n')
  .filter((l) => !/<meta charset|<meta name="viewport"/.test(l))
  .join('\n');
writeFileSync(`${OUT}/page.html`, `${headKept.trim()}\n${body.trim()}\n`);
console.log(`${OUT}/page.html と ${OUT}/assets/ をつくりました：`, readdirSync(`${OUT}/assets`).join(', '));
