import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getIndustry } from '../../engine/data';
import { eventDefs, localizeEvent } from '../../engine/eventData';
import { getLaw } from '../../engine/lawData';
import { summarizeRun } from '../../engine/summary';
import type { CompanyState, DiagnosisAxis, IndustryId, PolicySet } from '../../engine/types';
import { ATTRITION_REASONS, DIAGNOSIS_AXES, MONTHS_PER_YEAR } from '../../engine/types';
import { computeDiagnosis, diagnosisData } from '../../report/diagnosis';
import {
  buildTimeline,
  pickLessons,
  pickVoices,
  runRival,
  yearlySeries,
  type LessonPoint,
  type TimelineEntry,
  type YearPoint,
} from '../../report/history';
import {
  buildRetrospective,
  RETRO_METRICS,
  type Arrow,
  type ChangeItem,
  type RetroCard,
  type RetroMetric,
  type WindowStats,
} from '../../report/retrospective';
import { getProgram } from '../../engine/programs';
import { economyLabel } from '../parts/Dashboard';
import { optionName } from '../../store/game';
import { actions, useGame } from '../useGame';
import { endStrings, factorNames, orgStrings, policyStrings, reasonNames, reportStrings as t, statusNames } from '../strings';
import { dateLabel, pct, yen } from '../format';

const INK = '#1e2b45';
const RIVAL = '#8a93a6';
const GRID = '#dde2df';

/** 業種に合わせた文のイベント */
const eventOf = (id: string, industryId: IndustryId) => {
  const e = eventDefs.find((x) => x.id === id);
  return e ? localizeEvent(e, industryId) : undefined;
};
const changesText = (changes: { category: keyof PolicySet; option: string }[]) =>
  changes
    .map((c) => `${policyStrings.categories[c.category]}→${optionName(c.category, c.option as PolicySet[typeof c.category])}`)
    .join('、');

function timelineText(e: TimelineEntry, industryId: IndustryId): string {
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
      const ev = eventOf(e.eventId, industryId);
      return t.timeline.event(ev?.title ?? e.eventId, ev?.choices[e.choiceIndex]?.label ?? '');
    }
    case 'reflection':
      return t.timeline.reflection(e.text);
    case 'end':
      return t.timeline.end(statusNames[e.status]);
  }
}

function lessonTitle(p: LessonPoint, industryId: IndustryId): string {
  if (p.kind === 'event') {
    const ev = eventOf(p.eventId, industryId);
    return t.timeline.event(ev?.title ?? p.eventId, ev?.choices[p.choiceIndex]?.label ?? '');
  }
  return t.turning.law(getLaw(p.ruleId).name, p.violationMonths);
}

// ---------------------------------------------------------------------------
// 変更の振り返り（§14.7）
// ---------------------------------------------------------------------------

/** 見出しに並べる項目の上限（超えたら「ほか n 件」） */
const RETRO_TITLE_ITEMS = 3;

function changeItemText(item: ChangeItem, industryId: IndustryId): string {
  switch (item.kind) {
    case 'policy': {
      const how = item.method === 'consent' || item.method === 'rules' ? t.retroItem.method[item.method] : '';
      return t.retroItem.policy(changesText(item.changes)) + how;
    }
    case 'initiative':
      return t.retroItem.initiative(eventOf(item.eventId, industryId)?.title ?? item.eventId);
    case 'program':
      return t.retroItem.program[item.action](getProgram(item.programId).name);
    case 'reorg':
      return t.retroItem.reorg(orgStrings.forms[item.from], orgStrings.forms[item.to]);
  }
}

function retroTitle(card: RetroCard, industryId: IndustryId): string {
  const texts = card.group.items.map((i) => changeItemText(i, industryId));
  if (texts.length <= RETRO_TITLE_ITEMS + 1) return texts.join('、');
  return `${texts.slice(0, RETRO_TITLE_ITEMS).join('、')}、${t.retroMore(texts.length - RETRO_TITLE_ITEMS)}`;
}

const metricFormat: Record<RetroMetric, (v: number) => string> = {
  laborCostRatio: (v) => pct(v, 1),
  operatingProfit: yen,
  attritionRate: (v) => pct(v, 0),
  engagement: (v) => v.toFixed(1),
};

function metricCell(w: WindowStats, m: RetroMetric): string {
  const v = w[m];
  return v === null ? t.retroDash : metricFormat[m](v);
}

function ArrowMark({ a }: { a: Arrow }) {
  const label = t.retroToneLabels[a.tone];
  return (
    <span className={`retro-arrow retro-${a.tone}`} title={label || undefined} aria-label={label || undefined}>
      {t.retroArrows[a.dir]}
    </span>
  );
}

function RetroCardView({ card, industryId, roleName }: { card: RetroCard; industryId: IndustryId; roleName: (id: string) => string }) {
  const reason = (r: WindowStats['topReason']) => (r ? reasonNames[r] : null);
  return (
    <li className="retro-card">
      <h3 className="retro-title">
        <span className="feed-date num">{dateLabel(card.group.first)}</span> {retroTitle(card, industryId)}
      </h3>
      <div className="table-scroll">
        <table className="compare-table retro-table">
          <thead>
            <tr>
              <th />
              <th scope="col">{t.retroCols.before}</th>
              <th scope="col">{t.retroCols.soon}</th>
              <th scope="col">{t.retroCols.later}</th>
            </tr>
          </thead>
          <tbody>
            {RETRO_METRICS.map((m) => (
              <tr key={m}>
                <th scope="row">{t.retroRows[m]}</th>
                <td className="num">{metricCell(card.before, m)}</td>
                <td className="num">
                  {metricCell(card.soon, m)} <ArrowMark a={card.arrows[m].soon} />
                </td>
                <td className="num">
                  {metricCell(card.later, m)} <ArrowMark a={card.arrows[m].later} />
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">{t.retroRows.hires}</th>
              <td className="num">{card.before.hires}</td>
              <td className="num">{card.soon.hires}</td>
              <td className="num">{card.later.hires}</td>
            </tr>
            <tr className="retro-context">
              <th scope="row">{t.retroRows.economy}</th>
              <td>{economyLabel(card.before.economy)}</td>
              <td>{economyLabel(card.soon.economy)}</td>
              <td>{economyLabel(card.later.economy)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {(card.factorUp || card.factorDown) && (
        <p className="retro-line">
          {t.retroFactors(card.factorUp && factorNames[card.factorUp], card.factorDown && factorNames[card.factorDown])}
        </p>
      )}
      <p className="retro-line">{t.retroReasons(reason(card.before.topReason), reason(card.later.topReason))}</p>
      {card.voices.length > 0 && (
        <>
          <p className="retro-line retro-voices-title">{t.retroVoicesTitle}</p>
          <ul className="feed">
            {card.voices.map((v, i) => (
              <li key={i} className={`feed-voice tone-${v.tone}`}>
                <span className="feed-date num">{dateLabel(v.month)}</span>
                <span>
                  <q>{v.text}</q> <span className="muted voice-who">{v.name}（{roleName(v.role)}）</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="slip-note">※{t.retroNote}</p>
    </li>
  );
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
      retro: buildRetrospective(company),
      lessons: pickLessons(company),
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

      {/* 1. 人事スタイル診断 */}
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

      {/* 2. 変更の振り返り */}
      <section className="sheet" aria-labelledby="r-retro">
        <h2 id="r-retro" className="report-title">
          {t.blocks.retro}
        </h2>
        <p className="muted">{t.retroLead}</p>
        {report.retro.length === 0 ? (
          <p>{t.retroEmpty}</p>
        ) : (
          <ol className="retro-list">
            {report.retro.map((card) => (
              <RetroCardView key={card.group.first} card={card} industryId={company.profile.industryId} roleName={roleName} />
            ))}
          </ol>
        )}
      </section>

      {/* 3. 法令と出来事の学び */}
      <section className="sheet" aria-labelledby="r-turning">
        <h2 id="r-turning" className="report-title">
          {t.blocks.turning}
        </h2>
        <p className="muted">{t.turningLead}</p>
        <ol className="turning-list">
          {report.lessons.map((p, i) => (
            <li key={i}>
              <span className="feed-date num">{dateLabel(p.month)}</span>
              <div>
                <strong>{lessonTitle(p, company.profile.industryId)}</strong>
                <p>{p.lesson}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. 会社の一生 */}
      <section className="sheet" aria-labelledby="r-life">
        <h2 id="r-life" className="report-title">
          {t.blocks.life}
        </h2>
        <ol className="timeline">
          {report.timeline.map((e, i) => (
            <li key={i} className={`tl-${e.kind}`}>
              <span className="feed-date num">{dateLabel(e.month)}</span>
              <span>{timelineText(e, company.profile.industryId)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 5. 数字の推移 */}
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

      {/* 6. 同期創業の他社との比較 */}
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

      {/* 7. 従業員の声 */}
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

      <div className="page-actions">
        <button className="btn btn-primary" onClick={() => actions().goto('title')}>
          {endStrings.again}
        </button>
      </div>
    </main>
  );
}

/** 終了画面：社史レポート（§9 の6ブロック。§14.7 で診断を先頭に、変更の振り返りを足した） */
export function End() {
  const company = useGame((s) => s.company);
  if (!company) return null;
  return <Report company={company} />;
}
