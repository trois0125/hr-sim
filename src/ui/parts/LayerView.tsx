import { useMemo, useState } from 'react';
import { getIndustry } from '../../engine/data';
import { keyPeople, summarizeLayers, type Layer } from '../../engine/layers';
import type { CompanyState, Employee } from '../../engine/types';
import { actions } from '../useGame';
import { eventStrings, factorNames, layerStrings as t, mainStrings, strings } from '../strings';
import { yen } from '../format';
import { ENGAGEMENT_FACTORS } from '../../engine/types';

/** 層の詳細に出す「納得感の低い人」の人数 */
const LOWEST = 10;
const LOW = 40;
const HIGH = 60;
const level = (x: number) => (x < LOW ? ' low' : x > HIGH ? ' high' : '');

function EngagementCell({ value }: { value: number }) {
  return (
    <>
      <span className={`bar${level(value)}`} aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </span>
      {value.toFixed(0)}
    </>
  );
}

function PersonRow({ e, label, roleName }: { e: Employee; label?: string; roleName: string }) {
  const open = () => actions().selectEmployee(e.id);
  return (
    <tr
      className="row-button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      }}
    >
      <td>
        {e.name}
        {label && <span className="tag">{label}</span>}
        {e.leave && <span className="tag">{eventStrings.leaveKinds[e.leave.kind]}</span>}
      </td>
      <td>{roleName}</td>
      <td className="num">
        <EngagementCell value={e.engagement} />
      </td>
      <td className="right num hide-narrow">{yen(e.salaryMonthly)}</td>
    </tr>
  );
}

/** 層の内訳（層を押すと開く） */
function LayerDetail({ layer, company, onClose }: { layer: Layer; company: CompanyState; onClose: () => void }) {
  const industry = getIndustry(company.profile.industryId);
  const roleName = (id: string) => industry.roles.find((r) => r.id === id)?.name ?? id;
  const ids = new Set(layer.memberIds);
  const lowest = company.employees
    .filter((e) => ids.has(e.id))
    .sort((a, b) => a.engagement - b.engagement)
    .slice(0, LOWEST);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="layer-title" onClick={onClose}>
      <div className="slip" onClick={(ev) => ev.stopPropagation()}>
        <div className="slip-head">
          <h2 id="layer-title">{t.name(roleName(layer.role), layer.band)}</h2>
          <span className="slip-kind">{t.detailTitle}</span>
        </div>
        <div className="slip-body stack">
          <dl className="summary-grid">
            <div>
              <dt>{t.columns.count}</dt>
              <dd className="num">{layer.count}人</dd>
            </div>
            <div>
              <dt>{t.columns.engagement}</dt>
              <dd className="num">
                {layer.engagementMean.toFixed(1)}
                <div className="muted layer-sub">{t.spread(layer.engagementSd)}</div>
              </dd>
            </div>
            <div>
              <dt>{t.columns.resignations}</dt>
              <dd className="num">{layer.resignations12 ?? t.none}</dd>
            </div>
            <div>
              <dt>{t.columns.salary}</dt>
              <dd className="num">{yen(layer.salaryMean)}</dd>
            </div>
          </dl>
          <p className="muted">
            {t.low(layer.lowEngagement)}
            {layer.onLeave > 0 && `、${t.onLeave(layer.onLeave)}`}
          </p>
          {layer.factorMeans && (
            <section>
              <h3 className="sheet-title">{t.factorsTitle}</h3>
              {ENGAGEMENT_FACTORS.map((f) => {
                const v = layer.factorMeans?.[f] ?? 50;
                return (
                  <div key={f} className={`factor-row${f === layer.biggestDrag && v < 50 ? ' drag' : ''}`}>
                    <span className="factor-name">{factorNames[f]}</span>
                    <span className="factor-track" aria-hidden="true">
                      <span className={`factor-fill${level(v)}`} style={{ width: `${v}%`, display: 'block' }} />
                    </span>
                    <span className="num">{v.toFixed(0)}</span>
                  </div>
                );
              })}
            </section>
          )}
          <section>
            <h3 className="sheet-title">{t.lowestTitle}</h3>
            <div className="table-scroll">
              <table className="staff-table">
                <tbody>
                  {lowest.map((e) => (
                    <PersonRow key={e.id} e={e} roleName={roleName(e.role)} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="slip-actions">
            <button className="btn" onClick={onClose}>
              {strings.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 社員が多い会社の一覧：主要人物（一人ずつ）と層の表 */
export function LayerView({ company }: { company: CompanyState }) {
  const [grade, setGrade] = useState<number | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const industry = getIndustry(company.profile.industryId);
  const roleName = (id: string) => industry.roles.find((r) => r.id === id)?.name ?? id;
  const grades = useMemo(
    () => [...new Set(company.employees.map((e) => e.grade).filter((g) => g > 0))].sort((a, b) => a - b),
    [company.employees],
  );
  const layers = useMemo(
    () =>
      summarizeLayers(company.employees, {
        industry,
        departures: company.departures,
        month: company.month,
        grade: grade ?? undefined,
      }),
    [company.employees, company.departures, company.month, industry, grade],
  );
  const people = useMemo(() => keyPeople(company.employees), [company.employees]);
  const open = layers.find((l) => l.key === openKey) ?? null;
  const c = t.columns;
  return (
    <section className="sheet" aria-labelledby="staff-title">
      <h2 id="staff-title" className="staff-title">
        {mainStrings.employeesTitle}（{company.employees.length}人）
      </h2>
      <p className="muted layer-lead">{t.lead(company.employees.length)}</p>

      <h3 className="sheet-title">{t.keyPeopleTitle}</h3>
      <div className="table-scroll">
        <table className="staff-table">
          <thead>
            <tr>
              <th>{mainStrings.columns.name}</th>
              <th>{mainStrings.columns.role}</th>
              <th>{mainStrings.columns.engagement}</th>
              <th className="right hide-narrow">{mainStrings.columns.salary}</th>
            </tr>
          </thead>
          <tbody>
            {people.map(({ employee, reason }) => (
              <PersonRow key={employee.id} e={employee} label={t.reasons[reason]} roleName={roleName(employee.role)} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="staff-tools layer-tools">
        <h3 className="sheet-title layer-title">{t.layersTitle}</h3>
        {company.policies.grade !== 'none' && grades.length > 0 && (
          <label>
            {t.gradeFilter}{' '}
            <select
              id="layer-grade"
              value={grade ?? ''}
              onChange={(e) => setGrade(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">{t.allGrades}</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {t.gradeOption(g)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="table-scroll">
        <table className="staff-table">
          <thead>
            <tr>
              <th>{c.layer}</th>
              <th className="right">{c.count}</th>
              <th>{c.engagement}</th>
              <th className="hide-narrow">{c.drag}</th>
              <th className="right hide-narrow">{c.resignations}</th>
            </tr>
          </thead>
          <tbody>
            {layers.map((l) => {
              const dragLow = l.biggestDrag && l.factorMeans && l.factorMeans[l.biggestDrag] < 50;
              return (
                <tr
                  key={l.key}
                  className="row-button"
                  tabIndex={0}
                  onClick={() => setOpenKey(l.key)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      setOpenKey(l.key);
                    }
                  }}
                >
                  <td>{t.name(roleName(l.role), l.band)}</td>
                  <td className="right num">{l.count}</td>
                  <td className="num">
                    <EngagementCell value={l.engagementMean} />
                  </td>
                  <td className="hide-narrow">{dragLow && l.biggestDrag ? factorNames[l.biggestDrag] : t.none}</td>
                  <td className="right num hide-narrow">{l.resignations12 ?? t.none}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && <LayerDetail layer={open} company={company} onClose={() => setOpenKey(null)} />}
    </section>
  );
}
