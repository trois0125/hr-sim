import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { summarizeRun } from '../../engine/summary';
import { ATTRITION_REASONS, MONTHS_PER_YEAR } from '../../engine/types';
import { actions, useGame } from '../useGame';
import { endStrings as t, reasonNames, statusNames } from '../strings';
import { dateLabel, pct, yen } from '../format';

export function End() {
  const company = useGame((s) => s.company);
  if (!company) return null;
  const s = summarizeRun(company);
  const resignations = company.departures.filter((d) => d.kind === 'resignation').length;
  // 年ごとの社員数と納得感
  const chart = [];
  for (let y = 0; y * MONTHS_PER_YEAR < company.history.length; y++) {
    const rows = company.history.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    const last = rows[rows.length - 1];
    if (!last) continue;
    chart.push({
      year: `${y + 1}年目`,
      head: last.headcount,
      eng: Math.round(rows.reduce((a, r) => a + r.avgEngagement, 0) / rows.length),
    });
  }
  const sm = t.summary;
  return (
    <main className="page stack">
      <header className="end-head">
        <h1>{company.profile.name}</h1>
        <p className="end-result">
          {t.result(statusNames[company.status], Math.floor(company.month / MONTHS_PER_YEAR), company.month % MONTHS_PER_YEAR)}
        </p>
        <dl className="summary-grid">
          <div>
            <dt>{sm.finalHeadcount}</dt>
            <dd className="num">{s.finalHeadcount}人</dd>
          </div>
          <div>
            <dt>{sm.totalHires}</dt>
            <dd className="num">{s.totalHires}人</dd>
          </div>
          <div>
            <dt>{sm.resignations}</dt>
            <dd className="num">{resignations}人</dd>
          </div>
          <div>
            <dt>{sm.attrition}</dt>
            <dd className="num">{pct(s.all.attritionRate)}</dd>
          </div>
          <div>
            <dt>{sm.engagement}</dt>
            <dd className="num">{s.all.engagement.toFixed(1)}</dd>
          </div>
          <div>
            <dt>{sm.profit}</dt>
            <dd className={`num ${s.all.totalOperatingProfit < 0 ? 'loss' : ''}`}>{yen(s.all.totalOperatingProfit)}</dd>
          </div>
        </dl>
      </header>

      <section className="sheet">
        <h2 className="sheet-title">{t.chartTitle}</h2>
        <div className="end-chart">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#dde2df" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="head" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis yAxisId="eng" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="head" dataKey="head" name="社員数" stroke="#1e2b45" dot={false} isAnimationActive={false} />
              <Line yAxisId="eng" dataKey="eng" name="納得感" stroke="#2e6a4f" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {resignations > 0 && (
        <section className="sheet">
          <h2 className="sheet-title">{t.reasonsTitle}</h2>
          <dl className="reason-list">
            {[...ATTRITION_REASONS]
              .sort((a, b) => s.reasons[b] - s.reasons[a])
              .map((r) => (
                <div key={r}>
                  <dt>{reasonNames[r]}</dt>
                  <dd>
                    <span className="factor-track" aria-hidden="true">
                      <span className="factor-fill" style={{ width: `${s.reasons[r] * 100}%`, display: 'block' }} />
                    </span>
                  </dd>
                  <dd className="num">{pct(s.reasons[r], 0)}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      {company.reflections.length > 0 && (
        <section className="sheet">
          <h2 className="sheet-title">{t.reflectionsTitle}</h2>
          <ul className="feed">
            {company.reflections.map((r, i) => (
              <li key={i}>
                <span className="feed-date num">{dateLabel(r.month)}</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="slip-note">{t.reportNote}</p>
      <div className="page-actions">
        <button className="btn btn-primary" onClick={() => actions().goto('title')}>
          {t.again}
        </button>
      </div>
    </main>
  );
}
