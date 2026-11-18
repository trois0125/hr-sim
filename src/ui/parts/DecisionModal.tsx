import { useEffect, useRef, useState } from 'react';
import { getEvent, renderText } from '../../engine/events';
import { getLaw } from '../../engine/lawData';
import { choiceImpacts, type Impact } from '../../engine/preview';
import type { CompanyState, EventEffects, LegalResponse, PendingDecision } from '../../engine/types';
import { LEGAL_RESPONSES, MONTHS_PER_YEAR } from '../../engine/types';
import { actions } from '../useGame';
import { decisionStrings, eventStrings, lawStrings, reviewStrings } from '../strings';
import { yen } from '../format';

/** 印を押してから次に進むまでの間（ミリ秒）。動きを減らす設定なら待たない */
const STAMP_MS = 520;
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Impacts({ effects }: { effects: EventEffects }) {
  const list: Impact[] = choiceImpacts(effects);
  if (list.length === 0) return <span className="muted">{decisionStrings.noImpact}</span>;
  return (
    <ul className="impacts">
      {list.map((i) => {
        const text = decisionStrings.impacts[i.key][i.dir === 1 ? 0 : 1];
        return text ? (
          <li key={i.key} className={i.dir === 1 ? 'up' : 'down'}>
            {text}
          </li>
        ) : null;
      })}
    </ul>
  );
}

/** 選択肢の1行。選ぶと決裁の印が押される */
function Option({
  label,
  chosen,
  disabled,
  onChoose,
  children,
}: {
  label: string;
  chosen: boolean;
  disabled: boolean;
  onChoose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <button className={`option${chosen ? ' chosen' : ''}`} disabled={disabled && !chosen} onClick={onChoose}>
        <span className="option-label">{label}</span>
        {children}
        {chosen && (
          <span className="seal" aria-hidden="true">
            決裁
          </span>
        )}
      </button>
    </li>
  );
}

/** 選んでから少し待って（印が押されるのを見せてから）実行する */
function useStamp() {
  const [chosen, setChosen] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const choose = (i: number, run: () => void) => {
    if (chosen !== null) return;
    setChosen(i);
    timer.current = setTimeout(run, reducedMotion() ? 0 : STAMP_MS);
  };
  return { chosen, choose };
}

function Slip({ kind, title, children }: { kind: string; title: string; children: React.ReactNode }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="slip-title">
      <div className="slip">
        <div className="slip-head">
          <h2 id="slip-title">{title}</h2>
          <span className="slip-kind">{kind}</span>
        </div>
        <div className="slip-body">{children}</div>
      </div>
    </div>
  );
}

function MilestoneSlip({ d }: { d: PendingDecision }) {
  const [reflection, setReflection] = useState('');
  const { chosen, choose } = useStamp();
  const rules = d.ruleIds.map(getLaw);
  const workplace = rules.some((r) => r.workplaceUnit);
  const overtime = d.ruleIds.includes('agreement_36');
  const order: LegalResponse[] = ['immediate', 'outsource', 'postpone'];
  return (
    <Slip kind={eventStrings.categories.law} title={lawStrings.milestoneTitle(Number(d.vars.headcount ?? 0))}>
      <p>{lawStrings.milestoneLead}</p>
      <ul className="rule-list">
        {rules.map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong>
            <div className="muted">{r.description}</div>
          </li>
        ))}
      </ul>
      {overtime && <p className="slip-note warn">{lawStrings.overtimeWarning}</p>}
      {workplace && <p className="slip-note">{lawStrings.workplaceUnitNote}</p>}
      <ol className="option-list">
        {order
          .filter((r) => LEGAL_RESPONSES.includes(r))
          .map((r, i) => (
            <Option
              key={r}
              label={lawStrings.responses[r].label}
              chosen={chosen === i}
              disabled={chosen !== null}
              onChoose={() => choose(i, () => actions().answerMilestone(d.id, r, reflection))}
            >
              <span className="muted">{lawStrings.responses[r].note}</span>
            </Option>
          ))}
      </ol>
      <label className="reflection">
        <strong>{decisionStrings.reflectionTitle}</strong>
        <span>{decisionStrings.reflectionPrompt}</span>
        <textarea
          value={reflection}
          placeholder={decisionStrings.reflectionPlaceholder}
          onChange={(e) => setReflection(e.target.value)}
        />
      </label>
    </Slip>
  );
}

function EventSlip({ d }: { d: PendingDecision }) {
  const ev = getEvent(d.eventId ?? '');
  const { chosen, choose } = useStamp();
  return (
    <Slip kind={eventStrings.categories[ev.category]} title={ev.title}>
      <p>{renderText(ev.body, d.vars)}</p>
      {ev.onTrigger && (
        <p className="slip-note">
          {decisionStrings.happened}：<Impacts effects={ev.onTrigger} />
        </p>
      )}
      <h3 className="sheet-title">{decisionStrings.impactTitle}</h3>
      <ol className="option-list">
        {ev.choices.map((c, i) => (
          <Option
            key={c.label}
            label={c.label}
            chosen={chosen === i}
            disabled={chosen !== null}
            onChoose={() => choose(i, () => actions().answerEvent(d.id, i))}
          >
            <Impacts effects={c.effects} />
            {c.hint && <span className="option-hint">{c.hint}</span>}
          </Option>
        ))}
      </ol>
    </Slip>
  );
}

function ReviewSlip({ d, company }: { d: PendingDecision; company: CompanyState }) {
  const year = company.history.slice(-MONTHS_PER_YEAR);
  const sum = (f: (r: (typeof year)[number]) => number) => year.reduce((s, r) => s + f(r), 0);
  const t = reviewStrings.summary;
  return (
    <Slip kind={reviewStrings.editorTitle} title={reviewStrings.title(Number(d.vars.year ?? 0))}>
      <p>{reviewStrings.lead}</p>
      <dl className="summary-grid">
        <div>
          <dt>{t.revenue}</dt>
          <dd className="num">{yen(sum((r) => r.revenue))}</dd>
        </div>
        <div>
          <dt>{t.profit}</dt>
          <dd className={`num ${sum((r) => r.operatingProfit) < 0 ? 'loss' : ''}`}>{yen(sum((r) => r.operatingProfit))}</dd>
        </div>
        <div>
          <dt>{t.hires}</dt>
          <dd className="num">{sum((r) => r.hires)}人</dd>
        </div>
        <div>
          <dt>{t.resignations}</dt>
          <dd className="num">{sum((r) => r.resignations)}人</dd>
        </div>
        <div>
          <dt>{t.engagement}</dt>
          <dd className="num">{(sum((r) => r.avgEngagement) / Math.max(1, year.length)).toFixed(1)}</dd>
        </div>
        <div>
          <dt>{t.headcount}</dt>
          <dd className="num">{company.employees.length}人</dd>
        </div>
      </dl>
      <div className="slip-actions">
        <button className="btn" onClick={() => actions().openEditor()}>
          {reviewStrings.change}
        </button>
        <button className="btn btn-primary" onClick={() => actions().finishReview(d.id)}>
          {reviewStrings.keep}
        </button>
      </div>
    </Slip>
  );
}

/** 判断待ちの先頭を出す（節目・イベント・毎年の見直し） */
export function DecisionModal({ company }: { company: CompanyState }) {
  const d = company.pendingDecisions[0];
  if (!d) return null;
  if (d.kind === 'milestone') return <MilestoneSlip key={d.id} d={d} />;
  if (d.kind === 'event') return <EventSlip key={d.id} d={d} />;
  return <ReviewSlip key={d.id} d={d} company={company} />;
}
