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
  if (entry.text.includes('Limit Break:') || entry.text.includes('KIZUNA INTERCEPTION!')) {
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

interface CinematicFxOverlayProps {
  fx: ActiveFxEvent | null;
  onFinish: () => void;
}

const FX_DURATION_MS = 1450;

export function CinematicFxOverlay({ fx, onFinish }: CinematicFxOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!fx) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        onFinish();
      }
    };
    window.addEventListener('keydown', onKey);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      const t = window.setTimeout(onFinish, FX_DURATION_MS);
      return () => {
        window.removeEventListener('keydown', onKey);
        window.clearTimeout(t);
      };
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const start = performance.now();
    let rafId = 0;

    const frame = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / FX_DURATION_MS);
      const alpha = p < 0.15 ? p / 0.15 : p > 0.78 ? (1 - p) / 0.22 : 1;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(12, 10, 9, ${(0.72 * alpha).toFixed(2)})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      if (fx.kind === 'jutsu_clash') {
        // Dual elemental beams colliding at center
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
        // Concentric crimson eye ripples
        for (let i = 0; i < 4; i++) {
          const r = 30 + (p * 260 + i * 55);
          ctx.strokeStyle = `rgba(212, 80, 54, ${(alpha * (1 - i * 0.2)).toFixed(2)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (fx.kind === 'resolve_burst') {
        // Diagonal speed slashes
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
        // Crimson moon eclipsing the center
        const r = Math.min(w, h) * (0.18 + p * 0.08);
        ctx.fillStyle = `rgba(180, 42, 34, ${(alpha * 0.45).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(214, 163, 74, ${(alpha * 0.75).toFixed(2)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        // Warm gold horizontal brush sweep
        const barW = w * Math.min(1, p * 2.2);
        ctx.fillStyle = `rgba(214, 163, 74, ${(alpha * 0.22).toFixed(2)})`;
        ctx.fillRect((w - barW) / 2, cy - 58, barW, 116);
      }

      if (elapsed < FX_DURATION_MS) {
        rafId = requestAnimationFrame(frame);
      } else {
        onFinish();
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(rafId);
    };
  }, [fx, onFinish]);

  if (!fx) return null;

  return (
    <div
      className="fx-overlay"
      role="status"
      aria-live="assertive"
      onClick={onFinish}
    >
      <canvas ref={canvasRef} className="fx-canvas" aria-hidden="true" />
      <div className="fx-caption">
        <div className="fx-headline">{fx.headline}</div>
        <div className="fx-subline">{fx.subline}</div>
        <div className="fx-skip-hint">Click or press Space / Esc to skip</div>
      </div>
    </div>
  );
}
