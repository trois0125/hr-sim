import { useState } from 'react';
import { initiativeAvailability, initiativesFor } from '../../engine/initiatives';
import { getProgram, programMonthlyCost } from '../../engine/programs';
import type { CompanyState } from '../../engine/types';
import { actions, useGame } from '../useGame';
import { initiativeStrings as t } from '../strings';
import { dateLabel, yen } from '../format';

/** 施策のメニュー（右の欄の「施策を打つ」から開く。開いている間は時間を止める） */
export function InitiativeMenu({ company }: { company: CompanyState }) {
  const open = useGame((s) => s.initiativesOpen);
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="initiative-title">
      <div className="slip">
        <div className="slip-head">
          <h2 id="initiative-title">{t.menuTitle}</h2>
          <button className="btn" onClick={() => actions().closeInitiatives()}>
            {t.close}
          </button>
        </div>
        <div className="slip-body">
          <p>{t.menuLead}</p>
          <ul className="initiative-list">
            {initiativesFor(company).map((ev) => {
              const a = initiativeAvailability(company, ev);
              let note: string | null = null;
              if (!a.available) {
                const u = t.unavailable;
                note =
                  a.reason === 'cooldown'
                    ? u.cooldown(a.months ?? 0)
                    : a.reason === 'headcount'
                      ? u.headcount(a.months ?? 0)
                      : u[a.reason];
              }
              return (
                <li key={ev.id}>
                  <div className="initiative-text">
                    <strong>{ev.title}</strong>
                    <span className="muted">{ev.menuSummary}</span>
                    {note && <span className="initiative-note">{note}</span>}
                  </div>
                  <button className="btn" disabled={!a.available} onClick={() => actions().startInitiative(ev.id)}>
                    {t.run}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** 右の欄：施策を打つボタンと、整えている個別制度の一覧（止められる） */
export function ProgramsPanel({ company }: { company: CompanyState }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const running = company.status === 'running';
  return (
    <section className="sheet" aria-labelledby="programs-title">
      <h2 id="programs-title" className="sheet-title">
        {t.sectionTitle}
      </h2>
      <button className="btn btn-primary initiative-open" disabled={!running} onClick={() => actions().openInitiatives()}>
        {t.open}
      </button>
      <h3 className="programs-sub">{t.programsTitle}</h3>
      {company.programs.length === 0 ? (
        <p className="muted programs-empty">{t.noPrograms}</p>
      ) : (
        <ul className="program-list">
          {company.programs.map((p) => {
            const def = getProgram(p.id);
            return (
              <li key={p.id}>
                <div>
                  <strong title={def.summary}>{def.name}</strong>
                  <span className="muted num">
                    {t.since(dateLabel(p.since))}・{t.monthlyCost(yen(programMonthlyCost({ programs: [p] }, company.employees.length)))}
                  </span>
                </div>
                {confirming === p.id ? (
                  <div className="program-confirm" role="alert">
                    <span>{t.stopConfirm(def.name)}</span>
                    <div className="choice-row">
                      <button
                        className="btn"
                        onClick={() => {
                          setConfirming(null);
                          actions().stopProgram(p.id);
                        }}
                      >
                        {t.stopYes}
                      </button>
                      <button className="btn" onClick={() => setConfirming(null)}>
                        {t.stopNo}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-quiet" disabled={!running} onClick={() => setConfirming(p.id)}>
                    {t.stop}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
