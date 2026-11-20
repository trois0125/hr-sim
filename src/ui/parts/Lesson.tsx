import { actions, useGame } from '../useGame';
import { decisionStrings } from '../strings';

/** 選んだ選択肢の学びの一言 */
export function Lesson() {
  const lesson = useGame((s) => s.lesson);
  if (!lesson) return null;
  return (
    <aside className="lesson" role="status">
      <strong>
        {decisionStrings.lessonTitle}：{lesson.title}
      </strong>
      <p>{lesson.lesson}</p>
      <button className="btn" onClick={() => actions().dismissLesson()}>
        {decisionStrings.continue}
      </button>
    </aside>
  );
}
