import { useState } from 'react';
import { defaultPolicies, getIndustry } from '../../engine/data';
import type { PolicySet } from '../../engine/types';
import { PolicyForm } from '../parts/PolicyForm';
import { actions, useGame } from '../useGame';
import { generateStrings, strings } from '../strings';

export function Policies() {
  const c = useGame((s) => s.candidate);
  const [policies, setPolicies] = useState<PolicySet>({ ...defaultPolicies });
  if (!c) return null;
  return (
    <main className="page">
      <h1>{generateStrings.policiesTitle}</h1>
      <p className="muted">{generateStrings.policiesLead}</p>
      <PolicyForm value={policies} onChange={setPolicies} industry={getIndustry(c.profile.industryId)} />
      <div className="page-actions">
        <button className="btn btn-primary" onClick={() => actions().startGame(policies)}>
          {strings.start}
        </button>
        <button className="btn btn-quiet" onClick={() => actions().goto('generate')}>
          {strings.back}
        </button>
      </div>
    </main>
  );
}
