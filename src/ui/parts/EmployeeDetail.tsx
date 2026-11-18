import { getIndustry } from '../../engine/data';
import { biggestDrag } from '../../engine/engagement';
import type { CompanyState } from '../../engine/types';
import { ENGAGEMENT_FACTORS, MONTHS_PER_YEAR } from '../../engine/types';
import { actions } from '../useGame';
import { employeeStrings as t, eventStrings, factorNames, strings } from '../strings';
import { dateLabel, yen } from '../format';

const LOW = 40;
const HIGH = 60;
const level = (x: number) => (x < LOW ? ' low' : x > HIGH ? ' high' : '');
/** 最近の声として出す件数 */
const RECENT_VOICES = 5;

export function EmployeeDetail({ company, id }: { company: CompanyState; id: string }) {
  const e = company.employees.find((x) => x.id === id);
  const close = () => actions().selectEmployee(null);
  if (!e) return null;
  const industry = getIndustry(company.profile.industryId);
  const role = industry.roles.find((r) => r.id === e.role)?.name ?? e.role;
  const drag = e.factorScores ? biggestDrag(e.factorScores, e.values) : null;
  const voices = company.voices.filter((v) => v.employeeId === e.id).slice(-RECENT_VOICES).reverse();
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="emp-title" onClick={close}>
      <div className="slip" onClick={(ev) => ev.stopPropagation()}>
        <div className="slip-head">
          <h2 id="emp-title">{e.name}</h2>
          <span className="slip-kind">{t.title}</span>
        </div>
        <div className="slip-body stack">
          {e.leave && (
            <p className="waiting-note">
              {eventStrings.onLeave(eventStrings.leaveKinds[e.leave.kind], dateLabel(e.leave.endsAt))}
            </p>
          )}
          <dl className="profile-grid">
            <dt>{t.role}</dt>
            <dd>
              {role}（{t.employment[e.employmentType]}・{t.affiliation[e.affiliation]}）
            </dd>
            <dt>{t.age}</dt>
            <dd className="num">
              {e.age}歳・{t.gender[e.gender]}
            </dd>
            <dt>{t.tenure}</dt>
            <dd className="num">
              {Math.floor(e.tenureMonths / MONTHS_PER_YEAR)}年{e.tenureMonths % MONTHS_PER_YEAR}か月
            </dd>
            {e.grade > 0 && (
              <>
                <dt>{t.grade}</dt>
                <dd className="num">{e.grade}</dd>
              </>
            )}
            <dt>{t.salary}</dt>
            <dd className="num">{yen(e.salaryMonthly)}</dd>
            <dt>{t.bonus}</dt>
            <dd className="num">{yen(e.bonusMonthly)}</dd>
            <dt>{t.overtime}</dt>
            <dd className="num">{Math.round(e.overtimeHours)}時間</dd>
            <dt>{t.evaluation}</dt>
            <dd className="num">{e.perceivedPerformance.toFixed(0)}</dd>
            <dt>{t.engagement}</dt>
            <dd className="num">{e.engagement.toFixed(0)}</dd>
          </dl>

          <section>
            <h3 className="sheet-title">{t.factorsTitle}</h3>
            {e.factorScores ? (
              ENGAGEMENT_FACTORS.map((f) => {
                const v = e.factorScores?.[f] ?? 50;
                return (
                  <div key={f} className={`factor-row${f === drag && v < 50 ? ' drag' : ''}`}>
                    <span className="factor-name">{factorNames[f]}</span>
                    <span className="factor-track" aria-hidden="true">
                      <span className={`factor-fill${level(v)}`} style={{ width: `${v}%`, display: 'block' }} />
                    </span>
                    <span className="num">{v.toFixed(0)}</span>
                  </div>
                );
              })
            ) : (
              <p className="muted">{t.noFactors}</p>
            )}
            {drag && e.factorScores && e.factorScores[drag] < 50 && (
              <p className="loss">
                {t.biggestDrag}：{factorNames[drag]}
              </p>
            )}
          </section>

          <section>
            <h3 className="sheet-title">{t.values}</h3>
            {(Object.keys(t.valueNames) as (keyof typeof t.valueNames)[]).map((k) => (
              <div key={k} className="factor-row">
                <span>{t.valueNames[k]}</span>
                <span className="factor-track" aria-hidden="true">
                  <span className="factor-fill" style={{ width: `${e.values[k] * 100}%`, display: 'block' }} />
                </span>
                <span className="num">{Math.round(e.values[k] * 100)}%</span>
              </div>
            ))}
          </section>

          {voices.length > 0 && (
            <section>
              <h3 className="sheet-title">{t.voicesTitle}</h3>
              <ul className="feed">
                {voices.map((v, i) => (
                  <li key={i} className={`feed-voice tone-${v.tone}`}>
                    <span className="feed-date">{dateLabel(v.month)}</span>
                    <q>{v.text}</q>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="slip-actions">
            <button className="btn" onClick={close}>
              {strings.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
