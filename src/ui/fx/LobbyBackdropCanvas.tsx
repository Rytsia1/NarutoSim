import { useEffect, useRef } from 'react';

interface LobbyBackdropCanvasProps {
  livesPlayed: number;
  codexCount: number;
  animate: boolean;
}

/**
 * Procedural Sumi-e Night Village skyline backdrop (inspired by GDD Ch. 12.1):
 * - Night stars correspond to discovered Bingo Book shinobi (codexCount)
 * - Warm village lantern windows correspond to completed lives (livesPlayed)
 * - Renders a single crisp static frame when `animate` is false (prefers-reduced-motion)
 */
export function LobbyBackdropCanvas({
  livesPlayed,
  codexCount,
  animate,
}: LobbyBackdropCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = document.documentElement.clientWidth || window.innerWidth;
      height = Math.min(460, Math.max(300, window.innerHeight * 0.48));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!animate) {
        draw(0);
      }
    };

    // Deterministic seeded positions for stars & village lanterns
    const stars = Array.from({ length: Math.min(24, Math.max(6, codexCount + 4)) }, (_, i) => ({
      x: ((i * 197 + 43) % 97) / 100,
      y: ((i * 89 + 17) % 52) / 100,
      r: i < codexCount ? 1.8 : 1.0,
      bright: i < codexCount,
      phase: i * 0.9,
    }));

    const lanterns = Array.from({ length: Math.min(60, Math.max(5, livesPlayed + 3)) }, (_, i) => ({
      x: ((i * 131 + 29) % 94) / 100 + 0.03,
      y: 0.72 + ((i * 53) % 22) / 100,
      lit: i < livesPlayed,
      phase: i * 1.1,
    }));

    const embers = Array.from({ length: 14 }, (_, i) => ({
      x: ((i * 73 + 11) % 100) / 100,
      y: ((i * 41 + 23) % 100) / 100,
      speed: 0.008 + (i % 4) * 0.004,
      drift: (i % 2 === 0 ? 1 : -1) * 0.004,
    }));

    const draw = (timeSec: number) => {
      // Night sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#0d0c0b');
      sky.addColorStop(0.65, '#191513');
      sky.addColorStop(1, '#11100e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      // Crescent moon
      const moonX = width * 0.82;
      const moonY = height * 0.22;
      ctx.fillStyle = 'rgba(237, 230, 214, 0.82)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12100f';
      ctx.beginPath();
      ctx.arc(moonX + 10, moonY - 5, 23, 0, Math.PI * 2);
      ctx.fill();

      // Codex Stars
      for (const s of stars) {
        const twinkle = animate ? 0.65 + 0.35 * Math.sin(timeSec * 1.4 + s.phase) : 0.85;
        ctx.fillStyle = s.bright
          ? `rgba(214, 163, 74, ${(0.95 * twinkle).toFixed(2)})`
          : `rgba(185, 175, 156, ${(0.35 * twinkle).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Distant mountain ridge silhouette
      ctx.fillStyle = '#151311';
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, height * 0.64);
      ctx.lineTo(width * 0.18, height * 0.48);
      ctx.lineTo(width * 0.36, height * 0.62);
      ctx.lineTo(width * 0.58, height * 0.45);
      ctx.lineTo(width * 0.78, height * 0.6);
      ctx.lineTo(width, height * 0.52);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      // Foreground shinobi rooftops & watchtower silhouettes
      ctx.fillStyle = '#0f0e0c';
      const towerCount = Math.max(7, Math.floor(width / 120));
      for (let i = 0; i < towerCount; i++) {
        const bx = (i / towerCount) * width;
        const bw = width / towerCount + 14;
        const bh = height * (0.18 + ((i * 37) % 14) / 100);
        const by = height - bh;
        ctx.fillRect(bx, by, bw, bh);
        // Sloped Japanese eave roof
        ctx.beginPath();
        ctx.moveTo(bx - 8, by + 2);
        ctx.lineTo(bx + bw / 2, by - 16);
        ctx.lineTo(bx + bw + 8, by + 2);
        ctx.closePath();
        ctx.fill();
      }

      // Village lantern lights (one per completed life!)
      for (const l of lanterns) {
        const pulse = animate ? 0.75 + 0.25 * Math.sin(timeSec * 2 + l.phase) : 0.9;
        ctx.fillStyle = l.lit
          ? `rgba(212, 80, 54, ${(0.88 * pulse).toFixed(2)})`
          : 'rgba(214, 163, 74, 0.28)';
        ctx.fillRect(l.x * width, l.y * height, 4, 6);
      }

      // Gentle drifting embers (only when animated)
      if (animate) {
        ctx.fillStyle = 'rgba(214, 163, 74, 0.28)';
        for (const e of embers) {
          const y = ((e.y - timeSec * e.speed) % 1 + 1) % 1;
          const x = ((e.x + Math.sin(timeSec + e.x * 10) * e.drift) % 1 + 1) % 1;
          ctx.beginPath();
          ctx.arc(x * width, y * height, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Fade bottom smoothly into page canvas
      const fade = ctx.createLinearGradient(0, height * 0.78, 0, height);
      fade.addColorStop(0, 'rgba(17, 16, 14, 0)');
      fade.addColorStop(1, '#11100e');
      ctx.fillStyle = fade;
      ctx.fillRect(0, height * 0.78, width, height * 0.22);
    };

    resize();
    window.addEventListener('resize', resize);

    if (animate) {
      const start = performance.now();
      const loop = (now: number) => {
        draw((now - start) / 1000);
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [livesPlayed, codexCount, animate]);

  return <canvas ref={canvasRef} className="lobby-backdrop-canvas" aria-hidden="true" />;
}
