import { memo, useState } from 'react';
import type { AskQuestion } from '@shared/types';

/** Renders a model-issued AskUserQuestion card: one header chip + the question,
 *  selectable options (multi-select allowed), optional free-text, and an
 *  Answer/Dismiss pair that resolves the CLI's parked control_request. */
export default memo(function QuestionCard({
  questions,
  onAnswer,
  onDismiss,
  disabled
}: {
  questions: AskQuestion[];
  onAnswer: (answers: Record<string, string>, response?: string) => void;
  onDismiss: () => void;
  disabled?: boolean;
}) {
  // Per-question chosen option labels (single-selection stores 0/1 entries).
  const [pick, setPick] = useState<Record<number, string[]>>({});
  const [free, setFree] = useState<Record<number, string>>({});

  const answers: Record<string, string> = {};
  let complete = true;
  questions.forEach((q, i) => {
    const freeText = (free[i] ?? '').trim();
    if (freeText) {
      // Free text overrides the structured options (schema: answers[question] =
      // the user's own words).
      answers[q.question] = freeText;
      return;
    }
    const picked = pick[i] ?? [];
    if (q.multiSelect) {
      if (picked.length > 0) answers[q.question] = picked.join(', ');
      else complete = false;
    } else if (picked.length === 1) {
      answers[q.question] = picked[0];
    } else {
      complete = false;
    }
  });

  const toggle = (i: number, label: string): void => {
    const multi = questions[i].multiSelect;
    setPick((prev) => {
      const cur = prev[i] ?? [];
      if (multi) {
        return { ...prev, [i]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] };
      }
      return { ...prev, [i]: [label] };
    });
  };

  return (
    <div className="question-card" role="group" aria-label="Claude asks a question">
      {questions.map((q, i) => (
        <div className="qc-group" key={q.header ?? `g${i}`}>
          <div className="qc-head">
            {q.header && <span className="qc-header">{q.header}</span>}
            <span className="qc-question">{q.question}</span>
            {q.multiSelect && <span className="qc-multi">multi-select</span>}
          </div>
          <div className="qc-options">
            {q.options.map((o) => {
              const active = (pick[i] ?? []).includes(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  className={`qc-option${active ? ' active' : ''}`}
                  onClick={() => toggle(i, o.label)}
                  disabled={disabled}
                  title={o.description}
                >
                  <span className="qc-opt-label">{active ? '● ' : '○ '}{o.label}</span>
                  {o.description && <span className="qc-opt-desc">{o.description}</span>}
                  {o.preview && <pre className="qc-opt-preview">{o.preview}</pre>}
                </button>
              );
            })}
          </div>
          <input
            className="qc-free"
            placeholder="Type your own answer…"
            value={free[i] ?? ''}
            onChange={(e) => setFree((prev) => ({ ...prev, [i]: e.target.value }))}
            disabled={disabled}
          />
        </div>
      ))}
      <div className="qc-actions">
        <button
          type="button"
          className="call primary"
          onClick={() => onAnswer(answers)}
          disabled={!complete || disabled}
          title={complete ? 'Submit answers' : 'Pick an option or type an answer for each question'}
        >
          Answer
        </button>
        <button type="button" className="call ghost" onClick={onDismiss} disabled={disabled}>
          Dismiss
        </button>
      </div>
    </div>
  );
});