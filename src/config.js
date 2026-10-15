export const WORD = 'Coca-Cola';

// Rol de cada letra. Las crías (o, a) son osos pequeños, las dos C son
// papá y mamá oso. Las letras sueltas por ahora no participan.
export const ROLES = ['parent', 'cub', 'still', 'cub', 'still', 'parent', 'cub', 'still', 'cub'];

// Las dos familias que se abrazan al reunirse (índices de WORD):
// C o c a  y  C o l a. El guion queda entre ambas.
export const FAMILIES = [[0, 1, 2, 3], [5, 6, 7, 8]];

export const FONT = '"Loki Cola", "Yellowtail", cursive';

export const COLORS = {
  bg: '#e4001b',
  ink: '#ffffff',
  hint: 'rgba(255,255,255,0.55)',
  earInner: '#f6b3b8',
  feature: '#7a0010',
};

// Facciones de oso. En las crías la posición se calcula sola a partir del
// hueco del glifo (tamaños relativos a su ancho); la cabeza de la C se ubica
// a mano (fracciones de su caja, 0,0 = centro) y depende de la tipografía.
export const FEATURES = {
  o: { ear: 0.36, noseSize: 0.5 },
  a: { ear: 0.36, noseSize: 0.5 },
  // C: cabeza de perfil en el remate superior, mirando a la derecha
  C: { head: [0.18, -0.36], headSize: 0.2, ear: 0.075 },
};

// Controles: jugador 1 = flechas (primera C), jugador 2 = WASD (segunda C).
export const CONTROLS = [
  { up: 38, down: 40, left: 37, right: 39 },
  { up: 87, down: 83, left: 65, right: 68 },
];

export const PARAMS = {
  wordWidth: 0.34,        // ancho de la palabra respecto a la pantalla
  wordHeight: 0.16,       // tope del tamaño de letra respecto al alto
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
};
