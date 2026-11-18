import { actions } from '../useGame';
import { howToStrings, strings } from '../strings';

export function HowTo() {
  return (
    <main className="page">
      <h1>{howToStrings.title}</h1>
      <div className="howto-list">
        {howToStrings.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </div>
      <p className="slip-note">{howToStrings.note}</p>
      <div className="page-actions">
        <button className="btn" onClick={() => actions().goto('title')}>
          {strings.back}
        </button>
      </div>
    </main>
  );
}
