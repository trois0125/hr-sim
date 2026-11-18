import { availableIndustries, getFoundingPattern, getIndustry, getLocation } from '../../engine/data';
import { actions, useGame } from '../useGame';
import { generateStrings, strings, unitStrings } from '../strings';
import { pct, yen } from '../format';

export function Generate() {
  const c = useGame((s) => s.candidate);
  const industries = availableIndustries();
  if (!c) return null;
  const p = c.profile;
  const industry = getIndustry(p.industryId);
  const variant = industry.variants.find((v) => v.id === p.variantId);
  const f = generateStrings.fields;
  return (
    <main className="page">
      <h1>{generateStrings.title}</h1>
      <p className="muted">{generateStrings.lead}</p>
      <div className="choice-row" role="group" aria-label={generateStrings.chooseIndustry}>
        <button className="btn" onClick={() => actions().newCandidate()}>
          {generateStrings.random}
        </button>
        {industries.map((i) => (
          <button key={i.id} className="btn" onClick={() => actions().newCandidate(i.id)}>
            {i.name}
          </button>
        ))}
      </div>

      <section className="sheet profile-card" aria-label={generateStrings.profile}>
        <h2>{p.name}</h2>
        <dl className="profile-grid">
          <dt>{f.industry}</dt>
          <dd>{industry.name}</dd>
          <dt>{f.variant}</dt>
          <dd>{variant?.name}</dd>
          <dt>{f.location}</dt>
          <dd>{getLocation(p.locationId).name}</dd>
          <dt>{f.founder}</dt>
          <dd>{p.founderName}</dd>
          <dt>{f.founding}</dt>
          <dd>
            {getFoundingPattern(p.foundingPatternId).name}
            <div className="muted">{getFoundingPattern(p.foundingPatternId).description}</div>
          </dd>
          <dt>{f.headcount}</dt>
          <dd className="num">
            {c.employees.length}
            {unitStrings.people}
          </dd>
          <dt>{f.cash}</dt>
          <dd className="num">{yen(p.initialCash)}</dd>
          <dt>{f.grossMargin}</dt>
          <dd className="num">{pct(p.grossMargin)}</dd>
        </dl>
      </section>

      <div className="page-actions">
        <button className="btn btn-primary" onClick={() => actions().goto('policies')}>
          {strings.next}
        </button>
        <button className="btn" onClick={() => actions().newCandidate(p.industryId)}>
          {generateStrings.reroll}
        </button>
        <button className="btn btn-quiet" onClick={() => actions().goto('title')}>
          {strings.back}
        </button>
      </div>
    </main>
  );
}
