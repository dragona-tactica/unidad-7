"""Quita el fondo de las imágenes de la carta final y exporta PNG con
transparencia a public/img/.

Las imágenes traen un cuadriculado de "transparencia" pintado dentro del JPG
y el oso es blanco como ese fondo, así que el recorte lo hace Vision de macOS
(el mismo "Copiar sujeto" de Fotos) con tools/subject_mask.swift.

- assets/oso-coca-cola.jpg -> public/img/oso-sticker.png (con borde blanco
  de calcomanía alrededor)
- assets/botella.jpg       -> public/img/botella.png

Uso (en macOS 14+): python3 tools/cut_stickers.py
"""
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'img'
SWIFT = ROOT / 'tools' / 'subject_mask.swift'


def subject(src):
    with tempfile.TemporaryDirectory() as tmp:
        dst = Path(tmp) / 'cut.png'
        subprocess.run(['swift', str(SWIFT), str(src), str(dst)], check=True)
        return Image.open(dst).convert('RGBA').copy()


def fit(img, max_w, max_h):
    k = min(max_w / img.width, max_h / img.height, 1)
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)


def crop_to(img, pad):
    box = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    box = (max(0, box[0] - pad), max(0, box[1] - pad),
           min(img.width, box[2] + pad), min(img.height, box[3] + pad))
    return img.crop(box)


def sticker(src, dst, border=24):
    art = subject(src)
    # deja espacio para el borde
    pad = border + 6
    canvas = Image.new('RGBA', (art.width + pad * 2, art.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(art, (pad, pad))
    alpha = canvas.getchannel('A').point(lambda a: 255 if a > 40 else 0)
    # borde de calcomanía: la silueta engordada y suavizada, en blanco
    outline = (alpha.filter(ImageFilter.MaxFilter(border * 2 + 1))
               .filter(ImageFilter.GaussianBlur(3))
               .point(lambda a: 255 if a > 128 else 0)
               .filter(ImageFilter.GaussianBlur(1)))
    out = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    out.paste((255, 255, 255, 255), (0, 0), outline)
    out.alpha_composite(canvas)
    fit(crop_to(out, 2), 520, 600).save(dst, optimize=True)


def cutout(src, dst):
    fit(crop_to(subject(src), 2), 200, 600).save(dst, optimize=True)


OUT.mkdir(parents=True, exist_ok=True)
sticker(ROOT / 'assets' / 'oso-coca-cola.jpg', OUT / 'oso-sticker.png')
cutout(ROOT / 'assets' / 'botella.jpg', OUT / 'botella.png')
print('ok')
