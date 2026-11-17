import { strings } from './strings';

export function App() {
  return (
    <main style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1>{strings.appTitle}</h1>
      <p>{strings.appSubtitle}</p>
      <p>{strings.wip}</p>
    </main>
  );
}
