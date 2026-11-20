#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Builds a FreeCAD document and a STEP file from the JSON that scripts/cad_export.ts writes, run in FreeCADCmd"""

import json
import math
import os
import re
import sys
import time
import uuid

import FreeCAD as App
import Import
import Materials
import Part
import Sketcher

from JointObject import GroundedJoint, Joint

# Run by exec, the script has no __file__ : the folder of its neighbours comes from the launcher
sys.path.insert(0, os.environ.get("S32_SCRIPTS", os.getcwd()))
from stay_joints import stay_joints

SOURCE = os.environ["S32_JSON"]
OUT = os.environ["S32_OUT"]
TOL = 1e-6
ASSEMBLY = "Assembly::AssemblyObject"
# A pocket that narrows going in : the sign FreeCAD 1.1 reads, proved in the check of the volume taken
TAPER_NARROWING = -45
UUID_ROOT = uuid.UUID("5b0a9f1e-0c11-4c32-8a3e-3f2d9b7f3201")
DENSITY_MODEL = "454661e5-265b-4320-8e6f-fcf6223ac3af"
ELASTIC_MODEL = "f6f9e48c-b116-4e82-ad7f-3659a9219c50"


def vec(v):
    return App.Vector(v[0], v[1], v[2])


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def write_materials(model, folder):
    """A card per board material, its figures from the same sourced data as the software, in a library of its own"""
    os.makedirs(folder, exist_ok=True)
    cards = {}
    for m in model["materials"]:
        uid = str(uuid.uuid5(UUID_ROOT, m["id"]))
        with open(os.path.join(folder, f"{m['label']}.FCMat"), "w", encoding="utf-8") as f:
            f.write("---\nGeneral:\n"
                    f"  UUID: \"{uid}\"\n"
                    "  Author: \"systeme-32\"\n"
                    f"  Name: \"{m['label']}\"\n"
                    f"  Description: \"{m['source']}\"\n"
                    "Models:\n"
                    "  Density:\n"
                    f"    UUID: '{DENSITY_MODEL}'\n"
                    f"    Density: \"{m['density']} kg/m^3\"\n"
                    "  IsotropicLinearElastic:\n"
                    f"    UUID: '{ELASTIC_MODEL}'\n"
                    f"    YoungsModulus: \"{m['modulus']} MPa\"\n")
        cards[m["id"]] = uid
    prefs = App.ParamGet("User parameter:BaseApp/Preferences/Mod/Material/Resources/Modules/systeme-32")
    prefs.SetString("ModuleDir", folder)
    prefs.SetBool("ModuleReadOnly", False)
    manager = Materials.MaterialManager()
    manager.refresh()
    return {k: manager.getMaterial(v) for k, v in cards.items()}


def make_sheet(doc, model):
    """Every part size in one readable sheet, the sketches and pads read theirs from it"""
    sheet = doc.addObject("Spreadsheet::Sheet", "Cotes")
    sheet.set("A1", model["name"])
    sheet.setStyle("A1", "bold")
    sheet.set("A2", "Modifier une valeur ici recalcule la pièce. Fichier généré par systeme-32.")
    for col, title in zip("ABCDEF", ("Grandeur", "Valeur", "Unité", "Type", "Explication, source",
                                     "Inchangées jusqu'ici")):
        sheet.set(f"{col}4", title)
        sheet.setStyle(f"{col}4", "bold")
    sheet.setColumnWidth("A", 330)
    sheet.setColumnWidth("E", 330)
    row = 5
    last = None
    aliases = {}
    # 1 while every size down to this row is the one it was built with, multiplied down the column : any size moved
    # turns the results of a simulation or of a Ritz plate stale, a weighed sum let 2 moves cancel out
    running = None
    # The code of the item : a part may be coded after the drawer it's built into, #130
    item_code = {a["item"]: a["code"][:4] for a in model["assemblies"] if not a.get("parent")}
    for k, p in enumerate(model["parts"]):
        if (p["item"] != last):
            last = p["item"]
            row += 1
            # The section title reads the name of the item, the id only tells 2 of one name apart
            sheet.set(f"A{row}", f"{item_code.get(last, p['code'][:4])} {p.get('itemName', last)}")
            sheet.setStyle(f"A{row}", "bold")
            row += 1
        name = f"{p['code']} {p['label']}".strip()
        for key, word, value in (("L", "longueur", p["length"]), ("W", "largeur", p["width"]),
                                 ("T", "épaisseur", p["thickness"])):
            alias = f"p{k}_{key}"
            sheet.set(f"A{row}", f"{name}, {word}")
            # Full precision : the notes compare their linked sizes to the software's to 1e-9
            sheet.set(f"B{row}", repr(float(value)))
            sheet.setAlias(f"B{row}", alias)
            sheet.set(f"C{row}", "mm")
            sheet.set(f"D{row}", "saisie")
            sheet.set(f"E{row}", f"{p['decor']}, plan {p['code']}")
            flag = unchanged(f"B{row}", float(value))
            sheet.set(f"F{row}", f"={flag}" if running is None else f"={running} * {flag}")
            running = f"F{row}"
            aliases[(k, key)] = alias
            row += 1
    if running is not None:
        sheet.setAlias(running, "cotes_inchangees")
    sheet.recompute()
    return aliases


GAMME_COLUMNS = ("N°", "N° PBS", "Numéro de série", "Nombre de pièces", "Type d'assemblage", "Opération", "Outillage",
                 "Temps", "Sécurité", "Commentaire", "Direction", "Position du meuble")
GAMME_LETTERS = "ABCDEFGHIJKL"


def make_gamme(doc, model):
    """The assembly sequence the export worked out, as the Cairn notebook lays it : no cell left empty"""
    tables = model.get("gamme")
    if not tables:
        return 0
    sheet = doc.addObject("Spreadsheet::Sheet", "Gamme")
    sheet.Label = "Gamme de montage"
    text = lambda cell, value: sheet.set(cell, "'" + str(value))
    header = (("Nom du produit", model["name"]), ("Date", time.strftime("%d/%m/%Y")), ("Numéro de version", "Indice A"),
              ("Gamme adaptée", "N/A"), ("Temps d'assemblage", "N/A"))
    for k, (title, value) in enumerate(header):
        text(f"A{k + 1}", title)
        sheet.setStyle(f"A{k + 1}", "bold")
        text(f"B{k + 1}", value)
    sheet.set("A7", "'Direction : le mouvement de la pièce quand elle se pose, axes du document (x le long du mur, y vers lui, "
                    "z vers le haut). Fichier généré par systeme-32.")
    row = 9
    steps = 0
    for t in tables:
        text(f"A{row}", "N° PBS de l'assemblage")
        sheet.setStyle(f"A{row}", "bold")
        text(f"B{row}", t["code"])
        sheet.setStyle(f"B{row}", "bold")
        # What it builds, beside its number : a step placing it whole reads it
        text(f"C{row}", t.get("name", ""))
        sheet.setStyle(f"C{row}", "bold")
        row += 1
        for col, title in zip(GAMME_LETTERS, GAMME_COLUMNS):
            text(f"{col}{row}", title)
            sheet.setStyle(f"{col}{row}", "bold")
        row += 1
        for n, r in enumerate(t["rows"]):
            values = (n + 1, "\n".join(r["pbs"]), "N/A", r["count"], r["type"], r["operation"], r["tool"], "N/A", "N/A",
                      r["comment"], r["direction"], r.get("position", "Debout"))
            for col, value in zip(GAMME_LETTERS, values):
                if isinstance(value, int):
                    sheet.set(f"{col}{row}", str(value))
                else:
                    text(f"{col}{row}", value)
            row += 1
            steps += 1
        row += 1
    for col, width in zip(GAMME_LETTERS, (150, 330, 110, 110, 190, 480, 130, 60, 70, 300, 80, 170)):
        sheet.setColumnWidth(col, width)
    sheet.recompute()
    return steps


def is_plain_rectangle(p):
    seg = p["outline"]["segments"]
    return p["outline"]["start"] == [0, 0] and len(seg) == 4 and all(s["kind"] == "line" for s in seg)


def add_outline(sketch, outline, place):
    """Lines and arcs of an outline, a point mapped by place, a sketch geometry count returned"""
    previous = outline["start"]
    added = 0
    for segment in outline["segments"]:
        start_point = place(previous[0], previous[1])
        end_point = place(segment["x"], segment["y"])
        # A segment of no length, harmless in the outline of a part, a sketch refuses it
        if (start_point.distanceToPoint(end_point) < TOL):
            previous = [segment["x"], segment["y"]]
            continue
        if (segment["kind"] == "line"):
            sketch.addGeometry(Part.LineSegment(start_point, end_point), False)
        else:
            centre = place(segment["cx"], segment["cy"])
            radius = math.hypot(start_point.x - centre.x, start_point.y - centre.y)
            # The way round read from the middle of the arc once on the sketch, its plane may be mirrored and a half
            # circle gives nothing from its 2 ends alone
            from_angle = math.atan2(previous[1] - segment["cy"], previous[0] - segment["cx"])
            to_angle = math.atan2(segment["y"] - segment["cy"], segment["x"] - segment["cx"])
            while (segment["ccw"] and to_angle <= from_angle):
                to_angle += 2 * math.pi
            while (not segment["ccw"] and to_angle >= from_angle):
                to_angle -= 2 * math.pi
            middle = (from_angle + to_angle) / 2
            on_arc = place(segment["cx"] + radius * math.cos(middle), segment["cy"] + radius * math.sin(middle))
            ccw_on_sketch = ((on_arc.x - start_point.x) * (end_point.y - on_arc.y)
                             - (on_arc.y - start_point.y) * (end_point.x - on_arc.x) > 0)
            start_angle = math.atan2(start_point.y - centre.y, start_point.x - centre.x)
            end_angle = math.atan2(end_point.y - centre.y, end_point.x - centre.x)
            first, last = (start_angle, end_angle) if ccw_on_sketch else (end_angle, start_angle)
            while (last <= first):
                last += 2 * math.pi
            sketch.addGeometry(Part.ArcOfCircle(Part.Circle(centre, App.Vector(0, 0, 1), radius), first, last), False)
        previous = [segment["x"], segment["y"]]
        added += 1
    return added


def base_sketch(body, p, k, aliases, across):
    """The contour on the XY plane of the body, its size held by the sheet when it is a plain rectangle"""
    xy = next(f for f in body.Origin.OriginFeatures if f.Role == "XY_Plane")
    sk = body.newObject("Sketcher::SketchObject", "Contour")
    sk.AttachmentSupport = (xy, [""])
    sk.MapMode = "FlatFace"
    if not is_plain_rectangle(p):
        # Cut to the outline its banding leaves, its bent banding a body of its own (curved_band)
        add_outline(sk, p.get("bandInner") or p["outline"], lambda u, v: App.Vector(u, across(v), 0))
    else:
        add_rect(sk, App.Vector(0, 0, 0), App.Vector(p["length"], p["width"], 0))
        sk.addConstraint([Sketcher.Constraint("Coincident", i, 2, (i + 1) % 4, 1) for i in range(4)])
        sk.addConstraint([Sketcher.Constraint("Coincident", 0, 1, -1, 1), Sketcher.Constraint("Horizontal", 0),
                          Sketcher.Constraint("Vertical", 1), Sketcher.Constraint("Horizontal", 2),
                          Sketcher.Constraint("Vertical", 3)])
        lg = sk.addConstraint(Sketcher.Constraint("DistanceX", 0, 1, 0, 2, p["length"]))
        wd = sk.addConstraint(Sketcher.Constraint("DistanceY", 1, 1, 1, 2, p["width"]))
        # Whole words : the expression parser reads a bare W as the watt and L as the litre
        sk.renameConstraint(lg, "Longueur")
        sk.renameConstraint(wd, "Largeur")
        sk.setExpression("Constraints.Longueur", f"Cotes.{aliases[(k, 'L')]}")
        sk.setExpression("Constraints.Largeur", f"Cotes.{aliases[(k, 'W')]}")
    sk.Visibility = False
    return sk


def face_at(shape, axis, value):
    """The largest flat face lying in that plane of the body, its number as FreeCAD names it"""
    best, area = None, -1.0
    for i, f in enumerate(shape.Faces):
        if (f.Surface.TypeId != "Part::GeomPlane"):
            continue
        bb = f.BoundBox 
        lo, hi = {"x": (bb.XMin, bb.XMax), "y": (bb.YMin, bb.YMax), "z": (bb.ZMin, bb.ZMax)}[axis]
        if (abs(lo - value) < 1e-4 and abs(hi - value) < 1e-4 and f.Area > area):
            best, area = i + 1, f.Area
    return best


def sketch_on(body, tip, axis, value, name):
    """A sketch on a face of the solid so far, as a hand would draw it, the transform of its points returned"""
    face = face_at(tip.Shape, axis, value)
    if face is None:
        raise RuntimeError(f"pas de face {axis} = {value}")
    sk = body.newObject("Sketcher::SketchObject", name)
    sk.AttachmentSupport = (tip, [f"Face{face}"])
    sk.MapMode = "FlatFace"
    sk.recompute()
    inverse = sk.Placement.inverse()
    sk.Visibility = False
    return sk, lambda x, y, z: inverse.multVec(App.Vector(x, y, z))


def pocket(body, sk, name, depth, thickness, through=False):
    pk = body.newObject("PartDesign::Pocket", name)
    pk.Profile = sk
    if (through or depth >= thickness - TOL):
        pk.Type = "ThroughAll"
    else:
        pk.Length = depth
    pk.recompute()
    return pk


def add_circles(sk, points, diameter):
    """Circles fixed by their centre and diameter, the sketch fully constrained"""
    first = sk.GeometryCount
    sk.addGeometry([Part.Circle(p, App.Vector(0, 0, 1), diameter / 2) for p in points], False)
    cons = []
    for i, q in enumerate(points):
        g = first + i
        cons.append(Sketcher.Constraint("DistanceX", -1, 1, g, 3, q.x))
        cons.append(Sketcher.Constraint("DistanceY", -1, 1, g, 3, q.y))
        cons.append(Sketcher.Constraint("Diameter", g, diameter))
    sk.addConstraint(cons)


def add_rect(sk, a, b):
    """A rectangle from one corner to the other"""
    (x0, x1), (y0, y1) = sorted((a.x, b.x)), sorted((a.y, b.y))
    pts = [App.Vector(x0, y0, 0), App.Vector(x1, y0, 0), App.Vector(x1, y1, 0), App.Vector(x0, y1, 0)]
    for i in range(4):
        sk.addGeometry(Part.LineSegment(pts[i], pts[(i + 1) % 4]), False)


def machine(body, tip, part, across):
    """Holes grouped by face, diameter and depth, then cutouts, grooves and edge pockets"""
    thickness = part["thickness"]
    length = part["length"]
    width = part["width"]
    z_of = {"A": 0.0, "B": thickness}

    def plane(face):
        return {"A": ("z", 0.0), "B": ("z", thickness), "u0": ("x", 0.0), "u1": ("x", length),
                "v0": ("y", across(0.0)), "v1": ("y", across(width))}[face]

    # One pocket for each use : its label says what its holes hold, a tool wouldn't tell a dowel from a shelf pin
    groups = {}
    for hole in part["holes"]:
        groups.setdefault((hole["face"], hole["diameter"], hole["depth"], hole["label"].split(" (")[0]), []).append(hole)
    drilled = 0
    for (face, diameter, depth, use), holes in sorted(groups.items(), key=lambda kv: str(kv[0])):
        axis, value = plane(face)
        drilled += 1
        sketch, to = sketch_on(body, tip, axis, value, f"Percages_{drilled}")
        points = []
        for hole in holes:
            if face in ("A", "B"):
                points.append(to(hole["u"], across(hole["v"]), z_of[face]))
            else:
                # Its height in the thickness of the board, the middle when the part said none
                in_thickness = hole["w"] if hole.get("w") is not None else thickness / 2
                u = 0.0 if face == "u0" else length if face == "u1" else hole["u"]
                v = 0.0 if face == "v0" else width if face == "v1" else hole["v"]
                points.append(to(u, across(v), in_thickness))
        add_circles(sketch, points, diameter)
        sketch.recompute()
        tip = pocket(body, sketch, f"D{diameter}x{depth}_{face}", depth, 1e9)
        tip.Label = use
        # The seat of a head on the wood, a cone of 90 degrees from the face : a tool bevel, no separate piece
        sink = holes[0].get("countersink")
        if sink:
            sketch, to = sketch_on(body, tip, axis, value, f"Fraisages_{drilled}")
            add_circles(sketch, points, sink)
            sketch.recompute()
            cone = pocket(body, sketch, f"Fraisage_{drilled}", (sink - diameter) / 2, 1e9)
            cone.TaperAngle = TAPER_NARROWING
            cone.recompute()
            cone.Label = f"Fraisage, {use}"
            tip = cone
    for i, cutout in enumerate(part["cutouts"]):
        sketch, to = sketch_on(body, tip, "z", 0.0, f"Decoupe_{i + 1}")
        add_outline(sketch, cutout, lambda u, v: to(u, across(v), 0.0))
        sketch.recompute()
        tip = pocket(body, sketch, f"Decoupe_{i + 1}", 0, 0, True)
    for i, groove in enumerate(part["grooves"]):
        face_z = z_of[groove["face"]]
        sketch, to = sketch_on(body, tip, "z", face_z, f"Rainure_{i + 1}")
        half = groove["width"] / 2
        if (groove["along"] == "u"):
            corner = to(groove["from"], across(groove["at"] - half), face_z)
            opposite = to(groove["to"], across(groove["at"] + half), face_z)
        else:
            corner = to(groove["at"] - half, across(groove["from"]), face_z)
            opposite = to(groove["at"] + half, across(groove["to"]), face_z)
        add_rect(sketch, corner, opposite)
        sketch.recompute()
        tip = pocket(body, sketch, f"Rainure_{i + 1}", groove["depth"], 1e9)
    for i, notch in enumerate(part["pockets"]):
        axis, value = plane(notch["edge"])
        sketch, to = sketch_on(body, tip, axis, value, f"Entaille_{i + 1}")
        lowest, highest = notch["w"] - notch["across"] / 2, notch["w"] + notch["across"] / 2
        half = notch["length"] / 2
        if notch["edge"] in ("v0", "v1"):
            corner, opposite = to(notch["at"] - half, value, lowest), to(notch["at"] + half, value, highest)
        else:
            corner = to(value, across(notch["at"] - half), lowest)
            opposite = to(value, across(notch["at"] + half), highest)
        add_rect(sketch, corner, opposite)
        sketch.recompute()
        tip = pocket(body, sketch, f"Entaille_{i + 1}", notch["depth"], 1e9)
    return tip


# The names the cut list gives the edges : L1 and L2 the long sides, l1 and l2 the ends
EDGE_NAME = {"v0": "L1", "v1": "L2", "u0": "l1", "u1": "l2"}


def band_strips(doc, body, tip, p, across, cards):
    """Each banded edge : a strip of its thickness taken off the board, a body of its own in its place. The board
    keeps its frame and the holes measured from the finished edge, as the workshop drills after banding"""
    L, W, T = p["length"], p["width"], p["thickness"]
    bands = []
    for band in p.get("bands", []):
        e, t = band["edge"], band["thickness"]
        # Its rectangle in the frame of the board : the ends take the full width, the sides run between them
        if e in ("u0", "u1"):
            u0 = 0.0 if e == "u0" else L - t
            v0, v1, length = 0.0, W, t 
        else:
            ends = [x["edge"] for x in p["bands"] if x["edge"] in ("u0", "u1")]
            u0 = t if "u0" in ends else 0.0
            length = L - u0 - (t if "u1" in ends else 0.0)
            v0, v1 = (0.0, t) if e == "v0" else (W - t, W)
        y0 = min(across(v0), across(v1))
        at = App.Placement(App.Vector(u0, y0, 0), App.Rotation())
        cut = body.newObject("PartDesign::SubtractiveBox", f"Chant_{EDGE_NAME[e]}")
        cut.Length, cut.Width, cut.Height = length, v1 - v0, T
        cut.Placement = at
        cut.recompute()
        tip = cut
        strip = doc.addObject("PartDesign::Body", "Chant")
        strip.Label = f"{p['code']} {p['label']}, chant {EDGE_NAME[e]}".strip()
        strip.Label2 = f"{p['id']}#chant-{e}"
        box = strip.newObject("PartDesign::AdditiveBox", "Bande")
        box.Length, box.Width, box.Height = length, v1 - v0, T
        box.Placement = at
        box.recompute()
        strip.Tip = box
        strip.Origin.Visibility = False
        strip.Visibility = False
        if p["material"] in cards:
            strip.ShapeMaterial = cards[p["material"]]
        bands.append(strip)
    return tip, bands


def curved_band(doc, p, across, cards):
    """The banding of a board of another outline : its finished outline padded, the outline under the banding pocketed
    through it, what stays the strip along its banded segments, arcs included"""
    if not p.get("bandInner"):
        return []
    strip = doc.addObject("PartDesign::Body", "Chant")
    strip.Label = f"{p['code']} {p['label']}, chant cintré".strip()
    strip.Label2 = f"{p['id']}#chant-cintre"
    xy = next(f for f in strip.Origin.OriginFeatures if f.Role == "XY_Plane")
    flip = lambda u, v: App.Vector(u, across(v), 0)
    outer = strip.newObject("Sketcher::SketchObject", "Contour_fini")
    outer.AttachmentSupport = (xy, [""])
    outer.MapMode = "FlatFace"
    add_outline(outer, p["outline"], flip)
    pad = strip.newObject("PartDesign::Pad", "Bande")
    pad.Profile = outer
    pad.Length = p["thickness"]
    inner = strip.newObject("Sketcher::SketchObject", "Contour_sous_chant")
    inner.AttachmentSupport = (xy, [""])
    inner.MapMode = "FlatFace"
    add_outline(inner, p["bandInner"], flip)
    hole = strip.newObject("PartDesign::Pocket", "Evidement")
    hole.Profile = inner
    hole.Type = "ThroughAll"
    hole.SideType = "Symmetric"
    strip.recompute()
    strip.Tip = hole
    for feature in strip.Group:
        feature.Visibility = feature.Name == hole.Name
    strip.Origin.Visibility = False
    strip.Visibility = False
    if p["material"] in cards:
        strip.ShapeMaterial = cards[p["material"]]
    return [strip]


def build_part(doc, p, k, aliases, cards):
    frame = p["frame"]
    u, v, n, o = frame["u"], frame["v"], frame["n"], frame["o"]
    # The frame of a right side is mirrored, no rotation can place it : its width is then counted from the far edge
    # the board still growing along its normal. A pad reversed for it never came back from a recompute with a GUI
    mirrored = dot(cross(u, v), n) < 0
    W = p["width"]

    def across(value):
        return W - value if mirrored else value

    body = doc.addObject("PartDesign::Body", "Piece")
    body.Label = f"{p['code']} {p['label']}".strip()
    body.Label2 = p["id"]
    sk = base_sketch(body, p, k, aliases, across)
    pad = body.newObject("PartDesign::Pad", "Panneau")
    pad.Profile = sk
    pad.Length = p["thickness"]
    pad.setExpression("Length", f"Cotes.{aliases[(k, 'T')]}")
    sk.recompute()
    pad.recompute()
    tip = machine(body, pad, p, across)
    tip, bands = band_strips(doc, body, tip, p, across, cards)
    bands += curved_band(doc, p, across, cards)
    body.Tip = tip
    # Shown once only, by its link in the assembly : with every feature visible a GUI draws each of them, and opening
    # the document takes minutes per part
    for feature in body.Group:
        # Its tip stays visible : a body with none has nothing to give the link that shows it
        feature.Visibility = feature.Name == tip.Name
    body.Origin.Visibility = False
    body.Visibility = False
    if p["material"] in cards:
        body.ShapeMaterial = cards[p["material"]]
    s = -1 if mirrored else 1
    y = [s * c for c in v]
    origin = [o[i] + (W * v[i] if mirrored else 0) for i in range(3)]
    m = App.Matrix(u[0], y[0], n[0], origin[0],
                   u[1], y[1], n[1], origin[1],
                   u[2], y[2], n[2], origin[2],
                   0, 0, 0, 1)
    # The software has its height along y and FreeCAD along z : the room turned up, x along the wall and z over the floor
    placement = App.Placement(App.Vector(0, 0, 0), App.Rotation(App.Vector(1, 0, 0), 90)).multiply(App.Placement(m))
    return body, placement, bands


def make_assembly(doc, built, model):
    """The assembly of the PBS : one under the piece for each item, one inside its item for each thing built on the bench,
    each with its boards fixed to its first and its hardware apart"""
    root = doc.addObject(ASSEMBLY, "Global")
    root.Label = f"#000-000 {model['name']}"
    root.Visibility = True
    # By the code : 2 items of one name, the wall shelves of the TV wall, keep 2 codes
    info = {a["code"][:4]: a for a in model["assemblies"]}
    subs = {}
    hardware = {}
    by_code = {}
    for body, placement, code in built:
        by_code.setdefault(code, []).append((body, placement))
    # The items first, each sub-assembly then goes inside the item it's fitted to
    order = ([c for c, a in info.items() if not a.get("parent")]
             + [c for c, a in info.items() if a.get("parent")])
    for code in order:
        a = info[code]
        boards = by_code.get(code, [])
        if not boards:
            continue
        holder = subs[a["parent"][:4]] if a.get("parent") else root
        sub = holder.newObject(ASSEMBLY, "Sous_ensemble")
        sub.Label = f"{a['code']} {a.get('name', code)}"
        sub.Label2 = code
        sub.Visibility = True
        joints = sub.newObject("Assembly::JointGroup", "Liaisons")
        links = []
        for body, placement in boards:
            link = sub.newObject("App::Link", "Lien")
            link.LinkedObject = body
            link.Label = body.Label
            link.Label2 = code
            link.Placement = placement
            # Without a GUI an assembly and its links are born hidden, the document would open empty
            link.Visibility = True
            links.append((link, placement))
        GroundedJoint(joints.newObject("App::FeaturePython", "Ancrage"), links[0][0])
        leader, leader_place = links[0]  
        for link, placement in links[1:]:
            j = joints.newObject("App::FeaturePython", "Liaison")
            Joint(j, 0)
            j.Reference1 = (sub, [f"{leader.Name}.Face1", f"{leader.Name}.Vertex1"])
            j.Reference2 = (sub, [f"{link.Name}.Face1", f"{link.Name}.Vertex1"])
            j.Detach1 = True
            j.Detach2 = True
            # Both coordinate systems on the same point of the room : the joint holds the part where it stands
            j.Placement1 = leader_place.inverse().multiply(placement)
            j.Placement2 = App.Placement()
        bought = sub.newObject(ASSEMBLY, "Quincaillerie")
        bought.Label = f"{a['code']} {a.get('name', code)}, quincaillerie"
        bought.Label2 = code
        bought.Visibility = True
        subs[code] = sub
        hardware[code] = bought
    return root, subs, hardware


def drawn_body(doc, label, plane, points, length, symmetric, holes=(), hole_plane=3, mids=None):
    """What no maker's file gives : a profile padded, its section the only thing it has to say, with its screw holes"""
    mids = mids or {}
    body = doc.addObject("PartDesign::Body", "Article")
    body.Label = label
    sk = body.newObject("Sketcher::SketchObject", "Profil")
    sk.AttachmentSupport = (body.Origin.OriginFeatures[plane], [""])
    sk.MapMode = "FlatFace"   
    if points is None:
        sk.addGeometry(Part.Circle(App.Vector(0, 0, 0), App.Vector(0, 0, 1), length[0]))
        length = length[1]
    else:
        n = len(points)
        for k in range(n):
            a, b = points[k], points[(k + 1) % n]
            # A segment of the section given a middle point is an arc through it
            m = mids.get(str(k))
            if m is None:
                sk.addGeometry(Part.LineSegment(App.Vector(a[0], a[1], 0), App.Vector(b[0], b[1], 0)))
            else:
                sk.addGeometry(Part.ArcOfCircle(App.Vector(a[0], a[1], 0), App.Vector(m[0], m[1], 0),
                                                App.Vector(b[0], b[1], 0)))
    pad = body.newObject("PartDesign::Pad", "Extrusion")
    pad.Profile = sk
    pad.Length = length
    if symmetric:
        pad.SideType = "Symmetric"
    sk.recompute()
    pad.recompute()
    tip = pad
    for k, (a, c, diameter, reach) in enumerate(holes):
        hs = body.newObject("Sketcher::SketchObject", "Trou")
        hs.AttachmentSupport = (body.Origin.OriginFeatures[hole_plane], [""])
        hs.MapMode = "FlatFace"
        hs.addGeometry(Part.Circle(App.Vector(a, c, 0), App.Vector(0, 0, 1), diameter / 2))
        pk = body.newObject("PartDesign::Pocket", f"Trou_{k + 1}")
        pk.Profile = hs
        pk.Length = reach
        pk.SideType = "Symmetric"
        hs.recompute()
        pk.recompute()
        tip = pk
    body.Tip = tip
    for feature in body.Group:
        feature.Visibility = feature.Name == tip.Name
    body.Origin.Visibility = False
    body.Visibility = False
    return body


def round_lip_ends(body, length, lip):
    """Each end of the lip rounded seen from the front, from its bottom up to the sole, cut through the nose and the lip
    alone : the flat front of 145 measured on the bought pull. Cut seen from above it left spikes"""
    # FIXME the corner radius comes from the flat of 145 alone, a profile gauge on the real pull would tell its true arc
    half, front, low, top = length / 2, lip["front"], lip["bottom"], lip["wall"]
    r = min(lip["corner"], top - low)
    sk = body.newObject("Sketcher::SketchObject", "Coins_levre")
    # Seen from the front, x along the pull, y out past the edge, in front of the lip
    sk.AttachmentSupport = (body.Origin.OriginFeatures[3], [""])
    sk.MapMode = "FlatFace"
    sk.AttachmentOffset = App.Placement(App.Vector(0, 0, front + 1), App.Rotation())
    for s in (1, -1):
        c = App.Vector(s * (half - r), low + r, 0)
        start, end = App.Vector(s * (half - r), low, 0), App.Vector(s * half, low + r, 0)
        sk.addGeometry(Part.ArcOfCircle(start, c + App.Vector(s * r * math.sqrt(0.5), -r * math.sqrt(0.5), 0), end))
        around = [end, App.Vector(s * half, top + 1, 0), App.Vector(s * (half + 1), top + 1, 0),
                  App.Vector(s * (half + 1), low - 1, 0), App.Vector(s * (half - r), low - 1, 0), start]
        for a, b in zip(around, around[1:]):
            sk.addGeometry(Part.LineSegment(a, b))
    pk = body.newObject("PartDesign::Pocket", "Coins_arrondis")
    pk.Profile = sk
    # Back through the nose to where it leaves the sole, the sole and the tab behind untouched
    pk.Length = 1 + lip["nose"]
    sk.recompute()
    pk.recompute()
    body.Tip = pk
    for feature in body.Group:
        feature.Visibility = feature.Name == pk.Name


def sink_tab_holes(body, section):
    """The countersink of the 2 screw holes on the back of the tab, a cone of 90 degrees down to the hole of 4.5"""
    wall, r, hole = section["lip"]["wall"], section["sink"], 4.5 / 2
    over = 0.2
    for x in (-section["centres"] / 2, section["centres"] / 2):
        cone = body.newObject("PartDesign::SubtractiveCone", "Fraisure")
        cone.Radius1 = r + over
        cone.Radius2 = hole
        cone.Height = r + over - hole
        cone.Placement = App.Placement(App.Vector(x, section["tab"], -wall - over), App.Rotation())
        cone.recompute()
        body.Tip = cone
    for feature in body.Group:  
        feature.Visibility = feature.Name == body.Tip.Name


def make_models(doc, model, sources):
    """One object for each article, the links place it : a maker's file read as it comes, less the empty solid Häfele adds"""
    group = doc.addObject("App::DocumentObjectGroup", "Modeles_quincaillerie")
    group.Label = "Modèles de quincaillerie"
    out = {}
    missing = []
    for key, m in model["models"].items():
        # The reference first : what the check of the hardware bought reads it by
        named = f"{m['ref']} {m['label']}"
        if "file" in m:
            path = os.path.join(sources, m["file"])
            if not os.path.exists(path):
                missing.append(key)
                continue
            read = Part.read(path)
            o = doc.addObject("Part::Feature", "Article")
            shape = Part.makeCompound([s for s in read.Solids if s.Volume > 1e-6])
            # A file drawn round another origin than the maker's model it stands for : turned into that frame
            if "frame" in m:
                x, y, z, at = (m["frame"][k] for k in ("x", "y", "z", "o"))
                shape.transformShape(App.Matrix(x[0], y[0], z[0], at[0], x[1], y[1], z[1], at[1],
                                                x[2], y[2], z[2], at[2], 0, 0, 0, 1))
            o.Shape = shape
            o.Label = named
            o.Label2 = "quincaillerie"
            o.Visibility = False
        elif "draw" in m:
            # What no maker's file gives and the export defines : its section padded, or a cylinder
            d = m["draw"]
            if "cylinder" in d:
                o = drawn_body(doc, named, 3, None, (d["cylinder"][0], d["cylinder"][1]), False)
            else:
                o = drawn_body(doc, named, 3, [tuple(q) for q in d["section"]], d["length"], False)
            o.Label2 = "quincaillerie"
        elif (key == "DOWEL_8x35"):
            o = drawn_body(doc, named, 3, None, (4.0, model["dowelLength"]), False)
            o.Label2 = "quincaillerie"
        elif (key == "ANTI_TIP_BRACKET"):
            leg, t = 40.0, 2.0
            # One hole in the middle of each leg
            o = drawn_body(doc, named, 3, [(0, 0), (leg, 0), (leg, t), (t, t), (t, leg), (0, leg)], leg, True,
                           [(leg / 2, 0, 5.0, 2 * t + 1)], 4)
            leg_hole = o.newObject("Sketcher::SketchObject", "Trou_jambe")
            leg_hole.AttachmentSupport = (o.Origin.OriginFeatures[5], [""])
            leg_hole.MapMode = "FlatFace"
            leg_hole.addGeometry(Part.Circle(App.Vector(leg / 2, 0, 0), App.Vector(0, 0, 1), 2.5))
            pk = o.newObject("PartDesign::Pocket", "Trou_mur")
            pk.Profile = leg_hole
            pk.Length = 2 * t + 1
            pk.SideType = "Symmetric"
            leg_hole.recompute()
            pk.recompute()
            o.Tip = pk
            for feature in o.Group:
                feature.Visibility = feature.Name == pk.Name
            o.Label2 = "quincaillerie"
        elif (key == "84335807"):
            section = model["sections"][0]
            # Its 2 screw holes in the tab, on the plane of the back of the front
            tab = section["tab"]
            o = drawn_body(doc, named, 5, section["points"], section["length"], True,
                           [(-section["centres"] / 2, tab, 4.5, 4.0), (section["centres"] / 2, tab, 4.5, 4.0)],
                           mids=section["mids"])
            round_lip_ends(o, section["length"], section["lip"])
            sink_tab_holes(o, section)
            o.Label2 = "quincaillerie"
        else:
            missing.append(key)
            continue
        group.addObject(o)
        out[key] = o
    return out, missing


def place_hardware(model, models, hardware):
    """A link at each place of the room, in the assembly of its item"""
    turn = App.Placement(App.Vector(0, 0, 0), App.Rotation(App.Vector(1, 0, 0), 90))
    fallback = next(iter(hardware.values()))
    unrouted = []
    # The 4 articles of each gas stay, by their bought unit : jointed once all are placed
    stays = {}
    for k, i in enumerate(model["instances"]):
        base = models.get(i["model"])
        if base is None:
            continue
        x, y, z, o = i["x"], i["y"], i["z"], i["o"]
        m = App.Matrix(x[0], y[0], z[0], o[0],
                       x[1], y[1], z[1], o[1],
                       x[2], y[2], z[2], o[2],
                       0, 0, 0, 1)
        group = hardware.get(i.get("assembly") or i["item"])
        # Put away in the first group to be drawn all the same, but said in the report
        if group is None:
            unrouted.append(f"{i['model']}, {i['part']}")
            group = fallback
        link = group.newObject("App::Link", "Article")
        link.LinkedObject = base
        link.Label = f"{base.Label} {k + 1}, {i['part']}"
        link.Label2 = i["model"]
        # The 2 halves of a flap hinge, set apart by its settings : one article for the check of what holds what
        if i.get("unit"):
            link.addProperty("App::PropertyString", "Unit", "Article", "The bought article this solid is a piece of")
            link.Unit = i["unit"]
        # The screws it's tightened by, when its file shows them : the film puts a screwdriver on each
        tighten = ((model["models"].get(i["model"]) or {}).get("fixing") or {}).get("tighten") or {}
        if tighten.get("at"):
            link.addProperty("App::PropertyVectorList", "ToolPoints", "Article", "Heads of the screws tightened")
            link.addProperty("App::PropertyVector", "ToolAway", "Article", "Way the tool comes out of them")
            link.ToolPoints = [base.Placement.multVec(App.Vector(*p)) for p in tighten["at"]]
            link.ToolAway = base.Placement.Rotation.multVec(App.Vector(*tighten["away"]))
        link.Placement = turn.multiply(App.Placement(m))
        link.Visibility = True
        if i["model"].startswith("365.01.901."):
            stays.setdefault(i["unit"], (group, {}))[1][i["model"].rsplit(".", 1)[1]] = link
    joint_groups = {}
    for group, parts in stays.values():
        if (len(parts) != 4):
            unrouted.append(f"compas incomplet : {sorted(parts)}")
            continue
        if group.Name not in joint_groups:
            joint_groups[group.Name] = group.newObject("Assembly::JointGroup", "Liaisons")
        stay_joints(group, joint_groups[group.Name], parts["cabinet"], parts["rod"], parts["body"], parts["flap"])
    return unrouted


def report_state(doc, built):
    """What must hold on every generated document : nothing invalid and each body a single solid"""
    bad = [o.Label for o in doc.Objects if "Invalid" in o.State or "Error" in o.State]
    several = [b.Label for b, _, _ in built if len(b.Shape.Solids) != 1]
    return bad, several


# A name of a formula, never the exponent of a figure : the e of 1e-9 follows a digit
CALC_NAME_RE = re.compile(r"(?<![0-9.])[A-Za-z_][A-Za-z0-9_]*")


# A property of a material card, as a plain number in the unit of the notes
CARD_PROPERTY = {"modulus": ("YoungsModulus", "1MPa"), "density": ("Density", "1 (kg/m^3)")}
SIZE_KEY = {"length": "L", "width": "W", "thickness": "T"}


def card_formula(body, prop):
    key, unit = CARD_PROPERTY[prop]
    return f"=parsequant(hiddenref({body.Name}.ShapeMaterial.PhysicalProperties[<<{key}>>])) / {unit}"


# 1 while a cell still holds the figure it had when the sheet was built, 0 once it moved
def unchanged(name, value):
    return f"(abs({name} - {value!r}) <= 1e-9 * (1 + abs({value!r})) ? 1 : 0)"


def make_calc_notes(doc, model, aliases, bodies):
    """Each calculation of the checks : its inputs read off the sizes and the material cards, its steps live formulas"""
    notes = model.get("calcNotes") or []
    if not notes:
        return 0
    sheet = doc.addObject("Spreadsheet::Sheet", "NotesDeCalcul")
    sheet.Label = "Notes de calcul"
    text = lambda cell, value: sheet.set(cell, "'" + str(value))
    text("A1", f"{model['name']} : notes de calcul. Cotes et fiches matériau liées : les changer refait le calcul, "
               "et un résultat de simulation ou de Ritz passe à 'Périmé'.")
    sheet.setStyle("A1", "bold")
    for col, title in zip("ABCDEF", ("Grandeur", "Nom", "Valeur", "Unité", "Formule, lien", "Source")):
        text(f"{col}3", title)
        sheet.setStyle(f"{col}3", "bold")
    index = {p["id"]: k for k, p in enumerate(model["parts"])}

    def linked(link):
        """The formula of a linked input and where it reads, or None : a part with no body, a size with no alias"""
        if "size" in link:
            alias = aliases.get((index.get(link["part"]), SIZE_KEY[link["size"]]))
            return (f"=Cotes.{alias}", f"Cotes.{alias}") if alias else None
        body = bodies.get(link["part"])
        return (card_formula(body, link["property"]), f"fiche matériau de {body.Label}") if body else None
    row = 4
    # The card of every body against the figures it was written with, multiplied down the column : any card changed
    # turns the results stale as a size does, a simulation leaning on every board and not on its own top alone
    with_result = any(value.get("result") for note in notes for value in note["inputs"])
    stock = {m["id"]: m for m in model["materials"]}
    cards_kept = False
    if with_result:
        row += 1
        text(f"A{row}", "Fiches matériau de chaque pièce, pour la péremption des résultats de simulation et de Ritz")
        sheet.setStyle(f"A{row}", "bold")
        row += 1
        running = None
        for p in model["parts"]:
            body = bodies.get(p["id"])
            if (body is None or p["material"] not in stock):
                continue
            m = stock[p["material"]]
            flag = (unchanged(f"({card_formula(body, 'modulus')[1:]})", float(m["modulus"])) + " * "
                    + unchanged(f"({card_formula(body, 'density')[1:]})", float(m["density"])))
            text(f"A{row}", f"{body.Label} ({p['id']}), module {m['modulus']} et masse volumique {m['density']}")
            sheet.set(f"C{row}", f"={flag}" if running is None else f"={running} * {flag}")
            text(f"E{row}", f"fiche matériau de {body.Label} : 1 tant que toutes les fiches jusqu'ici sont inchangées")
            running = f"C{row}"
            row += 1
        if running is not None:
            sheet.setAlias(running, "fiches_inchangees")
            cards_kept = True
    for note in notes:
        prefix = note["number"]
        row += 1
        text(f"A{row}", f"{prefix} {note['title']}")
        sheet.setStyle(f"A{row}", "bold")
        text(f"E{row}", note["method"])
        row += 1
        for hypothesis in note["hypotheses"]:
            text(f"A{row}", f"Hypothèse : {hypothesis}")
            row += 1
        # Each name of the note becomes an alias of its own, the number of the note before it
        local = lambda formula: CALC_NAME_RE.sub(lambda m: f"{prefix}_{m.group(0)}", formula)
        result = any(value.get("result") for value in note["inputs"])
        kept = []
        for value in note["inputs"]:
            name = f"{prefix}_{value['name']}"
            text(f"A{row}", value["label"])
            text(f"B{row}", value["name"])
            made = linked(value["link"]) if value.get("link") else None
            if made:
                sheet.set(f"C{row}", made[0])
                text(f"E{row}", made[1])
            else:
                sheet.set(f"C{row}", repr(value["value"]))
                if value.get("link"):
                    text(f"E{row}", "saisie : pièce sans corps dans ce document, lien impossible")
                elif value.get("result"):
                    text(f"E{row}", "résultat figé, valable tant que la ligne 'Résultat valable' vaut 1")
            sheet.setAlias(f"C{row}", name)
            text(f"D{row}", value["unit"])
            text(f"F{row}", value["source"])
            if (result and not value.get("result")):
                kept.append(unchanged(name, value["value"]))
            row += 1
        if result:
            kept += ["Cotes.cotes_inchangees"] if doc.getObject("Cotes") is not None else []
            kept += ["fiches_inchangees"] if cards_kept else []
            text(f"A{row}", "Résultat valable")
            sheet.set(f"C{row}", "=" + " * ".join(kept))
            sheet.setAlias(f"C{row}", f"{prefix}_valide")
            text(f"E{row}", "1 tant que les entrées, les cotes et les fiches sont celles du calcul")
            row += 1
        for step in note["steps"]:
            text(f"A{row}", step["label"])
            text(f"B{row}", step["name"])
            sheet.set(f"C{row}", "=" + local(step["formula"]))
            sheet.setAlias(f"C{row}", f"{prefix}_{step['name']}")
            text(f"D{row}", step["unit"])
            text(f"E{row}", step["formula"])
            text(f"F{row}", step["source"])
            row += 1
        check = note["check"]
        text(f"A{row}", "Verdict")
        sheet.set(f"C{row}", f"={prefix}_{check['value']} <= {prefix}_{check['limit']} ? 1 : 0")
        sheet.setAlias(f"C{row}", f"{prefix}_verdict")
        text(f"E{row}", f"{check['value']} <= {check['limit']}")
        phrases = note["phrases"]
        said = f"({prefix}_verdict == 1 ? <<{phrases['pass']}>> : <<{phrases['fail']}>>)"
        sheet.set(f"F{row}", f"={prefix}_valide == 1 ? {said} : <<{phrases['stale']}>>" if result else "=" + said)
        sheet.setAlias(f"F{row}", f"{prefix}_phrase")
        row += 1
    for col, width in zip("ABCDEF", (330, 120, 110, 70, 420, 420)):
        sheet.setColumnWidth(col, width)
    sheet.recompute()
    return len(notes)


def main():
    t0 = time.perf_counter()
    # A body and its link share a name : without this FreeCAD numbers one, and Porte 1 reads Porte 001 in the tree
    App.ParamGet("User parameter:BaseApp/Preferences/Document").SetBool("DuplicateLabels", True)
    with open(SOURCE, encoding="utf-8") as f:
        model = json.load(f)
    name = os.path.splitext(os.path.basename(SOURCE))[0]
    os.makedirs(OUT, exist_ok=True)
    cards = write_materials(model, os.path.join(OUT, "materiaux"))
    doc = App.newDocument(name)
    aliases = make_sheet(doc, model)
    built = []
    failed = []
    only = int(os.environ.get("S32_ONLY", "0"))
    for k, p in enumerate(model["parts"]):
        if (only and k >= only):
            break
        try:
            body, placement, bands = build_part(doc, p, k, aliases, cards)
            # In its item, or in the drawer or the door it's built into on the bench
            built.append((body, placement, p["assembly"]))
            # Its edge banding where the board is
            built.extend((strip, placement, p["assembly"]) for strip in bands)
        except Exception as e:
            failed.append(f"{p['code']} {p['label']} : {e}")
    print(f"pieces {len(built)} en {time.perf_counter() - t0:.0f} s, echecs {len(failed)}")
    print("\n".join(failed[:12]))
    doc.recompute()
    root, subs, hardware = make_assembly(doc, built, model)
    models, missing = make_models(doc, model, os.environ["S32_SOURCES"])
    unrouted = place_hardware(model, models, hardware)
    doc.recompute()
    status = [s.solve() for s in subs.values()]
    doc.recompute()
    bad, several = report_state(doc, built)
    moved = 0
    placements = {b.Name: placement for b, placement, _ in built}
    for sub in subs.values():
        for child in sub.Group:
            if (child.TypeId == "App::Link" and not child.Placement.isSame(placements[child.LinkedObject.Name], 1e-6)):
                moved += 1
            # A drawer inside its carcass holds no joint there : the solver of the carcass must leave it where it is
            elif (child.TypeId == ASSEMBLY and not child.Placement.isIdentity()):
                moved += 1
    steps = make_gamme(doc, model)
    # The body of each part by its id : its bands carry #chant- after it
    part_bodies = {b.Label2: b for b, _, _ in built if "#chant-" not in b.Label2}
    notes = make_calc_notes(doc, model, aliases, part_bodies)
    # Each board seen with its edge bands, the finished outline the sheet draw
    bodies = {}
    for b, _, _ in built:
        # An id may hold a # of its own (a drawer behind a flap, #0) : only its bands add #chant-
        bodies.setdefault(b.Label2.split("#chant-")[0], []).append(b)
    # Its neighbour, found once the launcher's folder is on the pathe
    from freecad_drawings import make_drawings
    drawings = make_drawings(doc, model, bodies)
    path = os.path.join(OUT, f"{name}.FCStd")
    doc.saveAs(path)
    strips = sum(1 for b, _, _ in built if "#chant-" in b.Label2)
    report = {"name": model["name"], "parts": len(built) - strips, "edge_bands": strips, "failed": failed,
              "invalid": bad,
              "not_one_solid": several, "drawings": drawings,
              "missing_models": missing, "unrouted": unrouted, "instances": len(model["instances"]),
              "solve": status, "moved_by_solver": moved, "gamme_steps": steps, "calc_notes": notes,
              "left_out": model["left"],
              "seconds": round(time.perf_counter() - t0),
              "volume": sum(b.Shape.Volume for b, _, _ in built)}
    with open(os.path.join(OUT, f"{name}_rapport.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False)[:1800])
    print("FIN")


main()
