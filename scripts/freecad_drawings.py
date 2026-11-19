#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""TechDraw pages of the workpiece sheets the software prints, read off the drawings of scripts/cad_export.ts"""

import os
import re
from xml.sax.saxutils import escape

import FreeCAD as App

A3_W = 420
A3_H = 297
# A spreadsheet cell is sized in pixels at 96 dpi, its text in points
MM_PER_PX = 25.4 / 96
PT_PER_MM = 72 / 25.4
# How far off the outline the sheet sets its overall dimensions, mm of paper
DIM_OFF = 6
UPRIGHT_DIM_OFF = 12
# The lines a long owner or title runs on, left empty when it fits on the one before
CONTINUATION = {"legal_owner_2", "legal_owner_3", "supplementary_title_2"}


def axes(frame, su, sv):
    """Direction and x direction of a view of face A, in the frame of the body : u along x, face A at z = 0"""
    u, v, n = frame["u"], frame["v"], frame["n"]
    c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    # A mirrored frame is built with its width counted from the far edge : v runs along -y in the body
    vy = -1 if sum(c[i] * n[i] for i in range(3)) < 0 else 1
    right = App.Vector(su[0], sv[0] * vy, 0)
    return App.Vector(0, 0, -1), right


def overall_dimensions(doc, page, view, box, upright):
    """The two overall dimensions of the sheet, each between the outermost vertices the projection has, never by index"""
    pts = [(k, round(p.x, 4), round(p.y, 4)) for k, p in enumerate(view.getVisibleVertexes())]
    if (len(pts) < 2):
        return []
    low = min(p[2] for p in pts)
    bottom = [p for p in pts if abs(p[2] - low) < 1e-3]
    left = min(p[1] for p in pts)
    side = [p for p in pts if abs(p[1] - left) < 1e-3]
    made = []
    for kind, ends in (("DistanceX", (min(bottom, key=lambda p: p[1]), max(bottom, key=lambda p: p[1]))),
                       ("DistanceY", (min(side, key=lambda p: p[2]), max(side, key=lambda p: p[2])))):
        if (ends[0][0] == ends[1][0]):
            continue
        dim = doc.addObject("TechDraw::DrawViewDimension", "Cote")
        dim.Type = kind
        dim.References2D = [(view, f"Vertex{ends[0][0]}"), (view, f"Vertex{ends[1][0]}")]
        # As the sheet writes them : a decimal only when there's one
        dim.FormatSpec = "%.1w"
        page.addView(dim)
        # Where the sheet has them, the length under the outline and the width on its left, off the centre of the view
        # A front read standing has its height on the right, clear of the u arrow at its origin (workpiece.ts)
        if (kind == "DistanceX"):
            dim.X, dim.Y = 0, -(box["h"] / 2 + DIM_OFF)
        elif upright:
            dim.X, dim.Y = box["w"] / 2 + UPRIGHT_DIM_OFF, 0
        else:
            dim.X, dim.Y = -(box["w"] / 2 + DIM_OFF), 0
        made.append(dim)
    return made


# Each view of an item, first angle, in the axes of the document (x along the wall, y towards it, z up) : the
# direction it's seen from, then the way the sheet's right runs. The left view has the front of the item on its right
ITEM_AXES = {"front": ((0, -1, 0), (1, 0, 0)), "top": ((0, 0, 1), (1, 0, 0)), "left": ((-1, 0, 0), (0, -1, 0))}


def boards_of(sub, nested):
    out = []
    for o in sub.Group:
        if (o.TypeId == "App::Link"):
            out.append(o)
        elif (nested and o.TypeId == "Assembly::AssemblyObject" and o.Name.startswith("Sous_ensemble")):
            out.extend(boards_of(o, True))
    return out


def item_view(doc, page, spec, assemblies):
    """An item whole, or its own boards alone without the fronts built on the bench, where the sheet has it"""
    sub = assemblies[spec["item"]]
    # TechDraw projects no assembly given whole : its links are, down into what was built on the bench, all but the
    # bought hardware the sheet doesn't draw on these views
    source = boards_of(sub, spec["whole"])
    view = doc.addObject("TechDraw::DrawViewPart", "Vue")
    view.Label = f"{sub.Label}, {spec['view']}{'' if spec['whole'] else ', façades déposées'}"
    page.addView(view)
    view.Source = source
    direction, right = ITEM_AXES[spec["view"]]
    view.Direction, view.XDirection = App.Vector(*direction), App.Vector(*right)
    view.ScaleType = "Custom"
    view.Scale = 1 / spec["scale"]
    box = spec["box"]
    view.X = box["x"] + box["w"] / 2
    view.Y = A3_H - (box["y"] + box["h"] / 2)
    return view


# The items of the back wall seen from the room, each with what was built on its bench : named in the report when
# one has no assembly to project
def wall_view(doc, page, spec, assemblies, missing):
    source = []
    for item in spec["items"]:
        if (item in assemblies):
            source.extend(boards_of(assemblies[item], True))
        else:
            missing.append(item)
    view = doc.addObject("TechDraw::DrawViewPart", "Vue")
    view.Label = f"{page.Label}, mur du fond"
    page.addView(view)
    view.Source = source
    direction, right = ITEM_AXES["front"]
    view.Direction, view.XDirection = App.Vector(*direction), App.Vector(*right)
    view.ScaleType = "Custom"
    view.Scale = 1 / spec["scale"]
    box = spec["box"]
    view.X = box["x"] + box["w"] / 2
    view.Y = A3_H - (box["y"] + box["h"] / 2)
    return view


# FreeCAD's own sections, the sheets drawing them as the parts cut : vertical ones seen from the left with the front
# on the right, horizontal ones from above with the wall at the top, as the sheets read them
SECTION_AXES = {"x": ((-1, 0, 0), (0, -1, 0)), "y": ((0, 0, 1), (1, 0, 0))}
BASE_SCALE = 50
SECTION_SCALE = 20
SECTION_GAP = 6
SECTION_LINE_RUN = 14
# Width of a bold Helvetica letter for its size, on average over a french title
TITLE_EM = 0.6


def make_sections(doc, model, assemblies, group, template_path):
    specs = model.get("sectionCuts", [])
    coupes = [d for d in model.get("drawings", []) if d["title"] == "Coupes"]
    if (not specs or not coupes):
        return []
    made = []
    for suffix, axis in (("bis", "x"), ("ter", "y")):
        planes = [s for s in specs if s["axis"] == axis]
        if (not planes):
            continue
        fields = dict(coupes[0]["fields"])
        fields.update({"supplementary_title_1": "Coupes, vues FreeCAD", "supplementary_title_2":
                       "verticales" if axis == "x" else "horizontales", "scale": f"1:{SECTION_SCALE}",
                       "sheet_number": f"{coupes[0]['index']} {suffix}"})
        template = doc.addObject("TechDraw::DrawSVGTemplate", "Gabarit")
        template.Template = template_path
        page = doc.addObject("TechDraw::DrawPage", "Plan")
        page.Label = f"Planche {coupes[0]['index']} {suffix}, coupes FreeCAD {fields['supplementary_title_2']}"
        page.Template = template
        texts = dict(template.EditableTexts)
        for field in texts:
            texts[field] = fields.get(field, texts[field])
        template.EditableTexts = texts
        group.addObject(page)
        missing = []
        source = []
        for item in planes[0]["items"]:
            if (item in assemblies):
                source.extend(boards_of(assemblies[item], True))
            else:
                missing.append(item)
        base = doc.addObject("TechDraw::DrawViewPart", "Vue")
        base.Label = f"{page.Label}, mur du fond"
        page.addView(base)
        base.Source = source
        base.Direction, base.XDirection = App.Vector(0, -1, 0), App.Vector(1, 0, 0)
        base.ScaleType = "Custom"
        base.Scale = 1 / BASE_SCALE
        doc.recompute()
        direction, right = SECTION_AXES[axis]
        views = [(base, f"Mur du fond, 1:{BASE_SCALE}")]
        for s in planes:
            sec = doc.addObject("TechDraw::DrawViewSection", "Coupe")
            sec.Label = s["title"]
            page.addView(sec)
            sec.BaseView = base
            sec.Source = source
            sec.SectionSymbol = s["letter"]
            sec.SectionNormal = App.Vector(*direction)
            sec.SectionOrigin = App.Vector(*s["origin"])
            sec.Direction, sec.XDirection = App.Vector(*direction), App.Vector(*right)
            sec.ScaleType = "Custom"
            sec.Scale = 1 / SECTION_SCALE
            views.append((sec, s["title"]))
        doc.recompute()
        captions, lost = lay_out(views, model["sectionRoom"])
        overlay(doc, page, model["sectionRoom"]["heading"])
        overlay(doc, page, captions).Label = f"{page.Label}, titres des vues"
        doc.recompute()
        made.append({"page": page.Label, "faults": title_block_faults(template, fields)
                     + [f"{item} : aucun assemblage à projeter" for item in missing]
                     + [f"{title} : ne tient pas sur la planche" for title in lost],
                     "invalid": [o.Label for o in page.Views if "Invalid" in o.State or "Error" in o.State]})
    return made


def extent(view):
    """Width and height of a computed view on the paper, and how far its middle sits off the point it's placed by"""
    boxes = [e.BoundBox for e in view.getVisibleEdges()]
    x0, x1 = min(b.XMin for b in boxes), max(b.XMax for b in boxes)
    y0, y1 = min(b.YMin for b in boxes), max(b.YMax for b in boxes)
    return x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2


def lay_out(views, room):
    """Each view in the first place free from the top left, its title over it, as sections.ts lays its sheets out"""
    taken = []
    texts = []
    lost = []
    size = room["titleSize"]
    for k, (view, title) in enumerate(views):
        w, h, cx, cy = extent(view)
        # The lines of the cuts run past the base view, their letters on their ends
        pad = SECTION_LINE_RUN if k == 0 else 0
        slot_w = max(w + 2 * pad, TITLE_EM * size * len(title)) + SECTION_GAP
        slot_h = h + 2 * pad + size + 2 + SECTION_GAP
        spot = None
        y = room["top"]
        while (spot is None and y + slot_h <= room["bottom"]):
            x = room["left"]
            while (spot is None and x + slot_w <= room["right"]):
                over_block = x + slot_w > room["blockLeft"] and y + slot_h > room["blockTop"]
                if (not over_block and not any(x < tx + tw and tx < x + slot_w and y < ty + th and ty < y + slot_h
                                               for tx, ty, tw, th in taken)):
                    spot = (x, y)
                x += 2
            y += 2
        if (spot is None):
            lost.append(title)
            continue
        x, y = spot
        taken.append((x, y, slot_w, slot_h))
        texts.append((x, y + size, title))
        # The page counts up from its foot, the edges of a view up from its own middle
        view.X = x + pad + w / 2 - cx
        view.Y = A3_H - (y + size + 2 + pad + h / 2) - cy
    body = "\n".join(f'<text x="{x:.2f}" y="{y:.2f}" font-family="Helvetica, Arial, sans-serif" font-size="{size}" '
                     f'font-weight="bold">{escape(t)}</text>' for x, y, t in texts)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {A3_W} {A3_H}" width="{A3_W}mm" '
           f'height="{A3_H}mm">\n{body}\n</svg>\n')
    return svg, lost


# One column of the table of holes, the same lines as the sheet, its top left where the sheet have it
def table(doc, page, column, k):
    sheet = doc.addObject("Spreadsheet::Sheet", "Usinages")
    sheet.Label = f"{page.Label}, usinages {k + 1}"
    lines = [column["head"]] + column["lines"]
    for r, cells in enumerate(lines):
        # A line of one cell is a note running across the columns
        for c, text in enumerate(cells):
            # A leading quote keeps 37 and 9,5 as text, the way the sheet prints them
            sheet.set(f"{chr(65 + c)}{r + 1}", "'" + text)
        sheet.setRowHeight(str(r + 1), round(column["row"] / MM_PER_PX))
    # The row as FreeCAD draws it, a whole number of pixels : 3.70 for 3.6, 2 mm off over 40 lines
    row = round(column["row"] / MM_PER_PX) * MM_PER_PX
    for c, width in enumerate(column["widths"]):
        sheet.setColumnWidth(chr(65 + c), round(width / MM_PER_PX))
    view = doc.addObject("TechDraw::DrawViewSpreadsheet", "Tableau")
    view.Source = sheet
    view.CellEnd = f"{chr(64 + len(column['widths']))}{len(lines)}"
    # TechDraw reads its text size in points : the 2.4 mm of the sheet
    view.TextSize = 2.4 * PT_PER_MM
    # The sheet draws no grid, only the thinnest one TechDraw allows
    view.LineWidth = 0.05
    page.addView(view)
    # Its centre where the sheet has the middle of the column
    view.X = column["x"] + sum(column["widths"]) / 2
    view.Y = A3_H - (column["top"] - column["row"] + len(lines) * row / 2)
    return view


# What the sheet writes and draws over its views, the whole page at scale 1 on its centre : the sheet's own font
# and place, a TechDraw annotation sized its own way never matched them
def overlay(doc, page, svg):
    s = doc.addObject("TechDraw::DrawViewSymbol", "Annotations")
    s.Label = f"{page.Label}, annotations"
    s.Symbol = svg
    page.addView(s)
    s.Scale = 1
    s.X, s.Y = A3_W / 2, A3_H / 2
    return s


# What the block of a page says otherwise than the sheet, and what it leave empty
def title_block_faults(template, fields):
    faults = []
    texts = dict(template.EditableTexts)
    for name, said in texts.items():
        if (name not in fields):
            faults.append(f"{name} : absent de la planche, reste '{said}'")
        elif (said != fields[name]):
            faults.append(f"{name} : '{said}' au lieu de '{fields[name]}'")
        elif (said.strip() == "" and name not in CONTINUATION):
            faults.append(f"{name} : vide")
    return faults


def make_drawings(doc, model, bodies):
    """A page for each sheet carrying views, filled title block, views of the bodies, dimensions and tables"""
    wanted = os.environ.get("S32_DRAWINGS", "")
    only = re.compile(wanted) if wanted else None
    parts = {p["id"]: p for p in model["parts"]}
    group = doc.addObject("App::DocumentObjectGroup", "Plans")
    group.Label = "Plans"
    # The frame and the title block of the sheets themselves, written beside the document (sheets.ts, sheetTemplate)
    template_path = os.path.join(os.environ["S32_OUT"], f"{doc.Name}_gabarit.svg")
    with open(template_path, "w", encoding="utf-8") as f:
        f.write(model["template"])
    made = []
    # Each item's own assembly, by the item's id : the PBS gives its code, the assembly carries the code
    codes = {a["item"]: a["code"][:4] for a in model["assemblies"] if not a.get("parent")}
    by_code = {o.Label2: o for o in doc.Objects if o.TypeId == "Assembly::AssemblyObject"
               and o.Name.startswith("Sous_ensemble")}
    assemblies = {item: by_code[code] for item, code in codes.items() if code in by_code}
    for spec in model.get("drawings", []):
        # A run on of a table has no view of its own, still its lines
        # Every sheet of the set : a page of text and tables carries only its overlay
        if (not (spec["views"] or spec["tables"] or spec.get("items") or spec.get("overlay"))
                or (only is not None and not only.search(spec["title"]))):
            continue
        template = doc.addObject("TechDraw::DrawSVGTemplate", "Gabarit")
        template.Template = template_path
        page = doc.addObject("TechDraw::DrawPage", "Plan")
        page.Label = f"Planche {spec['index']}, {spec['title']}"
        page.Template = template
        texts = dict(template.EditableTexts)
        for field in texts:
            texts[field] = spec["fields"].get(field, texts[field])
        template.EditableTexts = texts
        group.addObject(page)
        for v in spec["views"]:
            p = parts[v["part"]]
            view = doc.addObject("TechDraw::DrawViewPart", "Vue")
            view.Label = f"{p['code']} {p['label']}, face A"
            page.addView(view)
            view.Source = bodies[v["part"]]
            view.Direction, view.XDirection = axes(p["frame"], v["su"], v["sv"])
            view.ScaleType = "Custom"
            view.Scale = 1 / v["scale"]
            box = v["box"]
            view.X = box["x"] + box["w"] / 2
            view.Y = A3_H - (box["y"] + box["h"] / 2)
            doc.recompute()
            # u up the sheet : a front drawn standing
            overall_dimensions(doc, page, view, box, v["su"][1] != 0)
        missing = []
        for v in spec.get("items", []):
            if (v["item"] in assemblies):
                item_view(doc, page, v, assemblies)
            elif (v["item"] not in missing):
                missing.append(v["item"])
        for w in spec.get("walls", []):
            wall_view(doc, page, w, assemblies, missing)
        for k, column in enumerate(spec["tables"]):
            table(doc, page, column, k)
        if (spec.get("overlay")):
            overlay(doc, page, spec["overlay"])
        doc.recompute()
        made.append({"page": page.Label, "faults": title_block_faults(template, spec["fields"])
                     + [f"{item} : aucun assemblage à projeter" for item in missing],
                     "invalid": [o.Label for o in page.Views if "Invalid" in o.State or "Error" in o.State]})
    # Its own sections beside the sheets, unless a filter asks for other pages only
    if (only is None or only.search("Coupes FreeCAD")):
        made.extend(make_sections(doc, model, assemblies, group, template_path))
    return made
