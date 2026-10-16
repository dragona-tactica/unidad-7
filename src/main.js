import p5 from 'p5';
import Matter from 'matter-js';
import { FAMILIES, FONT, COLORS, CONTROLS, PARAMS, PARENT, BOW } from './config.js';
import LOGO from './letters.json';
import { createHazards, clearHazards, updateHazards, drawHazards, drawHeart, popup } from './hazards.js';

const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

const CAT_WALL = 0x1;
const CAT_BEAR = 0x2;
const COLLIDE = { group: 0, category: CAT_BEAR, mask: CAT_WALL | CAT_BEAR };
const GHOST = { group: 0, category: CAT_BEAR, mask: 0 };

const fontAt = (size) => `${size}px ${FONT}`;

// recortes de cada letra (tools/cut_letters.py); ruta relativa para GitHub Pages
const images = LOGO.letters.map((d) => {
  const img = new Image();
  img.src = `letters/${d.file}`;
  return img;
});

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
  // over      -> (nivel pantallas) se acabó el tiempo en familia
  let phase = 'formed';
  let phaseStart = 0;
  let score = 0;
  let familyHug = false; // la próxima fase 'formed' empieza con el abrazo grupal
  let scoreAt = -1000;

  // Modo: 'classic' al principio; tras completar una vez aparece
  // "Seguir jugando" y se pasa a 'screens' (celulares, regalos, vida).
  let mode = 'classic';
  let completedOnce = false;
  let round = 0;
  let lives = PARAMS.lives;
  let invulnUntil = 0;
  let shieldUntil = 0; // invulnerabilidad de la Coca-Cola
  let banner = null; // { text, at }
  let won = false;        // ya llegó la carta de Papá Oso en esta partida
  let winPending = false; // mostrarla cuando termine el abrazo grupal
  let paused = false;     // mientras se lee la carta
  const hazards = createHazards();

  const ui = {
    cont: document.getElementById('continue'),
    over: document.getElementById('over'),
    overScore: document.getElementById('over-score'),
    restart: document.getElementById('restart'),
    win: document.getElementById('win'),
    winContinue: document.getElementById('win-continue'),
    winRestart: document.getElementById('win-restart'),
  };
  ui.winContinue.addEventListener('click', () => {
    ui.winContinue.blur();
    ui.win.hidden = true;
    paused = false;
  });
  ui.winRestart.addEventListener('click', () => {
    ui.winRestart.blur();
    ui.win.hidden = true;
    paused = false;
    restart();
  });
  ui.cont.addEventListener('click', () => {
    ui.cont.blur();
    startScreens();
  });
  ui.restart.addEventListener('click', () => {
    ui.restart.blur();
    restart();
  });

  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.pixelDensity(Math.min(2, window.devicePixelRatio));
    // allSettled: si falta LokiCola.ttf se usa la fuente de respaldo
    Promise.allSettled([
      document.fonts.load(fontAt(80)),
      document.fonts.load('80px "Yellowtail"'),
      ...images.map((img) => new Promise((done) => {
        if (img.complete) done();
        else img.onload = img.onerror = done;
      })),
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

  // La palabra sale del logo dibujado: cada letra conserva su posición en él
  // y se escala para ocupar una fracción de la pantalla.
  function measureWord() {
    const W = p.width;
    const H = p.height;
    const s = Math.min((W * PARAMS.wordWidth) / LOGO.width, (H * PARAMS.wordHeight) / LOGO.height);
    // tamaño de referencia para celulares, textos y brillos
    fontSize = s * PARAMS.sizeRef;
    const left = (W - LOGO.width * s) / 2;
    const top = (H - LOGO.height * s) / 2;

    return LOGO.letters.map((d, i) => {
      // el cuerpo de una C es el arco con la cabeza, no la cola larga
      const anchor = d.role === 'parent' ? PARENT.anchor : { x: d.w / 2, y: d.h / 2 };
      return {
        ch: d.ch,
        i,
        role: d.role,
        img: images[i],
        home: { x: left + (d.x + anchor.x) * s, y: top + (d.y + anchor.y) * s },
        ax: anchor.x * s,
        ay: anchor.y * s,
        bw: d.w * s,
        bh: d.h * s,
        scale: s,
        radius: (d.role === 'parent' ? PARENT.radius : Math.max(d.w, d.h) * 0.45) * s,
        hugPoint: { x: PARENT.hug.x * s, y: PARENT.hug.y * s },
      };
    });
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
    const fresh = measureWord();
    const sx = p.width / oldW;
    const sy = p.height / oldH;
    letters.forEach((L, i) => {
      const k = fresh[i].bh / L.bh;
      const { home, ax, ay, bw, bh, scale, radius, hugPoint } = fresh[i];
      Object.assign(L, { home, ax, ay, bw, bh, scale, hugPoint });
      if (!L.body) return;
      Body.scale(L.body, k, k);
      L.r = radius;
      const atHome = L.state === 'home' || (L.role === 'parent' && phase === 'formed');
      Body.setPosition(L.body, atHome ? L.home : { x: L.body.position.x * sx, y: L.body.position.y * sy });
      if (L.hugConstraint) L.hugConstraint.pointA = L.hugPoint;
    });
    setWalls();
  }

  function build() {
    engine = Engine.create();
    engine.gravity.y = 0;
    walls = [];
    setWalls();

    letters = measureWord();
    parents = [];
    cubs = [];
    let player = 0;

    for (const L of letters) {
      L.wobble = Math.random() * Math.PI * 2;
      if (L.role === 'still') continue;
      L.r = L.radius;
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
      window.__game = {
        p, parents, cubs, Body, hazards,
        get phase() { return phase; },
        get score() { return score; },
        get lives() { return lives; },
        get mode() { return mode; },
        get round() { return round; },
        get paused() { return paused; },
        get shieldUntil() { return shieldUntil; },
        cubSpeed,
      };
    }
  }

  // tras el abrazo grupal, el momento de lectura empieza cuando terminan de soltarse
  const holdMs = () => PARAMS.holdMs + (familyHug ? PARAMS.familyHugMs : 0);

  const cubSpeed = () =>
    PARAMS.cubMaxSpeed *
    (mode === 'screens' ? Math.min(1 + PARAMS.speedUpPerRound * (round + 1), PARAMS.maxSpeedUp) : 1);

  function showBanner(text) {
    banner = { text, at: p.millis() };
  }

  function startScreens() {
    mode = 'screens';
    round = 0;
    lives = PARAMS.lives;
    hazards.nextPhone = p.millis() + 1500;
    hazards.nextGift = p.millis() + PARAMS.giftEveryMs;
    showBanner('Nivel 1 · Cuidado con las pantallas');
    scatter();
  }

  // Todos a casa, sin abrazos pendientes, para empezar de nuevo.
  function resetFamily() {
    for (const P of parents) {
      if (P.hugging) endHug(P);
      Body.setPosition(P.body, P.home);
      Body.setVelocity(P.body, { x: 0, y: 0 });
    }
    for (const C of cubs) {
      C.state = 'home';
      C.solidAt = null;
      C.body.collisionFilter = GHOST;
      Body.setPosition(C.body, C.home);
    }
  }

  function gameOver() {
    setPhase('over');
    clearHazards(hazards);
    ui.overScore.textContent = `Puntos ${score}`;
    ui.over.hidden = false;
  }

  function restart() {
    ui.over.hidden = true;
    for (const P of parents) P.played = false;
    won = false;
    winPending = false;
    resetFamily();
    score = 0;
    familyHug = false;
    clearHazards(hazards);
    setPhase('formed');
    startScreens();
  }

  // Solo participan los osos que alguien movió. Si juega una sola persona,
  // el otro oso no es perseguido ni dañado: los celulares lo atraviesan.
  const playingParents = () => parents.filter((P) => P.played);

  function onPhone(P, ph) {
    const t = p.millis();
    // con la Coca-Cola los celulares se rompen sin quitar tiempo en familia
    if (t < shieldUntil) {
      popup(hazards, ph.x, ph.y, '¡Fuera!', t);
      return true;
    }
    if (t < invulnUntil) return false;
    lives--;
    invulnUntil = t + PARAMS.hitInvulnMs;
    P.hitAt = t;
    popup(hazards, ph.x, ph.y, '−1', t);
    if (lives <= 0) gameOver();
    return true;
  }

  function onCola(P, c) {
    const t = p.millis();
    shieldUntil = t + PARAMS.colaShieldMs;
    popup(hazards, c.x, c.y, '¡Invulnerables!', t);
    return true;
  }

  function onGift(P, g) {
    const t = p.millis();
    if (lives >= PARAMS.lives) {
      score++;
      scoreAt = t;
      popup(hazards, g.x, g.y, '+1', t);
    } else {
      lives++;
      popup(hazards, g.x, g.y, '+1 ♥', t);
    }
    return true;
  }

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
    if (mode === 'screens' && round > 0) showBanner(`Nivel ${round + 1}`);
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
      pointA: P.hugPoint, // donde va la o en el logo: dentro de la curva de la C
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
    if (phase === 'over') {
      Body.setVelocity(b, { x: b.velocity.x * 0.85, y: b.velocity.y * 0.85 });
      return;
    }
    if (paused) {
      Body.setPosition(b, P.home);
      Body.setVelocity(b, { x: 0, y: 0 });
      return;
    }
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
    if (ax || ay) P.played = true;
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
    const vmax = cubSpeed();
    C.wanderAngle += (Math.random() - 0.5) * 0.5;
    let dx = Math.cos(C.wanderAngle) * vmax * 0.55;
    let dy = Math.sin(C.wanderAngle) * vmax * 0.55;

    // las pantallas atraen a las crías
    for (const ph of hazards.phones) {
      const ox = ph.x - b.position.x;
      const oy = ph.y - b.position.y;
      const dist = Math.hypot(ox, oy);
      if (dist < PARAMS.phoneLureRadius && dist > 0) {
        const w = (1 - dist / PARAMS.phoneLureRadius) * vmax * PARAMS.phoneLure;
        dx += (ox / dist) * w;
        dy += (oy / dist) * w;
      }
    }

    for (const P of parents) {
      const ox = b.position.x - P.body.position.x;
      const oy = b.position.y - P.body.position.y;
      const dist = Math.hypot(ox, oy);
      if (dist < PARAMS.fleeRadius && dist > 0) {
        const w = (1 - dist / PARAMS.fleeRadius) * vmax * 2.2;
        dx += (ox / dist) * w;
        dy += (oy / dist) * w;
      }
    }

    const m = PARAMS.wallMargin;
    const { x, y } = b.position;
    if (x < m) dx += vmax * (1 - x / m) * 2;
    if (x > p.width - m) dx -= vmax * (1 - (p.width - x) / m) * 2;
    if (y < m) dy += vmax * (1 - y / m) * 2;
    if (y > p.height - m) dy -= vmax * (1 - (p.height - y) / m) * 2;

    steer(b, dx, dy, vmax, PARAMS.cubMaxForce);
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
    if (paused) return;
    if (phase === 'formed' && p.millis() - phaseStart >= holdMs()) {
      const left = parents.some(
        (P) => Math.hypot(P.body.position.x - P.home.x, P.body.position.y - P.home.y) > PARAMS.leaveDistance,
      );
      if (left) scatter();
    } else if (phase === 'play' && cubs.every((C) => C.state === 'home')) {
      for (const P of parents) if (P.hugging) endHug(P);
      clearHazards(hazards);
      setPhase('gathering');
    } else if (phase === 'gathering') {
      const home = parents.every(
        (P) => Math.hypot(P.body.position.x - P.home.x, P.body.position.y - P.home.y) < 1.5,
      );
      if (home) {
        familyHug = true;
        completedOnce = true;
        if (mode === 'screens') {
          round++;
          score += PARAMS.reunionBonus;
          scoreAt = p.millis();
          showBanner(`Familia unida · +${PARAMS.reunionBonus}`);
          if (round >= PARAMS.winLevel && !won) {
            won = true;
            winPending = true;
          }
        }
        setPhase('formed');
      }
    }
  }

  // ---------------------------------------------------------------- dibujo

  // Cada letra es un recorte del logo con osos (public/letters). Se dibuja
  // alrededor del centro de su cuerpo físico (ax, ay).
  function drawLetter(L, x, y, rot, sx, sy) {
    const ctx = p.drawingContext;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(L.img, -L.ax, -L.ay, L.bw, L.bh);
    if (L.i === BOW.letter) drawBow(ctx, L);
    ctx.restore();
  }

  // Moño de mamá osa, para diferenciarla de papá. Rojo Coca-Cola con borde
  // blanco: se lee tanto sobre su cabeza blanca como sobre el fondo rojo.
  function drawBow(ctx, L) {
    const s = L.scale;
    const u = BOW.size * s;
    ctx.save();
    ctx.translate(-L.ax + BOW.x * s, -L.ay + BOW.y * s);
    ctx.rotate(BOW.angle);
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, u * 0.09);
    ctx.strokeStyle = COLORS.ink;
    ctx.fillStyle = COLORS.bow;
    for (const side of [-1, 1]) {
      // cada lazo: un triángulo redondeado que sale del nudo
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * u * 0.35, -u * 0.55, side * u * 0.55, -u * 0.25);
      ctx.quadraticCurveTo(side * u * 0.65, u * 0.05, side * u * 0.55, u * 0.3);
      ctx.quadraticCurveTo(side * u * 0.35, u * 0.5, 0, 0);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.bowKnot;
    ctx.beginPath();
    ctx.ellipse(0, 0, u * 0.14, u * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
    // aura de la Coca-Cola: alrededor de los osos que están jugando
    if (L.role === 'parent' && L.played && t < shieldUntil) drawShield(L, t);
    // parpadea después de que un celular le quitó tiempo en familia
    if (L.role === 'parent' && L.hitAt && t - L.hitAt < PARAMS.hitInvulnMs && Math.floor(t / 90) % 2) return;
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
    ctx.fillText('← ↑ → ↓  papá oso      ·      W A S D  mamá osa', p.width / 2, p.height - 24);
    ctx.restore();
  }

  function drawShield(L, t) {
    const ctx = p.drawingContext;
    const left = (shieldUntil - t) / PARAMS.colaShieldMs;
    // en el último tercio titila para avisar que se acaba
    if (left < 0.33 && Math.floor(t / 80) % 2) return;
    const { x, y } = L.body.position;
    const r = L.r * (1.35 + 0.08 * Math.sin(t * 0.02));
    ctx.save();
    ctx.shadowBlur = 0;
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
    g.addColorStop(0, 'rgba(255, 236, 170, 0)');
    g.addColorStop(0.75, 'rgba(255, 236, 170, 0.35)');
    g.addColorStop(1, 'rgba(255, 236, 170, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.shield;
    ctx.lineWidth = Math.max(2, L.r * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Vida compartida en la esquina superior izquierda.
  function drawLives() {
    const ctx = p.drawingContext;
    const size = Math.max(16, Math.min(p.width, p.height) * 0.035);
    const m = size * 1.1;
    ctx.save();
    ctx.fillStyle = COLORS.ink;
    ctx.font = fontAt(size * 0.85);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Nivel ${round + 1}  ·  Tiempo en familia`, m, m + size * 0.5);
    for (let i = 0; i < PARAMS.lives; i++) {
      drawHeart(ctx, m + size * 0.45 + i * size * 1.05, m + size * 1.65, size, i < lives);
    }
    ctx.restore();
  }

  function drawBanner(t) {
    if (!banner) return;
    const k = (t - banner.at) / 2200;
    if (k >= 1) {
      banner = null;
      return;
    }
    const ctx = p.drawingContext;
    const size = Math.max(22, Math.min(p.width, p.height) * 0.06);
    ctx.save();
    ctx.globalAlpha = Math.min(1, k / 0.15, (1 - k) / 0.25);
    ctx.fillStyle = COLORS.ink;
    ctx.font = fontAt(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(banner.text, p.width / 2, p.height * 0.25 - k * size * 0.4);
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
    if (mode === 'screens' && phase === 'play') {
      updateHazards(hazards, {
        W: p.width, H: p.height, size: fontSize, round, t: p.millis(),
        parents: playingParents(),
        targets: playingParents().map((P) => P.body.position),
        avoid: [...parents.map((P) => P.body.position), { x: p.width / 2, y: p.height / 2 }],
        onPhone, onGift, onCola,
      });
    }
    // la carta de Papá Oso llega cuando termina el abrazo del nivel ganador
    if (winPending && phase === 'formed' && p.millis() - phaseStart > PARAMS.familyHugMs) {
      winPending = false;
      paused = true;
      document.getElementById('win-score').textContent = `Puntos ${score}`;
      ui.win.hidden = false;
    }
    // "Seguir jugando" aparece cuando la familia terminó su primer abrazo
    ui.cont.hidden = !(
      mode === 'classic' && completedOnce && phase === 'formed' && p.millis() - phaseStart > PARAMS.familyHugMs
    );

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

    if (mode === 'screens') drawHazards(ctx, hazards, fontSize, t, fontAt);
    drawScore(t);
    if (mode === 'screens') drawLives();
    drawBanner(t);
    drawHint();
  };
});
