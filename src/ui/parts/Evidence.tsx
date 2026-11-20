import { useMemo, useState } from 'react';
import { availableIndustries, getIndustry } from '../../engine/data';
import { coefficientEvidence, industryEvidence } from '../../engine/evidence';
import type { Basis, IndustryData, IndustryId } from '../../engine/types';
import { actions, useGame } from '../useGame';
import { evidenceStrings as t } from '../strings';

const BASES: readonly Basis[] = ['statistic', 'research', 'assumption'];

/** 業種データの場所を日本語の項目名にする（知らない場所なら null。そのときは場所をそのまま見せる） */
function industryLabel(path: string, industry: IndustryData): string | null {
  const m = /^(roles|variants)\[([^\]]+)\]/.exec(path);
  const key = path.replace(/\[[^\]]+\]/g, '[]');
  const label = t.fields[key];
  if (!label) return null;
  if (!m) return label;
  const list: readonly { id: string; name: string }[] = m[1] === 'roles' ? industry.roles : industry.variants;
  return label.replace('{x}', list.find((x) => x.id === m[2])?.name ?? m[2]!);
}

/** 数字の根拠の一覧（§10）。どの画面からでも重ねて開く（開くたびに、いまの会社の業種から始める） */
export function Evidence() {
  const current = useGame((s) => s.company?.profile.industryId ?? s.candidate?.profile.industryId);
  const [industryId, setIndustryId] = useState<IndustryId>(current ?? availableIndustries()[0]!.id);
  const [basis, setBasis] = useState<Basis | 'all'>('all');
  const [query, setQuery] = useState('');
  const all = useMemo(
    () => [...industryEvidence(getIndustry(industryId)), ...coefficientEvidence()],
    [industryId],
  );
  const industry = getIndustry(industryId);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (e) =>
      (basis === 'all' || e.basis === basis) &&
      (!q ||
        `${e.path} ${e.group === 'industry' ? industryLabel(e.path, industry) ?? '' : ''} ${e.source} ${e.note ?? ''}`
          .toLowerCase()
          .includes(q)),
  );
  const industryName = industry.name;
  const groups = [
    { key: 'industry', title: t.groups.industry(industryName), rows: shown.filter((e) => e.group === 'industry') },
    { key: 'coefficients', title: t.groups.coefficients, rows: shown.filter((e) => e.group === 'coefficients') },
  ];
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="evidence-title">
      <div className="slip evidence">
        <div className="slip-head">
          <h2 id="evidence-title">{t.title}</h2>
          <button className="btn" onClick={() => actions().closeEvidence()}>
            {t.close}
          </button>
        </div>
        <div className="slip-body">
          <p>{t.lead}</p>
          <div className="evidence-tools">
            <label>
              {t.industryLabel}{' '}
              <select value={industryId} onChange={(e) => setIndustryId(e.target.value as IndustryId)}>
                {availableIndustries().map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="choice-row" role="group" aria-label={t.columns.basis}>
              {(['all', ...BASES] as const).map((b) => (
                <button key={b} className="btn" aria-pressed={basis === b} onClick={() => setBasis(b)}>
                  {b === 'all' ? t.filterAll : t.basis[b]}
                </button>
              ))}
            </div>
            <label className="evidence-search">
              <span className="visually-hidden">{t.search}</span>
              <input
                type="search"
                value={query}
                placeholder={t.searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <p className="muted num">{t.count(shown.length, all.length)}</p>
          </div>
          {groups.map(
            (g) =>
              g.rows.length > 0 && (
                <section key={g.key}>
                  <h3 className="evidence-group">{g.title}</h3>
                  <ul className="evidence-list">
                    {g.rows.map((e) => (
                      <li key={`${e.group}:${e.path}`}>
                        <div className="evidence-row">
                          <span className="evidence-name">
                            {e.group === 'industry' && industryLabel(e.path, industry)}
                            <code className="evidence-path">{e.path}</code>
                          </span>
                          <span className="num evidence-value">
                            {e.value}
                            {e.unit ? ` ${e.unit}` : ''}
                          </span>
                          <span className={`basis basis-${e.basis}`}>{t.basis[e.basis]}</span>
                        </div>
                        <p className="evidence-source">
                          {e.source}
                          {e.note ? `（${e.note}）` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
        </div>
      </div>
    </div>
  );
}
