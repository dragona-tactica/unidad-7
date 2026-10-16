"""Recorta assets/coca-cola-osos.png en una imagen por letra.

Cada letra es una (o varias) piezas conectadas del dibujo. Se exportan en
blanco (conservando la transparencia) a public/letters/ y su posición en el
logo va a src/letters.json, que usa el juego para armar la palabra.

Uso: python3 tools/cut_letters.py
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'coca-cola-osos.png'
OUT = ROOT / 'public' / 'letters'

# letra, rol y un punto (x, y) del dibujo que cae dentro de su pieza principal.
# Las piezas pequeñas (ojos, nariz) se asignan a la letra cuya caja las contiene.
LETTERS = [
    ('C', 'parent', (20, 120)),
    ('o', 'cub', (70, 100)),
    ('c', 'still', (125, 105)),
    ('a', 'cub', (175, 110)),
    ('C', 'parent', (270, 120)),
    ('o', 'cub', (318, 100)),
    ('l', 'still', (420, 20)),
    ('a', 'cub', (425, 110)),
]

im = Image.open(SRC).convert('RGBA')
W, H = im.size
px = im.load()

# La tinta es el rojo oscuro. Algunos huecos (dentro de las o) son blanco
# opaco, así que la tinta se mide por lo oscuro del color, no solo por alfa.
INK_R = 119
def inkness(x, y):
    r, _, _, a = px[x, y]
    return a / 255 * min(1, max(0, (255 - r) / (255 - INK_R)))

amount = [[inkness(x, y) for x in range(W)] for y in range(H)]
ink = [[amount[y][x] > 0.25 for x in range(W)] for y in range(H)]

label = [[0] * W for _ in range(H)]
comps = []
for y in range(H):
    for x in range(W):
        if ink[y][x] and not label[y][x]:
            n = len(comps) + 1
            stack = [(x, y)]
            label[y][x] = n
            box = [W, H, 0, 0]
            while stack:
                cx, cy = stack.pop()
                box = [min(box[0], cx), min(box[1], cy), max(box[2], cx), max(box[3], cy)]
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and ink[ny][nx] and not label[ny][nx]:
                            label[ny][nx] = n
                            stack.append((nx, ny))
            comps.append(box)

# pieza principal de cada letra
owner = {}
for i, (_, _, (sx, sy)) in enumerate(LETTERS):
    # el punto semilla puede caer en un hueco: buscar la tinta más cercana
    best = min(
        ((abs(x - sx) + abs(y - sy), label[y][x]) for y in range(H) for x in range(W) if label[y][x]),
    )
    owner[best[1]] = i
main_box = {i: comps[c - 1] for c, i in owner.items()}

# piezas pequeñas: a la letra principal que las contiene
for c, box in enumerate(comps, start=1):
    if c in owner:
        continue
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    inside = [i for i, b in main_box.items() if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]]
    # si cae en varias cajas, la más pequeña (la letra más específica)
    inside.sort(key=lambda i: (main_box[i][2] - main_box[i][0]) * (main_box[i][3] - main_box[i][1]))
    if inside:
        owner[c] = inside[0]

OUT.mkdir(parents=True, exist_ok=True)
meta = {'width': W, 'height': H, 'letters': []}
for i, (ch, role, _) in enumerate(LETTERS):
    mine = [c for c, o in owner.items() if o == i]
    boxes = [comps[c - 1] for c in mine]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    sprite = Image.new('RGBA', (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
    sp = sprite.load()
    # incluye el antialias del borde: píxeles semitransparentes vecinos
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            a = round(amount[y][x] * 255)
            if not a:
                continue
            l = label[y][x]
            if l and owner.get(l) != i:
                continue
            if not l:
                near = {owner.get(label[ny][nx]) for nx in range(max(0, x - 1), min(W, x + 2))
                        for ny in range(max(0, y - 1), min(H, y + 2)) if label[ny][nx]}
                if i not in near:
                    continue
            sp[x - x0, y - y0] = (255, 255, 255, a)
    name = f'{i}-{ch}.png'
    sprite.save(OUT / name)
    meta['letters'].append({'ch': ch, 'role': role, 'file': name, 'x': x0, 'y': y0, 'w': x1 - x0 + 1, 'h': y1 - y0 + 1})

(ROOT / 'src' / 'letters.json').write_text(json.dumps(meta, indent=2))
for L in meta['letters']:
    print(L)
