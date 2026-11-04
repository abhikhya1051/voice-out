import { useState, type KeyboardEvent } from "react";
import type { CleanResult, Flag, ItemKind, NoteItem, Span } from "../api";
import { cutCounts, REASON_LABEL } from "../lib/marks";
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
                  <span className={`trace${flagsFor("todo", i).length ? " is-flagged" : ""}`} {...traceable(t)}>
                    {t.text}
                  </span>
                  {t.due && <span className="due">{t.due}</span>}
                  <FlagNotes flags={flagsFor("todo", i)} />
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
            .map((c) => `${c.count} ${REASON_LABEL[c.reason]}${c.count === 1 ? "" : "s"}`)
            .join(" · ")}{" "}
          cut · cleaned in {formatSeconds(result.elapsedMs)}
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
