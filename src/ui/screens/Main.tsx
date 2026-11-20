import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { getIndustry, industryReferences } from '../../engine/data';
import type { Sourced } from '../../engine/types';
import type { CompanyState, Employee, PolicySet } from '../../engine/types';
import { MONTHS_PER_YEAR } from '../../engine/types';
import { optionName } from '../../store/game';
import { DEV_SPEEDS, SPEEDS, STAFF_PAGE } from '../config';
import { usesLayerView } from '../../engine/layers';
import { storeCount } from '../../engine/performance';
import { runwayMonths } from '../../engine/eventTriggers';
import { DecisionModal } from '../parts/DecisionModal';
import { LayerView } from '../parts/LayerView';
import { EmployeeDetail } from '../parts/EmployeeDetail';
import { Lesson } from '../parts/Lesson';
import { InitiativeMenu, ProgramsPanel } from '../parts/Initiatives';
import { BusinessView, OrgView } from '../parts/Dashboard';
import { HelpButton } from '../parts/Guide';
import { PolicyEditor } from '../parts/PolicyEditor';
import { actions, useGame } from '../useGame';
import {
  dashboardStrings,
  decisionStrings,
  eventStrings,
  evidenceStrings,
  guideStrings,
  mainStrings as t,
  orgStrings,
  policyStrings,
  strings,
} from '../strings';
import { dateLabel, pct, yen } from '../format';

/** 1か月の進み具合。いまの月が始まるたびに、その月の長さで左から右へ伸びる。止まっている間は空 */
function MonthProgress() {
  const cycle = useGame((s) => s.cycle);
  return (
    <div className="month-progress" aria-hidden="true">
      {cycle && (
        <span
          key={cycle.startedAt}
          className="month-progress-fill"
          style={{ animationDuration: `${cycle.ms}ms` }}
        />
      )}
    </div>
  );
}

/** 現場・事業・組織のタブ（§14.2） */
function ViewTabs() {
  const view = useGame((s) => s.view);
  const views = ['floor', 'business', 'org'] as const;
  return (
    <nav className="view-tabs" aria-label={dashboardStrings.tabsLabel}>
      {views.map((v) => (
        <button key={v} className="view-tab" aria-pressed={view === v} onClick={() => actions().setView(v)}>
          {dashboardStrings.tabs[v]}
        </button>
      ))}
    </nav>
  );
}

function TopBar({ company }: { company: CompanyState }) {
  const speed = useGame((s) => s.speed);
  const stepMonths = useGame((s) => s.stepMonths);
  const cycle = useGame((s) => s.cycle);
  const speeds = [...SPEEDS, ...DEV_SPEEDS];
  return (
    <header className="topbar">
      <span className="topbar-company">{company.profile.name}</span>
      <span className="topbar-date num">{dateLabel(company.month)}</span>
      <div className="speed" role="group" aria-label={t.speed}>
        <button aria-pressed={speed === 0} onClick={() => actions().setSpeed(0)}>
          {t.pause}
        </button>
        {speeds.map((s) => (
          <button key={s} aria-pressed={speed === s} onClick={() => actions().setSpeed(s)}>
            {s}x
          </button>
        ))}
      </div>
      <div className="speed step-toggle" role="group" aria-label={t.stepLabel}>
        {([1, 3] as const).map((m) => (
          <button key={m} aria-pressed={stepMonths === m} onClick={() => actions().setStepMonths(m)}>
            {t.stepOptions[m]}
          </button>
        ))}
      </div>
      <span className="topbar-cash num">
        {t.cash} <strong className={company.cash < 0 ? 'loss' : ''}>{yen(company.cash)}</strong>
      </span>
      <span className="visually-hidden">
        {cycle ? t.progressRunning : t.progressStopped}
      </span>
      <MonthProgress />
    </header>
  );
}

/** 指標のそばに出す業種の目安（統計など）。出典は title で見せる */
function Reference({ data, format }: { data: Sourced<number> | undefined; format: (v: number) => string }) {
  if (!data) return null;
  return (
    <small className="metric-ref" title={data.source}>
      {evidenceStrings.reference(format(data.value), evidenceStrings.basis[data.basis])}
    </small>
  );
}

function Metrics({ company }: { company: CompanyState }) {
  const h = company.history;
  const last = h[h.length - 1];
  const year = h.slice(-MONTHS_PER_YEAR);
  const resign = year.reduce((s, r) => s + r.resignations, 0);
  const avgHead = year.reduce((s, r) => s + r.headcount, 0) / Math.max(1, year.length);
  const chart = year.map((r) => ({ m: dateLabel(r.month), head: r.headcount, eng: Math.round(r.avgEngagement) }));
  const onLeave = company.employees.filter((e) => e.leave).length;
  const m = t.metrics;
  const industry = getIndustry(company.profile.industryId);
  const refs = industryReferences(company.profile.industryId);
  // 飲食：店舗の数と店長のいない店。SaaS：いまの赤字が続いたら資金が何か月もつか
  const stores = industry.store ? storeCount(industry, company.employees.length) : 0;
  const managers = company.employees.filter((e) => !e.leave && industry.roles.find((r) => r.id === e.role)?.kind === 'management').length;
  const recent = h.slice(-3);
  const monthlyProfit = recent.reduce((s, r) => s + r.operatingProfit, 0) / Math.max(1, recent.length);
  const runway = monthlyProfit >= 0 ? null : runwayMonths(company.cash, monthlyProfit);
  return (
    <section className="sheet" aria-labelledby="metrics-title">
      <h2 id="metrics-title" className="sheet-title">
        {t.metricsTitle}
      </h2>
      <dl className="metric-list">
        <div className="metric">
          <dt>{m.headcount}</dt>
          <dd className="num">{company.employees.length}人</dd>
        </div>
        <div className="metric">
          <dt>{m.revenue}</dt>
          <dd className="num">{last ? yen(last.revenue) : '-'}</dd>
        </div>
        <div className="metric">
          <dt>{m.profit}</dt>
          <dd className={`num ${last && last.operatingProfit < 0 ? 'loss' : ''}`}>{last ? yen(last.operatingProfit) : '-'}</dd>
        </div>
        <div className="metric">
          <dt>{m.laborCostRatio}</dt>
          <dd className="num">{last && last.revenue > 0 ? pct(last.labor.total / last.revenue) : '-'}</dd>
          <Reference data={refs.laborCostRatio} format={pct} />
        </div>
        <div className="metric">
          <dt>{m.attrition}</dt>
          <dd className="num">{avgHead > 0 ? pct((resign / avgHead) * (MONTHS_PER_YEAR / Math.max(1, year.length))) : '-'}</dd>
          <Reference data={refs.attritionRate} format={pct} />
        </div>
        <div className="metric">
          <dt>{m.engagement}</dt>
          <dd className="num">{last ? last.avgEngagement.toFixed(1) : '-'}</dd>
        </div>
        <div className="metric">
          <dt>{m.overtime}</dt>
          <dd className="num">{last ? `${Math.round(last.overtimeHours)}時間` : '-'}</dd>
          <Reference data={refs.overtimeHours} format={(v) => `${Math.round(v)}時間`} />
        </div>
        {onLeave > 0 && (
          <div className="metric">
            <dt>{m.onLeave}</dt>
            <dd className="num">{onLeave}人</dd>
          </div>
        )}
        {industry.store && (
          <div className="metric">
            <dt>{m.stores}</dt>
            <dd className={`num ${stores - 1 - managers > 0 ? 'warn' : ''}`}>{m.storesValue(stores, Math.max(0, stores - 1 - managers))}</dd>
          </div>
        )}
        {industry.recurringRevenue && (
          <div className="metric">
            <dt>{m.runway}</dt>
            <dd className={`num ${runway !== null && runway < 12 ? 'loss' : ''}`}>{m.runwayValue(runway)}</dd>
          </div>
        )}
      </dl>
      {chart.length > 1 && (
        <div className="chart-box" aria-label={t.chartTitle}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <YAxis yAxisId="head" tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
              <YAxis yAxisId="eng" orientation="right" domain={[0, 100]} hide />
              <Tooltip />
              <Line yAxisId="head" dataKey="head" name={m.headcount} stroke="#1e2b45" dot={false} isAnimationActive={false} />
              <Line yAxisId="eng" dataKey="eng" name={m.engagement} stroke="#2e6a4f" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

type Sort = keyof typeof t.sorts;
const SORTERS: Record<Sort, (a: Employee, b: Employee) => number> = {
  engagement: (a, b) => a.engagement - b.engagement,
  ability: (a, b) => b.ability - a.ability,
  tenure: (a, b) => b.tenureMonths - a.tenureMonths,
};

function Staff({ company }: { company: CompanyState }) {
  const [sort, setSort] = useState<Sort>('engagement');
  const [shown, setShown] = useState(STAFF_PAGE);
  const industry = getIndustry(company.profile.industryId);
  const roleName = (id: string) => industry.roles.find((r) => r.id === id)?.name ?? id;
  const list = useMemo(() => [...company.employees].sort(SORTERS[sort]), [company.employees, sort]);
  const c = t.columns;
  return (
    <section className="sheet" aria-labelledby="staff-title">
      <div className="staff-tools">
        <h2 id="staff-title" className="staff-title">
          {t.employeesTitle}（{company.employees.length}人）
        </h2>
        <label>
          {t.sortBy}{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(Object.keys(t.sorts) as Sort[]).map((k) => (
              <option key={k} value={k}>
                {t.sorts[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="staff-table">
        <thead>
          <tr>
            <th>{c.name}</th>
            <th>{c.role}</th>
            <th className="right hide-narrow">{c.age}</th>
            <th>{c.engagement}</th>
            <th className="right hide-narrow">{c.salary}</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, shown).map((e) => {
            const tags = [
              e.isKeyPerson ? t.keyPerson : '',
              e.employmentType === 'part' ? t.partTime : '',
              e.affiliation === 'secondee' ? t.secondee : '',
              e.leave ? eventStrings.leaveKinds[e.leave.kind] : '',
            ].filter(Boolean);
            const lv = e.engagement < 40 ? ' low' : e.engagement > 60 ? ' high' : '';
            return (
              <tr
                key={e.id}
                className="row-button"
                tabIndex={0}
                onClick={() => actions().selectEmployee(e.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    actions().selectEmployee(e.id);
                  }
                }}
              >
                <td>
                  {e.name}
                  {tags.map((x) => (
                    <span key={x} className="tag">
                      {x}
                    </span>
                  ))}
                </td>
                <td>{roleName(e.role)}</td>
                <td className="right num hide-narrow">{e.age}</td>
                <td className="num">
                  <span className={`bar${lv}`} aria-hidden="true">
                    <span style={{ width: `${e.engagement}%` }} />
                  </span>
                  {e.engagement.toFixed(0)}
                </td>
                <td className="right num hide-narrow">{yen(e.salaryMonthly)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length > shown && (
        <button className="btn btn-quiet" onClick={() => setShown(list.length)}>
          {t.showMore(list.length - shown)}
        </button>
      )}
    </section>
  );
}

function Feed() {
  const feed = useGame((s) => s.feed);
  return (
    <section className="sheet" aria-labelledby="feed-title">
      <h2 id="feed-title" className="sheet-title">
        {t.feedTitle}
      </h2>
      <ul className="feed" aria-live="polite">
        {feed.map((f) => (
          <li key={f.id} className={`kind-${f.kind} tone-${f.tone}${f.kind === 'voice' ? ' feed-voice' : ''}`}>
            <span className="feed-date num">{dateLabel(f.month)}</span>
            <span>
              {f.kind === 'voice' ? (
                <>
                  <q>{f.text}</q>{' '}
                  {f.employeeId && (
                    <button className="feed-name" onClick={() => actions().selectEmployee(f.employeeId ?? null)}>
                      {f.name}
                    </button>
                  )}
                </>
              ) : (
                f.text
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Policies({ company }: { company: CompanyState }) {
  return (
    <section className="sheet" aria-labelledby="policies-title">
      <h2 id="policies-title" className="sheet-title">
        {t.policiesTitle}
      </h2>
      <dl className="policy-list">
        {(Object.keys(policyStrings.categories) as (keyof PolicySet)[]).map((k) => (
          <div key={k}>
            <dt>{policyStrings.categories[k]}</dt>
            <dd>{optionName(k, company.policies[k])}</dd>
          </div>
        ))}
        <div>
          <dt>{orgStrings.row}</dt>
          <dd>
            {orgStrings.forms[company.organization.form]}
            <HelpButton target={{ kind: 'orgForm', id: company.organization.form }} />
            {company.organization.transition && company.organization.transition.until > company.month && (
              <span className="tag warn-tag">{orgStrings.inTransition(company.organization.transition.until - company.month)}</span>
            )}
          </dd>
        </div>
      </dl>
      <button className="btn" onClick={() => actions().openEditor()}>
        {t.reviewPolicies}
      </button>
      <div className="side-links">
        <button className="btn" onClick={() => actions().openGuide()}>
          {guideStrings.open}
        </button>
        <button className="btn" onClick={() => actions().openEvidence()}>
          {strings.evidence}
        </button>
      </div>
    </section>
  );
}

export function Main() {
  const company = useGame((s) => s.company);
  const editorOpen = useGame((s) => s.editorOpen);
  const selected = useGame((s) => s.selectedEmployeeId);
  const saveFailed = useGame((s) => s.saveFailed);
  const view = useGame((s) => s.view);
  const decisionHidden = useGame((s) => s.decisionHidden);
  if (!company) return null;
  const waiting = company.pendingDecisions.length > 0;
  return (
    <>
      <TopBar company={company} />
      <ViewTabs />
      {waiting && decisionHidden && !editorOpen && (
        <div className="decision-bar" role="status">
          <span>{decisionStrings.waitingBar(company.pendingDecisions.length)}</span>
          <button className="btn btn-primary" onClick={() => actions().showDecision()}>
            {decisionStrings.reopen}
          </button>
        </div>
      )}
      {view === 'business' && (
        <main className="dashboard-page">
          <BusinessView company={company} />
        </main>
      )}
      {view === 'org' && (
        <main className="dashboard-page">
          <OrgView company={company} />
        </main>
      )}
      {view === 'floor' && (
        <main className="main-grid">
        <div className="side">
          {saveFailed && (
            <p className="save-failed" role="alert">
              {strings.saveFailed}
            </p>
          )}
          {waiting && <p className="waiting-note">{t.waiting}</p>}
          <Metrics company={company} />
        </div>
        <div className="main-center">
          <Feed />
          {usesLayerView(company.employees.length) ? <LayerView company={company} /> : <Staff company={company} />}
        </div>
        <div className="side side-right">
          <Policies company={company} />
          <ProgramsPanel company={company} />
        </div>
        </main>
      )}
      {editorOpen ? <PolicyEditor company={company} /> : !decisionHidden && <DecisionModal company={company} />}
      {!waiting && !editorOpen && <InitiativeMenu company={company} />}
      {selected && !editorOpen && (!waiting || decisionHidden) && <EmployeeDetail company={company} id={selected} />}
      <Lesson />
    </>
  );
}
