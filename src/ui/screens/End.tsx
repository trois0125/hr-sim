import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getIndustry } from '../../engine/data';
import { eventDefs } from '../../engine/eventData';
import { getLaw } from '../../engine/lawData';
import { summarizeRun } from '../../engine/summary';
import type { CompanyState, DiagnosisAxis, PolicySet } from '../../engine/types';
import { ATTRITION_REASONS, DIAGNOSIS_AXES, MONTHS_PER_YEAR } from '../../engine/types';
import { computeDiagnosis, diagnosisData } from '../../report/diagnosis';
import {
  buildTimeline,
  pickTurningPoints,
  pickVoices,
  runRival,
  yearlySeries,
  type TimelineEntry,
  type TurningPoint,
  type YearPoint,
} from '../../report/history';
import { optionName } from '../../store/game';
import { actions, useGame } from '../useGame';
import { endStrings, policyStrings, reasonNames, reportStrings as t, statusNames } from '../strings';
import { dateLabel, pct, yen } from '../format';

const INK = '#1e2b45';
const RIVAL = '#8a93a6';
const GRID = '#dde2df';

const eventOf = (id: string) => eventDefs.find((e) => e.id === id);
const changesText = (changes: { category: keyof PolicySet; option: string }[]) =>
  changes
    .map((c) => `${policyStrings.categories[c.category]}→${optionName(c.category, c.option as PolicySet[typeof c.category])}`)
    .join('、');

function timelineText(e: TimelineEntry): string {
  switch (e.kind) {
    case 'founding':
      return t.timeline.founding(e.headcount);
    case 'headcount':
      return t.timeline.headcount(e.threshold);
    case 'obligation':
      return t.timeline.obligation(e.names.join('、'));
    case 'violation':
      return t.timeline.violation(e.text);
    case 'policy':
      return t.timeline.policy(changesText(e.changes));
    case 'recession':
      return t.timeline.recession;
    case 'event': {
      const ev = eventOf(e.eventId);
      return t.timeline.event(ev?.title ?? e.eventId, ev?.choices[e.choiceIndex]?.label ?? '');
    }
    case 'reflection':
      return t.timeline.reflection(e.text);
    case 'end':
      return t.timeline.end(statusNames[e.status]);
  }
}

function turningTitle(p: TurningPoint): string {
  if (p.kind === 'event') {
    const ev = eventOf(p.eventId);
    return t.timeline.event(ev?.title ?? p.eventId, ev?.choices[p.choiceIndex]?.label ?? '');
  }
  if (p.kind === 'policy') {
    const how = p.method === 'consent' || p.method === 'rules' ? t.turning.method[p.method] : '';
    return t.turning.policy(changesText(p.changes)) + how;
  }
  return t.turning.law(getLaw(p.ruleId).name, p.violationMonths);
}

/** 年ごとの小さなグラフ（1つの指標） */
function SmallChart({
  title,
  data,
  rival,
  field,
  format,
}: {
  title: string;
  data: YearPoint[];
  rival?: YearPoint[];
  field: keyof YearPoint;
  format: (v: number) => string;
}) {
  const rows = Array.from({ length: Math.max(data.length, rival?.length ?? 0) }, (_, i) => ({
    year: `${i + 1}年目`,
    you: data[i]?.[field],
    rival: rival?.[i]?.[field],
  }));
  return (
    <figure className="small-chart">
      <figcaption>{title}</figcaption>
      <div className="small-chart-box">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => format(v)} />
            <Tooltip formatter={(v: number) => format(v)} />
            {rival && <Legend wrapperStyle={{ fontSize: 12 }} />}
            <Line dataKey="you" name={t.you} stroke={INK} strokeWidth={2} dot={false} isAnimationActive={false} />
            {rival && (
              <Line
                dataKey="rival"
                name={t.rival}
                stroke={RIVAL}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function AxisBar({ axis, score }: { axis: DiagnosisAxis; score: number }) {
  const a = diagnosisData.axes[axis];
  // −1（マイナス側）〜+1（プラス側）を、左（マイナス側）から右（プラス側）の位置にする
  const left = ((score + 1) / 2) * 100;
  return (
    <div className="axis-row">
      <span className={`axis-end${score < 0 ? ' axis-on' : ''}`}>{a.minus}</span>
      <span className="axis-track" aria-hidden="true">
        <span className="axis-mark" style={{ left: `${left}%` }} />
      </span>
      <span className={`axis-end${score >= 0 ? ' axis-on' : ''}`}>{a.plus}</span>
    </div>
  );
}

function rivalRow(label: string, you: string, rival: string) {
  return (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td className="num">{you}</td>
      <td className="num">{rival}</td>
    </tr>
  );
}

function Report({ company }: { company: CompanyState }) {
  const report = useMemo(() => {
    const rival = runRival(company);
    return {
      summary: summarizeRun(company),
      rivalSummary: summarizeRun(rival),
      rival,
      timeline: buildTimeline(company),
      series: yearlySeries(company.history),
      rivalSeries: yearlySeries(rival.history),
      voices: pickVoices(company),
      diagnosis: computeDiagnosis(company),
      turning: pickTurningPoints(company),
    };
  }, [company]);
  const industry = getIndustry(company.profile.industryId);
  const roleName = (id: string) => industry.roles.find((r) => r.id === id)?.name ?? id;
  const { summary: s, rivalSummary: rs, rival, diagnosis: d } = report;
  const resignations = company.departures.filter((x) => x.kind === 'resignation').length;
  const ym = (months: number) => t.yearsMonths(Math.floor(months / MONTHS_PER_YEAR), months % MONTHS_PER_YEAR);
  const c = t.charts;

  return (
    <main className="page report stack">
      <header className="end-head">
        <p className="muted">{t.title}</p>
        <h1>{company.profile.name}</h1>
        <p className="end-result">
          {endStrings.result(statusNames[company.status], Math.floor(company.month / MONTHS_PER_YEAR), company.month % MONTHS_PER_YEAR)}
        </p>
        <dl className="summary-grid">
          <div>
            <dt>{endStrings.summary.finalHeadcount}</dt>
            <dd className="num">{s.finalHeadcount}人</dd>
          </div>
          <div>
            <dt>{endStrings.summary.totalHires}</dt>
            <dd className="num">{s.totalHires}人</dd>
          </div>
          <div>
            <dt>{endStrings.summary.resignations}</dt>
            <dd className="num">{resignations}人</dd>
          </div>
          <div>
            <dt>{endStrings.summary.profit}</dt>
            <dd className={`num ${s.all.totalOperatingProfit < 0 ? 'loss' : ''}`}>{yen(s.all.totalOperatingProfit)}</dd>
          </div>
        </dl>
      </header>

      {/* 1. 会社の一生 */}
      <section className="sheet" aria-labelledby="r-life">
        <h2 id="r-life" className="report-title">
          {t.blocks.life}
        </h2>
        <ol className="timeline">
          {report.timeline.map((e, i) => (
            <li key={i} className={`tl-${e.kind}`}>
              <span className="feed-date num">{dateLabel(e.month)}</span>
              <span>{timelineText(e)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 2. 数字の推移 */}
      <section className="sheet" aria-labelledby="r-numbers">
        <h2 id="r-numbers" className="report-title">
          {t.blocks.numbers}
        </h2>
        <div className="chart-grid">
          <SmallChart title={c.revenue} data={report.series} field="revenue" format={yen} />
          <SmallChart title={c.operatingProfit} data={report.series} field="operatingProfit" format={yen} />
          <SmallChart title={c.laborCostRatio} data={report.series} field="laborCostRatio" format={(v) => pct(v, 0)} />
          <SmallChart title={c.headcount} data={report.series} field="headcount" format={(v) => `${Math.round(v)}人`} />
          <SmallChart title={c.attritionRate} data={report.series} field="attritionRate" format={(v) => pct(v, 0)} />
          <SmallChart title={c.engagement} data={report.series} field="engagement" format={(v) => v.toFixed(0)} />
        </div>
      </section>

      {/* 3. 同期創業の他社との比較 */}
      <section className="sheet" aria-labelledby="r-rival">
        <h2 id="r-rival" className="report-title">
          {t.blocks.rival}
        </h2>
        <p className="muted">{t.rivalLead}</p>
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th />
                <th scope="col">{t.you}</th>
                <th scope="col">{t.rival}</th>
              </tr>
            </thead>
            <tbody>
              {rivalRow(t.rivalRows.result, statusNames[company.status], statusNames[rival.status])}
              {rivalRow(t.rivalRows.years, ym(company.month), ym(rival.month))}
              {rivalRow(t.rivalRows.finalHeadcount, `${s.finalHeadcount}人`, `${rs.finalHeadcount}人`)}
              {rivalRow(t.rivalRows.totalProfit, yen(s.all.totalOperatingProfit), yen(rs.all.totalOperatingProfit))}
              {rivalRow(t.rivalRows.attrition, pct(s.all.attritionRate), pct(rs.all.attritionRate))}
              {rivalRow(t.rivalRows.engagement, s.all.engagement.toFixed(1), rs.all.engagement.toFixed(1))}
            </tbody>
          </table>
        </div>
        <div className="chart-grid">
          <SmallChart title={c.headcount} data={report.series} rival={report.rivalSeries} field="headcount" format={(v) => `${Math.round(v)}人`} />
          <SmallChart title={c.operatingProfit} data={report.series} rival={report.rivalSeries} field="operatingProfit" format={yen} />
          <SmallChart title={c.engagement} data={report.series} rival={report.rivalSeries} field="engagement" format={(v) => v.toFixed(0)} />
          <SmallChart title={c.attritionRate} data={report.series} rival={report.rivalSeries} field="attritionRate" format={(v) => pct(v, 0)} />
        </div>
      </section>

      {/* 4. 従業員の声 */}
      <section className="sheet" aria-labelledby="r-voices">
        <h2 id="r-voices" className="report-title">
          {t.blocks.voices}
        </h2>
        <div className="voice-periods">
          {report.voices.map((p) => (
            <section key={p.fromYear}>
              <h3 className="sheet-title">{t.voicePeriod(p.fromYear, p.toYear)}</h3>
              <ul className="feed">
                {p.voices.map((v, i) => (
                  <li key={i} className={`feed-voice tone-${v.tone}`}>
                    <span className="feed-date num">{dateLabel(v.month)}</span>
                    <span>
                      <q>{v.text}</q>{' '}
                      <span className="muted voice-who">
                        {v.name}（{roleName(v.role)}）{t.voiceKinds[v.kind] && `・${t.voiceKinds[v.kind]}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {resignations > 0 && (
          <>
            <h3 className="sheet-title">{endStrings.reasonsTitle}</h3>
            <dl className="reason-list">
              {[...ATTRITION_REASONS]
                .sort((a, b) => s.reasons[b] - s.reasons[a])
                .map((r) => (
                  <div key={r}>
                    <dt>{reasonNames[r]}</dt>
                    <dd>
                      <span className="reason-track" aria-hidden="true">
                        <span style={{ width: `${s.reasons[r] * 100}%` }} />
                      </span>
                    </dd>
                    <dd className="num">{pct(s.reasons[r], 0)}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
      </section>

      {/* 5. 人事スタイル診断 */}
      <section className="sheet style-card" aria-labelledby="r-style">
        <h2 id="r-style" className="report-title">
          {t.blocks.style}
        </h2>
        <p className="style-name">{d.type.name}</p>
        <p className="style-summary">{d.type.summary}</p>
        <div className="axes">
          {DIAGNOSIS_AXES.map((a) => (
            <AxisBar key={a} axis={a} score={d.axes[a].score} />
          ))}
        </div>
        <dl className="style-notes">
          <div>
            <dt>{t.strength}</dt>
            <dd>{d.type.strength}</dd>
          </div>
          <div>
            <dt>{t.pitfall}</dt>
            <dd>{d.type.pitfall}</dd>
          </div>
        </dl>
        <p className="slip-note">{t.styleLead}</p>
      </section>

      {/* 6. 分岐点の解説 */}
      <section className="sheet" aria-labelledby="r-turning">
        <h2 id="r-turning" className="report-title">
          {t.blocks.turning}
        </h2>
        <p className="muted">{t.turningLead}</p>
        <ol className="turning-list">
          {report.turning.map((p, i) => (
            <li key={i}>
              <span className="feed-date num">{dateLabel(p.month)}</span>
              <div>
                <strong>{turningTitle(p)}</strong>
                <p>{p.lesson}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="page-actions">
        <button className="btn btn-primary" onClick={() => actions().goto('title')}>
          {endStrings.again}
        </button>
      </div>
    </main>
  );
}

/** 終了画面：社史レポート（§9 の6ブロック） */
export function End() {
  const company = useGame((s) => s.company);
  if (!company) return null;
  return <Report company={company} />;
}
