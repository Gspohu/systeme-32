#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verdict of a generated piece from its 3 reports, each written after the run started : none, no verdict"""

import json
import os
import re
import sys


def expected_pages(model, wanted):
    """The pages make_drawings (freecad_drawings.py) builds from the JSON : each sheet carrying something, then a
    page of FreeCAD sections for each axis cut, both under the filter of S32_DRAWINGS"""
    only = re.compile(wanted) if wanted else None
    sheets = [s for s in model.get("drawings", []) if (s["views"] or s["tables"] or s.get("items") or s.get("overlay"))
              and (only is None or only.search(s["title"]))]
    sections = 0
    if (any(s["title"] == "Coupes" for s in model.get("drawings", [])) and (only is None or
        only.search("Coupes FreeCAD"))):
        sections = len({c["axis"] for c in model.get("sectionCuts", [])} & {"x", "y"})
    return len(sheets) + sections


def fresh(path, marker):
    """A report of this run, never one an earlier run left behind"""
    if not os.path.exists(path):
        return f"{os.path.basename(path)} absent"
    if (os.path.getmtime(path) <= os.path.getmtime(marker)):
        return f"{os.path.basename(path)} antérieur à ce passage, un plantage l'a laissé"
    return None


def reasons(out, piece, marker):
    stale = [why for why in (fresh(os.path.join(out, f"{piece}_{name}.json"), marker)
                             for name in ("rapport", "visserie", "controle")) if why]
    if stale:
        return stale
    found = {}
    for name in ("rapport", "visserie", "controle"):
        with open(os.path.join(out, f"{piece}_{name}.json"), encoding="utf-8") as f:
            found[name] = json.load(f)
    built, screws, check = found["rapport"], found["visserie"], found["controle"]
    why = [f"construction, {key} : {len(built[key])}" for key in ("failed", "invalid", "not_one_solid",
                                                                   "missing_models", "unrouted") if built.get(key)]
    if built.get("moved_by_solver"):
        why.append(f"construction, pièces déplacées par le solveur : {built['moved_by_solver']}")
    for page in built.get("drawings", []):
        why += [f"{page['page']} : {fault}" for fault in page["faults"]]
        why += [f"{page['page']} : vue invalide {view}" for view in page["invalid"]]
    why += [f"visserie, {key} : {len(screws[key])}" for key in ("misplaced", "unrouted") if screws.get(key)]
    if not screws.get("valid"):
        why.append("visserie : un modèle de vis invalide ou à plusieurs solides")
    # A report from before this check never says its pages were read
    if "struck_texts" not in screws:
        why.append("plans : textes barrés non contrôlés, passe d'interface antérieure au contrôle")
    why += [f"{s['page']} : '{s['text']}' barré par un trait à ({s['x']}, {s['y']}) mm"
            for s in screws.get("struck_texts", [])]
    # A view left blank strikes no text : its page would apss
    if "blank_views" not in screws:
        why.append("plans : projections non attendues, passe d'interface antérieure au contrôle")
    why += [f"plans, {blank}" for blank in screws.get("blank_views", [])]
    with open(os.path.join(out, "json", f"{piece}.json"), encoding="utf-8") as f:
        wanted = expected_pages(json.load(f), os.environ.get("S32_DRAWINGS", ""))
    for what, count in (("exportées", len(screws.get("pages", []))), ("construites", len(built.get("drawings", [])))):
        if (count != wanted):
            why.append(f"plans : {count} pages {what} pour {wanted} planches attendues du JSON")
    if (check.get("parts_json") != check.get("links")):
        why.append(f"contrôle : {check.get('links')} liens pour {check.get('parts_json')} pièces du JSON")
    if check.get("no_material"):
        why.append(f"contrôle, pièces sans matière : {len(check['no_material'])}")
    why += [f"contrôle, {reason}" for reason in check["verdict"]["raisons"]]
    return why


if __name__ == "__main__":
    found = reasons(*sys.argv[1:4])
    for line in found:
        print(f"ECHEC {sys.argv[2]} : {line}")
    sys.exit(1 if found else 0)
