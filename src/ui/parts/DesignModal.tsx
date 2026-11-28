/**
 * 中級：場面と制度の設計（DESIGN.md §15.3、§15.5。ステップ22）。
 * 場面の文章を読み、大きな方針を選ぶと設計に初期値が入る。そこから等級・評価・給与・賞与を細かく直して決める。
 * 等級の仕組みか段階の数が変わるときは、今の等級→新しい等級の対応表と、激変緩和の年数も決める。
 */
import { useState } from 'react';
import fields from '../../data/intermediate/detailFields.json';
import { levelsOf, validateDetailed, type DetailedPolicies } from '../../engine/intermediate/detailedPolicy';
import { needsRegroup, proportionalMapping } from '../../engine/intermediate/regroup';
import { STANCES, applyStance, type Scene } from '../../engine/intermediate/scenes';
import type { IntermediateState } from '../../engine/intermediate/types';
import type { PolicySet } from '../../engine/types';
import { optionName } from '../../store/game';
import { actions } from '../useGame';
import { pct } from '../format';
import { intermediateStrings as t } from '../strings';

type Cat = keyof DetailedPolicies;
const CATS: Cat[] = ['grade', 'evaluation', 'pay', 'bonus'];
/** 細かい選択肢のうち、初級の制度と同じ選択肢を持つもの（名前は初級の文言を使う） */
const BASE_CATEGORY: Record<string, keyof PolicySet> = { 'grade.system': 'grade', 'evaluation.system': 'evaluation', 'pay.basis': 'pay' };

function get(d: DetailedPolicies, id: string): unknown {
  const [cat, key] = id.split('.') as [Cat, string];
  return (d[cat] as Record<string, unknown>)[key];
}
function setField(d: DetailedPolicies, id: string, v: unknown): DetailedPolicies {
  const [cat, key] = id.split('.') as [Cat, string];
  return { ...d, [cat]: { ...d[cat], [key]: v } };
}

/** 数値の項目の表示（単位で書き方を変える） */
function formatValue(v: number, unit: string): string {
  if (unit === '割合') return pct(v, 0);
  if (unit === '±比') return `±${pct(v, 0)}`;
  if (unit.startsWith('年あたりの比')) return `${v >= 0 ? '+' : ''}${pct(v, 1)}${t.perYear}`;
  if (unit === '倍') return `${v}${t.times}`;
  return `${v}${unit}`;
}

function SceneBody({ scene, state }: { scene: Scene | null; state: IntermediateState }) {
  if (!scene) return null;
  if (scene.kind === 'founding') return <p>{t.foundingBody(scene.vars.headcount)}</p>;
  if (scene.kind === 'chain') {
    const voices = t.chainVoices[Math.min(4, scene.chainStage)] ?? [];
    return (
      <>
        {voices.map((v) => (
          <p key={v} className="voice-line">{v}</p>
        ))}
        <p className="muted">{t.chainLead}</p>
      </>
    );
  }
  return (
    <>
      {scene.premiseOn.map((k) => (
        <p key={k}>
          {k === 'growth'
            ? t.premiseOn.growth(pct(scene.vars.growthRate, 0))
            : k === 'aging'
              ? t.premiseOn.aging(pct(scene.vars.agingShare, 0))
              : k === 'large'
                ? t.premiseOn.large(scene.vars.headcount)
                : t.premiseOn[k]()}
        </p>
      ))}
      {scene.premiseOff.map((k) => (
        <p key={k} className="muted">{t.premiseOff[k]}</p>
      ))}
      <p className="muted">{state.profile.name}</p>
    </>
  );
}

export function DesignModal({ state }: { state: IntermediateState }) {
  const scene = state.pendingScene;
  const [stanceId, setStanceId] = useState('keep');
  const [detail, setDetail] = useState<DetailedPolicies>(structuredClone(state.detail));
  const oldLevels = levelsOf(state.detail);
  const regroup = needsRegroup(state.detail, detail);
  const [mapping, setMapping] = useState<number[] | null>(null);
  const [years, setYears] = useState<number>(fields.transition.default);
  const map = mapping && mapping.length === oldLevels ? mapping.map((g) => Math.min(g, levelsOf(detail) - 1)) : proportionalMapping(oldLevels, levelsOf(detail));

  let error: string | null = null;
  try {
    validateDetailed(detail);
  } catch (e) {
    error = (e as Error).message;
  }

  const chooseStance = (id: string) => {
    setStanceId(id);
    setDetail(applyStance(state.detail, id));
    setMapping(null);
  };
  const decide = () => {
    const options = regroup ? { gradeMapping: map, transitionYears: years } : undefined;
    if (scene) actions().answerScene(stanceId, detail, options);
    else actions().redesign(detail, options);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="design-title">
      <div className="slip">
        <div className="slip-head">
          <h2 id="design-title">{t.sceneTitle[scene ? scene.kind : 'free']}</h2>
        </div>
        <div className="slip-body">
          <SceneBody scene={scene} state={state} />

          <fieldset className="policy-field">
            <legend>{t.stanceTitle}</legend>
            <p className="muted">{t.stanceLead}</p>
            <div className="policy-options">
              {STANCES.map((s) => (
                <label key={s.id} className="policy-option">
                  <input type="radio" name="stance" checked={stanceId === s.id} onChange={() => chooseStance(s.id)} />
                  <span>{s.label}</span>
                  <span className="desc">{s.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <h3 className="sheet-title">{t.designTitle}</h3>
          {CATS.map((cat) => (
            <fieldset key={cat} className="policy-field">
              <legend>{t.categories[cat]}</legend>
              {fields.choices
                .filter((f) => f.id.startsWith(`${cat}.`))
                .map((f) => (
                  <label key={f.id} className="design-row">
                    <span>{f.label}</span>
                    <select
                      value={String(get(detail, f.id))}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDetail(setField(detail, f.id, raw === 'true' ? true : raw === 'false' ? false : raw));
                      }}
                    >
                      {(f.options as (string | boolean)[]).map((o) => (
                        <option key={String(o)} value={String(o)}>
                          {typeof o === 'boolean'
                            ? o
                              ? t.yes
                              : t.no
                            : BASE_CATEGORY[f.id]
                              ? optionName(BASE_CATEGORY[f.id] as keyof PolicySet, o as never)
                              : o}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              {fields.numbers
                .filter((f) => f.id.startsWith(`${cat}.`))
                .filter((f) => !(cat === 'grade' && detail.grade.system === 'none' && f.id !== 'grade.levels'))
                .map((f) => {
                  const max = f.id === 'grade.seniorityCap' ? Math.max(0, detail.grade.levels - 1) : f.max;
                  const v = get(detail, f.id) as number;
                  return (
                    <label key={f.id} className="design-row">
                      <span>{f.label}</span>
                      <input
                        type="range"
                        min={f.min}
                        max={max}
                        step={f.step}
                        value={Math.min(v, max)}
                        onChange={(e) => setDetail(setField(detail, f.id, Number(e.target.value)))}
                      />
                      <span className="num">{formatValue(v, f.unit)}</span>
                    </label>
                  );
                })}
            </fieldset>
          ))}

          {regroup && (
            <fieldset className="policy-field">
              <legend>{t.regroupTitle}</legend>
              <p className="muted">{t.regroupLead}</p>
              {Array.from({ length: oldLevels }, (_, g) => (
                <label key={g} className="design-row">
                  <span>{t.mappingFrom(g)}</span>
                  <select
                    value={map[g]}
                    onChange={(e) => {
                      const next = [...map];
                      next[g] = Number(e.target.value);
                      setMapping(next);
                    }}
                  >
                    {Array.from({ length: levelsOf(detail) }, (_, n) => (
                      <option key={n} value={n}>
                        {t.gradeLabel(n)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="design-row">
                <span>{fields.transition.label}</span>
                <input
                  type="range"
                  min={fields.transition.min}
                  max={fields.transition.max}
                  step={fields.transition.step}
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                />
                <span className="num">{`${years} ${fields.transition.unit}`}</span>
              </label>
            </fieldset>
          )}

          {error && (
            <p className="save-failed" role="alert">
              {t.invalid}
              {error}
            </p>
          )}
          <div className="slip-actions">
            <button className="btn btn-primary" disabled={!!error} onClick={decide}>
              {t.decide}
            </button>
            {!scene && (
              <button className="btn btn-quiet" onClick={() => actions().closeEditor()}>
                {t.close}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
