#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Reads a generated FreeCAD document back and checks it against the JSON it came from, run in FreeCADCmd"""

import json
import math
import os

import FreeCAD as App
import Part

SOURCE = os.environ["S32_JSON"]
DOC = os.environ["S32_DOC"]
# Under this no 2 boards are said to cross, a sheared float at a shared face
CROSS_MM3 = 1.0
# How far inside its tip a screw is probed, and how much board must be left beyond it
TIP_PROBE = 0.5
SKIN_LEFT = 3.0
# A screw in a pilot hole has air on its axis : its thread bites round it, wood looked for at 0.9 of its radius. A
# pilot as wide as that fails as a screw in the air does
PILOT_RING = 0.9


def ring(at, way, radius):
    """Four points round an axis, at that radius"""
    side = way.cross(App.Vector(1, 0, 0) if abs(way.x) < 0.9 else App.Vector(0, 1, 0))
    side.normalize()
    other = way.cross(side)
    return [at + v * radius for v in (side, side * -1, other, other * -1)]
# What the label of a screw into the wall says : "mur" alone also reads in "étagère murale"
WALL = "au mur"
# A head stands within this of what it holds, and takes no more than this of it : a little, its cone sat in the hole
HEAD_GAP = 0.3
HEAD_BURIED = 3.0
HEAD_TOUCH = 0.2
# A screw against an article, the thread of its model smooth at the full diameter : the head shares nothing, the core
# of the thread (din7505def.csv, 0.7 x d) passes the hole, the crest may bite a plastic hole. Head height 0.6 x d
HEAD_BITE = 0.05
HEAD_CONTACT = 0.02
HEAD_BACK = 0.1
# A head of twice the shank : its ring of probes 0.9 of its radius, 0.15 under its top
RING_RATIO = 0.9
RING_DEPTH = 0.15
# A fixing holds what it touches : a shelf lies 0.08 off the plane of its pin in the Häfele model
FIX_TOUCH = 0.1
HEAD_DEPTH = 0.6
CORE_RATIO = 0.7
NOT_HELD = ("PLUG_DUOPOWER_8x40", "PLUG_NYLON_8x40")
# TODO only the shut flap is built : the gas stays 365.01.901 swung open over the bottle drawer go unchecked

# The bottom of the cup in each Blum model of hinge, read off their Ø35 cylinders : the crank of the twin one sets it 9.5
# further. A cup further than this from the bottom of its boring is a hinge off its door
CUP_BOTTOM = {"70T3550.TL": (-6.5, 0.0, 51.3), "70T3650.TL": (-16.0, 0.0, 51.3)}
CUP_OFF = 1.0
# A point of each model that sits in a board once fitted : its dowel, its thread, its body in its bore
ENGAGED = {
    "174H7100E": ((6, 16, 0), (6, -16, 0)),
    "70T3550.TL": ((-6.5, 0, 45),), 
    "70T3650.TL": ((-16, 0, 45),),
    "DOWEL_8x35": ((0, 0, 5), (0, 0, 30)),
    "262.28.020": ((-4, 0, 0),),
    "262.26.535": ((0, 0, 7),),
    "282.24.727": ((-4, 0, 0),),
    "283.33.910": ((27, -60, 0),),
    "956.1004": (),
    # The sleeve across both boards, the screw inside it : Häfele's file cut in 2 (cad_models.ts)
    "267.07.903.sleeve": ((-10, 0, 0),),
    "267.07.903.screw": ((-30, 0, 0),),
}


# The software has its height along y and FreeCAD along z, the build turned the room up about x
def to_room(q):
    return [q[0], -q[2], q[1]]


def world_box(p):
    f = p["frame"]
    xs = []
    for u in (0, p["length"]):
        for v in (0, p["width"]):
            for w in (0, p["thickness"]):
                xs.append(to_room([f["o"][k] + u * f["u"][k] + v * f["v"][k] + w * f["n"][k] for k in range(3)]))
    return [min(q[k] for q in xs) for k in range(3)], [max(q[k] for q in xs) for k in range(3)]


def segments_distance(p1, d1, p2, d2): 
    """Least distance between two segments, each a start and the vector to its end"""
    r = p1 - p2
    a, e, f = d1.dot(d1), d2.dot(d2), d2.dot(r)
    c, b = d1.dot(r), d1.dot(d2)
    denom = a * e - b * b
    s = min(1.0, max(0.0, (b * f - c * e) / denom)) if denom > 1e-9 else 0.0
    t = (b * s + f) / e   
    if (t < 0.0 or t > 1.0):
        t = min(1.0, max(0.0, t))
        s = min(1.0, max(0.0, (b * t - c) / a))
    return (p1 + d1 * s - (p2 + d2 * t)).Length


def check_screws(screws, shapes, extra=0.0):
    """Where each screw ends, what its shank runs through : a wall screw leaves the board on purpose, a bolt has its hole"""
    def filled(q):
        return any(s.BoundBox.isInside(q) and s.isInside(q, 1e-6, True) for _, _, s in shapes)

    def bites(q, way, radius):
        return filled(q) or all(filled(p) for p in ring(q, way, PILOT_RING * radius))

    out = {"tip_in_air": [], "no_skin": [], "voids": [], "clash": [], "tips_in_pilot": 0}
    axes = []
    for s in screws:
        origin = App.Vector(*to_room(s["point"]))
        way = App.Vector(*to_room(s["out"]))
        length = s["length"] + extra
        axes.append((origin, way * (-length), s))
        # "au mur" : a screw into a wall shelf ("murale") keeps every check of its tip
        if (s["kind"] == "bolt" or WALL in s["label"].lower()):
            continue
        name = f"{s['part']} : {s['label'][:46]}"
        radius = s["diameter"] / 2
        tip = origin - way * (length - TIP_PROBE)
        if not bites(tip, way, radius):
            out["tip_in_air"].append(name)
            continue
        if not filled(tip):
            out["tips_in_pilot"] += 1
        if not filled(origin - way * (length + SKIN_LEFT)):
            out["no_skin"].append(name)
        # A screw runs free in its own clearance hole : what it must bite starts past it
        depth = s["free"] + TIP_PROBE
        hit = False
        while (depth < length and not hit):
            at = origin - way * depth
            hit = not (all(filled(p) for p in ring(at, way, radius)) and bites(at, way, radius))
            depth += 1.0
        if hit:
            out["voids"].append(f"{name} a {depth - 1:.1f} mm")
    for i, (a, da, sa) in enumerate(axes):
        for b, db, sb in axes[i + 1:]:
            if ((a - b).Length < sa["length"] + sb["length"] + extra * 2):
                gap = segments_distance(a, da, b, db)
                if (gap < (sa["diameter"] + sb["diameter"]) / 2):
                    out["clash"].append(f"{sa['part']} {sa['label'][:28]} x {sb['part']} {sb['label'][:28]} : {gap:.1f} mm")
    return out


def head_of(s, sink=0.0):
    """The head of a screw as a solid, under its top when countersunk, its seat under it when pan headed"""
    way = App.Vector(*to_room(s["out"]))
    origin = App.Vector(*to_room(s["point"])) - way * sink
    d = s["diameter"]
    if (s["kind"] == "countersunk"):
        # Twice the shank unless the screw names the head its model draws : the DIN 7997:2008 of the Oslo pull, a rim of
        # 0.45 over its cone of 90 degrees
        big = s.get("head", 2 * d) / 2
        rim = max(s.get("headHeight", big - d / 2) - (big - d / 2), 0.0)
        head = Part.makeCone(big, d / 2, big - d / 2, origin - way * rim, way * -1)
        if (rim > 0):
            head = head.fuse(Part.makeCylinder(big, rim, origin, way * -1))
    else:
        # A pan head stands over its origin : what it bears on is just under it, a thin disc
        head = Part.makeCylinder(d, HEAD_TOUCH, origin - way * HEAD_TOUCH, way)
    return head


def check_interfaces(screws, bought, shapes, sink=0.0):
    """A screw that holds nothing is misplaced : its head on the article it holds, not buried in it, its shank in wood"""
    out = {"head_off": [], "head_buried": [], "no_wood": [], "one_board": []}
    articles = {}
    for link in bought:
        s = link.LinkedObject.Shape.copy()
        s.Placement = link.Placement.multiply(s.Placement)
        articles.setdefault(link.Label2, []).append(s)

    def board_at(q):
        for name, _, b in shapes:
            if (b.BoundBox.isInside(q) and b.isInside(q, 1e-6, True)):
                return name
        return None

    for s in screws:
        origin = App.Vector(*to_room(s["point"]))
        way = App.Vector(*to_room(s["out"]))
        name = f"{s['part']} : {s['label'][:40]}"
        to_wall = WALL in s["label"].lower()
        wanted = s.get("holds")
        if wanted:
            head = head_of(s, sink)
            near = [a for key, group in articles.items() if key.startswith(wanted) for a in group
                    if a.BoundBox.isInside(origin) or (a.BoundBox.Center - origin).Length < a.BoundBox.DiagonalLength]
            gap = min((head.distToShape(a)[0] for a in near), default=1e9)
            if (gap > HEAD_GAP):
                out["head_off"].append(f"{name} : {gap:.2f} mm")
            elif (s["kind"] == "countersunk"):
                # A pan head bears flat, a countersunk one can sink through the hole it should sit in
                buried = max(head.common(a).Volume for a in near)
                if (buried > HEAD_BURIED):
                    out["head_buried"].append(f"{name} : {buried:.1f} mm3")
        if to_wall:
            continue
        end = origin - way * (s["length"] - TIP_PROBE)
        tip = board_at(end)
        if tip is None:
            # In a pilot hole : the board all round the axis
            round_it = {board_at(p) for p in ring(end, way, PILOT_RING * s["diameter"] / 2)}
            tip = round_it.pop() if len(round_it) == 1 else None 
        if tip is None:
            out["no_wood"].append(name)
        elif s.get("joins"):
            first = board_at(origin - way * (s["free"] / 2))
            # Its clearance hole is empty : what stands beside it says which board it's in
            if first is None:
                side = way.cross(App.Vector(1, 0, 0) if abs(way.x) < 0.9 else App.Vector(0, 1, 0))
                side.normalize()
                first = board_at(origin - way * (s["free"] / 2) + side * (s["diameter"] / 2 + 1.5))
            if (first == tip):
                out["one_board"].append(name)
    return out


def check_held(links, screws, bought, sink=0.0):
    """Each modelled screw against every article : its head shares nothing, the core of its thread passes the hole, its head meets what it holds"""
    out = {"head_bites": [], "core_bites": [], "head_apart": [], "head_sunk": []}
    specs = {tuple(round(c, 1) for c in to_room(s["point"])): s for s in screws}
    articles = []
    for link in bought:
        if link.Label2 in NOT_HELD:
            continue
        s = link.LinkedObject.Shape.copy()
        s.Placement = link.Placement.multiply(s.Placement)
        articles.append((link.Label2, s))
    for link in links:
        base = link.Placement.Base
        s = specs.get((round(base.x, 1), round(base.y, 1), round(base.z, 1)))
        if s is None:
            continue
        way = link.Placement.Rotation.multVec(App.Vector(0, 0, 1))
        d = s["diameter"]
        screw = link.Shape.copy()
        origin = base - way * sink
        screw.translate(way * -sink)
        # A head of known height stops there : 0.6 x d took the shank of a coupling screw rubbing its slot for a head
        under = s.get("headHeight", HEAD_DEPTH * d) if s["kind"] == "countersunk" else 0.0
        zone = Part.makeCylinder(2 * d, under + 2 * d, origin - way * under, way)
        head = screw.common(zone)
        core = Part.makeCylinder(CORE_RATIO * d / 2, s["length"], origin - way * under, way * -1)
        name = f"{s['part']} : {s['label'][:40]}"
        reach = head.BoundBox
        reach.enlarge(s["length"] + 1)
        held = []
        for key, a in articles:
            if not a.BoundBox.intersect(reach):
                continue
            bite = head.common(a).Volume
            if (bite > HEAD_BITE):
                out["head_bites"].append(f"{name} x {key} : {bite:.2f} mm3")
            bite = core.common(a).Volume
            if (bite > HEAD_BITE):
                out["core_bites"].append(f"{name} x {key} : {bite:.2f} mm3")
            if (s.get("holds") and key.startswith(s["holds"])):
                held.append((head.distToShape(a)[0], a))
        if not held:
            # A screw that should hold an article and finds none near it is as far from it as can be
            if s.get("holds"):
                out["head_apart"].append(f"{name} : aucun {s['holds']} autour")
            continue
        gap, nearest = min(held, key=lambda g: g[0])
        if (gap > HEAD_CONTACT):
            out["head_apart"].append(f"{name} : {gap:.3f} mm")
        # A common of 2 cones nearly one reads 0 as often as not : a seated head comes off when backed
        # out, a sunk one stays
        backed = head.copy()
        backed.translate(way * HEAD_BACK)
        if (backed.distToShape(nearest)[0] < HEAD_CONTACT):
            out["head_sunk"].append(name)
    return out


# The height of a head standing over its face : DIN 7996:1986 pan head 0.7 x d (2.8 for the Ø4 of the Fasteners model)
# ISO 7380-1:2011 button head 0.55 x d (2.75 for M5)
PAN_HEAD = {"pan": 0.7, "metric": 0.55}


def heads_clear(screws, shapes, sink=0.0):
    """Probes through the whole volume of each head standing over its face : none may fall in a board. The ring of
    heads_in_wood looks 0.15 over the face only, the head of an Oslo screw reached into the top 1.7 over it"""
    out = []
    for s in screws:
        rise = PAN_HEAD.get(s["kind"])
        if rise is None:
            continue
        way = App.Vector(*to_room(s["out"]))
        origin = App.Vector(*to_room(s["point"])) - way * sink
        side = way.cross(App.Vector(1, 0, 0) if abs(way.x) < 0.9 else App.Vector(0, 1, 0))
        side.normalize()
        other = way.cross(side)
        k = rise * s["diameter"]
        r = RING_RATIO * s["diameter"]
        probes = [origin + way * (k * f) + (side * math.cos(a) + other * math.sin(a)) * (r * g)
                  for f in (0.3, 0.6, 0.95) for g in (0.0, 0.5, 1.0) for a in (n * math.pi / 4 for n in range(8))]
        if (any(b.BoundBox.isInside(q) and b.isInside(q, 1e-6, False) for q in probes for _, _, b in shapes)):
            out.append(f"{s['part']} : {s['label'][:50]}")
    return out


def heads_in_wood(screws, shapes, sink=0.0):
    """Probes on a ring just inside the top of each head : in a board, the head has no seat cut for it"""
    out = []
    for s in screws:
        if (s["kind"] == "bolt"):
            continue
        way = App.Vector(*to_room(s["out"]))
        origin = App.Vector(*to_room(s["point"])) - way * sink
        side = way.cross(App.Vector(1, 0, 0) if abs(way.x) < 0.9 else App.Vector(0, 1, 0))
        side.normalize()
        other = way.cross(side)
        # A countersunk head goes down from its origin, a pan head stands over it
        level = origin - way * RING_DEPTH if s["kind"] == "countersunk" else origin + way * RING_DEPTH
        r = RING_RATIO * s["diameter"]
        ring = [level + (side * math.cos(a) + other * math.sin(a)) * r for a in (k * math.pi / 4 for k in range(8))]
        if (any(b.BoundBox.isInside(q) and b.isInside(q, 1e-6, False) for q in ring for _, _, b in shapes)):
            out.append(f"{s['part']} : {s['label'][:50]}")
    return out


def contacts(boards, fixings):
    """Who touches whom, a board against a fixing or 2 fixings : two boards side by side hold nothing"""
    shape = {o.Name: o.Shape for o in boards + fixings}
    box = {}
    for name, s in shape.items():
        b = s.BoundBox
        b.enlarge(FIX_TOUCH)
        box[name] = b

    def touch(a, b):
        return box[a].intersect(box[b]) and shape[a].distToShape(shape[b])[0] <= FIX_TOUCH

    pairs = []
    for i, f in enumerate(fixings):
        pairs += [(f.Name, g.Name) for g in boards + fixings[i + 1:] if touch(f.Name, g.Name)]
    return pairs


def check_fixed(boards, fixings, pairs, without="", apart=None):
    """From each board, not from each screw : what holds it, and whether its group comes down to the floor or the wall"""
    kept = {f.Name: f for f in fixings if not without or without not in f.Label2}
    names = {g.Name: g for g in boards}
    parent = {n: n for n in list(names) + list(kept) + ["SOL", "MUR"]}

    def find(n):
        while (parent[n] != n):
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n

    held = {n: 0 for n in names}
    # The pieces of one article hold together however far its settings set them apart
    units = {}
    for name, f in kept.items():
        unit = getattr(f, "Unit", "")
        if unit:
            if unit in units:
                parent[find(name)] = find(units[unit])
            else:
                units[unit] = name
    for a, b in pairs:
        if (a not in kept or (b not in kept and b not in names)):
            continue
        parent[find(a)] = find(b)
        if b in names:
            held[b] += 1
    for name, f in kept.items():
        if (f.Label2 in NOT_HELD or (name.startswith("Vis") and WALL in f.Label2.lower())):
            parent[find(name)] = find("MUR")
        elif f.Label2.startswith("637.76.35"):
            parent[find(name)] = find("SOL")
    ground = {find("SOL"), find("MUR")}
    apart = apart or {}
    out = {"unfixed": [], "one_fixing": [], "floating": [], "slid_in": [], "standing": [], "glued": []}
    for name, g in names.items():
        # Held by glue alone, its fixing no solid : said apart, never as fixed and never as forgotten
        if (apart.get(name) == "glued"):
            out["glued"].append(g.Label)
            continue
        if (held[name] == 0):
            out["unfixed"].append(g.Label)
        elif (held[name] == 1):
            out["one_fixing"].append(g.Label)
        # A lining slid into its cell, a column meant to stand loose : said apart, never as standing on nothing
        if (held[name] > 0 and find(name) not in ground):
            out[apart.get(name, "floating")].append(g.Label)
    return out


def check_hardware(bought, shapes, model):
    """What each article takes out of the boards, the bottom of each hinge cup against its boring, the feet on the floor"""
    table = {}
    placed = []
    for link in bought:
        shape = link.LinkedObject.Shape.copy()
        shape.Placement = link.Placement.multiply(shape.Placement)
        placed.append((link, shape))
        row = table.setdefault(link.Label2, {"n": 0, "max": 0.0, "sum": 0.0, "failed": 0, "worst": ""})
        row["n"] += 1
        for name, _, board in shapes:
            if not shape.BoundBox.intersect(board.BoundBox):
                continue
            try:
                shared = shape.common(board).Volume
            except App.Base.FreeCADError:
                row["failed"] += 1
                continue
            row["sum"] += shared
            if (shared > row["max"]):
                row["max"] = shared
                row["worst"] = f"{link.Label[:40]} x {name[:34]}"
    for row in table.values():
        row["max"] = round(row["max"], 1)
        row["sum"] = round(row["sum"], 1)
    bottoms = []
    for part in model["parts"]:
        frame = part["frame"]
        for hole in part["holes"]:
            if (hole.get("purpose") == "hinge-cup"):
                in_thickness = hole["depth"] if hole["face"] == "A" else part["thickness"] - hole["depth"]
                bottoms.append(App.Vector(*to_room([frame["o"][k] + hole["u"] * frame["u"][k] + hole["v"] * frame["v"][k]
                                                    + in_thickness * frame["n"][k] for k in range(3)])))
    gaps = []
    cup_off = []
    for link, _ in placed:
        if link.Label2.startswith("70T"):
            # A hinge model with no known cup is itself an alert, never a silent pass
            if link.Label2 not in CUP_BOTTOM:
                cup_off.append(f"{link.Label[:44]} : cuvette du modele inconnue")
                continue
            cup_bottom = link.Placement.multVec(App.Vector(*CUP_BOTTOM[link.Label2]))
            gap = round(min((cup_bottom - bottom).Length for bottom in bottoms), 2)
            gaps.append(gap)
            if (gap > CUP_OFF):
                cup_off.append(f"{link.Label[:44]} : {gap} mm du fond de son percage")
    floors = [round(shape.BoundBox.ZMin, 2) for link, shape in placed if link.Label2.startswith("637.76.35")]
    # Clear of every board proves nothing of a dowel pointing the wrong way : what must sit in a board has to be in one
    loose = {}
    for link, _ in placed:
        for engaged in ENGAGED.get(link.Label2, ()):
            point = link.Placement.multVec(App.Vector(*engaged))
            if not any(board.BoundBox.isInside(point) for _, _, board in shapes):
                loose.setdefault(link.Label2, []).append(link.Label[:44])
    # What two articles share
    pairs = {}
    for i, (first, first_shape) in enumerate(placed):
        for second, second_shape in placed[i + 1:]:
            if not first_shape.BoundBox.intersect(second_shape.BoundBox):
                continue
            try:
                shared = first_shape.common(second_shape).Volume
            except App.Base.FreeCADError:
                shared = -1
            if (shared > 0.05 or shared < 0):
                key = " x ".join(sorted((first.Label2, second.Label2)))
                row = pairs.setdefault(key, {"n": 0, "max": 0.0, "worst": ""})
                row["n"] += 1
                if (shared > row["max"]):
                    row["max"] = round(shared, 1)
                    row["worst"] = f"{first.Label[:36]} x {second.Label[:36]}"
    return {"table": table, "hinge_cup_gaps": sorted(gaps), "cup_off": cup_off, "foot_floors": sorted(set(floors)),
            "loose": loose, "pairs": pairs}


# What fails the build : a list of defects not empty, or a proof at nought, a check that saw nothing when it had to
# It measured and wrote FIN whatever it found (review of 2026-11-09)
FAILING = ("misplaced", "probes_bad", "crossing", "cup_off", "head_in_wood", "head_clear")
FAILING_IN = {"held": ("head_bites", "core_bites", "head_apart", "head_sunk"),
              "screws": ("tip_in_air", "no_skin", "voids", "clash"),
              "interfaces": ("head_off", "head_buried", "no_wood", "one_board"),
              "fixed": ("unfixed", "one_fixing", "floating")}


def verdict(out):
    why = [f"{k} : {len(out[k])}" for k in FAILING if out.get(k)]
    for group, keys in FAILING_IN.items():
        why += [f"{group}.{k} : {len(out[group][k])}" for k in keys if out.get(group, {}).get(k)]
    proofs = {k: v for k, v in out.items() if k.startswith("proof_")}
    why += [f"{k} : 0, le contrôle n'a rien vu" for k, v in proofs.items() if (len(v) if isinstance(v, list) else v) ==
            0]
    return {"ok": not why, "raisons": why}


def main():
    with open(SOURCE, encoding="utf-8") as source:
        model = json.load(source)
    doc = App.openDocument(DOC)
    by_id = {part["id"]: part for part in model["parts"]}
    every = [obj for obj in doc.Objects if obj.TypeId == "App::Link"]
    links = [obj for obj in every if obj.LinkedObject.TypeId == "PartDesign::Body" and obj.LinkedObject.Label2 in by_id]
    # The edge bands, a body each in the place of a strip taken off their board : in the checks of clashes and heads
    # not in that of fixings, glued on their board
    strips = [obj for obj in every if obj.LinkedObject.TypeId == "PartDesign::Body" and
              "#chant-" in obj.LinkedObject.Label2]
    bought = [obj for obj in every if obj.Label2 in model["models"]]
    out = {"parts_json": len(model["parts"]), "links": len(links), "edge_bands": len(strips), "misplaced": [],
           "probes_ok": 0, "probes_bad": [], "crossing": [], "no_material": []}
    shapes = []
    banded = {}
    for link in strips:
        base = link.LinkedObject.Label2.split("#chant-")[0]
        shape = link.LinkedObject.Shape.copy()
        shape.Placement = link.Placement.multiply(shape.Placement)
        shapes.append((link.Label, by_id.get(base), shape))
        banded.setdefault(base, []).append(shape.BoundBox)
        if base not in by_id:
            out["misplaced"].append(f"{link.Label} : chant d'une pièce absente du JSON")
    for link in links:
        body = link.LinkedObject
        part = by_id.get(body.Label2)
        shape = body.Shape.copy()
        shape.Placement = link.Placement.multiply(shape.Placement)
        shapes.append((link.Label, part, shape))
        if part is None:
            out["misplaced"].append(f"{link.Label} : absent du JSON")
            continue
        if (body.ShapeMaterial.Name == "" or body.ShapeMaterial.Name == "Default"):
            out["no_material"].append(link.Label)
        lo, hi = world_box(part)
        # The finished size is the board and its bands together
        finished = App.BoundBox(shape.BoundBox)
        for strip in banded.get(body.Label2, []):
            finished.add(strip)
        got = ([finished.XMin, finished.YMin, finished.ZMin], [finished.XMax, finished.YMax, finished.ZMax])
        if (max(abs(got[0][k] - lo[k]) for k in range(3)) > 0.01 or max(abs(got[1][k] -
            hi[k]) for k in range(3)) > 0.01):
            shaped = len(part["outline"]["segments"]) != 4
            if not shaped:
                out["misplaced"].append(f"{link.Label} : {got} pour {lo} {hi}")
        frame = part["frame"]
        for hole in part["holes"]:
            if hole["face"] not in ("A", "B"):
                continue
            # In the axis of the hole, half way down it : empty. Beside it, a board may hold another hole : only the
            # empty side is a proof
            in_thickness = hole["depth"] / 2 if hole["face"] == "A" else part["thickness"] - hole["depth"] / 2
            probe = App.Vector(*to_room([frame["o"][k] + hole["u"] * frame["u"][k] + hole["v"] * frame["v"][k]
                                         + in_thickness * frame["n"][k] for k in range(3)]))
            if shape.isInside(probe, 1e-6, True):
                out["probes_bad"].append(f"{link.Label} : {hole['label']} a {hole['u']}, {hole['v']}")
            else:
                out["probes_ok"] += 1
    def crossings(pieces):
        found = []
        for i, (first_name, first_part, first_shape) in enumerate(pieces):
            for second_name, second_part, second_shape in pieces[i + 1:]:
                if not first_shape.BoundBox.intersect(second_shape.BoundBox):
                    continue
                common = first_shape.common(second_shape).Volume
                if (common > CROSS_MM3):
                    found.append(f"{first_part['item']} {first_name} x {second_part['item']} {second_name} : "
                                 f"{common:.0f} mm3")
        return found

    out["crossing"] = crossings(shapes)
    # The check proves it can see a clash : every part moved 5 mm in turn along its normal, some must cross a neighbour
    moved = 0
    for index, (name, part, shape) in enumerate(shapes):
        shifted = shape.copy()
        shifted.translate(App.Vector(*to_room([5 * component for component in part["frame"]["n"]])))
        others = [entry for j, entry in enumerate(shapes) if j != index]
        if (crossings([(name, part, shifted)] + others)[:1] and not crossings(others)[:1]):
            moved += 1
        if (index >= 11):
            break
    out["proof_moved_parts_seen_crossing"] = moved
    out["hardware"] = check_hardware(bought, shapes, model)
    # Measured and never read : the cups 9.5 off on the uprights of the dresser sat in this list. Up to the summary
    out["cup_off"] = out["hardware"]["cup_off"]
    out["interfaces"] = check_interfaces(model["screws"], bought, shapes)
    # The test has to see a head out of place : every one sunk 2 mm deeper is buried in what it holds
    proof = check_interfaces(model["screws"], bought, shapes, 2.0)
    out["proof_heads_sunk_2mm_buried"] = len(proof["head_buried"])
    drilled = [obj for obj in every if obj.Name.startswith("Vis")]
    out["held"] = check_held(drilled, model["screws"], bought)
    # The defect it was written for : every head 0.4 deeper, as when the rim of the head was forgotten
    sunk = check_held(drilled, model["screws"], bought, 0.4)
    out["proof_heads_sunk_04_bite"] = len(sunk["head_bites"])
    out["proof_heads_sunk_04_stay"] = len(sunk["head_sunk"])
    out["head_in_wood"] = heads_in_wood(model["screws"], shapes)
    # The whole head clear of every board, and the proof the probes see one : each head sunk its own height
    out["head_clear"] = heads_clear(model["screws"], shapes)
    out["proof_heads_sunk_whole_seen"] = len(heads_clear(model["screws"], shapes, 3.0))
    # The case it was written for, a head on the wood with no countersink : every head 1 mm deeper is in the wood
    out["proof_heads_sunk_1mm_in_wood"] = len(heads_in_wood(model["screws"], shapes, 1.0))
    fixings = drilled + [obj for obj in every if obj.Name.startswith("Article")]
    pairs = contacts(links, fixings)
    apart = {}
    for link in links:
        part = by_id.get(link.LinkedObject.Label2, {})
        if part.get("item") in model.get("standing", []):
            apart[link.Name] = "standing"
        elif (part.get("role") == "lining"):
            apart[link.Name] = "slid_in"
        elif part.get("glued"):
            apart[link.Name] = "glued"
    out["fixed"] = check_fixed(links, fixings, pairs, apart=apart)
    # A back without its screws has to come out unfixed : the case no check saw on the back of a rounded end
    bare = check_fixed(links, fixings, pairs, "Vis 4 x 30 du fond")["unfixed"]
    out["proof_backs_bare_unfixed"] = sorted(set(bare) - set(out["fixed"]["unfixed"]))
    out["screws"] = check_screws(model["screws"], shapes)
    # The same check must see a screw too long : every one 25 mm longer, tips must come out
    out["proof_longer_screws_tips_out"] = len(check_screws(model["screws"], shapes, 25.0)["tip_in_air"])
    total = sum(shape.Volume for _, _, shape in shapes)
    out["volume_dm3"] = round(total / 1e6, 2)
    out["verdict"] = verdict(out)
    with open(DOC.replace(".FCStd", "_controle.json"), "w", encoding="utf-8") as report:
        json.dump(out, report, ensure_ascii=False, indent=1)
    print(json.dumps({k: (v if not isinstance(v, list) else (len(v), v[:14])) for k, v in out.items()},
                     ensure_ascii=False))
    print("VERDICT : " + ("OK" if out["verdict"]["ok"] else "ECHEC, " + " ; ".join(out["verdict"]["raisons"])))
    print("FIN")


main()
