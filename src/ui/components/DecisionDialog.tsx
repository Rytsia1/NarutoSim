import { useEffect, useId, useRef, useState } from 'react';
import type { PendingDecision } from '../../sim/types';

interface DecisionDialogProps {
  decision: PendingDecision | null;
  shortcutsBlocked?: boolean;
  onResolve: (optionId: string, freeText?: string) => void;
}

export function DecisionDialog({
  decision,
  shortcutsBlocked = false,
  onResolve,
}: DecisionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleId = useId();
  const [freeText, setFreeText] = useState('');

  useEffect(() => {
    setFreeText('');
    if (innerRef.current) {
      innerRef.current.scrollTop = 0;
    }
  }, [decision?.id]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (decision && !el.open) {
      el.showModal();
    } else if (!decision && el.open) {
      el.close();
    }

    if (decision) {
      if (innerRef.current) {
        innerRef.current.scrollTop = 0;
      }
      if (decision.allowFreeText && textareaRef.current) {
        textareaRef.current.focus({ preventScroll: true });
      } else if (innerRef.current) {
        innerRef.current.focus({ preventScroll: true });
      }
    }
  }, [decision]);

  // Prevent Escape dismissal while a required game decision is active
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      if (decision) {
        e.preventDefault();
      }
    };
    el.addEventListener('cancel', handleCancel);
    return () => el.removeEventListener('cancel', handleCancel);
  }, [decision]);

  // Number keys 1..9 choose options (disabled when blocked, modifier held, or typing in free-text)
  useEffect(() => {
    if (!decision) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutsBlocked || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const num = Number(e.key);
      if (num >= 1 && num <= decision.options.length) {
        const opt = decision.options[num - 1];
        if (!opt.disabled) {
          e.preventDefault();
          onResolve(opt.id, decision.allowFreeText ? freeText : undefined);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decision, shortcutsBlocked, freeText, onResolve]);

  return (
    <dialog
      ref={dialogRef}
      className="decision-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'none' } as Record<string, string>)}
    >
      {decision && (
        <div ref={innerRef} className="dialog-inner" tabIndex={-1}>
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
            {decision.options.map((opt, idx) => (
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
        </div>
      )}
    </dialog>
  );
}
