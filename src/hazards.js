// Nivel "pantallas": celulares que le roban tiempo en familia a papá y mamá
// oso (y atraen a las crías) y regalos navideños que lo devuelven.
import { COLORS, PARAMS } from './config.js';

export function createHazards() {
  // cola: la única Coca-Cola del nivel 2 (invulnerabilidad)
  return { phones: [], gifts: [], popups: [], nextPhone: 0, nextGift: 0, cola: null, colaAt: 0, colaSpawned: false };
}

export function clearHazards(h) {
  h.phones.length = 0;
  h.gifts.length = 0;
  h.cola = null;
  h.colaAt = 0;
  h.colaSpawned = false;
}

export function popup(h, x, y, text, t) {
  h.popups.push({ x, y, text, born: t });
}

const rand = (a, b) => a + Math.random() * (b - a);

function spawnPhone(h, W, H, size, round, t) {
  // entra desde un borde, apuntando hacia el interior
  const side = Math.floor(Math.random() * 4);
  const m = size;
  const x = side === 0 ? -m : side === 1 ? W + m : rand(m, W - m);
  const y = side === 2 ? -m : side === 3 ? H + m : rand(m, H - m);
  const tx = rand(W * 0.2, W * 0.8);
  const ty = rand(H * 0.2, H * 0.8);
  const d = Math.hypot(tx - x, ty - y);
  const speed = phoneSpeed(round);
  h.phones.push({
    x, y,
    vx: ((tx - x) / d) * speed,
    vy: ((ty - y) / d) * speed,
    r: size * 0.32,
    born: t,
    spin: rand(0, Math.PI * 2),
  });
}

function spawnGift(h, W, H, size, avoid, t) {
  // lejos de la palabra y de los osos, para que haya que ir a buscarlo
  for (let tries = 0; tries < 20; tries++) {
    const x = rand(W * 0.08, W * 0.92);
    const y = rand(H * 0.12, H * 0.88);
    if (avoid.every((a) => Math.hypot(a.x - x, a.y - y) > size * 2.2)) {
      h.gifts.push({ x, y, r: size * 0.3, born: t });
      return;
    }
  }
}

// Avanza celulares y regalos. `onPhone(P, phone)` y `onGift(P, gift)` se
// llaman cuando un papá los toca; devuelven true si el objeto se consume.
// cada nivel los celulares son más rápidos
export const phoneSpeed = (round) =>
  Math.min(PARAMS.phoneSpeed * (1 + round * PARAMS.phoneSpeedUpPerLevel), PARAMS.phoneMaxSpeed);

function nearest(points, from) {
  let best = null;
  let bd = Infinity;
  for (const pt of points) {
    const d = Math.hypot(pt.x - from.x, pt.y - from.y);
    if (d < bd) {
      bd = d;
      best = pt;
    }
  }
  return best;
}

// `targets`: posiciones de los osos que los celulares persiguen.
export function updateHazards(h, { W, H, size, round, t, parents, targets, avoid, onPhone, onGift, onCola }) {
  // una sola Coca-Cola en el nivel indicado, un rato después de empezar
  if (round === PARAMS.colaLevel - 1 && !h.colaSpawned) {
    if (!h.colaAt) h.colaAt = t + PARAMS.colaDelayMs;
    if (t >= h.colaAt) {
      const before = h.gifts.length;
      spawnGift(h, W, H, size, avoid, t);
      if (h.gifts.length > before) {
        h.cola = h.gifts.pop();
        h.colaSpawned = true;
      }
    }
  }

  const maxPhones = PARAMS.phonesBase + round;
  const every = PARAMS.phoneEveryMs / (1 + round * 0.25);
  if (t >= h.nextPhone) {
    if (h.phones.length < maxPhones) spawnPhone(h, W, H, size, round, t);
    h.nextPhone = t + every * rand(0.7, 1.3);
  }
  if (t >= h.nextGift) {
    if (h.gifts.length < 2) spawnGift(h, W, H, size, avoid, t);
    h.nextGift = t + PARAMS.giftEveryMs * rand(0.8, 1.3);
  }

  // Los celulares persiguen al oso grande más cercano (seek). El giro está
  // limitado para que hagan curvas y se puedan esquivar.
  const speed = phoneSpeed(round);
  const turn = PARAMS.phoneTurn * (1 + round * 0.2);
  for (const ph of h.phones) {
    const prey = nearest(targets, ph);
    if (prey && t - ph.born > 600) {
      const ox = prey.x - ph.x;
      const oy = prey.y - ph.y;
      const d = Math.hypot(ox, oy) || 1;
      let fx = (ox / d) * speed - ph.vx;
      let fy = (oy / d) * speed - ph.vy;
      const f = Math.hypot(fx, fy);
      if (f > turn) {
        fx *= turn / f;
        fy *= turn / f;
      }
      ph.vx += fx;
      ph.vy += fy;
    }
    ph.x += ph.vx;
    ph.y += ph.vy;
    if (t - ph.born > 1500) {
      ph.x = Math.min(Math.max(ph.x, ph.r), W - ph.r);
      ph.y = Math.min(Math.max(ph.y, ph.r), H - ph.r);
    }
  }
  h.phones = h.phones.filter((ph) => t - ph.born < PARAMS.phoneLifeMs);
  h.gifts = h.gifts.filter((g) => t - g.born < PARAMS.giftLifeMs);

  for (const P of parents) {
    const { x, y } = P.body.position;
    h.phones = h.phones.filter((ph) => !(Math.hypot(ph.x - x, ph.y - y) < P.r * 0.8 + ph.r && onPhone(P, ph)));
    h.gifts = h.gifts.filter((g) => !(Math.hypot(g.x - x, g.y - y) < P.r * 0.8 + g.r && onGift(P, g)));
    if (h.cola && Math.hypot(h.cola.x - x, h.cola.y - y) < P.r * 0.8 + h.cola.r && onCola(P, h.cola)) h.cola = null;
  }
  h.popups = h.popups.filter((pp) => t - pp.born < 1200);
}

// desvanecer al nacer y al morir
function fade(age, life) {
  return Math.min(1, age / 300, (life - age) / 600);
}

export function drawHazards(ctx, h, size, t, font) {
  for (const g of h.gifts) drawGift(ctx, g, size, t, fade(t - g.born, PARAMS.giftLifeMs));
  if (h.cola) drawCola(ctx, h.cola, size, t);
  for (const ph of h.phones) drawPhone(ctx, ph, size, t, fade(t - ph.born, PARAMS.phoneLifeMs));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const pp of h.popups) {
    const k = (t - pp.born) / 1200;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = COLORS.ink;
    ctx.font = font(size * 0.38);
    ctx.fillText(pp.text, pp.x, pp.y - k * size * 0.8);
  }
  ctx.restore();
}

function drawPhone(ctx, ph, size, t, alpha) {
  const w = size * 0.34;
  const hgt = size * 0.6;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(ph.x, ph.y);
  ctx.rotate(Math.sin(t * 0.004 + ph.spin) * 0.25);
  // la luz fría de la pantalla, contra el blanco cálido de la familia
  ctx.shadowColor = COLORS.screenGlow;
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = COLORS.phone;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -hgt / 2, w, hgt, w * 0.22);
  ctx.fill();
  ctx.shadowBlur = 0;
  const pad = w * 0.1;
  const flicker = 0.75 + 0.25 * Math.sin(t * 0.02 + ph.spin);
  ctx.fillStyle = COLORS.screen;
  ctx.globalAlpha *= flicker;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + pad, -hgt / 2 + pad * 1.6, w - pad * 2, hgt - pad * 3.2, w * 0.1);
  ctx.fill();
  ctx.restore();
}

// botella de Coca-Cola: vidrio oscuro, etiqueta roja con la onda blanca
function drawCola(ctx, c, size, t) {
  const h = size * 0.72;
  const w = h * 0.34;
  const bob = Math.sin(t * 0.004) * size * 0.06;
  const pulse = 0.6 + 0.4 * Math.sin(t * 0.008);
  ctx.save();
  ctx.globalAlpha = Math.min(1, (t - c.born) / 400);
  ctx.translate(c.x, c.y + bob);
  ctx.rotate(Math.sin(t * 0.003) * 0.12);

  // destello alrededor: es especial
  ctx.shadowColor = `rgba(255, 236, 170, ${0.9 * pulse})`;
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = COLORS.colaGlass;
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, -h / 2 + h * 0.08);
  ctx.lineTo(w * 0.18, -h / 2 + h * 0.08);
  ctx.bezierCurveTo(w * 0.18, -h * 0.18, w * 0.55, -h * 0.12, w * 0.5, h * 0.05);
  ctx.bezierCurveTo(w * 0.42, h * 0.18, w * 0.52, h * 0.3, w * 0.5, h * 0.44);
  ctx.quadraticCurveTo(w * 0.48, h / 2, 0, h / 2);
  ctx.quadraticCurveTo(-w * 0.48, h / 2, -w * 0.5, h * 0.44);
  ctx.bezierCurveTo(-w * 0.52, h * 0.3, -w * 0.42, h * 0.18, -w * 0.5, h * 0.05);
  ctx.bezierCurveTo(-w * 0.55, -h * 0.12, -w * 0.18, -h * 0.18, -w * 0.18, -h / 2 + h * 0.08);
  ctx.fill();
  ctx.shadowBlur = 0;

  // tapa
  ctx.fillStyle = COLORS.bg;
  ctx.beginPath();
  ctx.roundRect(-w * 0.22, -h / 2, w * 0.44, h * 0.09, w * 0.06);
  ctx.fill();
  // etiqueta
  ctx.fillRect(-w * 0.5, h * 0.02, w, h * 0.2);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = h * 0.025;
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, h * 0.15);
  ctx.quadraticCurveTo(0, h * 0.04, w * 0.45, h * 0.1);
  ctx.stroke();
  // brillo del vidrio
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = w * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, -h * 0.08);
  ctx.lineTo(-w * 0.3, -h * 0.0);
  ctx.moveTo(-w * 0.3, h * 0.28);
  ctx.lineTo(-w * 0.3, h * 0.4);
  ctx.stroke();
  ctx.restore();
}

function drawGift(ctx, g, size, t, alpha) {
  const s = size * 0.42;
  const bob = Math.sin(t * 0.005 + g.x) * size * 0.05;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(g.x, g.y + bob);
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = size * 0.2;
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.08);
  ctx.fill();
  ctx.shadowBlur = 0;
  // cinta y moño
  ctx.fillStyle = COLORS.feature;
  ctx.fillRect(-s * 0.08, -s / 2, s * 0.16, s);
  ctx.fillRect(-s / 2, -s * 0.08, s, s * 0.16);
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.ellipse(-s * 0.17, -s * 0.62, s * 0.17, s * 0.11, -0.5, 0, Math.PI * 2);
  ctx.ellipse(s * 0.17, -s * 0.62, s * 0.17, s * 0.11, 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawHeart(ctx, x, y, s, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 0.6, -s * 0.05, -s * 0.35, -s * 0.55, 0, -s * 0.25);
  ctx.bezierCurveTo(s * 0.35, -s * 0.55, s * 0.6, -s * 0.05, 0, s * 0.35);
  if (filled) {
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.stroke();
  }
  ctx.restore();
}
