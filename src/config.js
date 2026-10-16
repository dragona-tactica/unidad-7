// Las letras, sus roles y posiciones vienen de src/letters.json, generado
// por tools/cut_letters.py a partir de assets/coca-cola-osos.png.

// Las dos familias que se abrazan al reunirse (índices en letters.json):
// C o c a  y  C o l a.
export const FAMILIES = [[0, 1, 2, 3], [4, 5, 6, 7]];

// Cuerpo de papá y mamá (las C), en píxeles del dibujo original:
// el centro del arco con la cabeza, su radio y dónde queda la cría
// abrazada (la posición de la o en el logo, relativa a ese centro).
export const PARENT = {
  anchor: { x: 60, y: 88 },
  radius: 52,
  hug: { x: 38, y: 11 },
};

// Moño de mamá osa (segunda C), en píxeles del dibujo original: junto a
// su oreja, sobre el borde de la cabeza.
export const BOW = { letter: 4, x: 102, y: 10, size: 32, angle: -0.35 };

export const FONT = '"Loki Cola", "Yellowtail", cursive';

export const COLORS = {
  bg: '#e4001b',
  ink: '#ffffff',
  hint: 'rgba(255,255,255,0.55)',
  feature: '#7a0010',
  phone: '#1b0b10',
  screen: '#8fd8ff',
  screenGlow: 'rgba(120, 210, 255, 0.85)',
  colaGlass: '#3a0f12',
  shield: 'rgba(255, 236, 170, 0.9)',
  bow: '#e4001b',
  bowKnot: '#a8001a',
};

// Controles: jugador 1 = flechas (papá, primera C), jugador 2 = WASD (mamá, segunda C).
export const CONTROLS = [
  { up: 38, down: 40, left: 37, right: 39 },
  { up: 87, down: 83, left: 65, right: 68 },
];

export const PARAMS = {
  wordWidth: 0.34,        // ancho de la palabra respecto a la pantalla
  wordHeight: 0.3,        // tope del alto de la palabra respecto a la pantalla
  sizeRef: 135,           // escala → tamaño de referencia de celulares, textos y brillos
  parentAccel: 0.9,       // aceleración por frame al mantener una tecla
  parentMaxSpeed: 7.5,
  parentDamping: 0.88,
  cubMaxSpeed: 5.2,
  cubMaxForce: 0.35,
  fleeRadius: 230,        // distancia a la que una cría siente al papá
  wanderStrength: 0.18,
  wallMargin: 90,
  escapeGraceMs: 700,     // al desarmarse, las crías no chocan durante este tiempo
  familyHugMs: 2600,      // abrazo grupal cuando la familia se vuelve a juntar
  hugMs: 1500,           // cuánto dura el abrazo antes de volver a casa
  holdMs: 2500,           // momento de lectura con la palabra formada
  leaveDistance: 40,      // cuánto debe alejarse una C para empezar el juego
  arriveRadius: 160,

  // nivel "pantallas" (después de "Seguir jugando")
  lives: 5,               // tiempo en familia, compartido por papá y mamá
  speedUpPerRound: 0.15,  // cuánto más rápido corren las crías en cada ronda
  maxSpeedUp: 2.2,
  phoneSpeed: 2.2,
  phoneSpeedUpPerLevel: 0.3, // +30 % de velocidad de los celulares por nivel
  phoneMaxSpeed: 6.5,     // nunca más rápidos que papá y mamá (7.5)
  phoneTurn: 0.07,        // qué tan cerrado giran al perseguir
  winLevel: 2,            // al superar este nivel llega la carta de Papá Oso
  colaLevel: 2,            // nivel con la única Coca-Cola de invulnerabilidad
  colaDelayMs: 4000,      // aparece este tiempo después de empezar el nivel
  colaShieldMs: 1500,     // cuánto dura la invulnerabilidad
  phonesBase: 2,          // celulares simultáneos en la primera ronda (+1 por ronda)
  phoneEveryMs: 3200,
  phoneLifeMs: 12000,
  phoneLureRadius: 200,   // las pantallas también atraen a las crías
  phoneLure: 0.9,
  hitInvulnMs: 1200,      // tras perder vida, un momento sin recibir daño
  giftEveryMs: 7000,
  giftLifeMs: 8000,
  reunionBonus: 5,        // puntos extra al reunir a toda la familia
};
