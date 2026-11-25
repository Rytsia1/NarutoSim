import { t } from '../../data/i18n';
import { ELEMENT_NAMES } from '../../data/powers';
import type { LifeRecord } from '../../sim/types';

export function formatShareText(rec: LifeRecord): string {
  const rankLabel =
    rec.specialStatus === 'kage'
      ? 'Kage'
      : rec.specialStatus === 'missing_nin'
        ? `Missing-Nin (${t(`rank.${rec.peakRank}`)})`
        : t(`rank.${rec.peakRank}`);

  const parts = [
    `[NarutoSim Shinobi Record] ${rec.name}`,
    `${rec.villageName} | ${rec.originName} | Lived ${rec.birthYear} to ${rec.deathYear} (Age ${rec.deathAge})`,
    `Peak Rank: ${rankLabel} | Bingo Tier: ${rec.threatTier}-Rank | Element: ${ELEMENT_NAMES[rec.element]}`,
    `Kekkei Genkai: ${rec.bloodlineName ?? 'None'} | Wars Survived: ${rec.warsSurvived}/${rec.warsFought}`,
    `World Fate: ${rec.crisisStatus} | Cause: ${rec.causeOfDeath}`,
  ];
  if (rec.lastWords) {
    parts.push(`Last Words: "${rec.lastWords}"`);
  }
  return parts.join('\n');
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}...`;
}

export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines = 4,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = '';

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const test = line ? `${line} ${w}` : w;
    if (measure(test) <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines - 1) {
        // Accumulate all remaining words onto the final line and let truncation clamp cleanly
        const rest = words.slice(i + 1);
        if (rest.length > 0) line = `${line} ${rest.join(' ')}`;
        break;
      }
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line);
  }
  return lines;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4,
): number {
  const lines = wrapLines((s) => ctx.measureText(s).width, text, maxWidth, maxLines);
  let curY = y;
  for (const ln of lines) {
    ctx.fillText(truncateToWidth(ctx, ln, maxWidth), x, curY);
    curY += lineHeight;
  }
  return curY;
}

/**
 * Renders a crisp 1080x1350 Dark Shinobi Scroll record card natively via Canvas 2D
 * with zero external screenshot libraries.
 */
export function renderShinobiCardCanvas(rec: LifeRecord): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background Sumi-e canvas
  ctx.fillStyle = '#11100e';
  ctx.fillRect(0, 0, W, H);

  // Subtle top horizon glow
  const grad = ctx.createLinearGradient(0, 0, 0, 420);
  grad.addColorStop(0, '#241b17');
  grad.addColorStop(1, '#11100e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 420);

  // Outer scroll border
  ctx.strokeStyle = '#544a3d';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = '#38322a';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 50, W - 100, H - 100);

  // Vermilion hanko seal top-right
  ctx.strokeStyle = '#d45036';
  ctx.lineWidth = 5;
  ctx.strokeRect(W - 210, 78, 126, 126);
  ctx.fillStyle = '#d45036';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(rec.threatTier + '-RANK', W - 147, 134);
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('BINGO BOOK', W - 147, 168);
  ctx.textAlign = 'left';

  // Header
  ctx.fillStyle = '#d6a34a';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('NARUTOSIM : SHINOBI LIFE CHRONICLE', 86, 114);

  ctx.fillStyle = '#ede6d6';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText(rec.name, 86, 194, W - 320);

  const rankLabel =
    rec.specialStatus === 'kage'
      ? 'KAGE'
      : rec.specialStatus === 'missing_nin'
        ? `MISSING-NIN (${t(`rank.${rec.peakRank}`).toUpperCase()})`
        : t(`rank.${rec.peakRank}`).toUpperCase();

  ctx.fillStyle = '#b9af9c';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText(
    `${rec.villageName}  |  ${rec.birthYear} to ${rec.deathYear} (Age ${rec.deathAge})  |  ${rankLabel}`,
    86,
    246,
    W - 172,
  );

  // Divider
  ctx.strokeStyle = '#38322a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(86, 282);
  ctx.lineTo(W - 86, 282);
  ctx.stroke();

  // Key Stat Cards (2x3 grid)
  const cells: [string, string][] = [
    ['ORIGIN', rec.originName],
    ['CHAKRA NATURE', `${ELEMENT_NAMES[rec.element]} Release`],
    ['KEKKEI GENKAI', rec.bloodlineName ?? 'None Awakened'],
    ['WARS SURVIVED / FOUGHT', `${rec.warsSurvived} / ${rec.warsFought}`],
    ['WORLD FATE', rec.crisisStatus],
    ['CAUSE OF DEATH', rec.causeOfDeath],
  ];

  const colW = (W - 200) / 2;
  cells.forEach(([label, val], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 86 + col * (colW + 28);
    const y = 316 + row * 124;

    ctx.fillStyle = '#1a1815';
    ctx.fillRect(x, y, colW, 102);
    ctx.strokeStyle = '#38322a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, colW, 102);

    ctx.fillStyle = '#938876';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(label, x + 20, y + 34);

    ctx.fillStyle = '#ede6d6';
    ctx.font = '600 23px system-ui, sans-serif';
    ctx.fillText(val, x + 20, y + 72, colW - 40);
  });

  // Squad & Disciplines block
  let curY = 720;
  ctx.fillStyle = '#d6a34a';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('GENIN SQUAD & KIZUNA', 86, curY);
  curY += 32;
  ctx.fillStyle = '#ede6d6';
  ctx.font = '24px system-ui, sans-serif';
  curY = wrapText(ctx, rec.teamSummary, 86, curY, W - 172, 34, 3);

  curY += 26;
  ctx.fillStyle = '#d6a34a';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('SIGNATURE DISCIPLINES', 86, curY);
  curY += 32;
  ctx.fillStyle = '#ede6d6';
  ctx.font = '24px system-ui, sans-serif';
  curY = wrapText(
    ctx,
    rec.topDisciplines.length > 0 ? rec.topDisciplines.join('  |  ') : 'Unrecorded fundamentals',
    86,
    curY,
    W - 172,
    34,
    2,
  );

  // Last Words quote box
  if (rec.lastWords) {
    curY += 28;
    ctx.fillStyle = '#201c15';
    ctx.fillRect(86, curY, W - 172, 168);
    ctx.strokeStyle = '#d6a34a';
    ctx.lineWidth = 2;
    ctx.strokeRect(86, curY, W - 172, 168);

    ctx.fillStyle = '#d6a34a';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText('LAST WORDS', 112, curY + 36);

    ctx.fillStyle = '#ede6d6';
    ctx.font = 'italic 28px Georgia, serif';
    wrapText(ctx, `"${rec.lastWords}"`, 112, curY + 82, W - 224, 38, 2);
  }

  // Footer
  ctx.fillStyle = '#938876';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(`Seed #${rec.seed}  |  NarutoSim Solo Shinobi PWA`, 86, H - 72);

  return canvas;
}

export async function downloadOrShareShinobiCard(rec: LifeRecord): Promise<string> {
  const canvas = renderShinobiCardCanvas(rec);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return 'Could not generate PNG card.';

  const filename = `narutosim-${rec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `${rec.name}: Shinobi Record`,
        text: formatShareText(rec),
        files: [file],
      });
      return 'Shared Shinobi Card.';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return 'Share cancelled.';
      }
      // Fallback to direct download if share failed for non-cancel reason
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Shinobi Record PNG downloaded.';
}
