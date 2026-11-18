import { actions } from '../useGame';
import { strings } from '../strings';

export function Title() {
  return (
    <main className="page title-page">
      <div className="title-file">
        <h1 className="title-mark">{strings.appTitle}</h1>
        <p className="title-sub">{strings.appSubtitle}</p>
      </div>
      <div className="title-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            actions().newCandidate();
            actions().goto('generate');
          }}
        >
          {strings.newGame}
        </button>
        <button className="btn" disabled>
          {strings.continueGame}
        </button>
        <button className="btn" onClick={() => actions().goto('howto')}>
          {strings.howTo}
        </button>
      </div>
    </main>
  );
}
