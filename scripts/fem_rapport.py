#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Report of a run of fem_meuble.py for the cabinet maker : a PDF, every figure read off the run and the software"""

import argparse
import hashlib
import json
import math
import os
import sys
import textwrap

import numpy as np

import fem_meuble
from fem_calculix import FRICTION_K, read_results
from fem_meuble import deck_digest, fingerprint, friction_of, watched_of
from fem_panneau import inside

# Black ink as the drawings, the success, warning and danger colours of the interface for verdicts
INK = "#000000"
PASS = "#4cbb7c"
WARN = "#e2884c"
FAIL = "#c84555"
FONTS = ["Helvetica", "Arial", "Liberation Sans", "DejaVu Sans"]
A4 = (8.27, 11.69)


def sha256_of(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def checked_run(folder, job, current):
    """The run, its identity and its input, refused unless all of them are of one run and of the model of today"""
    def load(name):
        path = os.path.join(folder, f"{job}_{name}.json")
        if not os.path.isfile(path):
            raise SystemExit(f"{path} absent : relancer scripts/fem_meuble.py sur ce dossier.")
        with open(path) as handle:
            return json.load(handle)
    report, identity = load("fem"), load("identite")
    entree = os.path.join(os.path.dirname(folder), f"{job}_entree.json")
    with open(entree, "rb") as handle:
        raw = handle.read()
    with open(current, "rb") as handle:
        today = fingerprint(handle.read())
    read = fingerprint(raw)
    if (not (read == report["empreinte"] == identity["empreinte"])):
        raise SystemExit(f"Entrée {read}, résultats {report['empreinte']}, identité {identity['empreinte']} : pas un "
                         "seul calcul. Relancer scripts/fem_meuble.py.")
    if (today != read):
        raise SystemExit(f"Calcul périmé : fait sur l'entrée {read}, le modèle actuel donne {today}. Réécrire "
                         "l'entrée (scripts/fem_charges.ts) et relancer scripts/fem_meuble.py.")
    for key, suffix in (("sha256_inp", ".inp"), ("sha256_dat", ".dat")):
        if (identity.get(key) != sha256_of(os.path.join(folder, job + suffix))):
            raise SystemExit(f"{job}{suffix} n'est pas celui du calcul publié. Relancer scripts/fem_meuble.py.")
    seen = {}
    for weld in report["fixations"]:
        key = (weld["type"], tuple(sorted(weld["pieces"])), tuple(round(x, 2) for x in weld["position"]))
        if key in seen:
            raise SystemExit(f"{weld['type']} {weld['pieces']} compté deux fois : relire le calcul avec FEM_POST=1.")
        seen[key] = True
    return report, identity, json.loads(raw.decode("utf-8"))


def rebuilt(model, cell, identity):
    """The model built again, proved the one solved : its deck the very bytes of the .inp"""
    fem_meuble.MODEL, fem_meuble.TABLE, fem_meuble.CELL = model, model["materials"], cell
    boards, welds, contacts, fixed, upright, loads, notes, nodes, bricks, ties = fem_meuble.build(model)
    friction, _ = friction_of(boards, welds, fixed, upright, ties)
    settled = set(identity["actifs"])
    active = [k in settled for k in range(len(contacts))]
    watched = watched_of(boards, welds, contacts)
    if (deck_digest(boards, welds, contacts, active, fixed, upright, loads, friction, watched, ties)
            != identity["sha256_inp"]):
        raise SystemExit("Le code reconstruit un autre deck que celui résolu : relancer scripts/fem_meuble.py.")
    return {"boards": boards, "welds": welds, "fixed": fixed, "upright": upright, "loads": loads,
            "friction": friction, "ties": ties}


def stresses(path):
    """Stress tensor at each node off the .frd : xx, yy, zz, xy, yz, zx in N/mm2, fixed columns of 12"""
    out, reading = {}, False
    with open(path) as handle:
        for line in handle:
            if line.startswith(" -4"):
                reading = line.split()[1] == "STRESS"
                continue
            if (reading and line.startswith(" -3")):
                break
            if (reading and line.startswith(" -1")):
                node = int(line[3:13])
                out[node] = [float(line[13 + 12 * k:25 + 12 * k]) for k in range(6)]
    return out


def largest_principal(tensors):
    """Largest principal stress in absolute value of each tensor, sign kept"""
    t = np.asarray(tensors, dtype=float)
    full = np.stack([np.stack([t[:, 0], t[:, 3], t[:, 5]], -1), np.stack([t[:, 3], t[:, 1], t[:, 4]], -1),
                     np.stack([t[:, 5], t[:, 4], t[:, 2]], -1)], -2)
    values = np.linalg.eigvalsh(full)
    pick = np.argmax(np.abs(values), axis=1)
    return values[np.arange(len(values)), pick]


def sag_field(board, disp):
    """Drop of each node of a flat board below the chord of its own line, mm : the field own_sag takes the max of"""
    lines = {}
    for (i, j, k), n in board.grid.items():
        if n in disp:
            lines.setdefault((j, k), {})[i] = n
    field = {}
    for line in lines.values():
        if (len(line) < 2):
            continue
        i0, i1 = min(line), max(line)
        y0, y1 = disp[line[i0]][1], disp[line[i1]][1]
        for i, n in line.items():
            field[n] = y0 + (y1 - y0) * (i - i0) / (i1 - i0) - disp[n][1]
    return field


def export_part(board, export):
    """The part of the software export a board stands for : its name, its sizes and its origin, None if none fits"""
    for part in export["parts"]:
        if (f"{part['itemName']} / {part['label']}" == board.name and part.get("frame")
                and math.dist(part["frame"]["o"], board.origin) < 0.01
                and all(abs(part[k] - board.part[k]) < 0.01 for k in ("length", "width", "thickness"))):
            return part
    return None


def board_figures(run, report, disp, sigma, export):
    """Per board : the sag judged against the limit of the software, the stress off the fasteners"""
    model = run["boards"]
    owner = {n: b for b in model for n in b.nodes}
    tie_board = {node: owner[shares[0][0]] for node, _, shares in run["ties"]}
    tie_at = {node: point for node, point, _ in run["ties"]}
    # By board : where it's held (welds, wall, floor), and where a point load comes in besides
    held, spikes = {}, {}
    for weld in run["welds"]:
        for end in (weld["a"], weld["b"]):
            board = tie_board.get(end) or owner.get(end)
            held.setdefault(board.index, []).append((end, tie_at.get(end) or board.nodes.get(end)))
    for n in list(run["fixed"]) + list(run["upright"]):
        held.setdefault(owner[n].index, []).append((n, owner[n].nodes[n]))
    for load in run["loads"]:
        for n in load.get("nodes", []):
            spikes.setdefault(owner[n].index, []).append((n, owner[n].nodes[n]))
    strength = {m["id"]: m["strength"] for m in export["materials"]}
    notes = {note["subject"].get("id"): note for note in export["calcNotes"] if note["id"].startswith("fleche")}
    wood = [board for board in model if board.part["role"] != "foot"]
    # fem_meuble.py writes its pieces in the order of its boards : the rank ties them, 2 boards may share a name
    if ([b.name for b in wood] != [p["piece"] for p in report["pieces"]]):
        raise SystemExit("Les pièces du rapport ne suivent pas les panneaux reconstruits : relire avec FEM_POST=1.")
    rows = []
    for board, piece in zip(wood, report["pieces"]):
        values = [n for n in board.nodes if n in sigma]
        principal = largest_principal([sigma[n] for n in values]) if values else np.zeros(0)
        cell = report["maille_mm"]
        spots = np.array([spot for _, spot in held.get(board.index, []) + spikes.get(board.index, [])])
        where = np.array([board.nodes[n] for n in values])
        free = list(range(len(values)))
        if (len(spots) and len(values)):
            near = np.zeros(len(values), dtype=bool)
            for s in spots:
                near |= np.linalg.norm(where - s, axis=1) <= cell
            free = list(np.flatnonzero(~near))
        row = {"piece": board.name, "role": board.part["role"], "board": board,
               "sigma_max": float(np.max(np.abs(principal))) if len(principal) else 0.0,
               "sigma_libre": float(np.max(np.abs(principal[free]))) if free else None,
               "f_m": strength[board.part["material"]], "principal": dict(zip(values, principal))}
        if (piece["fleche_propre_mm"] is not None):
            note = notes.get(export_part(board, export)["id"])
            steps = {s["name"]: s.get("value") for s in note["steps"]} if note else {}
            inputs = {i["name"]: i["value"] for i in note["inputs"]} if note else {}
            span = inputs.get("portee")
            # A top the software judges on this very run : the figure it quotes must be the one of the run
            if (inputs.get("fleche_sim") is not None and abs(inputs["fleche_sim"] - piece["fleche_propre_mm"]) > 1e-9):
                raise SystemExit(f"{board.name} : le logiciel cite {inputs['fleche_sim']} mm, le calcul donne "
                                 f"{piece['fleche_propre_mm']} mm. Reporter le calcul dans src/lib/data/fem_results.ts.")
            ends = [disp[n][1] for n, _ in held.get(board.index, []) if n in disp]
            drop = max(-disp[n][1] for n in board.nodes) + (sum(ends) / len(ends) if ends else 0.0)
            row.update({"fleche": piece["fleche_propre_mm"], "tassement": piece["tassement_mm"],
                        "limite": steps.get("fleche_adm"), "portee": span,
                        "logiciel": None if inputs.get("fleche_sim") is not None else steps.get("fleche"),
                        "note": note["title"] if note else None,
                        "fluage": steps.get("fleche_fin"), "descente": drop,
                        "sag": sag_field(board, disp)})
        rows.append(row)
    return rows


def friction_force(run, disp):
    """Reaction of the corner springs of the groups no weld holds, along x and z, N : -k u, as a support gives it"""
    fx = -sum(FRICTION_K * disp[n][0] for n in run["friction"] if n in disp)
    fz = -sum(FRICTION_K * disp[n][2] for n in run["friction"] if n in disp)
    return fx, fz


# The PDF


def page(pdf, plt, title, blocks, figure=None):
    """One A4 page : a title, paragraphs and tables, top down"""
    fig = figure or plt.figure(figsize=A4)
    fig.text(0.07, 0.955, title, fontsize=14, fontweight="bold", color=INK, va="top")
    y = 0.92
    for block in blocks:
        if isinstance(block, str):
            for para in block.split("\n"):
                wrapped = textwrap.wrap(para, 118) or [""]
                for line in wrapped:
                    fig.text(0.07, y, line, fontsize=8.5, color=INK, va="top")
                    y -= 0.016
            y -= 0.006
        else:
            head, body, colours = block
            rows = len(body) + 1
            height = 0.0165 * rows
            ax = fig.add_axes([0.07, y - height, 0.86, height])
            ax.axis("off")
            # Each column as wide as its longest text, the panel names first of all
            longest = [max(len(str(line[c])) for line in [head] + body) + 2 for c in range(len(head))]
            widths = [w / sum(longest) for w in longest]
            table = ax.table(cellText=body, colLabels=head, loc="upper left", cellLoc="left", colWidths=widths)
            table.auto_set_font_size(False)
            table.set_fontsize(7)
            for (r, c), cell in table.get_celld().items():
                cell.set_height(1 / rows)
                cell.set_edgecolor(INK)
                cell.set_linewidth(0.3)
                if (r == 0):
                    cell.set_text_props(fontweight="bold")
                elif (colours and colours[r - 1] and c == len(head) - 1):
                    cell.set_text_props(color=colours[r - 1], fontweight="bold")
            y -= height + 0.02
    pdf.savefig(fig)
    plt.close(fig)


def field_map(ax, board, values, label, cmap, marks=()):
    """A board seen from above, a field over its nodes, its outline kept"""
    import matplotlib.tri as mtri
    pts = [(n, board.nodes[n]) for n in values]
    uv = np.array([[sum((p[k] - board.origin[k]) * board.along[k] for k in range(3)),
                    sum((p[k] - board.origin[k]) * board.across[k] for k in range(3))] for _, p in pts])
    z = np.array([values[n] for n, _ in pts])
    tri = mtri.Triangulation(uv[:, 0], uv[:, 1])
    if board.shape:
        middle = uv[tri.triangles].mean(axis=1)
        tri.set_mask([not inside(tuple(c), board.shape) for c in middle])
    filled = ax.tricontourf(tri, z, levels=14, cmap=cmap)
    for u, v in marks:
        ax.plot(u, v, "o", color=INK, markersize=2)
    ax.set_aspect("equal")
    ax.set_title(board.name, fontsize=7)
    ax.tick_params(labelsize=6)
    bar = ax.figure.colorbar(filled, ax=ax, shrink=0.8)
    bar.set_label(label, fontsize=6)
    bar.ax.tick_params(labelsize=6)


def verdict(value, limit):
    if (value is None or limit is None):
        return "", None
    return ("sous la limite", PASS) if value <= limit else ("au-delà", FAIL)


def write_pdf(path, job, report, rows, fric, images, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = FONTS
    applied = report["charge_totale_N"]
    rv = report["reactions_N"]
    with PdfPages(path) as pdf:
        first = [
            f"Calcul par éléments finis du meuble entier, CalculiX 2.23, entrée {report['empreinte']} : celle du modèle "
            "actuel, contrôlée à la génération de ce rapport. Toutes les valeurs ci-dessous sont lues dans les "
            "fichiers du calcul et dans l'export du logiciel.",
            "Hypothèses",
            "\n".join(f"- {h}" for h in report["hypotheses"]),
            f"- maille {report['maille_mm']:.0f} mm, briques à 20 noeuds (C3D20R), {report['panneaux']} panneaux, "
            f"{report['noeuds']} noeuds, {report['vis_et_tourillons']} vis et tourillons ({report['soudures']} "
            f"soudures), {report['contacts']} paires de contact, {report['pieds']} pieds, "
            f"{report['points_fixes']} points fixés au mur",
            "Matériaux",
        ]
        specs = list(report["materiaux"].values())
        mats = [[spec["label"], f"{spec['modulus']}", f"{spec['density']}", f"{spec['nu']}"] for spec in specs]
        first.append((["Matériau", "E (N/mm²)", "Masse volumique de contrôle (kg/m³)", "nu"], mats, None))
        first += [f"Source, {spec['label']} : {spec['source']}." for spec in specs]
        first.append(f"Coefficient de Poisson : {report['poisson_source']}.")
        wrong_ok = report["contacts_a_tort_N"] <= fem_meuble.WRONG_SHARE * applied
        first += [
            "Équilibre",
            (["Grandeur", "Valeur", "Contrôle"],
             [["Poids du bois", f"{report['poids_bois_N']:.1f} N", ""],
              ["Charge totale (bois, contenus, portes, tiroirs)", f"{applied:.1f} N", ""],
              ["Réaction verticale des appuis", f"{rv[1]:.1f} N", f"écart {abs(rv[1] - applied) / applied:.1e}"],
              ["Réaction horizontale des appuis (x, z)", f"{round(rv[0], 2) + 0:.2f} N, {round(rv[2], 2) + 0:.2f} N",
               ""],
              ["Ressorts de frottement fictifs (x, z)", f"{round(fric[0], 2) + 0:.2f} N, {round(fric[1], 2) + 0:.2f} N",
               f"somme horizontale {rv[0] + fric[0]:.1e} N, {rv[2] + fric[1]:.1e} N"],
              ["Forces à tort des contacts", f"{report['contacts_a_tort_N']:.3f} N",
               "sous 0,1 % de la charge" if wrong_ok else "AU-DELÀ de 0,1 %"],
              ["Passes de réglage des contacts", f"{len(report['passes'])}", "dernière sans changement"]],
             [None] * 5 + [PASS if wrong_ok else FAIL, None]),
        ]
        page(pdf, plt, title, first)

        flat = [r for r in rows if "fleche" in r]
        flat.sort(key=lambda r: (r["limite"] is None, -r["fleche"] / (r["limite"] or 1)))
        body, colours = [], []
        for r in flat:
            judged = r["limite"] is not None
            word, colour = verdict(r["fleche"], r["limite"]) if judged else ("non jugé", None)
            body.append([r["piece"], "" if r["portee"] is None else f"{r['portee']:.0f}", f"{r['fleche']:.2f}",
                         "" if r["logiciel"] is None else f"{r['logiciel']:.2f}",
                         f"{r['limite']:.2f}" if judged else "", f"{r['fleche'] / r['limite']:.0%}" if judged else "",
                         word])
            colours.append(colour)
        page(pdf, plt, "Flèches des dessus, dessous et tablettes (mm)", [
            "Flèche propre : chaque point contre la droite qui joint les deux bouts de sa ligne, sans le tassement du "
            "caisson. Portée et limite : celles des notes de calcul du logiciel, 0,5 % de la portée (UNI 11663). Un "
            "panneau sans note (dessous sur pieds, dessus sans caisson posé) n'a pas de limite dans le logiciel : non "
            "jugé. Colonne 'logiciel' : sa note, une poutre sur deux appuis simples ; vide pour un dessus qu'il juge "
            "sur cette simulation même.",
            (["Panneau", "Portée", "Simulée", "Logiciel", "Limite", "Taux", "Verdict"], body, colours),
            "Les fixations sont soudées rigides dans la simulation : une flèche simulée sous la limite est indicative, "
            "pas une preuve de conformité. Le verdict qui fait foi reste la note de calcul du logiciel.",
        ])

        hung = [r for r in flat if r["role"] in ("endPanel", "wallShelf")]
        body = [[r["piece"][:50], f"{r['fleche']:.2f}", f"{r['descente']:.2f}"] for r in hung]
        stress = sorted(rows, key=lambda r: -(r["sigma_libre"] or 0) / r["f_m"])
        sbody, scol = [], []
        for r in stress[:18]:
            ratio = (r["sigma_libre"] or 0) / r["f_m"]
            sbody.append([r["piece"][:46], f"{r['sigma_max']:.2f}", "" if r["sigma_libre"] is None else
                          f"{r['sigma_libre']:.2f}", f"{r['f_m']}", f"{ratio:.0%}"])
            scol.append(PASS if ratio <= 0.5 else WARN if ratio <= 1 else FAIL)
        blocks = []
        if body:
            blocks += ["Panneaux en console (bout arrondi, étagère murale) : la flèche propre, prise le long du "
                       "panneau, ne voit pas la descente du bord libre. Descente : le point le plus bas contre la "
                       "moyenne de ses fixations.",
                       (["Panneau", "Flèche propre (mm)", "Descente du bord libre (mm)"], body, None)]
        blocks += ["Contraintes : plus grande contrainte principale en valeur absolue, N/mm². 'Maxi' comprend les "
                   "pics au droit des fixations, des points d'appui et des charges ponctuelles : une liaison en un "
                   f"point donne une singularité, pas une contrainte. 'Hors fixations' : à plus d'une maille "
                   f"({report['maille_mm']:.0f} mm) de ces points. f_m : résistance en flexion du matériau "
                   "(export du logiciel), valeur caractéristique sans coefficient de sécurité.",
                   (["Panneau", "Maxi", "Hors fixations", "f_m", "Taux"], sbody, scol)]
        page(pdf, plt, "Consoles et contraintes", blocks)

        top = report["fixations"][:15]
        fbody = [[f"{k + 1}", w["type"], w["pieces"][0][:30], w["pieces"][1][:30], f"{w['effort_N']:.0f}",
                  f"{w['effort_N'] / 9.81:.1f}"] for k, w in enumerate(top)]
        feet = [[p["pied"], p["sous"][:40], f"{p['effort_N']:.0f}", f"{p['kg']:.1f}"] for p in report["charges_pieds"]]
        page(pdf, plt, "Fixations et pieds", [
            "Effort dans chaque fixation, toutes directions confondues. Une vis de liaison percée dans les deux "
            "panneaux compte une fois, avec la somme de ses deux soudures. Ces efforts sont donnés pour information : "
            "la tenue des vis et tourillons (arrachement, cisaillement) n'est pas vérifiée par ce calcul.",
            (["Rang", "Type", "Pièce", "Reliée à", "N", "kg"], fbody, None),
            "Charge sur chaque pied (réglable AXILO 78, fût modélisé indéformable).",
            (["Pied", "Sous", "N", "kg"], feet, None),
        ])

        loose = [n[1] for n in report["notes"] if n[0] == "tenu par frottement"]
        limits = [
            "Fatigue : aucun cycle de charge n'est simulé (ouvertures, chargements répétés).",
            "Fluage : charge instantanée seulement. À long terme, le panneau de particules fléchit environ "
            "(1 + kdef) fois plus ; les notes du logiciel donnent ce chiffre pour information.",
            "Liaisons : chaque vis, tourillon ou excentrique est une soudure rigide en un point ; aucun jeu, aucun "
            "glissement, aucun arrachement. C'est la borne favorable.",
            "Contacts sans frottement ; les groupes de panneaux qu'aucune fixation ne relie aux appuis tiennent "
            f"de côté par des ressorts fictifs de {FRICTION_K:g} N/mm à leurs coins"
            + (f" : {'; '.join(loose)}." if loose else "."),
            "Supports invisibles d'étagère murale : broches encastrées parfaitement dans le mur, leur propre flexion "
            "n'est pas modélisée. Leur charge est vérifiée par le logiciel sur la table du fabricant.",
            "Charges : 1 kg/dm² sur planchers et tablettes, 0,5 kg/dm² dans les placards hauts du vaisselier ; le "
            "tiroir à bouteilles (30 kg déclarés) reçoit 1 kg/dm², son cas reste à calculer.",
            "Contraintes : comparées à une résistance caractéristique, sans combinaison de calcul ; les pics aux "
            "fixations ne se lisent pas comme des contraintes.",
        ]
        page(pdf, plt, "Ce que ce calcul ne prouve pas", ["\n".join(f"- {line}" for line in limits)])

        for name, caption in images:
            fig = plt.figure(figsize=A4)
            ax = fig.add_axes([0.05, 0.1, 0.9, 0.78])
            ax.imshow(plt.imread(name))
            ax.axis("off")
            page(pdf, plt, caption, [], fig)

        maps = sorted([r for r in flat if r["sag"]], key=lambda r: -r["fleche"])[:12]
        for start in range(0, len(maps), 6):
            fig, axes = plt.subplots(3, 2, figsize=A4)
            for ax, r in zip(axes.flat, maps[start:start + 6]):
                field_map(ax, r["board"], r["sag"], "flèche propre (mm)", "viridis_r")
            for ax in list(axes.flat)[len(maps[start:start + 6]):]:
                ax.axis("off")
            fig.subplots_adjust(top=0.9, hspace=0.45)
            page(pdf, plt, "Flèche propre, panneaux vus de dessus (mm)", [], fig)
        worst = [r for r in stress if r["principal"]][:6]
        fig, axes = plt.subplots(3, 2, figsize=A4)
        for ax, r in zip(axes.flat, worst):
            field_map(ax, r["board"], {n: abs(v) for n, v in r["principal"].items()}, "|contrainte| (N/mm²)",
                      "magma_r")
        fig.subplots_adjust(top=0.9, hspace=0.45)
        page(pdf, plt, "Contraintes des panneaux les plus sollicités (N/mm², pics aux fixations compris)", [], fig)


def main(argv):
    parser = argparse.ArgumentParser(description="Rapport PDF d'un calcul de scripts/fem_meuble.py")
    parser.add_argument("dossier", help="dossier du calcul, <job>_entree.json dans le dossier parent")
    parser.add_argument("job")
    parser.add_argument("--entree-courante", required=True, help="<job>_entree.json écrit à l'instant par "
                        "scripts/fem_charges.ts")
    parser.add_argument("--export", required=True, help="json/<job>.json écrit par npm run cad")
    parser.add_argument("--titre", required=True)
    parser.add_argument("--sortie", required=True)
    args = parser.parse_args(argv)
    folder = os.path.realpath(args.dossier)
    report, identity, model = checked_run(folder, args.job, args.entree_courante)
    with open(args.export) as handle:
        export = json.load(handle)
    run = rebuilt(model, report["maille_mm"], identity)
    for board in run["boards"]:
        if (board.part["role"] != "foot" and export_part(board, export) is None):
            raise SystemExit(f"{board.name} : absent de l'export, ou à d'autres cotes. Refaire npm run cad sur le "
                             "même modèle.")
    disp, _ = read_results(folder, args.job)
    sigma = stresses(os.path.join(folder, args.job + ".frd"))
    rows = board_figures(run, report, disp, sigma, export)
    fric = friction_force(run, disp)
    shots = [("4_deformee_amplifiee_x20", "Déformée amplifiée 20 fois (forme seulement)"),
             ("5_charges_appliquees", "Charges appliquées : contenus en orange, points de charge en bleu"),
             ("7_fixations_chargees", "Fixations les plus chargées")]
    images = [(os.path.join(folder, f"{args.job}_{name}.png"), caption) for name, caption in shots
              if os.path.isfile(os.path.join(folder, f"{args.job}_{name}.png"))]
    os.makedirs(os.path.dirname(os.path.realpath(args.sortie)), exist_ok=True)
    write_pdf(args.sortie, args.job, report, rows, fric, images, args.titre)
    print(f"{args.job} : {args.sortie}, {len(rows)} panneaux, frottement {fric[0]:.2f} N, {fric[1]:.2f} N")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
