import { End } from './screens/End';
import { Generate } from './screens/Generate';
import { HowTo } from './screens/HowTo';
import { Main } from './screens/Main';
import { Policies } from './screens/Policies';
import { Title } from './screens/Title';
import { useGame } from './useGame';

export function App() {
  const screen = useGame((s) => s.screen);
  switch (screen) {
    case 'title':
      return <Title />;
    case 'howto':
      return <HowTo />;
    case 'generate':
      return <Generate />;
    case 'policies':
      return <Policies />;
    case 'main':
      return <Main />;
    case 'end':
      return <End />;
  }
}
