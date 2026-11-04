import { useState, type KeyboardEvent } from "react";
import type { CleanResult, Flag, ItemKind, NoteItem, ResolvedDate, Span } from "../api";
import { placeDates } from "../lib/dates";
import { cutCounts, reasonCount } from "../lib/marks";
import { formatSeconds } from "../lib/format";

interface Props {
  result: CleanResult;
  onPoint: (span: Span | null) => void;
  onPlay: (span: Span) => void;
  restoringCount: number;
  onReclean: () => void;
  busy: boolean;
}

/** The clean note. Every line is traceable: point at it to see its source words, tap to hear them. */
export function NoteView({ result, onPoint, onPlay, restoringCount, onReclean, busy }: Props) {
  const { cleanup, check } = result;
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  const flagsFor = (kind: ItemKind, index: number) => check.flags.filter((f) => f.kind === kind && f.index === index);
  const invented = check.flags.length;
  const datesAt = placeDates(result);
  const dateCount = result.dates?.length ?? 0;

  // Inline spans (not <button>, which is always a block-ish box) so sentences flow as one paragraph
  const traceable = (item: NoteItem) => ({
    role: "button" as const,
    tabIndex: 0,
    title: "Tap to hear where you said this",
    onMouseEnter: () => onPoint(item),
    onMouseLeave: () => onPoint(null),
    onFocus: () => onPoint(item),
    onBlur: () => onPoint(null),
    onClick: () => onPlay(item),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPlay(item);
      }
    },
  });

  return (
    <section className="note" aria-label="Clean note">
      <header className="note-head">
        <h2 className="section-label">Clean note</h2>
        <span className="note-type">{cleanup.type}</span>
      </header>
      <h3 className="note-title">{cleanup.title}</h3>

      <p className="note-body">
        {cleanup.sentences.map((s, i) => (
          <span key={i}>
            {i > 0 && " "}
            <span className={`trace${flagsFor("sentence", i).length ? " is-flagged" : ""}`} {...traceable(s)}>
              {s.text}
            </span>
            <DateNotes dates={datesAt.get(`sentence-${i}`)} />
            <FlagNotes flags={flagsFor("sentence", i)} />
          </span>
        ))}
      </p>

      {cleanup.keyPoints.length > 0 && (
        <>
          <h4 className="note-sub">Key points</h4>
          <ul className="note-list">
            {cleanup.keyPoints.map((k, i) => (
              <li key={i}>
                <span className={`trace${flagsFor("keyPoint", i).length ? " is-flagged" : ""}`} {...traceable(k)}>
                  {k.text}
                </span>
                <FlagNotes flags={flagsFor("keyPoint", i)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {cleanup.todos.length > 0 && (
        <>
          <h4 className="note-sub">To do</h4>
          <ul className="note-list todos">
            {cleanup.todos.map((t, i) => {
              const id = `todo-${i}`;
              const checked = done.has(i);
              return (
                <li key={i} className={checked ? "is-done" : undefined}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setDone((d) => {
                        const next = new Set(d);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <label htmlFor={id} className="visually-hidden">
                    Mark done: {t.text}
                  </label>
                  <div className="todo-body">
                    <span className={`trace${flagsFor("todo", i).length ? " is-flagged" : ""}`} {...traceable(t)}>
                      {t.text}
                    </span>
                    <TodoWhen due={t.due} dates={datesAt.get(`todo-${i}`)} />
                    <FlagNotes flags={flagsFor("todo", i)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <footer className="receipt">
        <p className={`receipt-main${invented ? " has-flags" : ""}`}>
          <span className="receipt-mark" aria-hidden="true">{invented ? "!" : "✓"}</span>
          {check.checked} {check.checked === 1 ? "fact" : "facts"} checked against your words ·{" "}
          {invented ? `${invented} flagged` : "0 invented"}
        </p>
        <p className="receipt-detail">
          {cutCounts(result)
            .map((c) => reasonCount(c.reason, c.count))
            .join(" · ")}{" "}
          cut · {dateCount > 0 && `${dateCount} ${dateCount === 1 ? "date" : "dates"} worked out by code · `}cleaned in{" "}
          {formatSeconds(result.elapsedMs)}
        </p>
        {restoringCount > 0 && (
          <button type="button" className="reclean" onClick={onReclean} disabled={busy}>
            Re-clean, keeping {restoringCount} restored {restoringCount === 1 ? "word" : "words"}
          </button>
        )}
      </footer>
    </section>
  );
}

/**
 * A to-do's deadline. When the spoken deadline is itself a worked-out date, show it once:
 * "the next Monday → Mon, Nov 9" instead of the words and then the same words again in a tag.
 */
function TodoWhen({ due, dates = [] }: { due?: string; dates?: ResolvedDate[] }) {
  const inDue = due ? dates.find((d) => due.toLowerCase().includes(d.phrase.toLowerCase())) : undefined;
  return (
    <>
      {due && (
        <span className="due">
          {due}
          {inDue && (
            <span className="due-date" title={`Worked out: ${inDue.basis}`}>
              {" "}→ {inDue.label}
            </span>
          )}
        </span>
      )}
      <DateNotes dates={dates.filter((d) => d !== inDue)} />
    </>
  );
}

/** "the next day → Sat, Nov 7", in pencil: worked out, not said. */
function DateNotes({ dates }: { dates?: ResolvedDate[] }) {
  if (!dates?.length) return null;
  return (
    <>
      {dates.map((d, i) => (
        <span key={i} className="date-note" title={`Worked out: ${d.basis}`}>
          {d.phrase} → {d.label}
        </span>
      ))}
    </>
  );
}

function FlagNotes({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <>
      {flags.map((f, i) => (
        <span key={i} className="flag-note" role="note">
          {f.message}
        </span>
      ))}
    </>
  );
}
