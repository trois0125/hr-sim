import { useState } from 'react';
import { eventDefs } from '../../engine/eventData';
import { laws } from '../../engine/lawData';
import { getProgram } from '../../engine/programs';
import { guide, optionKey, type GuideRef, type GuideSource, type ItemGuide } from '../guide';
import { actions, useGame } from '../useGame';
import { guideStrings as t, policyStrings } from '../strings';

const h = t.headings;
type PolicyCategory = keyof typeof policyStrings.options;

function optionName(key: string): string {
  const i = key.indexOf('.');
  const cat = key.slice(0, i) as PolicyCategory;
  const opts = policyStrings.options[cat] as Record<string, readonly [string, string]>;
  return opts[key.slice(i + 1)]?.[0] ?? key;
}

/** 項目の名前（一覧と見出しに使う） */
export function guideTitle(ref: GuideRef): string {
  switch (ref.kind) {
    case 'category':
      return policyStrings.categories[ref.id as PolicyCategory] ?? ref.id;
    case 'option':
      return guide.policyOptions[ref.id]?.title ?? optionName(ref.id);
    case 'law':
      return laws.find((r) => r.id === ref.id)?.name ?? ref.id;
    case 'program':
      return getProgram(ref.id).name;
    case 'initiative':
      return eventDefs.find((e) => e.id === ref.id)?.title ?? ref.id;
  }
}

/** 本文（検索に使う） */
function guideText(ref: GuideRef): string {
  const g =
    ref.kind === 'category'
      ? guide.policyCategories[ref.id]
      : ref.kind === 'option'
        ? guide.policyOptions[ref.id]
        : ref.kind === 'law'
          ? guide.laws[ref.id]
          : ref.kind === 'program'
            ? guide.programs[ref.id]
            : guide.initiatives[ref.id];
  return `${guideTitle(ref)} ${JSON.stringify(g ?? '')}`;
}

/** 「？」ボタン。押すとその項目の解説を開く */
export function HelpButton({ target, label }: { target: GuideRef; label?: string }) {
  const name = label ?? guideTitle(target);
  return (
    <button
      type="button"
      className="help-button"
      aria-label={t.help(name)}
      title={t.help(name)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        actions().openGuide(target);
      }}
    >
      {t.helpShort}
    </button>
  );
}

/** 稟議書などに置く「関係する解説」へのリンク */
export function GuideLinks({ refs }: { refs: GuideRef[] }) {
  if (refs.length === 0) return null;
  return (
    <p className="guide-links">
      <span className="muted">{t.related}：</span>
      {refs.map((r) => (
        <button key={`${r.kind}:${r.id}`} type="button" className="btn btn-quiet guide-link" onClick={() => actions().openGuide(r)}>
          {guideTitle(r)}
        </button>
      ))}
    </p>
  );
}

function List({ title, items }: { title: string; items: readonly string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="guide-block">
      <h4>{title}</h4>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </section>
  );
}

function Sources({ sources }: { sources: readonly GuideSource[] | undefined }) {
  if (!sources || sources.length === 0) return null;
  return (
    <section className="guide-block guide-sources">
      <h4>{h.sources}</h4>
      <ul>
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer noopener">
              {s.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemBody({ g }: { g: ItemGuide }) {
  return (
    <>
      <p className="guide-summary">{g.summary}</p>
      <div className="guide-pros-cons">
        <List title={h.merits} items={g.merits} />
        <List title={h.demerits} items={g.demerits} />
      </div>
      <section className="guide-block">
        <h4>{h.fits}</h4>
        <p>{g.fits}</p>
      </section>
      <List title={h.cautions} items={g.cautions} />
      <List title={h.pitfalls} items={g.pitfalls} />
      <List title={h.legal} items={g.legal} />
      <Sources sources={g.sources} />
    </>
  );
}

function Detail({ target, onOpen }: { target: GuideRef; onOpen: (r: GuideRef) => void }) {
  if (target.kind === 'category') {
    const g = guide.policyCategories[target.id];
    if (!g) return null;
    const options = Object.keys(policyStrings.options[target.id as PolicyCategory] ?? {});
    return (
      <>
        <p className="guide-summary">{g.summary}</p>
        <List title={h.considerations} items={g.considerations} />
        <section className="guide-block">
          <h4>{h.options}</h4>
          <ul className="guide-index">
            {options.map((o) => (
              <li key={o}>
                <button type="button" className="btn btn-quiet" onClick={() => onOpen({ kind: 'option', id: optionKey(target.id, o) })}>
                  {optionName(optionKey(target.id, o))}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <List title={h.legal} items={g.legal} />
        <Sources sources={g.sources} />
      </>
    );
  }
  if (target.kind === 'law') {
    const g = guide.laws[target.id];
    const rule = laws.find((r) => r.id === target.id);
    if (!g) return null;
    return (
      <>
        {rule && <p className="muted guide-meta">{`${rule.law}・${h.effectiveFrom(rule.effectiveFrom)}`}</p>}
        <p className="guide-summary">{g.summary}</p>
        <section className="guide-block">
          <h4>{h.who}</h4>
          <p>{g.who}</p>
        </section>
        <List title={h.duties} items={g.legal} />
        <List title={h.practice} items={g.cautions} />
        <List title={h.pitfalls} items={g.pitfalls} />
        {g.todo && (
          <section className="guide-block guide-todo">
            <h4>{h.todo}</h4>
            <p>{g.todo}</p>
          </section>
        )}
        <Sources sources={g.sources} />
        <p className="muted guide-checked">{t.checkedAt(guide.checkedAt)}</p>
      </>
    );
  }
  const g =
    target.kind === 'option' ? guide.policyOptions[target.id] : target.kind === 'program' ? guide.programs[target.id] : guide.initiatives[target.id];
  if (!g) return null;
  return (
    <>
      {target.kind === 'option' && (
        <p className="muted guide-meta">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => onOpen({ kind: 'category', id: target.id.slice(0, target.id.indexOf('.')) })}
          >
            {guideTitle({ kind: 'category', id: target.id.slice(0, target.id.indexOf('.')) })}
          </button>
        </p>
      )}
      <ItemBody g={g} />
      {g.legal && g.legal.length > 0 && <p className="muted guide-checked">{t.checkedAt(guide.checkedAt)}</p>}
    </>
  );
}

/** 一覧に出す項目 */
function allRefs(): { section: keyof typeof t.sections; refs: GuideRef[] }[] {
  return [
    {
      section: 'policies',
      refs: Object.keys(guide.policyCategories).flatMap((c) => [
        { kind: 'category' as const, id: c },
        ...Object.keys(policyStrings.options[c as PolicyCategory] ?? {}).map((o) => ({ kind: 'option' as const, id: optionKey(c, o) })),
      ]),
    },
    { section: 'laws', refs: laws.map((r) => ({ kind: 'law' as const, id: r.id })) },
    { section: 'programs', refs: Object.keys(guide.programs).map((id) => ({ kind: 'program' as const, id })) },
    { section: 'initiatives', refs: Object.keys(guide.initiatives).map((id) => ({ kind: 'initiative' as const, id })) },
  ];
}

/** 人事の辞典（どこからでも重ねて開く。開いている間は時間を止める） */
export function Guide() {
  const state = useGame((s) => s.guide);
  const [query, setQuery] = useState('');
  if (!state) return null;
  const current = state.ref;
  const open = (r: GuideRef | null) => actions().openGuide(r);
  const q = query.trim().toLowerCase();
  const sections = allRefs()
    .map((s) => ({ ...s, refs: q ? s.refs.filter((r) => guideText(r).toLowerCase().includes(q)) : s.refs }))
    .filter((s) => s.refs.length > 0);
  return (
    <div className="overlay guide-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="slip guide">
        <div className="slip-head">
          <h2 id="guide-title">{current ? guideTitle(current) : t.title}</h2>
          <span className="slip-kind">{current ? t.kinds[current.kind] : ''}</span>
        </div>
        <div className="slip-body">
          <div className="guide-nav">
            {current && (
              <button type="button" className="btn" onClick={() => open(null)}>
                {t.back}
              </button>
            )}
            <button type="button" className="btn" onClick={() => actions().closeGuide()}>
              {t.close}
            </button>
          </div>
          {current ? (
            <Detail target={current} onOpen={open} />
          ) : (
            <>
              <p>{t.lead}</p>
              <label className="evidence-search">
                <span className="visually-hidden">{t.search}</span>
                <input type="search" value={query} placeholder={t.searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
              </label>
              {sections.length === 0 && <p className="muted">{t.noResult}</p>}
              {sections.map((s) => (
                <section key={s.section}>
                  <h3 className="evidence-group">{t.sections[s.section]}</h3>
                  <ul className="guide-index">
                    {s.refs.map((r) => (
                      <li key={`${r.kind}:${r.id}`} className={r.kind === 'option' ? 'guide-index-option' : ''}>
                        <button type="button" className="btn btn-quiet" onClick={() => open(r)}>
                          {guideTitle(r)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
