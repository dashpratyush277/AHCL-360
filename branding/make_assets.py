"""
Generates all app / admin / PDF brand assets from the AHCL logo.

    python branding/make_assets.py

Source: branding/ahcl-logo-source.png (black logo on white). Outputs are written into
mobile/assets, admin/public, admin/src/assets and backend/assets.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "branding" / "ahcl-logo-source.png"
NAVY = (8, 34, 57)  # #082239

# Vertical bands of the source logo (measured): emblem, "AHCL" wordmark, company name.
EMBLEM = (83, 292)
WORDMARK = (316, 373)
FULL = (83, 422)


def to_alpha(img, color=(0, 0, 0)):
    """Black-on-white artwork -> solid `color` with anti-aliased transparency."""
    g = img.convert("L")
    alpha = g.point(lambda v: max(0, min(255, int((255 - v) * 1.15))))
    out = Image.new("RGBA", img.size, color + (0,))
    out.putalpha(alpha)
    return out


def crop_rows(img, top, bottom, pad=6):
    a = to_alpha(img.crop((0, max(0, top - pad), img.width, min(img.height, bottom + pad))))
    return img.crop(a.getbbox() and (a.getbbox()[0], max(0, top - pad) + a.getbbox()[1], a.getbbox()[2], max(0, top - pad) + a.getbbox()[3]))


def fit(art, size, box_frac, bg=None):
    """Center `art` in a size x size canvas, scaled to box_frac of the side."""
    canvas = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    box = int(size * box_frac)
    scale = box / max(art.width, art.height)  # scales up as well as down
    a = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(a, ((size - a.width) // 2, (size - a.height) // 2))
    return canvas


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print("wrote", path.relative_to(ROOT), img.size)


src = Image.open(SRC).convert("RGB")

full = crop_rows(src, *FULL)            # emblem + AHCL + company name
mark = crop_rows(src, EMBLEM[0], WORDMARK[1])  # emblem + AHCL (for icons)
emblem = crop_rows(src, *EMBLEM)        # emblem only (tiny icons)

full_dark, full_light = to_alpha(full), to_alpha(full, (255, 255, 255))
mark_dark, mark_light = to_alpha(mark), to_alpha(mark, (255, 255, 255))
emblem_dark, emblem_light = to_alpha(emblem), to_alpha(emblem, (255, 255, 255))

M = ROOT / "mobile" / "assets"
save(full_dark, M / "logo.png")                 # light backgrounds
save(full_light, M / "logo-white.png")          # navy backgrounds
save(fit(mark_dark, 1024, 0.78, bg=(255, 255, 255)), M / "icon.png")
save(fit(mark_dark, 1024, 0.56), M / "android-icon-foreground.png")       # adaptive icon safe zone
save(Image.new("RGBA", (1024, 1024), (255, 255, 255, 255)), M / "android-icon-background.png")
save(fit(mark_light, 1024, 0.56), M / "android-icon-monochrome.png")      # Android 13 themed icon
save(fit(emblem_light, 96, 0.9), M / "notification-icon.png")              # status-bar icon: white on transparent
save(fit(full_dark, 1024, 0.9), M / "splash-icon.png")
save(fit(full_light, 1024, 0.9), M / "splash-icon-dark.png")
save(fit(mark_dark, 48, 0.92, bg=(255, 255, 255)), M / "favicon.png")

A = ROOT / "admin"
save(fit(mark_dark, 64, 0.9, bg=(255, 255, 255)), A / "public" / "favicon.png")
save(fit(mark_dark, 180, 0.8, bg=(255, 255, 255)), A / "public" / "apple-touch-icon.png")
save(full_dark, A / "src" / "assets" / "logo.png")
save(full_light, A / "src" / "assets" / "logo-white.png")

# PDFs (invoices, payslips, reports) – flattened on white, PDFKit-friendly
pdf_logo = Image.new("RGB", full_dark.size, (255, 255, 255))
pdf_logo.paste(full_dark, mask=full_dark.split()[3])
save(pdf_logo, ROOT / "backend" / "assets" / "logo.png")
