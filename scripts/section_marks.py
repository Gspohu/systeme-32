#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cutting plane lines over a base view, their letters stepped out in rows where neighbours would touch"""

import math

# Paper kept between a mark and any other ink, mm
AIR = 0.5
# Thick end of each line (ISO 128-40:2001), and how far past the outline it stops
THICK_RUN = 3.0
REACH = THICK_RUN + 1.0
# The arrow runs this much further than its head
SHAFT = 1.0
# Closed filled arrow, 30 degrees included (ISO 128-40:2001 figure A.1)
HEAD_ANGLE = math.radians(15)
# Ink of a bold capital for its font size : TechDraw draws the overlay in DejaVu Sans Bold
LETTER_EM = 0.8
CAP = 0.75
MAX_ROWS = 6


def seg_distance(p, q, r, s):
    """Shortest distance between segments p-q and r-s, 0 when they cross"""
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    d1, d2, d3, d4 = cross(r, s, p), cross(r, s, q), cross(p, q, r), cross(p, q, s)
    if (d1 * d2 < 0 and d3 * d4 < 0):
        return 0.0

    def to_seg(x, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = dx * dx + dy * dy
        t = 0.0 if n == 0 else max(0.0, min(1.0, ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / n))
        return math.hypot(x[0] - a[0] - t * dx, x[1] - a[1] - t * dy)

    return min(to_seg(p, r, s), to_seg(q, r, s), to_seg(r, p, q), to_seg(s, p, q))


def seg_in_box(p, q, box, pad):
    """Does segment p-q come within pad of box (x0, y0, x1, y1) : Liang-Barsky on the grown box"""
    x0, y0, x1, y1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
    t0, t1 = 0.0, 1.0
    dx, dy = q[0] - p[0], q[1] - p[1]
    for side, gap in ((-dx, p[0] - x0), (dx, x1 - p[0]), (-dy, p[1] - y0), (dy, y1 - p[1])):
        if (side == 0):
            if (gap < 0):
                return False
            continue
        t = gap / side
        if (side < 0):
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if (t0 > t1):
            return False
    return True


def boxes_touch(a, b, pad):
    return a[0] - pad < b[2] and b[0] - pad < a[2] and a[1] - pad < b[3] and b[1] - pad < a[3]


def end_marks(at, letter, edge, end, row, sight, vertical, size, head, pitch):
    """The ink of one end of a cut : the line past the outline, the arrow and the letter box, page coordinates"""
    def pt(across, along):
        return (across, along) if vertical else (along, across)

    half_w = head * math.tan(HEAD_ANGLE)
    length = head + SHAFT
    tip_end = edge + end * (REACH + row * pitch)
    wide = LETTER_EM * size * len(letter)
    tall = CAP * size
    on_along, on_across = (tall, wide) if vertical else (wide, tall)
    gap = half_w + AIR
    near = tip_end + end * gap
    far = tip_end + end * (gap + on_along)
    mid = at + sight * length / 2
    a, b = pt(mid - on_across / 2, min(near, far)), pt(mid + on_across / 2, max(near, far))
    neck = at + sight * (length - head)
    arrow = [pt(at + sight * length, tip_end), pt(neck, tip_end - half_w), pt(neck, tip_end + half_w)]
    return {"line": (pt(at, edge), pt(at, tip_end)), "thick": (pt(at, tip_end - end * THICK_RUN), pt(at, tip_end)),
            "shaft": (pt(at, tip_end), pt(neck, tip_end)), "arrow": arrow,
            "box": (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])), "row": row}


def ink_segments(m):
    tri = m["arrow"]
    return [m["line"], m["shaft"], (tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])]


def clash(m, n):
    """Do the marks of two cuts at the same end touch : letter on letter, a line or arrow on a letter, an arrow on
    another line"""
    if boxes_touch(m["box"], n["box"], AIR):
        return True
    for x, y in ((m, n), (n, m)):
        if any(seg_in_box(p, q, y["box"], AIR) for p, q in ink_segments(x)):
            return True
        # An arrowhead reaching the thick end of the next line, its half width counted
        if (any(seg_distance(p, q, *y["line"]) < AIR + 0.3 for p, q in ink_segments(x)[1:])):
            return True
    return False


def place_end(cuts, edge, end, sight, vertical, size, head, pitch, max_rows):
    """Rows for one end of every cut, the lowest first in order across : None when none fits within max_rows"""
    order = sorted(range(len(cuts)), key=lambda k: cuts[k][1])
    chosen = {}

    def search(i):
        if (i == len(order)):
            return True
        k = order[i]
        letter, at = cuts[k]
        for row in range(max_rows):
            m = end_marks(at, letter, edge, end, row, sight, vertical, size, head, pitch)
            if not any(clash(m, other) for other in chosen.values()):
                chosen[k] = m
                if search(i + 1):
                    return True
                del chosen[k]
        return False

    if search(0):
        return [chosen[k] for k in range(len(cuts))]
    return None


def lay_marks(cuts, lo, hi, sight, vertical, size, head, max_rows=None):
    """Both ends of every cut. cuts are (letter, place across the lines), lo and hi the outline along them, sight +1
    or -1 the way the arrows point across, y down. Returns the marks of each cut and what could not be placed"""
    rows = MAX_ROWS if max_rows is None else max_rows
    half_w = head * math.tan(HEAD_ANGLE)
    along = CAP * size if vertical else LETTER_EM * size
    pitch = half_w + 2 * AIR + along
    faults = []
    ends = []
    for edge, end in ((lo, -1), (hi, 1)):
        placed = place_end(cuts, edge, end, sight, vertical, size, head, pitch, rows)
        if placed is None:
            faults.append(f"repères de coupe : pas de place sans croisement en {rows} rangs, côté {end}")
            placed = [end_marks(at, letter, edge, end, 0, sight, vertical, size, head, pitch) for letter, at in cuts]
        ends.append(placed)
    marks = [{"letter": cuts[k][0], "ends": (ends[0][k], ends[1][k])} for k in range(len(cuts))]
    return marks, faults


def reach(marks):
    """Box of all the ink of the marks"""
    xs = []
    ys = []
    for m in marks:
        for e in m["ends"]:
            for p, q in ink_segments(e):
                xs += [p[0], q[0]]
                ys += [p[1], q[1]]
            xs += [e["box"][0], e["box"][2]]
            ys += [e["box"][1], e["box"][3]]
    return min(xs), min(ys), max(xs), max(ys)


def marks_svg(marks, dx, dy, size, widths, dash, family):
    """The marks as SVG elements moved by (dx, dy), black only"""
    def p(v):
        return f"{v[0] + dx:.3f},{v[1] + dy:.3f}"

    out = []
    for m in marks:
        lo, hi = m["ends"]
        out.append(f'<path d="M {p(lo["line"][1])} L {p(hi["line"][1])}" fill="none" stroke="#000000" '
                   f'stroke-width="{widths["centre"]}" stroke-dasharray="{dash}"/>')
        for e in m["ends"]:
            out.append(f'<path d="M {p(e["thick"][0])} L {p(e["thick"][1])}" fill="none" stroke="#000000" '
                       f'stroke-width="{widths["thick"]}"/>')
            out.append(f'<path d="M {p(e["shaft"][0])} L {p(e["shaft"][1])}" fill="none" stroke="#000000" '
                       f'stroke-width="{widths["normal"]}"/>')
            out.append(f'<path d="M {" L ".join(p(v) for v in e["arrow"])} Z" fill="#000000" stroke="none"/>')
            x0, y0, x1, y1 = e["box"]
            out.append(f'<text x="{x0 + dx:.3f}" y="{y1 + dy:.3f}" font-family="{family}" font-size="{size}" '
                       f'font-weight="bold">{m["letter"]}</text>')
    return "\n".join(out)
