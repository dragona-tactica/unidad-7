// Nivel "pantallas": celulares que le roban tiempo en familia a papá y mamá
// oso (y atraen a las crías) y regalos navideños que lo devuelven.
import { COLORS, PARAMS } from './config.js';

export function createHazards() {
  return { phones: [], gifts: [], popups: [], nextPhone: 0, nextGift: 0 };
}

export function clearHazards(h) {
  h.phones.length = 0;
  h.gifts.length = 0;
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
  const speed = PARAMS.phoneSpeed * (1 + round * 0.15);
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
export function updateHazards(h, { W, H, size, round, t, parents, avoid, onPhone, onGift }) {
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

  for (const ph of h.phones) {
    ph.x += ph.vx;
    ph.y += ph.vy;
    // rebota en los bordes una vez que entró en pantalla
    if (t - ph.born > 1500) {
      if (ph.x < ph.r || ph.x > W - ph.r) ph.vx *= -1;
      if (ph.y < ph.r || ph.y > H - ph.r) ph.vy *= -1;
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
  }
  h.popups = h.popups.filter((pp) => t - pp.born < 1200);
}

// desvanecer al nacer y al morir
function fade(age, life) {
  return Math.min(1, age / 300, (life - age) / 600);
}

export function drawHazards(ctx, h, size, t, font) {
  for (const g of h.gifts) drawGift(ctx, g, size, t, fade(t - g.born, PARAMS.giftLifeMs));
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
