# Coca-Cola · Familia

Unidad 7 de Simulación — *Word as a Playable System*.

Un sistema tipográfico jugable con las letras de **Coca-Cola**. Las dos C son
papá oso y mamá osa polar, y las o y las a son sus crías. Las crías se escapan,
papá y mamá las persiguen y las abrazan, y cuando la familia vuelve a estar
completa se abraza y se forma otra vez la palabra.

**Jugar:** https://dragona-tactica.github.io/unidad-7/

## Controles

| Jugador | Teclas | Personaje |
| --- | --- | --- |
| 1 | ← ↑ → ↓ | papá oso (primera C) |
| 2 | W A S D | mamá osa (segunda C, con moño) |

Se puede jugar con una o con dos personas.

## Desarrollo

```bash
npm install
npm run dev
```

- `src/config.js`: reglas y parámetros (velocidades, tiempos, tamaño de la palabra).
- `src/main.js`: física (Matter.js), steering de las crías y dibujo (p5.js).
- Letras: recortes de `assets/coca-cola-osos.png`. Si cambias ese dibujo, corre
  `python3 tools/cut_letters.py` para regenerar `public/letters/` y `src/letters.json`.
- Textos (marcador, carteles): Loki Cola si existe `public/fonts/LokiCola.ttf`; si no, Yellowtail.

Cada push a `main` se publica en GitHub Pages con `.github/workflows/deploy.yml`.
