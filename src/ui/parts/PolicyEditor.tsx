import { useMemo, useState } from 'react';
import { coef } from '../../engine/coefficients';
import { getIndustry } from '../../engine/data';
import { forecastChange } from '../../engine/forecast';
import { changedCategories, previewChange } from '../../engine/policyChange';
import type { ChangeMethod, CompanyState, PolicySet } from '../../engine/types';
import { PolicyForm } from './PolicyForm';
import { actions } from '../useGame';
import { reviewStrings, strings } from '../strings';
import { yen } from '../format';

/** 試算の差が「ほぼ変わらない」とみなす幅 */
const SAME = {
  laborCostRatio: () => coef('ui.forecast.cost_threshold'),
  engagement: () => coef('ui.forecast.engagement_threshold'),
};

function Direction({ value, threshold, good }: { value: number; threshold: number; good: 1 | -1 }) {
  if (Math.abs(value) < threshold) return <span className="muted">{reviewStrings.same}</span>;
  const up = value > 0;
  const cls = (up ? 1 : -1) === good ? 'gain' : 'loss';
  return <span className={cls}>{up ? `▲ ${reviewStrings.up}` : `▼ ${reviewStrings.down}`}</span>;
}

/** 制度の見直し（毎年の決算月と、右の「制度を見直す」から開く） */
export function PolicyEditor({ company }: { company: CompanyState }) {
  const [next, setNext] = useState<PolicySet>({ ...company.policies });
  const [method, setMethod] = useState<ChangeMethod>('consent');
  const [transition, setTransition] = useState(false);
  const changed = changedCategories(company.policies, next).length > 0;
  const preview = useMemo(() => previewChange(company, next), [company, next]);
  const options = preview.isDisadvantageous ? { method, transition } : {};
  const forecast = useMemo(
    () => (changed ? forecastChange(company, next, options) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [company, next, method, transition, changed],
  );

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="slip">
        <div className="slip-head">
          <h2 id="editor-title">{reviewStrings.editorTitle}</h2>
        </div>
        <div className="slip-body">
          <PolicyForm value={next} onChange={setNext} industry={getIndustry(company.profile.industryId)} current={company.policies} />

          {forecast && (
            <section className="forecast-box">
              <h3 className="sheet-title">{reviewStrings.forecastTitle(forecast.months)}</h3>
              <dl className="forecast">
                <div>
                  <dt>{reviewStrings.forecast.laborCost}</dt>
                  <dd>
                    <Direction
                      value={forecast.laborCost / Math.max(1, forecast.baseLaborCost)}
                      threshold={SAME.laborCostRatio()}
                      good={-1}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{reviewStrings.forecast.netProfit}</dt>
                  <dd>
                    <Direction
                      value={forecast.netProfit / Math.max(1, forecast.baseLaborCost)}
                      threshold={SAME.laborCostRatio()}
                      good={1}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{reviewStrings.forecast.engagement}</dt>
                  <dd>
                    <Direction value={forecast.engagement} threshold={SAME.engagement()} good={1} />
                  </dd>
                </div>
                <div>
                  <dt>{reviewStrings.forecast.resignations}</dt>
                  <dd>
                    <Direction value={forecast.resignations} threshold={1} good={-1} />
                  </dd>
                </div>
              </dl>
              {preview.cuts.size > 0 && <p className="warn">{reviewStrings.cuts(preview.cuts.size)}</p>}
              <p className="slip-note">
                {reviewStrings.forecastNote}（{reviewStrings.forecast.laborCost}の差：{yen(forecast.laborCost)}）
              </p>
            </section>
          )}

          {preview.isDisadvantageous && (
            <fieldset className="method-box">
              <legend>{reviewStrings.methodTitle}</legend>
              {(['consent', 'rules'] as const).map((m) => (
                <label key={m} className="policy-option" htmlFor={`method-${m}`}>
                  <input id={`method-${m}`} type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                  <span>{reviewStrings.methods[m][0]}</span>
                  <span className="desc">{reviewStrings.methods[m][1]}</span>
                </label>
              ))}
              <label style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input type="checkbox" checked={transition} onChange={(e) => setTransition(e.target.checked)} />
                {reviewStrings.transition}
              </label>
            </fieldset>
          )}

          <div className="slip-actions">
            <button className="btn" onClick={() => actions().closeEditor()}>
              {strings.back}
            </button>
            <button className="btn btn-primary" disabled={!changed} onClick={() => actions().changePolicy(next, options)}>
              {changed ? reviewStrings.apply : reviewStrings.noChange}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
