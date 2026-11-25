import { useEffect, useId, useRef, useState } from 'react';
import type { PendingDecision } from '../../sim/types';

interface DecisionDialogProps {
  decision: PendingDecision | null;
  minimized?: boolean;
  shortcutsBlocked?: boolean;
  onMinimizedChange?: (next: boolean) => void;
  onResolve: (optionId: string, freeText?: string) => void;
}

export function DecisionDialog({
  decision,
  minimized = false,
  shortcutsBlocked = false,
  onMinimizedChange,
  onResolve,
}: DecisionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleId = useId();
  const [freeText, setFreeText] = useState('');

  const cancelId = decision?.cancelOptionId;
  const primaryOptions = decision
    ? decision.options.filter((opt) => !cancelId || opt.id !== cancelId)
    : [];
  const cancelOption = decision && cancelId
    ? decision.options.find((opt) => opt.id === cancelId) ?? null
    : null;

  useEffect(() => {
    setFreeText('');
    if (innerRef.current) {
      innerRef.current.scrollTop = 0;
    }
  }, [decision?.id]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (decision && !minimized && !el.open) {
      el.showModal();
    } else if ((!decision || minimized) && el.open) {
      el.close();
    }

    if (decision && !minimized) {
      if (innerRef.current) {
        innerRef.current.scrollTop = 0;
      }
      if (decision.allowFreeText && textareaRef.current) {
        textareaRef.current.focus({ preventScroll: true });
      } else if (innerRef.current) {
        innerRef.current.focus({ preventScroll: true });
      }
    }
  }, [decision, minimized]);

  // Escape cancels sub-menu decisions cleanly, or stays blocked on mandatory events
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      if (!decision) return;
      e.preventDefault();
      if (decision.cancelOptionId) {
        onResolve(decision.cancelOptionId);
      }
    };
    el.addEventListener('cancel', handleCancel);
    return () => el.removeEventListener('cancel', handleCancel);
  }, [decision, onResolve]);

  // Keyboard shortcuts: 0 toggles Minimize, 1..9 choose primary options
  useEffect(() => {
    if (!decision) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutsBlocked || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      if (e.key === '0' && onMinimizedChange) {
        e.preventDefault();
        onMinimizedChange(!minimized);
        return;
      }
      if (minimized) return;

      const num = Number(e.key);
      if (num >= 1 && num <= primaryOptions.length) {
        const opt = primaryOptions[num - 1];
        if (!opt.disabled) {
          e.preventDefault();
          onResolve(opt.id, decision.allowFreeText ? freeText : undefined);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decision, minimized, onMinimizedChange, primaryOptions, shortcutsBlocked, freeText, onResolve]);

  return (
    <>
      {decision && minimized && onMinimizedChange && (
        <div className="battle-minimized-bar" role="region" aria-label="Pending Decision Minimized">
          <span className="battle-min-info">
            Pending Choice: <strong>{decision.title}</strong>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {cancelOption && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onResolve(cancelOption.id)}
              >
                ← Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onMinimizedChange(false)}
            >
              Expand Choice (0) ▴
            </button>
          </div>
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="decision-dialog"
        aria-labelledby={titleId}
        {...({ closedby: 'none' } as Record<string, string>)}
      >
        {decision && (
          <div ref={innerRef} className="dialog-inner" tabIndex={-1}>
            <div className="dialog-header">
              <div>
                <h1 id={titleId} className="dialog-heading">
                  {decision.title}
                </h1>
                {decision.manual && (
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    <span className="chip">Critical Decision (Auto-Play Paused)</span>
                  </div>
                )}
              </div>
              {onMinimizedChange && (
                <button
                  type="button"
                  className="battle-min-btn"
                  onClick={() => onMinimizedChange(true)}
                  title="Minimize choice window to inspect stats, squad, or logs (Shortcut: 0)"
                >
                  Minimize ▾
                </button>
              )}
            </div>

            <p className="dialog-body">{decision.body}</p>

            {decision.allowFreeText && (
              <div className="field">
                <label htmlFor="reflection-input">Personal Note</label>
                <textarea
                  ref={textareaRef}
                  id="reflection-input"
                  rows={3}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={decision.freeTextPlaceholder ?? 'Write your thought...'}
                />
              </div>
            )}

            <div className="decision-options">
              {primaryOptions.map((opt, idx) => (
                <button
                  key={opt.id}
                  type="button"
                  className="option-btn"
                  disabled={opt.disabled}
                  onClick={() => onResolve(opt.id, decision.allowFreeText ? freeText : undefined)}
                >
                  <span className="option-head">
                    <span>{opt.label}</span>
                    <span className="option-key tabular">{idx + 1}</span>
                  </span>
                  {opt.sublabel && <span className="option-sub">{opt.sublabel}</span>}
                  {opt.disabled && opt.disabledReason && (
                    <span className="option-sub" style={{ color: '#f2a6a6' }}>
                      {opt.disabledReason}
                    </span>
                  )}
                  {opt.statHints && opt.statHints.length > 0 && (
                    <span className="chip-row">
                      {opt.statHints.map((h) => (
                        <span key={h} className="chip">
                          {h}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {cancelOption && (
              <div className="dialog-cancel-row">
                <button
                  type="button"
                  className="btn btn-ghost dialog-cancel-btn"
                  onClick={() => onResolve(cancelOption.id)}
                >
                  <span>← {decision.cancelLabel ?? cancelOption.label}</span>
                  <span className="option-key">Esc</span>
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
