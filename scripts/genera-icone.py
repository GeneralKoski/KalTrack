"""Rigenera le icone dell'app: la K bianca con il punto verde.

    python3 scripts/genera-icone.py

Scrive in `assets/images/` e lascia un provino in /tmp/icona-finale.png.


Il segno si disegna UNA volta con le proporzioni della proposta approvata, poi
si ritaglia al suo contenuto (`getbbox`) e si scala. Riposizionare lettera e
punto a mano per ogni misura, come nel primo tentativo, aveva finito per
appoggiare il punto sul braccio della K: nella proposta era staccato, ed e' lo
stacco a farlo leggere come un segno a se' invece che come una sbavatura.

Su Android l'icona e' a due strati e il sistema ci ritaglia sopra la forma che
vuole (cerchio, squircle, goccia): il contenuto del primo piano deve stare nel
66% centrale, altrimenti il punto - che sta in alto a destra, cioe' proprio
dove la maschera taglia - sparisce.
"""

import os

from PIL import Image, ImageDraw, ImageFont

SCALE = 4
DARK = "#18181b"
WHITE = "#ffffff"
SUCCESS = "#22c55e"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = f"{ROOT}/assets/fonts"
OUT = f"{ROOT}/assets/images"
# Il provino non entra nel repository: serve solo a guardare il risultato.
SCRATCH = "/tmp"


def segno(colore_lettera=WHITE, colore_punto=SUCCESS):
    """Il segno ritagliato al contenuto, con le proporzioni della proposta."""
    S = 1024 * SCALE
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # Le stesse coordinate della proposta E2. Poppins Bold: la cassa alta e'
    # circa il 70% del corpo, da cui il fattore sul corpo.
    f = ImageFont.truetype(f"{FONTS}/Poppins-Bold.ttf", int(0.47 * S / 0.70))
    d.text((S / 2 - 0.05 * S, S / 2 + 0.04 * S), "K", font=f,
           fill=colore_lettera, anchor="mm")

    # Staccato dal braccio della lettera, non appoggiato: a contatto si legge
    # come una sbavatura della K invece che come un segno a se'.
    r = 0.053 * S
    d.ellipse([S * 0.79 - r, S * 0.23 - r, S * 0.79 + r, S * 0.23 + r],
              fill=colore_punto)

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


comporre(1024, 0.60, DARK).save(f"{OUT}/icon.png")

# 0.46 e non 0.60: quel che esce dal 66% centrale lo mangia la maschera.
comporre(512, 0.46).save(f"{OUT}/android-icon-foreground.png")
Image.new("RGB", (512, 512), DARK).save(f"{OUT}/android-icon-background.png")

# Monocromatica (temi Material You): conta solo la forma, il colore lo mette
# Android. Il punto resta e si legge come parte del segno.
comporre(432, 0.46, colore_lettera="#000000", colore_punto="#000000").save(
    f"{OUT}/android-icon-monochrome.png"
)

comporre(512, 0.56).save(f"{OUT}/splash-icon.png")
comporre(48, 0.64, DARK).save(f"{OUT}/favicon.png")

# --- provino ---------------------------------------------------------------
foglio = Image.new("RGB", (760, 300), "#ffffff")
d = ImageDraw.Draw(foglio)
etichette = ImageFont.truetype(f"{FONTS}/Poppins-Medium.ttf", 18)
icona = Image.open(f"{OUT}/icon.png")

# Prova della maschera: se il punto sopravvive al cerchio, sopravvive a tutto.
fondo = Image.new("RGB", (512, 512), DARK)
fg = Image.open(f"{OUT}/android-icon-foreground.png")
fondo.paste(fg, (0, 0), fg)
maschera = Image.new("L", (512, 512), 0)
ImageDraw.Draw(maschera).ellipse([0, 0, 511, 511], fill=255)
tondo = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
tondo.paste(fondo, (0, 0), maschera)

for i, (im, testo) in enumerate([
    (icona.resize((200, 200), Image.LANCZOS), "icona 1024"),
    (icona.resize((72, 72), Image.LANCZOS), "come sul telefono"),
    (tondo.resize((200, 200), Image.LANCZOS), "ritagliata tonda (Android)"),
]):
    box = 200
    x = 30 + i * (box + 40)
    foglio.paste(im, (x + (box - im.width) // 2, 30 + (box - im.height) // 2),
                 im if im.mode == "RGBA" else None)
    d.text((x + box / 2, 250), testo, font=etichette, fill="#71717a", anchor="ma")

foglio.save(f"{SCRATCH}/icona-finale.png")
print("icone scritte in assets/images/")
