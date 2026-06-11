// ---------------------------------------------------------------------------
// Emote sprite-sheet.
//
// One shared CanvasTexture holds the five emote glyphs side by side. A single
// instanced sprite mesh (or a small pooled set) draws floating icons above
// citizens' heads, selecting a glyph by shifting UVs per instance. Drawing the
// glyphs to a canvas keeps us free of external assets and font loading.
//
// Layout: EMOTE_COUNT cells in a horizontal strip. Each cell is CELL px square.
// ---------------------------------------------------------------------------

import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';
import { EMOTE_COUNT } from './constants';

const CELL = 64;

let cached: { texture: Texture; cells: number } | null = null;

/** Draw one glyph centered in its cell. Pure 2D canvas, no external fonts. */
function drawGlyph(ctx: CanvasRenderingContext2D, index: number) {
  const cx = index * CELL + CELL / 2;
  const cy = CELL / 2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;

  // Soft rounded badge behind each glyph so it reads on any backdrop.
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2);
  ctx.fill();

  switch (index) {
    case 0: {
      // Heart — chat / social.
      ctx.fillStyle = '#e0556b';
      const s = CELL * 0.26;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.85);
      ctx.bezierCurveTo(cx + s * 1.4, cy - s * 0.4, cx + s * 0.5, cy - s * 1.2, cx, cy - s * 0.3);
      ctx.bezierCurveTo(cx - s * 0.5, cy - s * 1.2, cx - s * 1.4, cy - s * 0.4, cx, cy + s * 0.85);
      ctx.fill();
      break;
    }
    case 1: {
      // Music note — dancing.
      ctx.fillStyle = '#3a6fb0';
      ctx.strokeStyle = '#3a6fb0';
      ctx.lineWidth = 5;
      const headX = cx - 6;
      const headY = cy + 10;
      ctx.beginPath();
      ctx.ellipse(headX, headY, 8, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headX + 7, headY - 2);
      ctx.lineTo(headX + 7, cy - 16);
      ctx.lineTo(headX + 18, cy - 12);
      ctx.stroke();
      break;
    }
    case 2: {
      // Exclamation — protest / alarm.
      ctx.fillStyle = '#d8632a';
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 16);
      ctx.lineTo(cx + 5, cy - 16);
      ctx.lineTo(cx + 3, cy + 4);
      ctx.lineTo(cx - 3, cy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + 13, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 3: {
      // Zzz — lounging.
      ctx.fillStyle = '#5a7a9a';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('z', cx - 8, cy + 6);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('z', cx + 8, cy - 6);
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('z', cx + 18, cy - 16);
      break;
    }
    case 4:
    default: {
      // Question mark — lost.
      ctx.fillStyle = '#7a5aa0';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('?', cx, cy + 2);
      break;
    }
  }
  ctx.restore();
}

/**
 * Build (once) the shared emote sprite-sheet. Returns the texture plus its cell
 * count so consumers can size UV offsets. Falls back to null where there's no
 * 2D canvas (e.g. some SSR paths) — the caller then just skips emotes.
 */
export function getEmoteTexture(): { texture: Texture; cells: number } | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = CELL * EMOTE_COUNT;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < EMOTE_COUNT; i++) drawGlyph(ctx, i);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  cached = { texture, cells: EMOTE_COUNT };
  return cached;
}
