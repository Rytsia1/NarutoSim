import { useEffect, useId, useRef } from 'react';
import type { UserSettings } from '../settings';

interface SettingsDialogProps {
  open: boolean;
  settings: UserSettings;
  onUpdate: (next: UserSettings) => void;
  onClose: () => void;
}

export function SettingsDialog({ open, settings, onUpdate, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Sync Escape / light-dismiss back to React state + Safari fallback for closedby="any"
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const handleClose = () => {
      el.returnValue = '';
      onCloseRef.current();
    };
    el.addEventListener('close', handleClose);

    let cleanupOutside: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) el.close();
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      cleanupOutside = () => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      el.removeEventListener('close', handleClose);
      cleanupOutside?.();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="decision-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="dialog-inner">
        <div className="disc-head">
          <h1 id={titleId} className="dialog-heading">
            Settings & Controls
          </h1>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} autoFocus>
            Close
          </button>
        </div>

        <div className="stat-list">
          <label className="settings-toggle">
            <span>Procedural Audio (BGM & SFX)</span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => onUpdate({ ...settings, soundEnabled: e.target.checked })}
            />
          </label>

          <div className="field">
            <label htmlFor="set-bgm" className="tabular">
              Ambience BGM Volume: {Math.round(settings.bgmVolume * 100)}%
            </label>
            <input
              id="set-bgm"
              type="range"
              min={0}
              max={1}
              step={0.05}
              disabled={!settings.soundEnabled}
              value={settings.bgmVolume}
              onChange={(e) => onUpdate({ ...settings, bgmVolume: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label htmlFor="set-sfx" className="tabular">
              SFX & Jingles Volume: {Math.round(settings.sfxVolume * 100)}%
            </label>
            <input
              id="set-sfx"
              type="range"
              min={0}
              max={1}
              step={0.05}
              disabled={!settings.soundEnabled}
              value={settings.sfxVolume}
              onChange={(e) => onUpdate({ ...settings, sfxVolume: Number(e.target.value) })}
            />
          </div>

          <label className="settings-toggle">
            <span>Cinematic Canvas FX (Jutsu Clash, Awakening, Crisis)</span>
            <input
              type="checkbox"
              checked={settings.fxEnabled}
              onChange={(e) => onUpdate({ ...settings, fxEnabled: e.target.checked })}
            />
          </label>

          <label className="settings-toggle">
            <span>Animated Night Village Lobby Sky</span>
            <input
              type="checkbox"
              checked={settings.lobbyAnimationEnabled}
              onChange={(e) => onUpdate({ ...settings, lobbyAnimationEnabled: e.target.checked })}
            />
          </label>
        </div>

        <div className="disc-item">
          <div className="disc-head">
            <span>Keyboard Shortcuts</span>
          </div>
          <div className="disc-sub">
            Space: Pause/Resume | 1 to 4: Speed (1x/2x/4x/8x) | A: Toggle Auto-Play | M: Mute Audio | 0: Minimize/Expand Choice or Battle | Esc: Cancel Sub-Menu | 1 to 9: Pick Dialog Option
          </div>
        </div>
      </div>
    </dialog>
  );
}
