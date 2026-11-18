import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { coef } from '../../engine/coefficients';
import { gameDate } from '../../engine/calendar';
import {
  ageBands,
  bucketize,
  businessSeries,
  gradeCounts,
  LABOR_PARTS,
  orgChart,
  orgSeries,
  PERIODS,
  type Bucket,
  type Period,
} from '../../engine/dashboard';
import { getIndustry } from '../../engine/data';
import { overtimeCap } from '../../engine/performance';
import type { CompanyState } from '../../engine/types';
import { ATTRITION_REASONS, ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from '../../engine/types';
import { actions, useGame } from '../useGame';
import { dashboardStrings as t, factorNames, reasonNames } from '../strings';
import { dateLabel, pct, yen } from '../format';
import { AXIS_TICK, BASELINE, GRID, SERIES } from '../chartTheme';

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

const QUARTER = 3;

/** 期間の名前（グラフの横軸） */
function bucketLabel(b: Pick<Bucket, 'unit' | 'startMonth'>): string {
  if (b.unit === 'month') return t.bucket.month(gameDate(b.startMonth).month);
  const year = Math.floor(b.startMonth / MONTHS_PER_YEAR) + 1;
  if (b.unit === 'year') return t.bucket.year(year);
  return t.bucket.quarter(year, Math.floor((b.startMonth % MONTHS_PER_YEAR) / QUARTER) + 1);
}

/** 期間のくわしい名前（ツールチップと表） */
function bucketTitle(b: Pick<Bucket, 'unit' | 'startMonth' | 'endMonth'>): string {
  if (b.unit === 'month') return dateLabel(b.startMonth);
  return `${bucketLabel(b)}（${dateLabel(b.startMonth)}〜${dateLabel(b.endMonth)}）`;
}

/** 金額の目盛り（万円・億円） */
const yenTick = (v: number) => (v === 0 ? '0' : yen(v).replace('円', ''));
const pctTick = (v: number) => `${Math.round(v * 100)}%`;

type Column<R> = { key: string; label: string; value: (r: R) => string };

/** グラフ1つぶんの枠。「表で見る」で、同じ数字を表に切り替える */
function ChartCard<R>({
  title,
  note,
  rows,
  columns,
  children,
  height = 220,
}: {
  title: string;
  note?: string;
  rows: readonly R[];
  columns: Column<R>[];
  children: ReactNode;
  height?: number;
}) {
  const [table, setTable] = useState(false);
  return (
    <section className="sheet chart-card">
      <div className="chart-card-head">
        <h3 className="sheet-title">{title}</h3>
        <button className="btn btn-quiet chart-toggle" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? t.showChart : t.showTable}
        </button>
      </div>
      {note && <p className="chart-note muted">{note}</p>}
      {table ? (
        <div className="table-scroll">
          <table className="staff-table chart-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.key === 'period' ? '' : 'num right'}>
                      {c.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot" style={{ height }}>
          <ResponsiveContainer>{children as React.ReactElement}</ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

const LINE = {
  strokeWidth: 2,
  dot: false,
  isAnimationActive: false,
  connectNulls: false,
} as const;
const BAR = { isAnimationActive: false, maxBarSize: 24 } as const;
const legendStyle = { fontSize: 12 };
/** 凡例の文字は系列の色ではなく、ふつうの文字の色にする（色は横の印が受け持つ） */
const legendText = (value: string) => <span style={{ color: AXIS_TICK.fill }}>{value}</span>;
/** ツールチップの見出し：期間のくわしい名前 */
const tooltipTitle = (_: unknown, payload: readonly { payload?: { title?: string } }[]) => payload?.[0]?.payload?.title ?? '';

function PeriodPicker() {
  const period = useGame((s) => s.chartPeriod);
  return (
    <div className="choice-row period-picker" role="group" aria-label={t.period}>
      {PERIODS.map((p) => (
        <button key={p} className="btn" aria-pressed={period === p} onClick={() => actions().setChartPeriod(p)}>
          <span className="period-long">{t.periods[p]}</span>
          <span className="period-short">{t.periodShort[p]}</span>
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <span className="stat-note muted">{note}</span>}
    </div>
  );
}

function useBuckets(company: CompanyState, period: Period) {
  return useMemo(() => bucketize(company.history, period), [company.history, period]);
}

// ---------------------------------------------------------------------------
// 事業
// ---------------------------------------------------------------------------

function economyLabel(economy: number): string {
  if (economy >= coef('ui.economy.boom_threshold')) return t.business.economyLabels.boom;
  if (economy <= coef('ui.economy.slump_threshold')) return t.business.economyLabels.slump;
  return t.business.economyLabels.normal;
}

export function BusinessView({ company }: { company: CompanyState }) {
  const period = useGame((s) => s.chartPeriod);
  const buckets = useBuckets(company, period);
  const b = t.business;
  const rows = useMemo(
    () =>
      businessSeries(buckets).map((r, i) => ({
        ...r,
        label: bucketLabel(buckets[i]!),
        title: bucketTitle(buckets[i]!),
        economyIndex: Math.round(100 * (1 + r.economy)),
      })),
    [buckets],
  );
  const last = company.history[company.history.length - 1];
  const col = (key: string, label: string, value: (r: (typeof rows)[number]) => string): Column<(typeof rows)[number]> => ({
    key,
    label,
    value,
  });
  const periodCol = col('period', t.columns.period, (r) => r.title);
  return (
    <div className="dashboard">
      <div className="dashboard-head">
        <h2 className="dashboard-title">{b.title}</h2>
        <PeriodPicker />
      </div>
      {!last ? (
        <p className="muted">{t.noData}</p>
      ) : (
        <>
          <div className="stat-row">
            <Tile
              label={b.economyNow}
              value={economyLabel(last.economy)}
              note={`${b.economy} ${Math.round(100 * (1 + last.economy))}`}
            />
            <Tile
              label={b.utilizationNow}
              value={last.capacity > 0 ? pct(last.revenue / last.capacity) : '-'}
              note={b.utilizationHelp}
            />
            <Tile label={b.coverageNow} value={last.demand > 0 ? pct(last.revenue / last.demand) : '-'} />
          </div>
          <div className="chart-grid-2">
            <ChartCard
              title={b.demandTitle}
              rows={rows}
              columns={[
                periodCol,
                col('demand', b.demand, (r) => yen(r.demand)),
                col('revenue', b.revenue, (r) => yen(r.revenue)),
                col('capacity', b.capacity, (r) => yen(r.capacity)),
              ]}
            >
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} tickFormatter={yenTick} width={56} />
                <Tooltip formatter={(v: number) => yen(v)} labelFormatter={tooltipTitle} />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                <Line dataKey="demand" name={b.demand} stroke={SERIES[0]} {...LINE} />
                <Line dataKey="revenue" name={b.revenue} stroke={SERIES[1]} {...LINE} />
                <Line dataKey="capacity" name={b.capacity} stroke={SERIES[2]} {...LINE} />
              </LineChart>
            </ChartCard>
            <ChartCard
              title={b.rateTitle}
              note={b.utilizationHelp}
              rows={rows}
              columns={[
                periodCol,
                col('utilization', b.utilization, (r) => (r.utilization === null ? '-' : pct(r.utilization))),
                col('coverage', b.coverage, (r) => (r.coverage === null ? '-' : pct(r.coverage))),
              ]}
            >
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} tickFormatter={pctTick} width={44} domain={[0, 'auto']} />
                <ReferenceLine y={1} stroke={BASELINE} />
                <Tooltip formatter={(v: number) => pct(v)} labelFormatter={tooltipTitle} />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                <Line dataKey="utilization" name={b.utilization} stroke={SERIES[0]} {...LINE} />
                <Line dataKey="coverage" name={b.coverage} stroke={SERIES[1]} {...LINE} />
              </LineChart>
            </ChartCard>
            <ChartCard
              title={b.profitTitle}
              rows={rows}
              columns={[
                periodCol,
                col('gross', b.grossProfit, (r) => yen(r.grossProfit)),
                col('op', b.operatingProfit, (r) => yen(r.operatingProfit)),
              ]}
            >
              <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} tickFormatter={yenTick} width={56} />
                <ReferenceLine y={0} stroke={BASELINE} />
                <Tooltip formatter={(v: number) => yen(v)} labelFormatter={tooltipTitle} />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                <Bar dataKey="grossProfit" name={b.grossProfit} fill={SERIES[0]} radius={[4, 4, 0, 0]} {...BAR} />
                <Bar dataKey="operatingProfit" name={b.operatingProfit} fill={SERIES[1]} radius={[4, 4, 0, 0]} {...BAR} />
              </BarChart>
            </ChartCard>
            <ChartCard
              title={b.economyTitle}
              rows={rows}
              columns={[periodCol, col('economy', b.economy, (r) => `${r.economyIndex}（${economyLabel(r.economy)}）`)]}
            >
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} width={44} domain={['auto', 'auto']} />
                <ReferenceLine y={100} stroke={BASELINE} />
                <Tooltip labelFormatter={tooltipTitle} />
                <Line dataKey="economyIndex" name={b.economy} stroke={SERIES[0]} {...LINE} />
              </LineChart>
            </ChartCard>
          </div>
          <OrgChartView company={company} />
        </>
      )}
    </div>
  );
}

/** 仮の組織図：社長の下に、管理職・売上を生む職種・事務の箱 */
function OrgChartView({ company }: { company: CompanyState }) {
  const groups = orgChart(company);
  const b = t.business;
  return (
    <section className="sheet org-chart" aria-labelledby="orgchart-title">
      <h3 id="orgchart-title" className="sheet-title">
        {b.orgChartTitle}
      </h3>
      <p className="chart-note muted">{b.orgChartNote}</p>
      <div className="org-tree">
        <div className="org-node org-ceo">{b.ceo}</div>
        <ul className="org-groups">
          {groups.map((g) => (
            <li key={g.kind} className="org-group">
              <div className="org-node org-kind">
                {b.kinds[g.kind]}
                <span className="num">{t.people(g.total)}</span>
              </div>
              <ul className="org-roles">
                {g.roles.map((r) => (
                  <li key={r.id} className="org-node org-role">
                    <strong>{r.name}</strong>
                    <span className="num">{b.roleCount(r.full, r.part)}</span>
                    {r.onLeave > 0 && <span className="muted num">{b.onLeave(r.onLeave)}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 組織
// ---------------------------------------------------------------------------

export function OrgView({ company }: { company: CompanyState }) {
  const period = useGame((s) => s.chartPeriod);
  const buckets = useBuckets(company, period);
  const o = t.org;
  const industry = getIndustry(company.profile.industryId);
  const rows = useMemo(
    () =>
      orgSeries(buckets, company.departures).map((r, i) => ({
        ...r,
        label: bucketLabel(buckets[i]!),
        title: bucketTitle(buckets[i]!),
        ...Object.fromEntries(ENGAGEMENT_FACTORS.map((f) => [`f_${f}`, r.factors ? Math.round(r.factors[f] * 10) / 10 : null])),
        ...Object.fromEntries(industry.roles.map((x) => [`r_${x.id}`, r.roles ? (r.roles[x.id] ?? 0) : null])),
        ...Object.fromEntries(LABOR_PARTS.map((k) => [`l_${k}`, r.labor[k]])),
      })),
    [buckets, company.departures, industry],
  );
  type Row = (typeof rows)[number];
  const col = (key: string, label: string, value: (r: Row) => string): Column<Row> => ({ key, label, value });
  const periodCol = col('period', t.columns.period, (r) => r.title);
  const hasOrg = rows.some((r) => r.factors);
  const reasons = ATTRITION_REASONS.map((x) => ({
    reason: x,
    name: reasonNames[x],
    count: rows.reduce((s, r) => s + r.reasons[x], 0),
  }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const resignTotal = rows.reduce((s, r) => s + r.resignations, 0);
  const avgHead = rows.length > 0 ? company.history.slice(-rows.reduce((s, r) => s + (r.endMonth - r.startMonth + 1), 0)) : [];
  const meanHead = avgHead.length > 0 ? avgHead.reduce((s, r) => s + r.headcount, 0) / avgHead.length : 0;
  const ages = ageBands(company.employees);
  const grades = gradeCounts(company);
  const cap = overtimeCap(company.policies.overtime);
  const usedRoles = industry.roles.filter((x) => rows.some((r) => (r.roles?.[x.id] ?? 0) > 0));
  const onLeave = company.employees.filter((e) => e.leave).length;
  return (
    <div className="dashboard">
      <div className="dashboard-head">
        <h2 className="dashboard-title">{o.title}</h2>
        <PeriodPicker />
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t.noData}</p>
      ) : (
        <>
          <div className="stat-row">
            <Tile label={o.headcountNow} value={t.people(company.employees.length)} />
            <Tile
              label={o.attritionNow}
              value={meanHead > 0 ? pct((resignTotal / meanHead) * (MONTHS_PER_YEAR / Math.max(1, avgHead.length))) : '-'}
              note={t.periodShort[period]}
            />
            <Tile label={o.onLeaveNow} value={t.people(onLeave)} />
          </div>
          <div className="chart-grid-2">
            <ChartCard
              title={o.factorsTitle}
              note={hasOrg ? undefined : t.noOrgData}
              rows={rows}
              columns={[
                periodCol,
                ...ENGAGEMENT_FACTORS.map((f) => col(f, factorNames[f], (r) => (r.factors ? r.factors[f].toFixed(1) : '-'))),
              ]}
              height={260}
            >
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} width={32} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
                <ReferenceLine y={50} stroke={BASELINE} />
                <Tooltip labelFormatter={tooltipTitle} />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                {ENGAGEMENT_FACTORS.map((f, i) => (
                  <Line key={f} dataKey={`f_${f}`} name={factorNames[f]} stroke={SERIES[i]} {...LINE} />
                ))}
              </LineChart>
            </ChartCard>
            <ChartCard
              title={o.rolesTitle}
              note={hasOrg ? undefined : t.noOrgData}
              rows={rows}
              columns={[
                periodCol,
                ...usedRoles.map((x) => col(x.id, x.name, (r) => (r.roles ? t.people(r.roles[x.id] ?? 0) : '-'))),
                col('part', o.part, (r) => (r.part === null ? '-' : t.people(r.part))),
              ]}
            >
              <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} width={40} allowDecimals={false} />
                <Tooltip labelFormatter={tooltipTitle} />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                {usedRoles.map((x, i) => (
                  <Bar
                    key={x.id}
                    dataKey={`r_${x.id}`}
                    name={x.name}
                    stackId="roles"
                    fill={SERIES[i]}
                    stroke="#f8faf9"
                    strokeWidth={2}
                    radius={i === usedRoles.length - 1 ? [4, 4, 0, 0] : 0}
                    {...BAR}
                  />
                ))}
              </BarChart>
            </ChartCard>
            <ChartCard
              title={o.flowTitle}
              rows={rows}
              columns={[
                periodCol,
                col('hires', o.hires, (r) => t.people(r.hires)),
                col('resign', o.resignations, (r) => t.people(r.resignations)),
                col('retire', o.retirements, (r) => t.people(r.retirements)),
              ]}
            >
              <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} width={40} allowDecimals={false} />
                <Tooltip labelFormatter={tooltipTitle} />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                <Bar dataKey="hires" name={o.hires} fill={SERIES[0]} radius={[4, 4, 0, 0]} {...BAR} />
                <Bar dataKey="resignations" name={o.resignations} fill={SERIES[1]} radius={[4, 4, 0, 0]} {...BAR} />
                <Bar dataKey="retirements" name={o.retirements} fill={SERIES[2]} radius={[4, 4, 0, 0]} {...BAR} />
              </BarChart>
            </ChartCard>
            <ChartCard
              title={o.attritionTitle}
              rows={rows}
              columns={[periodCol, col('attrition', o.attrition, (r) => (r.attritionRate === null ? '-' : pct(r.attritionRate)))]}
            >
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} tickFormatter={pctTick} width={44} domain={[0, 'auto']} />
                <Tooltip formatter={(v: number) => pct(v)} labelFormatter={tooltipTitle} />
                <Line dataKey="attritionRate" name={o.attrition} stroke={SERIES[0]} {...LINE} />
              </LineChart>
            </ChartCard>
            <ChartCard
              title={o.reasonsTitle}
              rows={reasons}
              columns={[
                { key: 'period', label: o.reasonsTitle, value: (r) => r.name },
                {
                  key: 'count',
                  label: o.resignations,
                  value: (r) => t.people(r.count),
                },
              ]}
              height={Math.max(120, reasons.length * 32 + 24)}
            >
              <BarChart data={reasons} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} stroke={BASELINE} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke={BASELINE} width={64} />
                <Tooltip />
                <Bar dataKey="count" name={o.resignations} fill={SERIES[0]} radius={[0, 4, 4, 0]} {...BAR} />
              </BarChart>
            </ChartCard>
            <ChartCard
              title={o.ageTitle}
              rows={ages}
              columns={[
                {
                  key: 'period',
                  label: o.ageTitle,
                  value: (r) => o.ageBand(r.band),
                },
                { key: 'full', label: o.full, value: (r) => t.people(r.full) },
                {
                  key: 'part',
                  label: o.partTime,
                  value: (r) => t.people(r.part),
                },
              ]}
              height={Math.max(120, ages.length * 32 + 48)}
            >
              <BarChart
                data={ages.map((a) => ({ ...a, name: o.ageBand(a.band) }))}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} stroke={BASELINE} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke={BASELINE} width={48} />
                <Tooltip />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                <Bar dataKey="full" name={o.full} stackId="age" fill={SERIES[0]} stroke="#f8faf9" strokeWidth={2} {...BAR} />
                <Bar
                  dataKey="part"
                  name={o.partTime}
                  stackId="age"
                  fill={SERIES[1]}
                  stroke="#f8faf9"
                  strokeWidth={2}
                  radius={[0, 4, 4, 0]}
                  {...BAR}
                />
              </BarChart>
            </ChartCard>
            {grades.length > 0 && (
              <ChartCard
                title={o.gradeTitle}
                rows={grades}
                columns={[
                  {
                    key: 'period',
                    label: o.gradeTitle,
                    value: (r) => o.grade(r.grade),
                  },
                  {
                    key: 'count',
                    label: o.gradeTitle,
                    value: (r) => t.people(r.count),
                  },
                ]}
                height={Math.max(120, grades.length * 32 + 24)}
              >
                <BarChart
                  data={grades.map((g) => ({ ...g, name: o.grade(g.grade) }))}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} stroke={BASELINE} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK} stroke={BASELINE} width={48} />
                  <Tooltip />
                  <Bar dataKey="count" name={o.gradeTitle} fill={SERIES[0]} radius={[0, 4, 4, 0]} {...BAR} />
                </BarChart>
              </ChartCard>
            )}
            <ChartCard
              title={o.laborTitle}
              rows={rows}
              columns={[periodCol, ...LABOR_PARTS.map((k) => col(k, o.laborParts[k], (r) => yen(r.labor[k])))]}
              height={260}
            >
              <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} tickFormatter={yenTick} width={56} />
                <Tooltip formatter={(v: number) => yen(v)} labelFormatter={tooltipTitle} />
                <Legend wrapperStyle={legendStyle} formatter={legendText} />
                {LABOR_PARTS.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={`l_${k}`}
                    name={o.laborParts[k]}
                    stackId="labor"
                    fill={SERIES[i]}
                    stroke="#f8faf9"
                    strokeWidth={2}
                    radius={i === LABOR_PARTS.length - 1 ? [4, 4, 0, 0] : 0}
                    {...BAR}
                  />
                ))}
              </BarChart>
            </ChartCard>
            <ChartCard
              title={o.overtimeTitle}
              note={cap > 0 ? o.overtimeCap(cap) : undefined}
              rows={rows}
              columns={[periodCol, col('overtime', o.overtime, (r) => t.hours(r.overtime))]}
            >
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} stroke={BASELINE} minTickGap={8} />
                <YAxis tick={AXIS_TICK} stroke={BASELINE} width={40} domain={[0, cap > 0 ? cap : 'auto']} />
                {cap > 0 && <ReferenceLine y={cap} stroke={BASELINE} />}
                <Tooltip formatter={(v: number) => t.hours(v)} labelFormatter={tooltipTitle} />
                <Line dataKey="overtime" name={o.overtime} stroke={SERIES[0]} {...LINE} />
              </LineChart>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
