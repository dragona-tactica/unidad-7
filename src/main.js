import p5 from 'p5';
import Matter from 'matter-js';
import { WORD, ROLES, FAMILIES, FONT, COLORS, CONTROLS, PARAMS, FEATURES } from './config.js';

const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

const CAT_WALL = 0x1;
const CAT_BEAR = 0x2;
const COLLIDE = { group: 0, category: CAT_BEAR, mask: CAT_WALL | CAT_BEAR };
const GHOST = { group: 0, category: CAT_BEAR, mask: 0 };

const fontAt = (size) => `${size}px ${FONT}`;

new p5((p) => {
  let engine;
  let letters = [];
  let walls = [];
  let parents = [];
  let cubs = [];
  let fontSize = 100;
  let ready = false;

  // Fases del sistema:
  // formed    -> la palabra está armada; mover una C la desarma
  // play      -> las crías huyen, papá y mamá las persiguen y abrazan
  // gathering -> todas las crías volvieron; papá y mamá regresan a su sitio
  let phase = 'formed';
  let phaseStart = 0;
  let score = 0;
  let familyHug = false; // la próxima fase 'formed' empieza con el abrazo grupal
  let scoreAt = -1000;

  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.pixelDensity(Math.min(2, window.devicePixelRatio));
    // allSettled: si falta LokiCola.ttf se usa la fuente de respaldo
    Promise.allSettled([
      document.fonts.load(fontAt(80)),
      document.fonts.load('80px "Yellowtail"'),
    ]).then(() => {
      ready = true;
      build();
    });
  };

  p.windowResized = () => {
    const oldW = p.width;
    const oldH = p.height;
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    if (ready) relayout(oldW, oldH);
  };

  // Evita que las flechas hagan scroll en la página.
  p.keyPressed = () => (p.keyCode >= 37 && p.keyCode <= 40 ? false : undefined);

  // ---------------------------------------------------------------- layout

  function measureWord(ctx) {
    const W = p.width;
    const H = p.height;
    // la palabra ocupa una fracción del ancho y deja el resto para jugar
    ctx.font = fontAt(100);
    const per100 = ctx.measureText(WORD).width / 100;
    fontSize = Math.min((W * PARAMS.wordWidth) / per100, H * PARAMS.wordHeight);
    ctx.font = fontAt(fontSize);
    const total = ctx.measureText(WORD).width;
    const left = (W - total) / 2;
    const baseline = H * 0.5 + fontSize * 0.22;

    return WORD.split('').map((ch, i) => {
      const x0 = left + ctx.measureText(WORD.slice(0, i)).width;
      const m = ctx.measureText(ch);
      const gx0 = x0 - m.actualBoundingBoxLeft;
      const gx1 = x0 + m.actualBoundingBoxRight;
      const top = baseline - m.actualBoundingBoxAscent;
      const bottom = baseline + m.actualBoundingBoxDescent;
      const cx = (gx0 + gx1) / 2;
      const cy = (top + bottom) / 2;
      return {
        ch,
        i,
        role: ROLES[i],
        home: { x: cx, y: cy },
        // origen del fillText relativo al centro del glifo
        ox: x0 - cx,
        oy: baseline - cy,
        bw: gx1 - gx0,
        bh: bottom - top,
      };
    });
  }

  // Busca el hueco interior (la panza de la o / a) dibujando el glifo
  // en un canvas aparte: lo que no es tinta y no se alcanza desde el
  // borde es un hueco. De ahí salen hocico y orejas, para cualquier fuente.
  function findFace(L) {
    const pad = 4;
    const w = Math.ceil(L.bw) + pad * 2;
    const h = Math.ceil(L.bh) + pad * 2;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = fontAt(fontSize);
    g.fillStyle = '#000';
    g.fillText(L.ch, L.ox + w / 2, L.oy + h / 2);
    const a = g.getImageData(0, 0, w, h).data;
    const ink = (i) => a[i * 4 + 3] > 100;
    const N = w * h;
    const neighbors = (i) => {
      const x = i % w;
      const out = [];
      if (x > 0) out.push(i - 1);
      if (x < w - 1) out.push(i + 1);
      if (i >= w) out.push(i - w);
      if (i < N - w) out.push(i + w);
      return out;
    };

    // relleno desde los bordes: todo lo alcanzado es "afuera"
    const outside = new Uint8Array(N);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const i = stack.pop();
      if (outside[i] || ink(i)) continue;
      outside[i] = 1;
      stack.push(...neighbors(i));
    }

    // el hueco más grande
    const visited = new Uint8Array(N);
    let best = null;
    for (let s0 = 0; s0 < N; s0++) {
      if (outside[s0] || visited[s0] || ink(s0)) continue;
      const q = [s0];
      visited[s0] = 1;
      let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      while (q.length) {
        const i = q.pop();
        const x = i % w;
        const y = (i - x) / w;
        n++; sx += x; sy += y;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const j of neighbors(i)) {
          if (visited[j] || outside[j] || ink(j)) continue;
          visited[j] = 1;
          q.push(j);
        }
      }
      if (!best || n > best.n) best = { n, cx: sx / n, cy: sy / n, x0, x1, y0, y1 };
    }
    if (!best) return null;

    // grosor del trazo: tinta que hay justo encima del hueco
    const cx = Math.round(best.cx);
    let stroke = 0;
    for (let y = best.y0 - 1; y >= 0 && ink(y * w + cx); y--) stroke++;
    stroke = Math.max(stroke, 2);

    // las orejas van sobre el anillo que rodea al hueco, arriba a cada lado
    const rx = (best.x1 - best.x0) / 2 + stroke * 0.6;
    const ry = (best.y1 - best.y0) / 2 + stroke * 0.6;
    const ex = (best.x0 + best.x1) / 2;
    const ey = (best.y0 + best.y1) / 2;
    const ear = (ang) => local(ex + Math.cos(ang) * rx, ey + Math.sin(ang) * ry);
    const local = (x, y) => [x - w / 2, y - h / 2];
    return {
      holeW: best.x1 - best.x0,
      holeH: best.y1 - best.y0,
      stroke,
      nose: local(best.cx, best.cy - (best.y1 - best.y0) * 0.08),
      mouthEnd: local(best.cx, best.y1 - (best.y1 - best.y0) * 0.12),
      ears: [ear(-Math.PI * 0.75), ear(-Math.PI * 0.25)],
    };
  }

  function setWalls() {
    if (walls.length) Composite.remove(engine.world, walls);
    const W = p.width;
    const H = p.height;
    const t = 200;
    walls = [
      Bodies.rectangle(W / 2, -t / 2, W + 2 * t, t, { isStatic: true }),
      Bodies.rectangle(W / 2, H + t / 2, W + 2 * t, t, { isStatic: true }),
      Bodies.rectangle(-t / 2, H / 2, t, H + 2 * t, { isStatic: true }),
      Bodies.rectangle(W + t / 2, H / 2, t, H + 2 * t, { isStatic: true }),
    ];
    for (const b of walls) b.collisionFilter = { group: 0, category: CAT_WALL, mask: CAT_BEAR };
    Composite.add(engine.world, walls);
  }

  // Al cambiar el tamaño de la ventana no se reinicia el juego: se recalcula
  // la palabra y cada oso conserva su estado y su posición proporcional.
  function relayout(oldW, oldH) {
    const fresh = measureWord(p.drawingContext);
    const sx = p.width / oldW;
    const sy = p.height / oldH;
    letters.forEach((L, i) => {
      const k = fresh[i].bh / L.bh;
      Object.assign(L, {
        home: fresh[i].home, ox: fresh[i].ox, oy: fresh[i].oy, bw: fresh[i].bw, bh: fresh[i].bh,
      });
      if (!L.body) return;
      Body.scale(L.body, k, k);
      L.r *= k;
      if (L.role === 'cub') L.face = findFace(L);
      const atHome = L.state === 'home' || (L.role === 'parent' && phase === 'formed');
      Body.setPosition(L.body, atHome ? L.home : { x: L.body.position.x * sx, y: L.body.position.y * sy });
      if (L.hugConstraint) L.hugConstraint.pointA = { x: L.bw * 0.12, y: L.bh * 0.08 };
    });
    setWalls();
  }

  function build() {
    engine = Engine.create();
    engine.gravity.y = 0;
    walls = [];
    setWalls();

    letters = measureWord(p.drawingContext);
    parents = [];
    cubs = [];
    let player = 0;

    for (const L of letters) {
      L.wobble = Math.random() * Math.PI * 2;
      if (L.role === 'still') continue;
      L.r = Math.max(L.bw, L.bh) * (L.role === 'parent' ? 0.4 : 0.48);
      if (L.role === 'cub') L.face = findFace(L);
      L.body = Bodies.circle(L.home.x, L.home.y, L.r, {
        frictionAir: 0,
        friction: 0,
        restitution: 0.5,
        inertia: Infinity,
        collisionFilter: GHOST,
      });
      L.body.letter = L;
      Composite.add(engine.world, L.body);

      if (L.role === 'parent') {
        L.player = player++;
        L.hugging = null;
        parents.push(L);
      } else {
        L.state = 'home';
        L.wanderAngle = Math.random() * Math.PI * 2;
        cubs.push(L);
      }
    }

    Events.on(engine, 'collisionStart', (e) => {
      for (const { bodyA, bodyB } of e.pairs) {
        const a = bodyA.letter;
        const b = bodyB.letter;
        if (!a || !b) continue;
        if (a.role === 'parent' && b.role === 'cub') startHug(a, b);
        else if (b.role === 'parent' && a.role === 'cub') startHug(b, a);
      }
    });

    setPhase('formed');

    // solo en desarrollo: para inspeccionar el estado desde la consola
    if (import.meta.env.DEV) {
      window.__game = { p, parents, cubs, Body, get phase() { return phase; }, get score() { return score; } };
    }
  }

  // tras el abrazo grupal, el momento de lectura empieza cuando terminan de soltarse
  const holdMs = () => PARAMS.holdMs + (familyHug ? PARAMS.familyHugMs : 0);

  function setPhase(next) {
    phase = next;
    phaseStart = p.millis();
    const filter = next === 'play' ? COLLIDE : GHOST;
    for (const P of parents) P.body.collisionFilter = filter;
  }

  // ---------------------------------------------------------------- reglas

  // En la palabra armada cada o/a está pegada a su C. Si chocaran desde el
  // primer frame quedarían atrapadas al instante y la física las separaría
  // de golpe; por eso salen "fantasma" y se vuelven sólidas un momento después.
  function scatter() {
    familyHug = false;
    for (const C of cubs) {
      C.state = 'free';
      C.solidAt = p.millis() + PARAMS.escapeGraceMs;
      const a = Math.random() * Math.PI * 2;
      C.wanderAngle = a;
      Body.setVelocity(C.body, { x: Math.cos(a) * 6, y: Math.sin(a) * 6 - 3 });
    }
    setPhase('play');
  }

  function startHug(P, C) {
    if (phase !== 'play' || C.state !== 'free' || P.hugging) return;
    C.state = 'hugged';
    score++;
    scoreAt = p.millis();
    C.hugStart = p.millis();
    C.body.collisionFilter = GHOST;
    // la cría queda dentro del bucle de la C
    P.hugging = C;
    P.hugConstraint = Constraint.create({
      bodyA: P.body,
      pointA: { x: P.bw * 0.12, y: P.bh * 0.08 },
      bodyB: C.body,
      length: 0,
      stiffness: 0.08,
      damping: 0.2,
    });
    Composite.add(engine.world, P.hugConstraint);
  }

  function endHug(P) {
    const C = P.hugging;
    Composite.remove(engine.world, P.hugConstraint);
    P.hugging = null;
    P.hugConstraint = null;
    C.state = 'returning';
  }

  function updateParent(P) {
    const b = P.body;
    if (phase === 'gathering') {
      arrive(b, P.home, PARAMS.parentMaxSpeed * 0.8, 0.6);
      return;
    }
    if (phase === 'formed' && p.millis() - phaseStart < holdMs()) {
      Body.setPosition(b, P.home);
      Body.setVelocity(b, { x: 0, y: 0 });
      return;
    }
    const k = CONTROLS[P.player];
    const ax = (p.keyIsDown(k.right) ? 1 : 0) - (p.keyIsDown(k.left) ? 1 : 0);
    const ay = (p.keyIsDown(k.down) ? 1 : 0) - (p.keyIsDown(k.up) ? 1 : 0);
    let vx = b.velocity.x * PARAMS.parentDamping + ax * PARAMS.parentAccel;
    let vy = b.velocity.y * PARAMS.parentDamping + ay * PARAMS.parentAccel;
    const s = Math.hypot(vx, vy);
    if (s > PARAMS.parentMaxSpeed) {
      vx *= PARAMS.parentMaxSpeed / s;
      vy *= PARAMS.parentMaxSpeed / s;
    }
    Body.setVelocity(b, { x: vx, y: vy });

    if (P.hugging && p.millis() - P.hugging.hugStart > PARAMS.hugMs) endHug(P);
  }

  function updateCub(C) {
    const b = C.body;
    if (C.state === 'home') {
      Body.setPosition(b, C.home);
      Body.setVelocity(b, { x: 0, y: 0 });
      return;
    }
    if (C.state === 'hugged') {
      Body.setVelocity(b, { x: b.velocity.x * 0.8, y: b.velocity.y * 0.8 });
      return;
    }
    if (C.state === 'returning') {
      const d = arrive(b, C.home, 6, 0.5);
      if (d < 1.5) {
        C.state = 'home';
        C.body.collisionFilter = GHOST;
      }
      return;
    }

    // se vuelve sólida cuando ya pasó la gracia y no está encima de una C
    if (C.solidAt && p.millis() >= C.solidAt) {
      const clear = parents.every(
        (P) => Math.hypot(b.position.x - P.body.position.x, b.position.y - P.body.position.y) > P.r + C.r,
      );
      if (clear) {
        C.body.collisionFilter = COLLIDE;
        C.solidAt = null;
      }
    }

    // free: deambula y huye de papá y mamá
    C.wanderAngle += (Math.random() - 0.5) * 0.5;
    let dx = Math.cos(C.wanderAngle) * PARAMS.cubMaxSpeed * 0.55;
    let dy = Math.sin(C.wanderAngle) * PARAMS.cubMaxSpeed * 0.55;

    for (const P of parents) {
      const ox = b.position.x - P.body.position.x;
      const oy = b.position.y - P.body.position.y;
      const dist = Math.hypot(ox, oy);
      if (dist < PARAMS.fleeRadius && dist > 0) {
        const w = (1 - dist / PARAMS.fleeRadius) * PARAMS.cubMaxSpeed * 2.2;
        dx += (ox / dist) * w;
        dy += (oy / dist) * w;
      }
    }

    const m = PARAMS.wallMargin;
    const { x, y } = b.position;
    if (x < m) dx += PARAMS.cubMaxSpeed * (1 - x / m) * 2;
    if (x > p.width - m) dx -= PARAMS.cubMaxSpeed * (1 - (p.width - x) / m) * 2;
    if (y < m) dy += PARAMS.cubMaxSpeed * (1 - y / m) * 2;
    if (y > p.height - m) dy -= PARAMS.cubMaxSpeed * (1 - (p.height - y) / m) * 2;

    steer(b, dx, dy, PARAMS.cubMaxSpeed, PARAMS.cubMaxForce);
    if (Math.hypot(dx, dy) > 0.01) {
      // el deambular sigue la dirección en la que de verdad corre
      C.wanderAngle += angleDiff(Math.atan2(b.velocity.y, b.velocity.x), C.wanderAngle) * 0.05;
    }
  }

  function steer(b, dx, dy, maxSpeed, maxForce) {
    const ds = Math.hypot(dx, dy);
    if (ds > maxSpeed) {
      dx *= maxSpeed / ds;
      dy *= maxSpeed / ds;
    }
    let fx = dx - b.velocity.x;
    let fy = dy - b.velocity.y;
    const fs = Math.hypot(fx, fy);
    if (fs > maxForce) {
      fx *= maxForce / fs;
      fy *= maxForce / fs;
    }
    Body.setVelocity(b, { x: b.velocity.x + fx, y: b.velocity.y + fy });
  }

  // Steering "arrive": frena al acercarse. Devuelve la distancia restante.
  function arrive(b, target, maxSpeed, maxForce) {
    const ox = target.x - b.position.x;
    const oy = target.y - b.position.y;
    const d = Math.hypot(ox, oy);
    if (d < 1.5) {
      Body.setPosition(b, target);
      Body.setVelocity(b, { x: 0, y: 0 });
      return d;
    }
    const speed = d < PARAMS.arriveRadius ? maxSpeed * (d / PARAMS.arriveRadius) : maxSpeed;
    steer(b, (ox / d) * speed, (oy / d) * speed, maxSpeed, maxForce);
    return d;
  }

  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  function updatePhase() {
    if (phase === 'formed' && p.millis() - phaseStart >= holdMs()) {
      const left = parents.some(
        (P) => Math.hypot(P.body.position.x - P.home.x, P.body.position.y - P.home.y) > PARAMS.leaveDistance,
      );
      if (left) scatter();
    } else if (phase === 'play' && cubs.every((C) => C.state === 'home')) {
      for (const P of parents) if (P.hugging) endHug(P);
      setPhase('gathering');
    } else if (phase === 'gathering') {
      const home = parents.every(
        (P) => Math.hypot(P.body.position.x - P.home.x, P.body.position.y - P.home.y) < 1.5,
      );
      if (home) {
        familyHug = true;
        setPhase('formed');
      }
    }
  }

  // ---------------------------------------------------------------- dibujo

  // Facciones de oso tomadas del boceto: orejas redondas detrás del glifo,
  // hocico triangular con su línea en las crías y cabeza de perfil en la C.
  function earAt(ctx, x, y, r) {
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.earInner;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.1, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBack(ctx, L) {
    const F = FEATURES[L.ch];
    if (L.role === 'cub') {
      if (!L.face) return;
      const r = Math.max(L.face.holeW * F.ear, L.face.stroke * 0.9);
      for (const [ex, ey] of L.face.ears) earAt(ctx, ex, ey, r);
    } else {
      const s = F.headSize * L.bh;
      const hx = F.head[0] * L.bw;
      const hy = F.head[1] * L.bh;
      earAt(ctx, hx - s * 0.35, hy - s * 0.85, F.ear * L.bh);
    }
  }

  function drawFront(ctx, L) {
    const F = FEATURES[L.ch];
    ctx.fillStyle = COLORS.ink;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (L.role === 'cub') {
      // oscuro como en el boceto, así se lee encima del trazo blanco
      ctx.fillStyle = COLORS.feature;
      ctx.strokeStyle = COLORS.feature;
      if (!L.face) return;
      const n = Math.max(L.face.holeW * F.noseSize, fontSize * 0.035);
      const [nx, ny] = L.face.nose;
      // hocico: triángulo de esquinas suaves, más ancho que alto
      ctx.beginPath();
      ctx.moveTo(nx - n * 0.5, ny - n * 0.2);
      ctx.quadraticCurveTo(nx, ny - n * 0.36, nx + n * 0.5, ny - n * 0.2);
      ctx.quadraticCurveTo(nx + n * 0.42, ny + n * 0.18, nx, ny + n * 0.3);
      ctx.quadraticCurveTo(nx - n * 0.42, ny + n * 0.18, nx - n * 0.5, ny - n * 0.2);
      ctx.fill();
      // línea de la boca hasta el fondo de la panza
      const [, my] = L.face.mouthEnd;
      ctx.lineWidth = Math.max(n * 0.11, 1.2);
      ctx.beginPath();
      ctx.moveTo(nx, ny + n * 0.25);
      ctx.lineTo(nx, Math.max(my, ny + n * 0.55));
      ctx.stroke();
      return;
    }

    // C: cabeza de perfil que mira a la derecha
    const s = F.headSize * L.bh;
    const hx = F.head[0] * L.bw;
    const hy = F.head[1] * L.bh;
    ctx.beginPath();
    ctx.ellipse(hx, hy, s, s * 0.82, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // hocico
    ctx.beginPath();
    ctx.ellipse(hx + s * 0.9, hy + s * 0.12, s * 0.62, s * 0.42, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // nariz en la punta
    ctx.fillStyle = COLORS.feature;
    ctx.beginPath();
    ctx.moveTo(hx + s * 1.38, hy - s * 0.12);
    ctx.lineTo(hx + s * 1.56, hy + s * 0.02);
    ctx.lineTo(hx + s * 1.36, hy + s * 0.14);
    ctx.closePath();
    ctx.fill();
    // ojo cerrado y sonrisa
    ctx.strokeStyle = COLORS.feature;
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.arc(hx + s * 0.3, hy - s * 0.22, s * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx + s * 0.95, hy + s * 0.18, s * 0.3, 0.2 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }

  function drawLetter(L, x, y, rot, sx, sy) {
    const ctx = p.drawingContext;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    const bear = L.role !== 'still';
    if (bear) drawBack(ctx, L);
    ctx.fillStyle = COLORS.ink;
    ctx.font = fontAt(fontSize);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(L.ch, L.ox, L.oy);
    if (bear) {
      ctx.shadowBlur = 0;
      drawFront(ctx, L);
    }
    ctx.restore();
  }

  // Abrazo grupal: cada familia (C o c a / C o l a) se inclina hacia su
  // centro, se aprieta dos veces y se suelta. Las dos familias también se
  // acercan entre sí. Devuelve el desplazamiento de la letra o null.
  const smooth = (x) => {
    const c = Math.min(Math.max(x, 0), 1);
    return c * c * (3 - 2 * c);
  };
  const bump = (k, c, w) => Math.max(0, Math.cos(Math.min(Math.abs(k - c) / w, 1) * Math.PI / 2));

  function familyPose(L, t) {
    if (phase !== 'formed' || !familyHug) return null;
    const k = (t - phaseStart) / PARAMS.familyHugMs;
    if (k >= 1) return null;
    const env = smooth(k / 0.22) * (1 - smooth((k - 0.8) / 0.2));
    const squeeze = bump(k, 0.42, 0.08) + bump(k, 0.6, 0.08);

    const fam = FAMILIES.find((f) => f.includes(L.i));
    const famX = (f) => f.reduce((s, i) => s + letters[i].home.x, 0) / f.length;
    const wordX = FAMILIES.reduce((s, f) => s + famX(f), 0) / FAMILIES.length;
    if (!fam) return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, glow: env };

    const fx = famX(fam);
    const inward = fx - L.home.x;
    const dx = (inward * (0.18 + squeeze * 0.1) + (wordX - fx) * 0.08) * env;
    const rot = Math.sign(inward) * Math.min(Math.abs(inward) / L.bw, 1) * 0.12 * env;
    const hop = L.role === 'cub' ? -squeeze * fontSize * 0.1 : 0;
    return {
      dx,
      dy: hop,
      rot,
      sx: 1 - squeeze * 0.06,
      sy: 1 + squeeze * 0.04,
      glow: env,
    };
  }

  function drawPosed(L, x, y, rot, sx, sy, t) {
    const pose = familyPose(L, t);
    if (!pose) return drawLetter(L, x, y, rot, sx, sy);
    drawLetter(L, x + pose.dx, y + pose.dy, rot + pose.rot, sx * pose.sx, sy * pose.sy);
  }

  function drawBear(L, t) {
    const b = L.body;
    const speed = Math.hypot(b.velocity.x, b.velocity.y);
    const maxS = L.role === 'parent' ? PARAMS.parentMaxSpeed : PARAMS.cubMaxSpeed;
    const walk = Math.min(speed / maxS, 1);
    L.wobble += 0.12 + walk * 0.35;
    // caminado de oso: balanceo y pequeño salto
    const rot = Math.sin(L.wobble) * 0.13 * walk;
    const hop = -Math.abs(Math.sin(L.wobble)) * 5 * walk;
    let sx = 1;
    let sy = 1;
    if (L.role === 'parent' && L.hugging) {
      const k = (t - L.hugging.hugStart) / PARAMS.hugMs;
      const squeeze = Math.sin(Math.min(k, 1) * Math.PI) * 0.1;
      sx = 1 - squeeze;
      sy = 1 + squeeze * 0.6;
    }
    if (L.role === 'cub' && L.state === 'hugged') {
      sx = sy = 0.78;
    }
    drawPosed(L, b.position.x, b.position.y + hop, rot, sx, sy, t);
  }

  function drawHint() {
    const ctx = p.drawingContext;
    ctx.save();
    ctx.fillStyle = COLORS.hint;
    ctx.font = '500 14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('← ↑ → ↓  papá oso      ·      W A S D  mamá oso', p.width / 2, p.height - 24);
    ctx.restore();
  }

  // Marcador en la esquina superior derecha: un punto por cada abrazo.
  function drawScore(t) {
    const ctx = p.drawingContext;
    const size = Math.max(16, Math.min(p.width, p.height) * 0.035);
    const label = `Puntos  ${score}`;
    ctx.save();
    ctx.font = fontAt(size);
    const w = ctx.measureText(label).width + size * 1.2;
    const h = size * 1.6;
    const m = size * 1.1;
    const x = p.width - m - w;
    const y = m;
    // pequeño salto cuando suma
    const pop = Math.max(0, 1 - (t - scoreAt) / 300);
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(1 + pop * 0.15, 1 + pop * 0.15);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.3);
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, size * 0.05);
    ctx.restore();
  }

  p.draw = () => {
    p.background(COLORS.bg);
    if (!ready) return;

    for (const P of parents) updateParent(P);
    for (const C of cubs) updateCub(C);
    Engine.update(engine, 1000 / 60);
    updatePhase();

    const t = p.millis();
    const ctx = p.drawingContext;

    // depuración: ?zoom=3&zx=0.25 amplía la palabra alrededor de ese punto
    const q = new URLSearchParams(location.search);
    const zoom = parseFloat(q.get('zoom')) || 1;
    ctx.save();
    if (zoom !== 1) {
      const zx = (parseFloat(q.get('zx')) || 0.5) * p.width;
      const zy = (parseFloat(q.get('zy')) || 0.5) * p.height;
      ctx.translate(p.width / 2, p.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-zx, -zy);
    }

    // momento de lectura: la familia unida brilla un poco
    if (phase === 'formed') {
      const k = Math.min((t - phaseStart) / 600, 1);
      // durante el abrazo grupal el brillo crece: calor de familia
      const hugGlow = familyPose(letters[0], t)?.glow ?? 0;
      ctx.shadowColor = `rgba(255,255,255,${0.55 * k + 0.35 * hugGlow})`;
      ctx.shadowBlur = fontSize * (0.12 * k + 0.25 * hugGlow);
    }

    for (const L of letters) if (L.role === 'still') drawPosed(L, L.home.x, L.home.y, 0, 1, 1, t);
    for (const P of parents) drawBear(P, t);
    for (const C of cubs) drawBear(C, t);
    ctx.shadowBlur = 0;
    ctx.restore();

    drawScore(t);
    drawHint();
  };
});
