import { useEffect, useRef } from 'react';
import type { LogEntry } from '../../sim/types';

export type FxEventKind =
  | 'jutsu_clash'
  | 'bloodline_awaken'
  | 'resolve_burst'
  | 'crisis_descent'
  | 'rank_promotion';

export interface ActiveFxEvent {
  id: string;
  kind: FxEventKind;
  headline: string;
  subline: string;
}

const FX_PRIORITY: Record<FxEventKind, number> = {
  jutsu_clash: 5,
  crisis_descent: 4,
  bloodline_awaken: 3,
  resolve_burst: 2,
  rank_promotion: 1,
};

export function detectFxFromLogEntry(entry: LogEntry): ActiveFxEvent | null {
  if (entry.text.includes('JUTSU CLASH!')) {
    return {
      id: entry.id,
      kind: 'jutsu_clash',
      headline: 'JUTSU CLASH',
      subline: 'Two signature techniques collide midair',
    };
  }
  if (entry.title?.startsWith('Awakened ')) {
    return {
      id: entry.id,
      kind: 'bloodline_awaken',
      headline: entry.title.toUpperCase(),
      subline: 'Dormant Kekkei Genkai erupts across your chakra pathways',
    };
  }
  if (
    entry.text.includes('Limit Break:') ||
    entry.text.includes('KIZUNA INTERCEPTION!') ||
    entry.text.includes('Limit Break Body Flicker') ||
    entry.text.includes('Limit Break Second Wind')
  ) {
    return {
      id: entry.id,
      kind: 'resolve_burst',
      headline: entry.text.includes('KIZUNA INTERCEPTION!') ? 'KIZUNA INTERCEPTION' : 'LIMIT BREAK',
      subline: entry.text.includes('KIZUNA INTERCEPTION!')
        ? 'Old bonds hold the line against death'
        : 'Surpassing physical limits through pure shinobi resolve',
    };
  }
  if (entry.title?.includes('Descends!') || entry.title?.includes('Endgame Crisis War')) {
    return {
      id: entry.id,
      kind: 'crisis_descent',
      headline: 'ENDGAME CRISIS',
      subline: entry.title,
    };
  }
  if (
    entry.title?.startsWith('Promoted to ') ||
    entry.title === 'Acclaimed as Kage' ||
    entry.title?.startsWith('S-Rank Mastery:')
  ) {
    return {
      id: entry.id,
      kind: 'rank_promotion',
      headline: entry.title.toUpperCase(),
      subline: 'A new chapter etched into the village chronicle',
    };
  }
  return null;
}

export function pickHighestPriorityFx(entries: LogEntry[]): ActiveFxEvent | null {
  let best: ActiveFxEvent | null = null;
  for (const entry of entries) {
    const fx = detectFxFromLogEntry(entry);
    if (fx && (!best || FX_PRIORITY[fx.kind] >= FX_PRIORITY[best.kind])) {
      best = fx;
    }
  }
  return best;
}

interface CinematicFxOverlayProps {
  fx: ActiveFxEvent | null;
  onFinish: () => void;
}

const FX_DURATION_MS = 1450;

export function CinematicFxOverlay({ fx, onFinish }: CinematicFxOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Render in Browser Top Layer via native <dialog>.showModal() so FX always sits ABOVE BattleDialog/DecisionDialog
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (fx && !dlg.open) {
      dlg.showModal();
    } else if (!fx && dlg.open) {
      dlg.close();
    }
  }, [fx]);

  useEffect(() => {
    if (!fx) return;

    const finish = () => {
      const dlg = dialogRef.current;
      if (dlg?.open) dlg.close();
      onFinishRef.current();
    };

    const dlg = dialogRef.current;
    const onCancel = (e: Event) => {
      e.preventDefault();
      finish();
    };
    dlg?.addEventListener('cancel', onCancel);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, true);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      const t = window.setTimeout(finish, FX_DURATION_MS);
      return () => {
        dlg?.removeEventListener('cancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.clearTimeout(t);
      };
    }

    let w = 0;
    let h = 0;
    const syncSize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = document.documentElement.clientWidth || window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncSize();
    window.addEventListener('resize', syncSize);

    const start = performance.now();
    let rafId = 0;

    const frame = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / FX_DURATION_MS);
      const alpha = p < 0.15 ? p / 0.15 : p > 0.78 ? (1 - p) / 0.22 : 1;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(12, 10, 9, ${(0.76 * alpha).toFixed(2)})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      if (fx.kind === 'jutsu_clash') {
        const reach = Math.min(1, p * 2.4);
        ctx.strokeStyle = `rgba(212, 80, 54, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 10 * (1 - p * 0.4);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(cx * reach, cy);
        ctx.stroke();

        ctx.strokeStyle = `rgba(91, 155, 213, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(w, cy);
        ctx.lineTo(w - cx * reach, cy);
        ctx.stroke();

        if (p > 0.35) {
          const r = (p - 0.35) * Math.min(w, h) * 0.75;
          ctx.strokeStyle = `rgba(214, 163, 74, ${(alpha * 0.9).toFixed(2)})`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (fx.kind === 'bloodline_awaken') {
        for (let i = 0; i < 4; i++) {
          const r = 30 + (p * 260 + i * 55);
          ctx.strokeStyle = `rgba(212, 80, 54, ${(alpha * (1 - i * 0.2)).toFixed(2)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (fx.kind === 'resolve_burst') {
        ctx.strokeStyle = `rgba(212, 80, 54, ${(alpha * 0.85).toFixed(2)})`;
        ctx.lineWidth = 4;
        for (let i = -3; i <= 3; i++) {
          const offset = i * 64 + p * 120;
          ctx.beginPath();
          ctx.moveTo(cx - 320 + offset, cy + 180);
          ctx.lineTo(cx + 320 + offset, cy - 180);
          ctx.stroke();
        }
      } else if (fx.kind === 'crisis_descent') {
        const r = Math.min(w, h) * (0.18 + p * 0.08);
        ctx.fillStyle = `rgba(180, 42, 34, ${(alpha * 0.45).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(214, 163, 74, ${(alpha * 0.75).toFixed(2)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        const barW = w * Math.min(1, p * 2.2);
        ctx.fillStyle = `rgba(214, 163, 74, ${(alpha * 0.22).toFixed(2)})`;
        ctx.fillRect((w - barW) / 2, cy - 58, barW, 116);
      }

      if (elapsed < FX_DURATION_MS) {
        rafId = requestAnimationFrame(frame);
      } else {
        finish();
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      dlg?.removeEventListener('cancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', syncSize);
      cancelAnimationFrame(rafId);
    };
  }, [fx]);

  return (
    <dialog
      ref={dialogRef}
      className="fx-dialog"
      aria-label={fx?.headline ?? 'Cinematic Effect'}
      onClick={() => {
        if (dialogRef.current?.open) dialogRef.current.close();
        onFinishRef.current();
      }}
    >
      {fx && (
        <div className="fx-overlay" role="status" aria-live="assertive">
          <canvas ref={canvasRef} className="fx-canvas" aria-hidden="true" />
          <div className="fx-caption">
            <div className="fx-headline">{fx.headline}</div>
            <div className="fx-subline">{fx.subline}</div>
            <div className="fx-skip-hint">Click or press Space / Esc to skip</div>
          </div>
        </div>
      )}
    </dialog>
  );
}
