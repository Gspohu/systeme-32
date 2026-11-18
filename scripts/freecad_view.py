#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The GUI pass of a generated document : colours, screws of the Fasteners workbench, framed view, saved, then its STEP files"""

import json
import os
import re
import traceback

import FreeCAD as App
import FreeCADGui as Gui
import Import
from PySide import QtCore

SOURCE = os.environ["S32_JSON"]
DOC = os.environ["S32_DOC"]
IMAGE = os.environ["S32_IMAGE"]
OUT = os.environ["S32_STEP_DIR"]
FAILED = IMAGE + ".erreur.txt"
# Started from the command line a macro runs before the event loop : it waits for it
START_MS = 2000
# Zinc plated steel, what the data of the hardware list say the screws are
SCREW_COLOUR = (0.78, 0.79, 0.80, 0.0)
# DIN7505 was added to the workbench for this : chipboard screws, a head of twice their diameter like the Blum 609.1500
SCREW_TYPES = {"countersunk": "DIN7505", "pan": "DIN7996", "metric": "ISO7380-1"}
# DIN7505 starts at 3 : the Ø2.5 of the niche lining is a DIN7997 wood screw, head 4.7 x 1.5 (din7997def.csv)
SMALL_COUNTERSUNK = ("DIN7997", 3.0)
# The text of the dimensions of the sheets, mm (display.ts, dimH)
DIM_TEXT = 2.2


def export_pages(doc):
    """Each TechDraw page as a PDF beside the document, the plans read without opening FreeCAD"""
    import TechDrawGui
    folder = os.path.join(os.path.dirname(DOC), "plans_" + os.path.splitext(os.path.basename(DOC))[0])
    os.makedirs(folder, exist_ok=True)
    written = []
    for page in [o for o in doc.Objects if o.TypeId == "TechDraw::DrawPage"]:
        page.ViewObject.show()
        Gui.updateGui()
        path = os.path.join(folder, file_name(page.Label) + ".pdf")
        TechDrawGui.exportPageAsPdf(page, path)
        written.append(path)
    return written


def screw_type(screw):
    if screw.get("standard"):
        return screw["standard"]
    small, under = SMALL_COUNTERSUNK
    if (screw["kind"] == "countersunk" and screw["diameter"] < under):
        return small
    return SCREW_TYPES[screw["kind"]]
# The extra large washer of the wall screws, ISO 7094:2000 M5 (data/hardware.ts) : 5.5 x 18 x 2 in the workbench table
WASHER = {"type": "ISO7094", "diameter": "M5"}


# Height along y in the software, along z in FreeCAD : the build turned the room up about x
def to_room(q):
    return App.Vector(q[0], -q[2], q[1])


def file_name(text):
    return re.sub(r"[^\w#. -]+", "_", text).strip()[:110]


def make_screw(doc, group, screw):
    import FastenersCmd

    name = f"Vis {screw['diameter']:g} x {screw['length']:g}"
    if (screw["kind"] == "pan"):
        name += " tete cylindrique"
    if screw.get("standard"):
        name += f" {screw['standard']}"
    if (screw["kind"] == "metric"):
        name = f"Vis M{screw['diameter']:g} x {screw['length']:g}, cheville a confirmer"
    o = doc.addObject("Part::FeaturePython", "Modele_vis")
    FastenersCmd.FSScrewObject(o, screw_type(screw), None)
    FastenersCmd.FSViewProviderTree(o.ViewObject)
    # A US wood screw goes by its gauge, #6 , the others by their millimetres
    size = screw.get("size")
    if size is None:
        size = f"M{screw['diameter']:g}" if screw["kind"] == "metric" else f"{screw['diameter']:g} mm"
    o.Diameter = size
    o.Length = "Custom"
    o.LengthCustom = screw["length"]
    o.Label2 = name
    o.recompute()
    o.ViewObject.ShapeColor = SCREW_COLOUR
    o.ViewObject.Visibility = False
    group.addObject(o)
    return name, o


def make_washer(doc, group):
    """The washer of the workbench and its thickness, read off its shape : it lies from its origin upwards"""
    import FastenersCmd

    o = doc.addObject("Part::FeaturePython", "Modele_rondelle")
    FastenersCmd.FSScrewObject(o, WASHER["type"], None)
    FastenersCmd.FSViewProviderTree(o.ViewObject)
    o.Diameter = WASHER["diameter"]
    o.Label2 = f"Rondelle {WASHER['diameter']} {WASHER['type']}"
    o.recompute()
    box = o.Shape.BoundBox
    if (not abs(box.ZMin) <= 1e-6 or not box.ZLength > 0):
        raise RuntimeError(f"rondelle {WASHER['type']} hors de son origine : z de {box.ZMin} à {box.ZMax}")
    o.ViewObject.ShapeColor = SCREW_COLOUR
    o.ViewObject.Visibility = False
    group.addObject(o)
    return o, box.ZLength


def place(parent, base, label, note, origin, out):
    link = parent.newObject("App::Link", "Vis")
    link.LinkedObject = base
    link.Placement = App.Placement(origin, App.Rotation(App.Vector(0, 0, 1), out))
    link.Label = label
    link.Label2 = note
    link.ViewObject.Visibility = True
    return link


def make_screws(doc, model, hardware):
    """One object of the workbench for each size, a link at each place, in the assembly of its item"""
    models = doc.addObject("App::DocumentObjectGroup", "Modeles_visserie")
    models.Label = "Modèles de visserie"
    fallback = next(iter(hardware.values()))
    unrouted = []
    bases = {}
    washer = None
    wrong = []
    washers = 0
    for k, s in enumerate(model["screws"]):
        key = (s["kind"], s["diameter"], s["length"], screw_type(s))
        if key not in bases:
            bases[key] = make_screw(doc, models, s)
        name, base = bases[key]
        # In the hardware of its own assembly : a cup screw goes with the door it hold the hinge in
        parent = hardware.get(s.get("assembly") or s["item"])
        # Put away in the first group to be drawn all the same, but said : it went there quietly
        if parent is None:
            unrouted.append(f"{s['label']}, {s.get('tag', s['part'])}")
            parent = fallback
        out = to_room(s["out"])
        origin = to_room(s["point"])
        if s.get("washer"):
            if washer is None:
                washer = make_washer(doc, models)
            # By the PBS code of the board it sits on : a step of the assembly sequence names it by that
            tag = s.get("tag", s["part"])
            # A Fasteners washer is read by its note : the board alone there made it a board, out of every step
            place(parent, washer[0], f"Rondelle {k + 1}, {tag}", f"Rondelle M5 ISO 7094:2000, {tag}", origin, out)
            washers += 1
            origin = origin + out * washer[1]
        tag = s.get("tag", s["part"])
        link = place(parent, base, f"{name} {k + 1}, {tag}", f"{s['label']}, {tag}", origin, out)
        # Half way down its shank the axis is steel, past its tip it no longer is
        shape = base.Shape.copy()
        shape.Placement = link.Placement
        if (not shape.isInside(origin - out * (s["length"] * 0.5), 1e-6, True) or shape.isInside(origin -
            out * (s["length"] + 1), 1e-6, False)):
            wrong.append(link.Label)
    return {"screws": len(model["screws"]), "washers": washers, "models": {b[0]: b[1].Label for b in bases.values()},
            "valid": all(b[1].Shape.isValid() and len(b[1].Shape.Solids) ==
                         1 for b in bases.values()), "misplaced": wrong, "unrouted": unrouted}


def export_steps(doc, model, root, subs, drawn):
    """A file for each piece and each article, one for each assembly of the PBS, then the whole with its assemblies in it"""
    for folder in ("pieces", "sous_ensembles"):
        os.makedirs(os.path.join(OUT, folder), exist_ok=True)
    seen = set()
    code = {p["id"]: p["code"] for p in model["parts"]}
    written = 0
    for o in doc.Objects:
        if (o.TypeId == "PartDesign::Body" and o.Label2 in code and code[o.Label2] not in seen):
            seen.add(code[o.Label2])
            Import.export([o], os.path.join(OUT, "pieces", file_name(o.Label) + ".step"))
            written += 1
    for key, o in drawn.items():
        Import.export([o], os.path.join(OUT, "pieces", file_name(f"{key} {model['models'][key]['label']}") + ".step"))
        written += 1
    for s in subs:
        Import.export([s], os.path.join(OUT, "sous_ensembles", file_name(s.Label) + ".step"))
    Import.export([root], os.path.join(OUT, file_name(root.Label) + ".step"))
    return written


def frame(view):
    # The view clipped the piece when captured at once : near and far planes settle over a redraw
    view.viewIsometric()
    for _ in range(3):
        view.fitAll()
        Gui.updateGui()
        QtCore.QCoreApplication.processEvents()


def run():
    with open(SOURCE, encoding="utf-8") as f:
        model = json.load(f)
    doc = App.openDocument(DOC)
    Gui.updateGui()
    colours = {p["id"]: p["rgb"] for p in model["parts"]}
    by_label = {f"{m['ref']} {m['label']}": (key, m["rgb"]) for key, m in model["models"].items()}
    root = None
    subs = []
    hardware = {}
    drawn = {}
    for o in doc.Objects:
        vo = o.ViewObject
        if vo is None:
            continue
        if (o.Label2 == "quincaillerie" and o.Label in by_label):
            key, rgb = by_label[o.Label]
            vo.ShapeColor = (rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 0.0)
            # The screw caps cut out of the banding, see-through : the head under them stay visible for the reviews
            if key.startswith("EDGE_CAP"):
                vo.Transparency = 70
            drawn[key] = o
            if (o.TypeId == "PartDesign::Body"):
                o.Tip.ViewObject.Visibility = True
            vo.Visibility = False
        elif (o.TypeId == "PartDesign::Body"):
            # An edge band takes the colour of its board
            rgb = colours.get(o.Label2.split("#chant-")[0])
            if rgb is not None:
                vo.ShapeColor = (rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 0.0)
            # The links of the assembly show it, the body itself stays out of the way, its tip giving them a shape
            o.Tip.ViewObject.Visibility = True
            vo.Visibility = False
        elif (o.TypeId == "TechDraw::DrawViewDimension"):
            # A setting of the view only, set here : the size the sheet writes its dimensions at
            vo.Fontsize = DIM_TEXT
        elif o.TypeId in ("Assembly::AssemblyObject", "App::Link"):
            # What a document saved without a GUI said isn't always what its view providers read on opening
            vo.Visibility = True
            if (o.TypeId == "Assembly::AssemblyObject"):
                if o.Name.startswith("Global"):
                    root = o
                elif o.Name.startswith("Quincaillerie"):
                    hardware[o.Label2] = o
                else:
                    subs.append(o)
    report = make_screws(doc, model, hardware)
    # The capture of essai37 showed a block of another document, open beside the piece and holding the active view
    # TODO which document it was is still unknown, a crash recovery after the SIGILL of essai36 is the likeliest
    Gui.setActiveDocument(doc.Name) 
    Gui.updateGui()
    print('colibri01')
    if (Gui.ActiveDocument.Document is not doc): 
        raise RuntimeError(f"vue active sur {Gui.ActiveDocument.Document.Name}, pas sur {doc.Name}")
    print('COLIBRI00')
    view = Gui.getDocument(doc.Name).ActiveView 
    frame(view)
    view.saveImage(IMAGE, 1600, 1000, "White")
    doc.save()
    report["pages"] = export_pages(doc)
    report["steps_written"] = export_steps(doc, model, root, subs, drawn)
    report["expected_step_solids"] = (len(model["parts"]) + sum(len(p.get("bands", [])) +
                                                                (1 if p.get("bandInner") else 0)
                                                                for p in model["parts"])
                                      + report["screws"] + report["washers"]
                                      + sum(len(drawn[i["model"]].Shape.Solids) for i in model["instances"] if i["model"] in drawn))
    with open(DOC.replace(".FCStd", "_visserie.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    App.closeDocument(doc.Name)


def main():
    with open(FAILED, "w", encoding="utf-8"):
        pass
    try:
        run()
    except Exception:
        with open(FAILED, "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
    Gui.getMainWindow().close()


QtCore.QTimer.singleShot(START_MS, main)
