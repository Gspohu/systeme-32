#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verdict of a generated piece from its 3 reports, each written after the run started : none, no verdict"""

import json
import os
import sys


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
    load = lambda name: json.load(open(os.path.join(out, f"{piece}_{name}.json"), encoding="utf-8"))
    built, screws, check = load("rapport"), load("visserie"), load("controle")
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
