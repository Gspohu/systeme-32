#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Texts a drawn line runs through, on a drawing page exported as SVG : each text measured as its font draws it"""

import math
import re
import xml.etree.ElementTree as ET

# Paper a line may leave between itself and the ink of a text before it counts as touching it, mm
TOUCH = 0.05
# Straight pieces a curve or a circle is read as
CURVE_STEPS = 12
NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def matrix_of(text):
    """The affine matrix (a, b, c, d, e, f) of an SVG transform attribute, matrix, translate, scale and rotate"""
    m = IDENTITY
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", text or ""):
        v = [float(x) for x in NUMBER.findall(args)]
        if (name == "matrix" and len(v) == 6):
            step = tuple(v)
        elif (name == "translate"):
            step = (1.0, 0.0, 0.0, 1.0, v[0], v[1] if len(v) > 1 else 0.0)
        elif (name == "scale"):
            step = (v[0], 0.0, 0.0, v[1] if len(v) > 1 else v[0], 0.0, 0.0)
        elif (name == "rotate"):
            r = math.radians(v[0])
            step = (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0.0, 0.0)
            if (len(v) == 3):
                step = compose(compose((1.0, 0.0, 0.0, 1.0, v[1], v[2]), step), (1.0, 0.0, 0.0, 1.0, -v[1], -v[2]))
        else:
            raise ValueError(f"transformation SVG non lue : {name}")
        m = compose(m, step)
    return m


def compose(outer, inner):
    """The matrix that applies inner first, then outer"""
    a, b, c, d, e, f = outer
    g, h, i, j, k, l = inner
    return (a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f)


def apply(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def invert(m):
    a, b, c, d, e, f = m
    det = a * d - b * c
    if (abs(det) < 1e-12):
        return None
    return (d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det)


def path_points(d):
    """The polylines of a path, its curves cut in straight pieces : M, L, H, V, C, Q and Z, absolute or relative"""
    tokens = re.findall(NUMBER.pattern + r"|[A-Za-z]", d)
    unread = sorted({t for t in tokens if t.isalpha() and t not in "MmLlHhVvCcQqZz"})
    # An arc or a smooth curve read as the command before it would draw a line that isn't there
    if unread:
        raise ValueError(f"commande de chemin SVG non lue : {''.join(unread)} dans {d[:40]}")
    runs = []
    run = []
    x = y = sx = sy = 0.0
    k = 0
    cmd = None
    while (k < len(tokens)):
        if tokens[k].isalpha():
            cmd = tokens[k]
            k += 1
            if cmd in "Zz":
                if run:
                    run.append((sx, sy))
                    runs.append(run)
                run = [(sx, sy)]
                x, y = sx, sy
                continue
        if cmd is None:
            raise ValueError(f"chemin SVG sans commande : {d[:40]}")
        rel = cmd.islower()
        take = {"m": 2, "l": 2, "h": 1, "v": 1, "c": 6, "q": 4}[cmd.lower()]
        v = [float(t) for t in tokens[k:k + take] if not t.isalpha()]
        if (len(v) < take):
            raise ValueError(f"chemin SVG tronqué après {cmd} : {d[:40]}")
        k += take
        if (cmd in "Mm"):
            if (len(run) > 1):
                runs.append(run)
            x, y = (x + v[0], y + v[1]) if rel else (v[0], v[1])
            sx, sy = x, y
            run = [(x, y)]
            # Further pairs after a move are lines
            cmd = "l" if rel else "L"
        elif cmd in "Ll":
            x, y = (x + v[0], y + v[1]) if rel else (v[0], v[1])
            run.append((x, y))
        elif cmd in "Hh":
            x = x + v[0] if rel else v[0]
            run.append((x, y))
        elif cmd in "Vv":
            y = y + v[0] if rel else v[0]
            run.append((x, y))
        else:
            pts = [(x + v[i], y + v[i + 1]) if rel else (v[i], v[i + 1]) for i in range(0, take, 2)]
            ctrl = [(x, y)] + pts
            for s in range(1, CURVE_STEPS + 1):
                t = s / CURVE_STEPS
                # De Casteljau on the 3 or 4 points of the curve
                p = ctrl
                while (len(p) > 1):
                    p = [((1 - t) * p[i][0] + t * p[i + 1][0], (1 - t) * p[i][1] + t * p[i + 1][1])
                         for i in range(len(p) - 1)]
                run.append(p[0])
            x, y = ctrl[-1]
    if (len(run) > 1):
        runs.append(run)
    return runs


def shape_points(tag, e):
    """The polylines an SVG shape strokes, in its own frame"""
    f = lambda name: float(e.get(name, 0) or 0)
    if (tag == "line"):
        return [[(f("x1"), f("y1")), (f("x2"), f("y2"))]]
    if tag in ("polyline", "polygon"):
        v = [float(t) for t in NUMBER.findall(e.get("points", ""))]
        pts = list(zip(v[0::2], v[1::2]))
        return [pts + pts[:1]] if tag == "polygon" else [pts]
    if (tag == "rect"):
        x, y, w, h = f("x"), f("y"), f("width"), f("height")
        return [[(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]]
    if tag in ("circle", "ellipse"):
        rx = f("r") if tag == "circle" else f("rx")
        ry = f("r") if tag == "circle" else f("ry")
        n = 4 * CURVE_STEPS
        return [[(f("cx") + rx * math.cos(2 * math.pi * i / n), f("cy") + ry * math.sin(2 * math.pi * i / n))
                 for i in range(n + 1)]]
    if (tag == "path"):
        return path_points(e.get("d", ""))
    return []


def stroked(style):
    """Does the inherited style draw a line : a stroke that is not none, not white and not see-through"""
    colour = (style.get("stroke") or "none").strip().lower()
    if colour in ("none", "transparent", "#ffffff", "#fff", "white"):
        return False
    return number(style.get("stroke-opacity"), 1.0) > 0 and number(style.get("stroke-width"), 1.0) > 0


def number(text, default):
    found = NUMBER.findall(text or "")
    return float(found[0]) if found else default


STYLE = ("stroke", "stroke-opacity", "stroke-width", "font-family", "font-size", "font-weight", "text-anchor")
# Where SVG puts the start of a text for each anchor, in its advance
ANCHOR = {"start": 0.0, "middle": 0.5, "end": 1.0}
# A size in user units, the px of SVG being the same unit
SIZE = re.compile(r"^\s*(" + NUMBER.pattern + r")\s*(px)?\s*$")
# What a tspan of the template may carry and still sit on the line of its text
TSPAN = ("{http://www.w3.org/XML/1998/namespace}space",)


def own_style(e, inherited):
    """The style an element draws with : the inherited one, its attributes over it, its style= over both, as CSS says"""
    style = dict(inherited)
    for key in STYLE:
        if e.get(key) is not None:
            style[key] = e.get(key).strip()
    for declaration in (e.get("style") or "").split(";"):
        if not declaration.strip():
            continue
        key, _, value = declaration.partition(":")
        key = key.strip().lower()
        if key in STYLE:
            style[key] = value.strip()
        elif (key == "font"):
            raise ValueError(f"raccourci CSS font non lu : {declaration.strip()}")
    return style


def bold_of(weight, content):
    weight = (weight or "normal").strip().lower()
    if weight in ("normal", "lighter"):
        return False
    if weight in ("bold", "bolder"):
        return True
    if weight.isdigit():
        # CSS Fonts 4, 5.2 : with a normal and a bold face, 500 falls to the 400 one and 600 up to the 700 one
        return int(weight) >= 600
    raise ValueError(f"graisse '{weight}' non lue pour le texte '{content}'")


def read_text(e, style, m):
    """A text of the page with what its ink is measured from, or an error for whatever of it isn't read"""
    content = "".join(e.itertext()).strip()
    if not content:
        return None
    for child in e.iter():
        if child is e:
            continue
        # Moved or restyled on its own, a piece of the text would be measured where it isn't
        extra = [k for k in child.attrib if k not in TSPAN]
        if (child.tag.split("}")[-1] != "tspan" or extra):
            raise ValueError(f"texte '{content}' : élément {child.tag.split('}')[-1]} {extra} non lu")
    for key in ("dx", "dy", "rotate", "textLength"):
        if e.get(key) is not None:
            raise ValueError(f"texte '{content}' : attribut {key} non lu")
    size = SIZE.match(style.get("font-size", ""))
    if (size is None or float(size.group(1)) <= 0):
        raise ValueError(f"texte '{content}' sans taille de police lisible : '{style.get('font-size', '')}'")
    anchor = style.get("text-anchor", "start").lower()
    if anchor not in ANCHOR:
        raise ValueError(f"texte '{content}' : ancrage '{anchor}' non lu")
    place = [NUMBER.findall(e.get(key) or "0") for key in ("x", "y")]
    if (len(place[0]) != 1 or len(place[1]) != 1):
        raise ValueError(f"texte '{content}' : position glyphe par glyphe non lue")
    return {"text": content, "family": style.get("font-family", ""), "size": float(size.group(1)),
            "bold": bold_of(style.get("font-weight"), content), "anchor": ANCHOR[anchor],
            "x": float(place[0][0]), "y": float(place[1][0]), "m": m}


def walk(e, m, style, texts, segments):
    """Every text with its matrix and every stroked segment in page units, through nested groups"""
    tag = e.tag.split("}")[-1]
    if tag in ("defs", "title", "desc", "clipPath", "mask", "symbol", "marker"):
        return
    # A style sheet would restyle by class what this reads by attribute
    if (tag == "style"):
        raise ValueError("feuille de style CSS non lue")
    m = compose(m, matrix_of(e.get("transform")))
    style = own_style(e, style)
    if (tag == "text"):
        found = read_text(e, style, m)
        if found is not None:
            texts.append(found)
        return
    if stroked(style):
        for run in shape_points(tag, e):
            pts = [apply(m, x, y) for x, y in run]
            segments.extend(zip(pts, pts[1:]))
    for child in e:
        walk(child, m, style, texts, segments)


def clips(p, q, box):
    """Does segment p-q enter box (x0, y0, x1, y1) : Liang-Barsky"""
    t0, t1 = 0.0, 1.0
    dx, dy = q[0] - p[0], q[1] - p[1]
    for side, gap in ((-dx, p[0] - box[0]), (dx, box[2] - p[0]), (-dy, p[1] - box[1]), (dy, box[3] - p[1])):
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


def crossed_texts(svg, ink):
    """Each text a stroked segment runs through, with where it sits on the page in mm. ink(text, family, size, bold)
    gives the box of its glyphs from the start of its baseline and its advance (x0, y0, x1, y1, advance), y down"""
    # The SVG itself, or the path of its file
    root = ET.fromstring(svg) if svg.lstrip().startswith("<") else ET.parse(svg).getroot()
    width = float(NUMBER.findall(root.get("width", "0"))[0])
    view = [float(v) for v in NUMBER.findall(root.get("viewBox", ""))]
    # Units of the page per mm : a page of 420 mm drawn on a viewBox of 4200 counts 10
    unit = view[2] / width if (len(view) == 4 and width > 0) else 1.0
    texts = []
    segments = []
    walk(root, IDENTITY, {}, texts, segments)
    found = []
    for t in texts:
        inverse = invert(t["m"])
        if inverse is None:
            continue
        x0, y0, x1, y1, advance = ink(t["text"], t["family"], t["size"], t["bold"])
        if (x1 <= x0 or y1 <= y0):
            raise ValueError(f"texte '{t['text']}' sans encre mesurée en {t['family']} {t['size']}")
        # SVG moves the start of an anchored text back by its advance, the ink follows
        shift = -t["anchor"] * advance
        x0, x1 = x0 + shift, x1 + shift
        # The tolerence in the frame of the text : its matrix may scale it
        scale = math.sqrt(abs(t["m"][0] * t["m"][3] - t["m"][1] * t["m"][2])) or 1.0
        air = TOUCH * unit / scale
        box = (t["x"] + x0 + air, t["y"] + y0 + air, t["x"] + x1 - air, t["y"] + y1 - air)
        if (box[2] <= box[0] or box[3] <= box[1]):
            continue
        corners = [apply(t["m"], u, v) for u in (box[0], box[2]) for v in (box[1], box[3])]
        lo_x, hi_x = min(c[0] for c in corners), max(c[0] for c in corners)
        lo_y, hi_y = min(c[1] for c in corners), max(c[1] for c in corners)
        near = [(p, q) for p, q in segments if max(p[0], q[0]) >= lo_x and min(p[0], q[0]) <= hi_x
                and max(p[1], q[1]) >= lo_y and min(p[1], q[1]) <= hi_y]
        # Each segment brought into the frame of the text, a turned text staying a plain box there
        if any(clips(apply(inverse, *p), apply(inverse, *q), box) for p, q in near):
            cx, cy = apply(t["m"], t["x"] + (x0 + x1) / 2, t["y"] + (y0 + y1) / 2)
            found.append({"text": t["text"], "x": round(cx / unit, 1), "y": round(cy / unit, 1)})
    return found
