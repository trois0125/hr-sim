import { useState } from 'react';
import { actions, useGame } from '../useGame';
import { guideStrings, strings } from '../strings';
import { dateLabel } from '../format';

export function Title() {
  const saved = useGame((s) => s.savedGame);
  const problem = useGame((s) => s.saveProblem);
  const canSave = useGame((s) => s.canSave);
  const [confirming, setConfirming] = useState(false);
  const startNew = () => {
    actions().newCandidate();
    actions().goto('generate');
  };
  return (
    <main className="page title-page">
      <div className="title-file">
        <h1 className="title-mark">{strings.appTitle}</h1>
        <p className="title-sub">{strings.appSubtitle}</p>
      </div>
      {confirming && saved ? (
        <div className="title-confirm" role="alertdialog" aria-labelledby="overwrite-title">
          <h2 id="overwrite-title">{strings.overwriteTitle}</h2>
          <p>{strings.overwriteBody(saved.name)}</p>
          <div className="title-actions">
            <button className="btn btn-primary" onClick={startNew}>
              {strings.overwriteYes}
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              {strings.overwriteNo}
            </button>
          </div>
        </div>
      ) : (
        <div className="title-actions">
          {saved && (
            <button className="btn btn-primary" onClick={() => actions().continueGame()}>
              {strings.continueGame}
              <span className="btn-detail">
                {strings.continueDetail(saved.name, dateLabel(saved.month), saved.status !== 'running')}
              </span>
            </button>
          )}
          <button className={saved ? 'btn' : 'btn btn-primary'} onClick={() => (saved ? setConfirming(true) : startNew())}>
            {strings.newGame}
          </button>
          <button className="btn" onClick={() => actions().goto('howto')}>
            {strings.howTo}
          </button>
          <button className="btn" onClick={() => actions().openGuide()}>
            {guideStrings.open}
          </button>
          <button className="btn" onClick={() => actions().openEvidence()}>
            {strings.evidence}
          </button>
        </div>
      )}
      {problem && <p className="title-problem" role="alert">{problem === 'newer' ? strings.saveNewer : strings.saveBroken}</p>}
      <p className="title-note muted">{canSave ? strings.saveNote : strings.saveUnavailable}</p>
    </main>
  );
}
