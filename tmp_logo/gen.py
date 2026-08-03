#!/usr/bin/env python3
"""Generator for FCC Studio SPARK-TERMINAL logo mark.

Four-point sparkle on diagonals; the two right arms (NE, SE) are elongated
so they read as a terminal prompt chevron '>' fused with the star core.
Single closed path, one fill -> works solid-on-light and as cutout-on-tile.
"""
import math

CX, CY = 32.0, 32.0
FILL = "#d97a55"

# Arm directions (unit, pointing outward from center), 45deg diagonals
U_NE = (math.cos(math.pi / 4), -math.sin(math.pi / 4))   # up-right
U_SE = (math.cos(math.pi / 4),  math.sin(math.pi / 4))   # down-right
U_SW = (-math.cos(math.pi / 4), math.sin(math.pi / 4))   # down-left
U_NW = (-math.cos(math.pi / 4), -math.sin(math.pi / 4))  # up-left

def f(x, n=2):
    return f"{x:.{n}f}"

def seg(uA, LA, uB, LB):
    """Cubic segment controls from tip A toward tip B, valley between arms."""
    avg = (LA + LB) / 2.0
    c1 = (CX + uA[0] * 0.44 * avg + uB[0] * 0.12 * avg,
          CY + uA[1] * 0.44 * avg + uB[1] * 0.12 * avg)
    c2 = (CX + uA[0] * 0.12 * avg + uB[0] * 0.44 * avg,
          CY + uA[1] * 0.12 * avg + uB[1] * 0.44 * avg)
    return c1, c2

def sparkle(ne, se, sw, nw, label, out):
    arms = [("NE", U_NE, ne), ("SE", U_SE, se), ("SW", U_SW, sw), ("NW", U_NW, nw)]
    tips = {}
    for name, u, L in arms:
        tips[name] = (CX + u[0] * L, CY + u[1] * L)
    order = ["NE", "SE", "SW", "NW"]  # chain adjacency
    d = []
    d.append(f"M {f(tips['NE'][0])} {f(tips['NE'][1])}")
    for i in range(4):
        a, b = order[i], order[(i + 1) % 4]
        LA = dict(ne=ne, se=se, sw=sw, nw=nw)[a.lower()]
        LB = dict(ne=ne, se=se, sw=sw, nw=nw)[b.lower()]
        c1, c2 = seg(arms[i][1], LA, arms[(i + 1) % 4][1], LB)
        d.append(f"C {f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(tips[b][0])} {f(tips[b][1])}")
    d.append("Z")
    path = " ".join(d)
    svg = (f'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" '
           f'width="256" height="256">\n'
           f'  <rect width="64" height="64" rx="14" fill="#14171c"/>\n'
           f'  <path fill="{FILL}" d="{path}"/>\n'
           f'</svg>\n')
    with open(out, "w") as fh:
        fh.write(svg)
    print(label, "bounds:", f(min(t[0] for t in tips.values())), f(min(t[1] for t in tips.values())),
          f(max(t[0] for t in tips.values())), f(max(t[1] for t in tips.values())))

if __name__ == "__main__":
    # variant A: the fusion, NE/SE long, SW/NW short
    sparkle(ne=21, se=21, sw=10, nw=10, label="A fusion", out="a.svg")
    # variant B: longer short arms
    sparkle(ne=21, se=21, sw=12.5, nw=12.5, label="B fusion", out="b.svg")
    # variant C: classic equal sparkle rotated (reference)
    sparkle(ne=18, se=18, sw=18, nw=18, label="C equal", out="c.svg")
