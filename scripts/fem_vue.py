#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""FreeCAD pass over a run of fem_meuble.py : results, outlines, load zones, fasteners, the sheet of every figure"""

import json
import os
import re
import traceback

import FreeCAD as App
import FreeCADGui as Gui
import Part
from PySide import QtCore

# The folder of a run and its plain name, checked before anything is read or writen there
FOLDER = os.path.realpath(os.environ["FEM_DIR"])
JOB = os.environ["FEM_JOB"]
if (not os.path.isdir(FOLDER) or not re.fullmatch(r"[A-Za-z0-9_-]+", JOB)):
    raise SystemExit(f"dossier ou nom de calcul refusé : {FOLDER}, {JOB}")
TOP = max(1, min(50, int(os.environ.get("FEM_TOP", "10"))))
STAMP = os.path.join(FOLDER, JOB + "_vue")
# The software has its height along y, FreeCAD along z : the room turned up as the build does
UPRIGHT = App.Placement(App.Vector(0, 0, 0), App.Rotation(App.Vector(1, 0, 0), 90))


def settle(view):
    for _ in range(5):
        view.redraw()
        Gui.updateGui()
        QtCore.QCoreApplication.processEvents()


def shoot(view, name):
    settle(view)
    view.fitAll()
    settle(view)
    width, height = view.getSize()
    view.saveImage(os.path.join(FOLDER, f"{JOB}_{name}.png"), 1600, int(1600 * height / width), "White")


def nodes_of(path):
    nodes, reading = {}, False
    for line in open(path):
        if line.startswith("*"):
            head = line.upper()
            reading = head.startswith("*NODE") and "PRINT" not in head and "FILE" not in head
            continue
        if reading:
            cells = line.split(",")
            nodes[int(cells[0])] = App.Vector(float(cells[1]), float(cells[2]), float(cells[3]))
    return nodes


def feature(doc, name, label, shape):
    obj = doc.addObject("Part::Feature", name)
    obj.Label = label
    obj.Shape = shape
    obj.Placement = UPRIGHT
    return obj


def note(doc, name, lines, at):
    tag = doc.addObject("App::Annotation", name)
    tag.LabelText = lines
    tag.Position = UPRIGHT.multVec(App.Vector(*at))
    return tag


def sheet_of(doc, report):
    """Every figure of the run, the derived ones as formulas : readable and checkable in FreeCAD"""
    sheet = doc.addObject("Spreadsheet::Sheet", "SimulationFEM")
    sheet.Label = "Simulation FEM"
    row = [1]

    def put(cells, bold=False):
        for col, value in zip("ABCDEFGHIJKL", cells):
            if value is None:
                continue
            sheet.set(f"{col}{row[0]}", str(value) if not isinstance(value, str) or
                      value.startswith("=") else f"'{value}")
            if bold:
                sheet.setStyle(f"{col}{row[0]}", "bold")
        row[0] += 1
    # An empty put() leaves a blank row between 2 sections
    put([f"Simulation par éléments finis : {report['source'].split('/')[-1]}"], True)
    put(["Résultats de scripts/fem_meuble.py lus dans CalculiX. "
         "Les colonnes calculées sont des formules de cette feuille."])
    put([])
    put(["Hypothèses"], True)
    for line in report["hypotheses"]:
        put([line])
    put([])
    put(["Modèle", "Valeur", "Unité", "Explication"], True)
    put(["Panneaux maillés", report["panneaux"], "", "briques à 20 noeuds C3D20R, une dans l'épaisseur"])
    put(["Maille", report["maille_mm"], "mm", "côté des briques dans le plan des panneaux"])
    put(["Noeuds", report["noeuds"], "", ""])
    put(["Points de soudure", report["soudures"], "", "une fixation, rigide dans les 3 directions"])
    put(["Contacts", report["contacts"], "", "paires de noeuds face contre face, compression seule"])
    for name, spec in report["materiaux"].items():
        put([f"Module d'Young, {spec['label']}", spec["modulus"], "MPa", spec["source"]])
        put([f"Masse volumique, {spec['label']}", spec["density"], "kg/m3", "densité de contrôle du logiciel"])
    put(["Coefficient de Poisson", next(iter(report["materiaux"].values()))["nu"], "", report["poisson_source"]])
    put([])
    put(["Bilan d'équilibre", "Valeur", "Unité", "Explication"], True)
    first = row[0]
    put(["Poids du bois", round(report["poids_bois_N"], 1), "N", "volume des panneaux maillés x masse volumique x g"])
    put(["Charge totale appliquée", round(report["charge_totale_N"], 1), "N",
         "bois, contenus, portes, tiroirs, étagères"])
    put(["Réaction verticale des appuis", round(report["reactions_N"][1], 1) if report["reactions_N"] else "", "N",
         "somme des réactions aux pieds et aux vis au mur"])
    put(["Écart", f"=(B{first + 1}-B{first + 2})/B{first + 1}*100", "%",
         "doit rester sous 0,5 % : sinon le modèle fuit"])
    put([])
    put(["Charges appliquées", "Total (N)", "Total (kg)", "Type"], True)
    for load in report["charges"]:
        put([load["zone"], round(load["total"], 1), f"=B{row[0]}/9.81", "répartie" if load["kind"] ==
             "pressure" else "ponctuelle"])
    put([])
    put(["Déformation par pièce", "Flèche propre (mm)", "Tassement (mm)", "Flèche totale (mm)", "Déplacement max (mm)",
         "Longueur (mm)", "Limite 0,5 % (mm)", "Taux d'utilisation (%)"], True)
    put(["Flèche propre : chaque point contre la droite qui joint les 2 bouts du panneau, sans le tassement ni "
         "l'inclinaison du caisson sur ses pieds. Limite : 0,5 % de la longueur, la convention du logiciel."])
    flat = [p for p in report["pieces"] if p.get("fleche_propre_mm") is not None]
    rest = [p for p in report["pieces"] if p.get("fleche_propre_mm") is None]
    for piece in sorted(flat, key=lambda p: -p["fleche_propre_mm"] / p["longueur_mm"]):
        here = row[0]
        put([piece["piece"], round(piece["fleche_propre_mm"], 4), round(piece["tassement_mm"], 4),
             round(piece["fleche_verticale_max_mm"], 4), round(piece["deplacement_max_mm"], 4),
             round(piece["longueur_mm"], 1), f"=F{here}*0.005", f"=B{here}/G{here}*100"])
    for piece in sorted(rest, key=lambda p: -p["deplacement_max_mm"]):
        put([piece["piece"], None, None, round(piece["fleche_verticale_max_mm"], 4), round(piece["deplacement_max_mm"],
            4),
             round(piece["longueur_mm"], 1)])
    put([])
    put(["Notes du modèle", "Objet", "Détail"], True)
    for kind, what, detail in report["notes"]:
        if (kind != "point fixe"):
            put([kind, what, detail])
    last = report["passes"][-1] if report["passes"] else {}
    put(["convergence des contacts", f"{len(report['passes'])} passes",
         f"{last.get('changements', '')} contacts changés à la dernière, sur {last.get('contacts_actifs', '')} actifs"])
    put([])
    put(["Effort par fixation", "Type", "Pièce", "Reliée à", "Depuis la gauche (mm)", "Hauteur (mm)",
         "Depuis le mur (mm)", "Effort (N)", "Effort (kg)", "Gauche-droite (N)", "Vertical (N)",
         "Avant-arrière (N)"], True)
    for rank, weld in enumerate(report["fixations"], start=1):
        x, y, z = weld["position"]
        fx, fy, fz = weld["composantes_N"]
        here = row[0]
        put([rank, weld["type"], weld["pieces"][0], weld["pieces"][1], round(x), round(y), round(z),
             f"=sqrt(J{here}^2+K{here}^2+L{here}^2)", f"=H{here}/9.81", round(fx, 2), round(fy, 2), round(fz, 2)])
    for col, size in zip("ABCDEFGHIJKL", (330, 150, 210, 210, 120, 110, 110, 90, 90, 110, 100, 110)):
        sheet.setColumnWidth(col, size)
    return sheet


def run():
    try:
        import ObjectsFem
        from feminout import importCcxFrdResults
        report = json.load(open(os.path.join(FOLDER, JOB + "_fem.json")))
        doc = App.newDocument(JOB + "_fem")
        analysis = ObjectsFem.makeAnalysis(doc, "Analyse")
        importCcxFrdResults.importFrd(os.path.join(FOLDER, JOB + ".frd"), analysis, "Resultat_")
        results = [o for o in doc.Objects if o.isDerivedFrom("Fem::FemResultObject")]
        full_load = results[-1]
        full_load.Label = "Résultat à pleine charge"
        for res in results:
            res.Mesh.Placement = UPRIGHT
        nodes = nodes_of(os.path.join(FOLDER, JOB + ".inp"))
        edges = []
        for piece in report["pieces"]:
            lo, hi = piece["box"]
            edges += Part.makeBox(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], App.Vector(*lo)).Edges
        # TODO : the feet fem_meuble.py meshes are left out of the report pieces, no outline shows them in these views
        outline = feature(doc, "Contours", "Contours des pièces", Part.makeCompound(edges))
        # Load zones : each loaded board coated, each hanging point a ball, its total besides it
        zones, balls, tags = [], [], []
        boxes = {p["piece"]: p["box"] for p in report["pieces"]}
        for k, load in enumerate(report["charges"]):
            if (load["kind"] == "pressure"):
                name = load["zone"].split(" sur ", 1)[1]
                lo, hi = boxes[name]
                zones.append(Part.makeBox(hi[0] - lo[0], 3, hi[2] - lo[2], App.Vector(lo[0], hi[1], lo[2])))
                at = ((lo[0] + hi[0]) / 2, hi[1] + 20, (lo[2] + hi[2]) / 2)
            else:
                spots = [nodes[n] for n in load.get("noeuds", [])]
                balls += [Part.makeSphere(8, p) for p in spots]
                at = None
            if at is not None:
                tags.append(note(doc, f"Charge_{k + 1}", [f"{load['total']:.0f} N"], at))
        coat = feature(doc, "Zones_chargees", "Zones chargées (contenus)", Part.makeCompound(zones))
        hooks = feature(doc, "Points_charges", "Points de charge (portes, tiroirs, étagères)",
                        Part.makeCompound(balls) if balls else Part.Shape())
        ranked = report["fixations"][:TOP]
        marks = feature(doc, "Fixations_chargees", "Fixations les plus chargées",
                        Part.makeCompound([Part.makeSphere(14, App.Vector(*w["position"])) for w in ranked]))
        labels = [note(doc, f"Fixation_{k + 1}", [f"{k + 1}. {w['type']} {w['effort_N']:.0f} N",
                                                   f"{w['pieces'][0]} > {w['pieces'][1].split(' / ')[-1]}"],
                       (w["position"][0], w["position"][1] + 40, w["position"][2])) for k, w in enumerate(ranked)]
        sheet_of(doc, report)
        doc.recompute()
        mine = {full_load.Mesh, outline, coat, hooks, marks}
        for obj in doc.Objects:
            if (getattr(obj, "ViewObject", None) is not None and obj not in mine and obj not in tags + labels):
                obj.ViewObject.Visibility = False
        view = Gui.ActiveDocument.ActiveView
        shown = full_load.Mesh.ViewObject
        outline.ViewObject.LineColor = (0.0, 0.0, 0.0)
        outline.ViewObject.LineWidth = 2
        coat.ViewObject.ShapeColor = (1.0, 0.55, 0.0)
        hooks.ViewObject.ShapeColor = (0.1, 0.3, 0.95)
        marks.ViewObject.ShapeColor = (1.0, 0.0, 1.0)

        def show(objects, texts=()):
            for obj in (coat, hooks, marks):
                obj.ViewObject.Visibility = obj in objects
            for tag in tags + labels:
                tag.ViewObject.Visibility = tag in texts
        show([])
        shown.Visibility = True
        shown.DisplayMode = "Faces & Wireframe"
        view.viewIsometric()
        shoot(view, "1_maillage")
        shown.DisplayMode = "Faces"
        shown.setNodeDisplacementByVectors(full_load.NodeNumbers, full_load.DisplacementVectors)
        shown.applyDisplacement(1)
        shown.setNodeColorByScalars(full_load.NodeNumbers, [-d.y for d in full_load.DisplacementVectors])
        view.viewIsometric()
        shoot(view, "2_deplacement_vertical_mm_echelle1")
        view.viewFront()
        shoot(view, "3_face_deplacement_vertical_mm_echelle1")
        shown.applyDisplacement(20)
        view.viewIsometric()
        shoot(view, "4_deformee_amplifiee_x20")
        shown.applyDisplacement(1)
        shown.Transparency = 75
        show([coat, hooks], tags)
        view.viewIsometric()
        shoot(view, "5_charges_appliquees")
        view.viewFront()
        shoot(view, "6_charges_appliquees_face")
        show([marks], labels)
        view.viewIsometric()
        shoot(view, "7_fixations_chargees")
        view.viewFront()
        shoot(view, "8_fixations_chargees_face")
        shown.Transparency = 0
        show([])
        view.viewIsometric()
        settle(view)
        view.fitAll()
        doc.saveAs(os.path.join(FOLDER, JOB + "_fem.FCStd"))
        open(STAMP + ".ok", "w").write("ok")
    except Exception:
        open(STAMP + ".err", "w").write(traceback.format_exc())


QtCore.QTimer.singleShot(3000, run)
