#!/usr/bin/env python3
"""Rasterize a cubic-bezier SVG path to PNG for visual verification (no libs)."""
import math, re
from PIL import Image

FILL = (217, 122, 85, 255)      # #d97a55
TILE = (20, 23, 28, 255)        # #14171c
WHITE = (228, 231, 236, 255)    # #e4e7ec

def parse_path(d):
    """Return list of subpaths; each subpath = list of (x,y) flattened points."""
    toks = re.findall(r'[A-Za-z]|-?\d+\.?\d*', d)
    # group commands
    i = 0
    cmds = []
    while i < len(toks):
        if toks[i].isalpha():
            c = toks[i]; i += 1
        vals = []
        while i < len(toks) and not toks[i].isalpha():
            vals.append(float(toks[i])); i += 1
        cmds.append((c, vals))
    sub = []
    cur = None
    for c, v in cmds:
        if c == 'M':
            cur = (v[0], v[1]); sub.append(cur)
        elif c == 'C':
            p0, p1, p2, p3 = cur, (v[0], v[1]), (v[2], v[3]), (v[4], v[5])
            for k in range(1, 33):
                t = k / 32.0
                mt = 1 - t
                x = mt**3*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t**3*p3[0]
                y = mt**3*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t**3*p3[1]
                cur = (x, y); sub.append(cur)
        elif c == 'Z':
            if len(sub) > 1 and sub[0] != sub[-1]:
                sub.append(sub[0])
            if sub: yield sub
            sub = []
    if sub: yield sub

def inside(x, y, polys):
    # winding number
    wn = 0
    for poly in polys:
        n = len(poly)
        for j in range(n - 1):
            x1, y1 = poly[j]; x2, y2 = poly[j + 1]
            if y1 <= y:
                if y2 > y and _cross(x1, y1, x2, y2, x, y) > 0: wn += 1
            else:
                if y2 <= y and _cross(x1, y1, x2, y2, x, y) < 0: wn -= 1
    return wn != 0

def _cross(x1, y1, x2, y2, x, y):
    return (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)

def render(d, size, bg, fg, supersample=3):
    polys = list(parse_path(d))
    ss = supersample
    im = Image.new('RGBA', (size * ss, size * ss), bg)
    px = im.load()
    # viewBox 0 0 64 64 maps to pixels: px -> x = (px+0.5)/(size*ss)*64
    scale = 64.0 / (size * ss)
    for py in range(size * ss):
        y = (py + 0.5) * scale
        for px_ in range(size * ss):
            x = (px_ + 0.5) * scale
            if inside(x, y, polys):
                px[px_, py] = fg
    if ss > 1:
        im = im.resize((size, size), Image.LANCZOS)
    return im

if __name__ == '__main__':
    import gen
    # reuse the same generator parameters as gen.py
    paths = {}
    def make(ne, se, sw, nw):
        arms = [("NE", gen.U_NE, ne), ("SE", gen.U_SE, se), ("SW", gen.U_SW, sw), ("NW", gen.U_NW, nw)]
        tips = {n: (gen.CX + u[0]*L, gen.CY + u[1]*L) for n, u, L in arms}
        d = [f"M {tips['NE'][0]:.2f} {tips['NE'][1]:.2f}"]
        order = ["NE", "SE", "SW", "NW"]
        for i in range(4):
            a, b = order[i], order[(i+1) % 4]
            LA = dict(ne=ne, se=se, sw=sw, nw=nw)[a.lower()]
            LB = dict(ne=ne, se=se, sw=sw, nw=nw)[b.lower()]
            c1, c2 = gen.seg(arms[i][1], LA, arms[(i+1) % 4][1], LB)
            d.append(f"C {c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {tips[b][0]:.2f} {tips[b][1]:.2f}")
        d.append("Z")
        return " ".join(d)

    # composite sheet
    variants = [
        ("A", make(21, 21, 10, 10)),
        ("B", make(21, 21, 12.5, 12.5)),
        ("C", make(18, 18, 18, 18)),
    ]
    CELL = 256
    pad = 24
    cols = len(variants)
    sheet = Image.new('RGBA', (cols * (CELL + pad) + pad, 2 * (CELL + pad) + pad), (11, 13, 16, 255))
    for ci, (name, d) in enumerate(variants):
        img = render(d, CELL, TILE, FILL)
        sheet.paste(img, (pad + ci * (CELL + pad), pad))
        img16 = render(d, CELL, TILE, FILL).resize((160, 160), Image.NEAREST)  # 16px enlarged 10x
        sheet.paste(img16, (pad + ci * (CELL + pad), pad + CELL + pad))
    sheet.save('sheet.png')

    # ASCII art so the shape is visible in text
    def ascii_art(d, size, char='#'):
        img = render(d, size, (0, 0, 0, 255), (255, 255, 255, 255), supersample=1)
        px = img.load()
        rows = []
        for y in range(size):
            rows.append(''.join('#' if px[x, y][0] > 127 else '.' for x in range(size)))
        return rows
    for name, d in variants:
        print(f"=== {name} at 16 ===")
        for r in ascii_art(d, 16): print(r)
        print(f"=== {name} at 32 ===")
        for r in ascii_art(d, 32): print(r)
    print("done")
