import { defaultPolicies } from '../../engine/data';
import {
  BONUS_POLICIES,
  EVALUATION_SYSTEMS,
  GRADE_SYSTEMS,
  HIRING_POLICIES,
  OVERTIME_POLICIES,
  PAY_POLICIES,
  TRAINING_INVESTMENTS,
  WORK_HOUR_SYSTEMS,
  WORK_STYLES,
  type IndustryData,
  type PolicySet,
} from '../../engine/types';
import { policyStrings } from '../strings';
import { optionKey } from '../guide';
import { HelpButton } from './Guide';

const OPTIONS: { [K in keyof PolicySet]: readonly PolicySet[K][] } = {
  grade: GRADE_SYSTEMS,
  evaluation: EVALUATION_SYSTEMS,
  pay: PAY_POLICIES,
  bonus: BONUS_POLICIES,
  hiring: HIRING_POLICIES,
  workHours: WORK_HOUR_SYSTEMS,
  training: TRAINING_INVESTMENTS,
  workStyle: WORK_STYLES,
  overtime: OVERTIME_POLICIES,
};

type Props = {
  value: PolicySet;
  onChange: (next: PolicySet) => void;
  industry: IndustryData;
  /** 「今の制度」として印を付ける制度（見直しのとき） */
  current?: PolicySet;
};

/** 9つの制度を選ぶフォーム（最初の制度と、制度の見直しで使う） */
export function PolicyForm({ value, onChange, industry, current }: Props) {
  return (
    <div className="policy-form">
      {(Object.keys(OPTIONS) as (keyof PolicySet)[]).map((cat) => (
        <fieldset key={cat} className="policy-field">
          <legend>
            {policyStrings.categories[cat]}
            <HelpButton target={{ kind: 'category', id: cat }} />
          </legend>
          <div className="policy-options">
            {(OPTIONS[cat] as readonly string[]).map((opt) => {
              const [name, desc] = (policyStrings.options[cat] as Record<string, readonly [string, string]>)[opt] ?? [opt, ''];
              const disabled = cat === 'workStyle' && !industry.remoteAllowed.includes(opt as PolicySet['workStyle']);
              const id = `policy-${cat}-${opt}`;
              return (
                <label key={opt} htmlFor={id} className={`policy-option${disabled ? ' disabled' : ''}`}>
                  <input
                    id={id}
                    type="radio"
                    name={`policy-${cat}`}
                    value={opt}
                    checked={value[cat] === opt}
                    disabled={disabled}
                    onChange={() => onChange({ ...value, [cat]: opt } as PolicySet)}
                  />
                  <span>
                    {name}
                    <HelpButton target={{ kind: 'option', id: optionKey(cat, opt) }} label={name} />
                    {current?.[cat] === opt && <span className="tag">今の制度</span>}
                    {!current && defaultPolicies[cat] === opt && <span className="tag">{policyStrings.standard}</span>}
                  </span>
                  <span className="desc">{disabled ? policyStrings.notAllowed : desc}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
