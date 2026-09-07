"""Rigenera le icone dell'app: la goccia bianca con la foglia verde.

    python3 scripts/genera-icone.py

Scrive in `assets/images/` e lascia un provino in /tmp/icona-finale.png.

Il segno si disegna UNA volta e poi si ritaglia al suo contenuto (`getbbox`) e
si scala. Ridisegnarlo misura per misura, come nel primo tentativo, aveva
finito per far divergere le sei immagini alla prima correzione.

Due cose che si vedono solo mettendole alla prova, ed e' il motivo per cui il
provino ha quattro colonne e non una:

- **Su Android l'icona e' a due strati** e il sistema ci ritaglia sopra la
  forma che vuole (cerchio, squircle, goccia): il contenuto del primo piano
  deve stare nel 66% centrale, da cui il 46% invece del 62%.
- **Lo stacco fra goccia e foglia e' un BUCO nell'alfa**, non una riga di
  colore scuro. Primo piano e monocromatica sono trasparenti: li' un vuoto
  dipinto di nero sarebbe una macchia nera. Ed e' quel vuoto - e nient'altro -
  a tenere separate le due forme nella monocromatica dei temi Material You,
  dove il colore lo decide Android e ne resta uno solo.
"""

import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFont

SCALE = 4
DARK = "#18181b"
WHITE = "#ffffff"
SUCCESS = "#22c55e"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = f"{ROOT}/assets/fonts"
OUT = f"{ROOT}/assets/images"
# Il provino non entra nel repository: serve solo a guardare il risultato.
SCRATCH = "/tmp"

# Le proporzioni della proposta approvata (variante A1), in frazioni del lato.
FOGLIA = dict(fx=0.68, fy=0.38, lung=0.52, largh=0.24, stacco=0.075)


def profilo_goccia(cx, cy, altezza, larghezza, passi=240):
    """Curva a goccia con la punta in alto. Il fattore 1.3 riporta la larghezza
    della curva parametrica (che arriva a ~0.65) alla larghezza chiesta."""
    punti = []
    for i in range(passi + 1):
        t = 2 * math.pi * i / passi
        punti.append((cx + math.sin(t) * math.sin(t / 2) ** 2 * larghezza / 1.3,
                      cy - math.cos(t) * altezza / 2))
    return punti


def profilo_foglia(cx, cy, lung, largh, angolo, passi=80):
    """Vesica: due archi di cerchio che si incontrano a punta ai due capi."""
    L, w = lung / 2, largh / 2
    R = (w * w + L * L) / (2 * w)
    d = math.sqrt(R * R - L * L)
    lato = [
        (math.sqrt(max(R * R - u * u, 0)) - d, u)
        for u in (-L + 2 * L * i / passi for i in range(passi + 1))
    ]
    a = math.radians(angolo)
    return [
        (cx + x * math.cos(a) - y * math.sin(a),
         cy + x * math.sin(a) + y * math.cos(a))
        for x, y in lato + [(-x, y) for x, y in lato[::-1]]
    ]


def segno(colore_goccia=WHITE, colore_foglia=SUCCESS):
    """Il segno ritagliato al contenuto, con le proporzioni della proposta."""
    S = 1024 * SCALE
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(im).polygon(
        profilo_goccia(S * 0.46, S * 0.52, S * 0.86, S * 0.62),
        fill=colore_goccia)

    # Il vuoto attorno alla foglia si ottiene bucando l'alfa con la foglia
    # stessa ingrassata: cosi' il distacco segue il contorno invece di essere
    # una riga dritta, e resta uguale su tutto il giro.
    buco = Image.new("L", (S, S), 255)
    ImageDraw.Draw(buco).polygon(
        profilo_foglia(S * FOGLIA["fx"], S * FOGLIA["fy"],
                       S * (FOGLIA["lung"] + FOGLIA["stacco"] * 2),
                       S * (FOGLIA["largh"] + FOGLIA["stacco"] * 2), 45),
        fill=0)
    im.putalpha(ImageChops.multiply(im.getchannel("A"), buco))

    ImageDraw.Draw(im).polygon(
        profilo_foglia(S * FOGLIA["fx"], S * FOGLIA["fy"],
                       S * FOGLIA["lung"], S * FOGLIA["largh"], 45),
        fill=colore_foglia)

    return im.crop(im.getbbox())


def comporre(lato, quota, sfondo=None, **kw):
    """Il segno alto/largo `quota` volte il lato, centrato."""
    s = segno(**kw)
    misura = int(lato * quota)
    # Si scala sul lato piu' lungo, cosi' `quota` vuol dire sempre la stessa
    # cosa qualunque sia la forma del segno.
    if s.width >= s.height:
        nuovo = (misura, max(1, round(misura * s.height / s.width)))
    else:
        nuovo = (max(1, round(misura * s.width / s.height)), misura)
    s = s.resize(nuovo, Image.LANCZOS)

    im = Image.new("RGBA", (lato, lato), (0, 0, 0, 0) if sfondo is None else sfondo)
    im.paste(s, ((lato - s.width) // 2, (lato - s.height) // 2), s)
    return im if sfondo is None else im.convert("RGB")


comporre(1024, 0.62, DARK).save(f"{OUT}/icon.png")

# 0.46 e non 0.62: quel che esce dal 66% centrale lo mangia la maschera.
comporre(512, 0.46).save(f"{OUT}/android-icon-foreground.png")
Image.new("RGB", (512, 512), DARK).save(f"{OUT}/android-icon-background.png")

# Monocromatica (temi Material You): conta solo la forma, il colore lo mette
# Android. Le due forme restano leggibili solo grazie al vuoto fra loro.
comporre(432, 0.46, colore_goccia="#000000", colore_foglia="#000000").save(
    f"{OUT}/android-icon-monochrome.png"
)

comporre(512, 0.58).save(f"{OUT}/splash-icon.png")
comporre(48, 0.64, DARK).save(f"{OUT}/favicon.png")

# --- provino ---------------------------------------------------------------
riquadri = []
icona = Image.open(f"{OUT}/icon.png")
riquadri.append((icona.resize((200, 200), Image.LANCZOS), "icona 1024"))
riquadri.append((icona.resize((48, 48), Image.LANCZOS)
                 .resize((200, 200), Image.NEAREST), "sul telefono (48 px)"))

# Prova della maschera: se la foglia sopravvive al cerchio, sopravvive a tutto.
fondo = Image.new("RGB", (512, 512), DARK)
fg = Image.open(f"{OUT}/android-icon-foreground.png")
fondo.paste(fg, (0, 0), fg)
maschera = Image.new("L", (512, 512), 0)
ImageDraw.Draw(maschera).ellipse([0, 0, 511, 511], fill=255)
tondo = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
tondo.paste(fondo, (0, 0), maschera)
riquadri.append((tondo.resize((200, 200), Image.LANCZOS), "ritagliata tonda"))

# Prova della monocromatica: un colore solo, su una tinta qualunque di Android.
mono = Image.open(f"{OUT}/android-icon-monochrome.png")
piano = Image.new("RGB", (432, 432), "#d4d4d8")
piano.paste(mono, (0, 0), mono)
riquadri.append((piano.resize((200, 200), Image.LANCZOS), "monocromatica"))

foglio = Image.new("RGB", (30 + len(riquadri) * 240, 300), "#ffffff")
d = ImageDraw.Draw(foglio)
etichette = ImageFont.truetype(f"{FONTS}/Poppins-Medium.ttf", 16)
for i, (im, testo) in enumerate(riquadri):
    x = 30 + i * 240
    foglio.paste(im, (x + (200 - im.width) // 2, 30 + (200 - im.height) // 2),
                 im if im.mode == "RGBA" else None)
    d.text((x + 100, 250), testo, font=etichette, fill="#71717a", anchor="ma")

foglio.save(f"{SCRATCH}/icona-finale.png")
print("icone scritte in assets/images/")
