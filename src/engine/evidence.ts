/**
 * 数字の根拠の一覧（§10「根拠の表示」。ステップ13）。
 * 係数台帳と業種データから、根拠付きの数値（value・basis・source を持つもの）をすべて集める。
 */
import { coefficients } from './data';
import type { Basis, IndustryData } from './types';

export type EvidenceEntry = {
  group: 'coefficients' | 'industry';
  /** 係数のID、または業種データの中の場所（例：roles[sales].marketSalaryMonthly） */
  path: string;
  /** 表示用の値（範囲は「a〜b」） */
  value: string;
  unit?: string;
  basis: Basis;
  source: string;
  note?: string;
};

const BASES: readonly Basis[] = ['statistic', 'research', 'assumption'];

function formatValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('ja-JP') : String(Number(v.toPrecision(4)));
  if (v && typeof v === 'object' && 'min' in v && 'max' in v) {
    const r = v as { min: number; max: number };
    return `${formatValue(r.min)}〜${formatValue(r.max)}`;
  }
  return String(v);
}

function isSourced(x: unknown): x is { value: unknown; basis: Basis; source: string; unit?: string; note?: string } {
  return !!x && typeof x === 'object' && 'value' in x && 'basis' in x && 'source' in x && BASES.includes((x as { basis: Basis }).basis);
}

export function coefficientEvidence(): EvidenceEntry[] {
  return coefficients.map((c) => ({
    group: 'coefficients',
    path: c.id,
    value: formatValue(c.value),
    unit: c.unit,
    basis: c.basis,
    source: c.source,
    note: c.note,
  }));
}

/** 業種データの中の根拠付きの数値を、場所と一緒に集める（配列の中は id で場所を表す） */
export function industryEvidence(industry: IndustryData): EvidenceEntry[] {
  const out: EvidenceEntry[] = [];
  const walk = (x: unknown, path: string) => {
    if (isSourced(x)) {
      out.push({ group: 'industry', path, value: formatValue(x.value), unit: x.unit, basis: x.basis, source: x.source, note: x.note });
      return;
    }
    if (Array.isArray(x)) {
      x.forEach((item, i) => {
        const id = item && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : String(i);
        walk(item, `${path}[${id}]`);
      });
      return;
    }
    if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(industry, '');
  return out;
}
