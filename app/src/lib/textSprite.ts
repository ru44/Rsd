// Words for the map, drawn by the browser into small pictures.
// The map engine's own text drawing speckles on some graphics cards and
// cannot join Arabic letters; the browser's does both properly.

export interface TextStyle {
  /** A CSS font, e.g. "600 13px 'Geist Variable', sans-serif". */
  font: string;
  color: string;
  /** A filled box behind the words. */
  background?: string;
  /** A dark edge round each letter, for words with no box behind them. */
  halo?: string;
  padX?: number;
  padY?: number;
}

/** Pictures are drawn at this many times their shown size, to stay sharp. */
export const SPRITE_SCALE = 2;
const cache = new Map<string, HTMLCanvasElement>();
const MAX_CACHED = 600;

export function textSprite(text: string, style: TextStyle): HTMLCanvasElement {
  const key = `${text}\n${style.font}\n${style.color}\n${style.background ?? ""}\n${style.halo ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const k = SPRITE_SCALE;
  const padX = style.padX ?? (style.background ? 7 : 3);
  const padY = style.padY ?? (style.background ? 5 : 3);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = style.font;
  const size = parseFloat(style.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "13");
  const width = Math.ceil(ctx.measureText(text || " ").width) + padX * 2;
  const height = Math.ceil(size * 1.25) + padY * 2;
  canvas.width = width * k;
  canvas.height = height * k;
  ctx.scale(k, k);
  if (style.background) {
    ctx.fillStyle = style.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 5);
    ctx.fill();
  }
  ctx.font = style.font; // resizing the canvas resets it
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (style.halo) {
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.halo;
    ctx.strokeText(text, width / 2, height / 2 + 0.5);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(text, width / 2, height / 2 + 0.5);

  if (cache.size >= MAX_CACHED) cache.clear(); // readouts that change every frame would grow it for ever
  cache.set(key, canvas);
  return canvas;
}
