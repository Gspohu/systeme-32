#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Finite element model of a whole piece : boards in 20 node bricks, a weld at each fastener, contacts elsewhere"""

import hashlib
import json
import math
import os
import re
import sys

from fem_calculix import CONTACT_K, E_FOOT, GRAVITY, WELD_K, density, read_results, solve, write
from fem_panneau import Board, add, dot, hole_point, scale


def checked_args(argv):
    """The input written by fem_charges.ts, the folder written, the cell, the job : a file that exist, a plain name"""
    if (len(argv) < 3):
        raise ValueError("usage : fem_meuble.py <job>_entree.json <dossier de sortie> [maille mm]")
    source = os.path.realpath(argv[1])
    name = os.path.basename(source)
    if (not name.endswith("_entree.json") or not os.path.isfile(source)):
        raise ValueError(f"entrée introuvable, ou pas un <job>_entree.json écrit par scripts/fem_charges.ts : {source}")
    job = name[:-len("_entree.json")]
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_-]*", job):
        raise ValueError(f"nom de calcul refusé, lettres, chiffres, - et _ seulement : {job}")
    cell = float(argv[3]) if len(argv) > 3 else 30.0
    if (not 5.0 <= cell <= 200.0):
        raise ValueError(f"maille hors de 5 à 200 mm : {cell}")
    return source, os.path.realpath(argv[2]), cell, job


def fingerprint(raw):
    """FNV-1a over 64 bits of the bytes read, the figure femFingerprint gives in the software for the same text"""
    value = 0xcbf29ce484222325
    for byte in raw:
        value = ((value ^ byte) * 0x100000001b3) & 0xffffffffffffffff
    return f"{value:016x}"


def sha256_of(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


# Boards that carry nothing of the carcass : their weight is put where they hang, or left out
LOADS_ONLY = ("door", "drawerFront", "boxSide", "boxEnd", "boxBottom", "flap", "shelf", "filler")
LEFT_OUT = ("plinth", "skin", "batten")
WELDED = ("minifix-bolt", "dowel", "back-screw", "link-screw", "spacer-screw", "cleat-screw", "lining-screw")
# Into the wall : the screws through a back, the concealed supports of a wall shelf and their plugs
WALL = ("wall-screw", "wall-fixing", "shelf-bracket")
# Boards that hold what is put on them
FLOORS = ("bottom", "hdivider", "wallShelf")
# kg/dm2 : the high cupboards of the dresser, light things only
LIGHT = 0.5
KG_DM2 = 9.81 / 1e4 # 1 kg/dm2 in N/mm2
PASSES = 150
# N : what a contact may still carry the wrong way once settled, and the share of the load all of them together may
SETTLE_N = 0.1
WRONG_SHARE = 0.001
# A foot : the tube of the AXILO 78, Ø 30 (Häfele 637.76.35x), as a square of the same area, from the floor to the
# board over it
FOOT_SIDE = 30.0 * math.sqrt(math.pi) / 2


def box_of(part):
    return Board(part, -1)


def content_rate(item_name):
    # The high cupboards of the dresser hold light things only, every other floor the test load of the software, read
    # in the input. TODO : the bottle drawer declares 30 kg (templates.ts) and gets 1 kg/dm2 here, its own case
    # still to run before anything is said of its runners
    return LIGHT if item_name == "Placards hauts" else MODEL["shelfLoad"]


def build(model):
    parts = [piece for piece in model["parts"] if piece.get("frame")]
    boards = [Board(piece, k) for k, piece in enumerate(piece for piece in parts if piece["role"] not in LOADS_ONLY +
                                                        LEFT_OUT)]
    for k, board in enumerate(boards):
        board.index = k
    node_id, brick_id = 0, 0
    for board in boards:
        node_id, brick_id = board.mesh(node_id, brick_id, CELL)
    by_part = {id(board.part): board for board in boards}

    def board_at(point):
        for board in boards:
            if board.contains(point):
                return board
        return None

    welds, fixed, loads, notes = [], set(), [], []
    # A tie moves as its brick at its very point : 2 ties at one place stay together under a rigid motion
    ties = []

    def tie(board, point):
        shares = board.weights(point)
        if shares is None:
            return None
        ties.append((list(point), shares))
        return ("tie", len(ties) - 1)
    # Fasteners : a weld between the 2 boards they join, a fixed point into the wall
    for part in parts:
        mine = by_part.get(id(part))
        for hole in part["holes"]:
            if mine is None:
                continue
            # The concealed support of a wall shelf goes into its back edge
            if hole["purpose"] in WALL:
                start = hole_point(part, hole)
                fixed.add(mine.nearest(start))
                # A rod into an edge holds the board along its whole length, not at a point : points in a row
                # along one edge would make a hinge
                inward = {"u0": part["frame"]["u"], "u1": scale(part["frame"]["u"], -1),
                          "v0": part["frame"]["v"], "v1": scale(part["frame"]["v"], -1)}.get(hole["face"])
                if inward is not None:
                    steps = max(1, round(hole["depth"] / (CELL / 2)))
                    for step in range(1, steps + 1):
                        fixed.add(mine.nearest(add(start, scale(inward, hole["depth"] * step / steps))))
                notes.append(("point fixe", hole["purpose"], mine.name))
                continue
            if (hole["purpose"] not in WELDED or hole["face"] not in ("A", "B")):
                continue
            point = hole_point(part, hole)
            outward = scale(part["frame"]["n"], -1 if hole["face"] == "A" else 1)
            for reach in (3.0, -(part["thickness"] + 3.0)):
                other = board_at(add(point, scale(outward, reach)))
                if (other is not None and other is not mine):
                    seat = add(point, scale(outward, 0.0 if reach > 0 else -part["thickness"]))
                    ends = tie(mine, seat), tie(other, seat)
                    # Into a corner a curved outline cuts off : no wood there to hold it
                    if None in ends:
                        notes.append(("fixation hors matière", hole["purpose"], f"{mine.name} > {other.name}"))
                    else:
                        welds.append({"a": ends[0], "b": ends[1], "type": hole["purpose"],
                                      "pieces": [mine.name, other.name]})
                    break

    # Contacts wherever 2 boards touch, face against face or edge against face
    contacts = []
    for one in boards:
        for two in boards:
            if one is two:
                continue
            for axis in range(3):
                gap = two.lo[axis] - one.hi[axis]
                limit = 2.5 if "Petite colonne" in one.name and two.part["itemName"] == "Niche" else 0.05
                if (not (-0.05 <= gap <= limit)):
                    continue
                others = [k for k in range(3) if k != axis]
                low = [max(one.lo[k], two.lo[k]) for k in range(3)]
                high = [min(one.hi[k], two.hi[k]) for k in range(3)]
                if (any(high[k] - low[k] <= 1.0 for k in others)):
                    continue
                normal = [0.0, 0.0, 0.0]
                normal[axis] = 1.0
                # From the nodes of both boards : a face against an edge keep only the rows of its grid that fall in
                # a 19 mm strip, none at all on some meshes, and the edge held or not by chance
                before = len(contacts)
                for node in one.on_plane(axis, one.hi[axis]):
                    pos = one.nodes[node]
                    if (not all(low[k] - 0.01 <= pos[k] <= high[k] + 0.01 for k in others)):
                        continue
                    facing = tie(two, add(pos, scale(normal, gap)))
                    if facing is not None:
                        contacts.append((node, facing, normal, max(0.0, gap)))
                for node in two.on_plane(axis, two.lo[axis]):
                    pos = two.nodes[node]
                    if (not all(low[k] - 0.01 <= pos[k] <= high[k] + 0.01 for k in others)):
                        continue
                    facing = tie(one, add(pos, scale(normal, -gap)))
                    if facing is not None:
                        contacts.append((facing, node, normal, max(0.0, gap)))
                if (len(contacts) == before):
                    notes.append(("contact sans point", f"{one.name} / {two.name}", "aucun noeud dans la zone commune"))

    feet = [fitting for fitting in model.get("fitted", []) if fitting.get("purpose") == "foot"]
    upright = set()
    # A board held by the return of a plinth stands on the floor through it : upright at each of its screws
    for part in parts:
        for hole in part["holes"]:
            if (hole["purpose"] != "plinth-screw"):
                continue
            point = hole_point(part, hole)
            mine = by_part.get(id(part))
            if mine is not None:
                upright.add(mine.nearest(point)) 
                continue
            outward = scale(part["frame"]["n"], -1 if hole["face"] == "A" else 1)
            for reach in (3.0, -(part["thickness"] + 3.0)):
                other = board_at(add(point, scale(outward, reach)))
                if other is not None:
                    upright.add(other.nearest(point))
                    break
    # Feet : a post each from the floor to the lowest flat board over it, a bottom or the lower plate of a rounded
    # end, welded under it as any fastener, standing on the floor
    flat = [slab for slab in boards if abs(slab.normal[1]) > 0.5]
    for number, foot in enumerate(feet, start=1):
        x, y, z = foot["centre"]
        floor = [slab for slab in flat if slab.lo[0] - 1 <= x <= slab.hi[0] + 1 and slab.lo[2] - 1 <= z <= slab.hi[2] + 1
                 and slab.lo[1] >= y - 1]
        if not floor:
            notes.append(("appui non posé", f"pied à {round(x)}, {round(z)}", "pas de dessous au-dessus"))
            continue
        board = min(floor, key=lambda slab: slab.lo[1])
        half = FOOT_SIDE / 2
        post = Board({"itemName": board.part["itemName"], "label": f"Pied {number}", "role": "foot", "holes": [],
                      "length": FOOT_SIDE, "width": FOOT_SIDE, "thickness": board.lo[1],
                      "frame": {"o": [x - half, 0.0, z - half], "u": [1, 0, 0], "v": [0, 0, 1], "n": [0, 1, 0]}},
                     len(boards))
        node_id, brick_id = post.mesh(node_id, brick_id, CELL)
        boards.append(post)
        for (i, j, k), node in post.grid.items():
            if (k == 0):
                upright.add(node)
                continue
            held = tie(board, post.nodes[node]) if k == 2 else None
            if held is not None:
                welds.append({"a": node, "b": held, "type": "foot", "pieces": [post.name, board.name]})
    fixed.discard(None) 
    upright.discard(None)
    posts = sum(1 for b in boards if b.part["role"] == "foot")
    notes.append(("appuis", f"{posts} pieds maillés, soudés sous leur panneau",
                  ""))

    # Loads : content on the floors and fixed shelves, the boards left as loads where they hang
    for board in boards:
        # A board of a rounded end lying flat is one of its shelves
        flat_end = board.part["role"] == "endPanel" and abs(board.normal[1]) > 0.5
        if (board.part["role"] in FLOORS or flat_end):
            rate = content_rate(board.part["itemName"])
            covered = any(other is not board and other.lo[1] >= board.hi[1] - 0.05 and other.lo[1] <= board.hi[1] + 0.05
                          and other.part["role"] == "bottom" and other.part["item"] != board.part["item"]
                          and min(other.hi[0], board.hi[0]) - max(other.lo[0], board.lo[0]) > board.length * 0.5
                          for other in boards)
            if covered:
                continue
            loads.append({"zone": f"contenu {rate} kg/dm2 sur {board.name}", "kind": "pressure", "board": board.index,
                          "face": "P2" if board.normal[1] > 0 else "P1", "rate": rate * KG_DM2,
                          "total": rate * KG_DM2 * board.area()})

    def hang(name, weight, points, what):
        points = [n for n in points if n is not None]
        if not points:
            notes.append(("charge non posée", name, what))
            return
        loads.append({"zone": name, "kind": "points", "nodes": points, "total": weight})

    holders = [(part, hole) for part in parts for hole in part["holes"] if id(part) in by_part]
    for part in parts:
        role = part["role"]
        if role not in LOADS_ONLY:
            continue
        own = part["length"] * part["width"] * part["thickness"] * density(TABLE, part) * GRAVITY
        box = box_of(part)
        same = [(holder, hole) for holder, hole in holders if holder["item"] == part["item"]]
        if (role == "door"):
            # The plates on the board by its hinge cups : the side it opens from, not the next door's
            cups = [hole_point(part, hole)[0] for hole in part["holes"] if hole["purpose"] == "hinge-cup"]
            hinge_x = sum(cups) / len(cups) if cups else (box.lo[0] + box.hi[0]) / 2
            plates = [(holder, hole) for holder, hole in same if hole["purpose"] == "plate-dowel"
                      and box.lo[1] - 5 <= hole_point(holder, hole)[1] <= box.hi[1] + 5]
            nearest_x = min((abs(hole_point(holder, hole)[0] - hinge_x) for holder, hole in plates), default=0.0)
            points = [by_part[id(holder)].nearest(hole_point(holder, hole)) for holder, hole in plates
                      if abs(hole_point(holder, hole)[0] - hinge_x) <= nearest_x + 15]
            hang(f"porte {part['itemName']} / {part['label']}", own, points, "pas d'embase trouvée")
        elif (role == "flap"):
            points = [by_part[id(holder)].nearest(hole_point(holder, hole)) for holder, hole in same
                      if hole["purpose"] == "flap-hinge"]
            hang(f"abattant {part['itemName']} / {part['label']}", own, points, "pas de charnière trouvée")
        elif (role == "shelf"):
            rate = content_rate(part["itemName"])
            weight = own + rate * KG_DM2 * part["length"] * part["width"]
            points = [by_part[id(holder)].nearest(hole_point(holder, hole)) for holder, hole in same
                      if hole["purpose"] == "shelf-pin"
                      and box.lo[1] - 25 <= hole_point(holder, hole)[1] <= box.lo[1] + 5
                      and box.lo[0] - 40 <= hole_point(holder, hole)[0] <= box.hi[0] + 40]
            hang(f"étagère et contenu {rate} kg/dm2, {part['itemName']} / {part['label']}", weight, points,
                 "pas de taquet trouvé")
        elif (role == "boxBottom"):
            rate = content_rate(part["itemName"])
            drawer = [piece for piece in parts if piece["item"] == part["item"]
                      and piece["role"] in ("boxSide", "boxEnd", "boxBottom", "drawerFront")
                      and box_of(piece).lo[0] < box.hi[0] + 30 and box_of(piece).hi[0] > box.lo[0] - 30
                      and box_of(piece).lo[1] < box.hi[1] + 250 and box_of(piece).hi[1] > box.lo[1] - 30]
            fronts = [piece for piece in drawer if piece["role"] == "drawerFront"]
            # One front for one box : the nearest over it
            if (len(fronts) > 1):
                keep = min(fronts, key=lambda piece: abs(box_of(piece).lo[1] - box.lo[1]))
                drawer = [piece for piece in drawer if piece["role"] != "drawerFront" or piece is keep]
            weight = sum(piece["length"] * piece["width"] * piece["thickness"] * density(TABLE, piece)
                         for piece in drawer) * GRAVITY
            weight += rate * KG_DM2 * part["length"] * part["width"]
            # The runner screws on a face looking at the box : an upright carry the next drawer on its other face
            centre = [(box.lo[k] + box.hi[k]) / 2 for k in range(3)]

            def facing(holder, hole):
                spot = hole_point(holder, hole)
                outward = scale(holder["frame"]["n"], -1 if hole["face"] == "A" else 1)
                return dot([centre[k] - spot[k] for k in range(3)], outward) > 0
            points = [by_part[id(holder)].nearest(hole_point(holder, hole)) for holder, hole in same
                      if hole["purpose"] == "runner-screw"
                      and box.lo[1] - 80 <= hole_point(holder, hole)[1] <= box.lo[1] + 80
                      and box.lo[0] - 80 <= hole_point(holder, hole)[0] <= box.hi[0] + 80 and facing(holder, hole)]
            hang(f"tiroir et contenu {rate} kg/dm2, {part['itemName']} / {part['label']}", weight, points,   
                 "pas de vis de coulisse trouvée")
        elif (role == "filler"):
            # Glued on its cleat : the nodes of the cleat it touches carry it, wherever the cleat's own screws go
            cleats = [by_part[id(piece)] for piece in parts if piece["item"] == part["item"] and piece["role"] == "cleat"
                      and id(piece) in by_part]
            points = [n for cleat in cleats for n, spot in cleat.nodes.items() if box.contains(spot, 1.0)]
            hang(f"fileur {part['itemName']} / {part['label']}", own, points, "pas de tasseau qui le touche")
    # Devices : their weight spread over the face of the board they stand on, under their footprint
    for device in model["loads"]:
        low, high = device["lo"], device["hi"]
        under = [slab for slab in boards if abs(slab.hi[1] - low[1]) < 1.0 and slab.lo[0] < high[0]
                 and slab.hi[0] > low[0] and slab.lo[2] < high[2] and slab.hi[2] > low[2]]
        points = [n for slab in under for n in slab.on_plane(1, slab.hi[1])
                  if low[0] <= slab.nodes[n][0] <= high[0] and low[2] <= slab.nodes[n][2] <= high[2]]
        hang(f"appareil {device['name']} ({device['massKg']} kg)", device["massKg"] * 9.81, points,
             "pas de panneau dessous")
    # The ties numbered after the last node of the boards and feet
    first = node_id + 1
    real = lambda ref: first + ref[1] if isinstance(ref, tuple) else ref
    for weld in welds:
        weld["a"], weld["b"] = real(weld["a"]), real(weld["b"])
    contacts = [(real(a), real(b), normal, gap) for a, b, normal, gap in contacts]
    numbered = [(first + k, point, shares) for k, (point, shares) in enumerate(ties)]
    return boards, welds, contacts, sorted(fixed), sorted(upright), loads, notes, node_id + len(ties), brick_id, numbered


def main():
    os.makedirs(OUT, exist_ok=True)
    model = MODEL
    # A board of a material the table lacks would fall back on another one : refused, never guessed
    unknown = sorted({part.get("material") for part in model["parts"] if part.get("frame")}
                     - set(TABLE["materials"]))
    if unknown:
        raise SystemExit(f"matériau absent de la table de l'entrée : {unknown}. Relancer scripts/fem_charges.ts.")
    boards, welds, contacts, fixed, upright, loads, notes, nodes, bricks, ties = build(model)
    tie_at = {node: point for node, point, _ in ties}
    # A load left out would leave the balance as well : it would check the loads kept, never that none was lost
    lost = [f"{what} ({why})" for kind, what, why in notes
            if kind in ("charge non posée", "appui non posé", "contact sans point", "fixation hors matière")]
    if lost:
        raise SystemExit("Simulation non publiée, charges ou appuis non posés : " + " ; ".join(lost))
    # Groups of boards no weld tie to a support only stand on contacts : friction holds them across, a soft
    # spring at each corner of their lowest board stands in for it
    root = list(range(len(boards)))

    def find(k):
        while (root[k] != k):
            root[k] = root[root[k]]
            k = root[k]
        return k
    owner = {n: b.index for b in boards for n in b.nodes}
    # A tie belongs to the board of the nodes it rides on
    owner.update({node: owner[shares[0][0]] for node, _, shares in ties})
    for weld in welds:
        root[find(owner[weld["a"]])] = find(owner[weld["b"]])
    held = {find(owner[n]) for n in list(fixed) + list(upright)}
    friction = []
    groups = {}
    for board in boards:
        groups.setdefault(find(board.index), []).append(board)
    for key, members in groups.items():
        if key in held:
            continue
        lowest = min(members, key=lambda b: b.lo[1])
        # A corner a curved outline cuts off has no node
        corners = [(0, 0, 0), (2 * lowest.cells_u, 0, 0), (0, 2 * lowest.cells_v, 0),
                   (2 * lowest.cells_u, 2 * lowest.cells_v, 0)]
        friction += [lowest.grid[key] for key in corners if key in lowest.grid]
        notes.append(("tenu par frottement", ", ".join(sorted(b.name for b in members)), ""))
    wood = [b for b in boards if b.part["role"] != "foot"]
    # Off the bricks kept : a curved board weighs what its outline holds, not it's rectangle
    weight = sum(b.area() * b.thick * density(TABLE, b.part) for b in wood) * GRAVITY
    applied = weight + sum(load["total"] for load in loads)
    watched = set(n for w in welds for n in (w["a"], w["b"])) | set(n for c in contacts for n in (c[0], c[1]))
    for board in boards:
        watched |= set(board.nodes)
    active = [c[3] <= 0.0 for c in contacts]
    path = os.path.join(OUT, JOB + ".inp")
    history = []
    # FEM_POST=1 : the results of the last run read again, nothing solved, its passes kept, and only off the deck of
    # this very input : an old .dat of another input or mesh would be published under the new fingerprint
    identity_path = os.path.join(OUT, JOB + "_identite.json")
    identity = {"empreinte": FINGERPRINT, "maille_mm": CELL, "raideur_soudure_N_mm": WELD_K}
    if (os.environ.get("FEM_POST") == "1"):
        kept = json.load(open(identity_path)) if os.path.exists(identity_path) else {}
        same = all(kept.get(key) == value for key, value in identity.items())
        dat = os.path.join(OUT, JOB + ".dat")
        if not (same and os.path.exists(path) and kept.get("sha256_inp") == sha256_of(path) and os.path.exists(dat)
                and kept.get("sha256_dat") == sha256_of(dat)):
            raise SystemExit(f"FEM_POST refusé : {identity_path} absent, ou deck et résultats d'un autre calcul (attendu "
                             f"{identity}). Relancer le calcul sans FEM_POST.")
        disp, totals = read_results(OUT, JOB)
        # The passes and the contacts of that very run, kept with its identity once it was published
        history = kept.get("passes", [])
        settled = set(kept.get("actifs", []))
        active = [k in settled for k in range(len(contacts))]
    for rounds in range(0 if os.environ.get("FEM_POST") == "1" else PASSES):
        write(path, boards, welds, contacts, active, fixed, upright, loads, friction, watched, TABLE, ties)
        disp, totals, finished = solve(OUT, JOB)
        forces = wrong_forces(contacts, active, disp)
        # A contact turns past SETTLE_N the wrong way, or past nothing at all once their sum overruns its share
        # of the load : 1e-4 mm let 10 N pull on each
        over = sum(forces.values()) > WRONG_SHARE * applied
        flip = [k for k, force in forces.items() if force > (0.0 if over else SETTLE_N)]
        for k in flip:
            active[k] = not active[k]
        changed = len(flip)
        history.append({"passe": rounds + 1, "contacts_actifs": sum(active), "changements": changed, "fin": finished})
        print(history[-1], flush=True)
        if (changed == 0 or not finished):
            break
    # Published only once settled : the solver done, no contact still changing, every watched node read and the
    # supports taking back what was applied
    last = history[-1] if history else None
    if (last is None or not last["fin"] or last["changements"] != 0):
        raise SystemExit(f"Simulation non publiée, pas convergée : {last}. Revoir les contacts ou augmenter PASSES.")
    # A NaN fails every comparison and so passes every test written as one : finite first, said the right way round
    missing = [n for n in watched if n not in disp or not all(math.isfinite(x) for x in disp[n])]
    if missing:
        raise SystemExit(f"Simulation non publiée : {len(missing)} noeuds suivis sans déplacement fini dans le .dat.")
    # Read on the anchors of the supports the reaction is whole : 1e-4 of the load and no more
    balanced = len(totals) == 3 and all(math.isfinite(x) for x in totals) and abs(totals[1] - applied) <= 1e-4 * applied
    if not balanced:
        raise SystemExit(f"Simulation non publiée : réaction verticale {totals[1] if totals else None} N pour "
                         f"{applied:.1f} N appliqués. Chercher une charge ou un appui perdu.")
    # The balance holds whatever the inner forces : a contact pulling, or one let go though the boards cross, is
    # summed apart and kept under a share of the load
    wrong = sum(wrong_forces(contacts, active, disp).values())
    if (not (math.isfinite(wrong) and wrong <= WRONG_SHARE * applied)):
        raise SystemExit(f"Simulation non publiée : {wrong:.1f} N dans des contacts qui tirent ou se croisent, plus de "
                         f"{WRONG_SHARE:.1%} des {applied:.1f} N appliqués. Augmenter PASSES ou revoir les contacts.")
    # Written once every check above passed : the deck, its results and the contacts it settled on, all of one run
    if (os.environ.get("FEM_POST") != "1"):
        with open(identity_path, "w") as f:
            json.dump({**identity, "sha256_inp": sha256_of(path), "sha256_dat": sha256_of(os.path.join(OUT, JOB +
                ".dat")),
                       "actifs": [k for k, on in enumerate(active) if on], "passes": history}, f, indent=1)
    # Each fastener, each board : what the run gives
    for weld in welds:
        force = [WELD_K * (disp[weld["a"]][k] - disp[weld["b"]][k]) for k in range(3)]
        weld["effort_N"] = math.hypot(*force)
        weld["composantes_N"] = force
        weld["position"] = tie_at.get(weld["a"]) or boards_node(boards, weld["a"])
    # Each foot : what its welds pass from the board down into it, upward on the board
    feet = []
    for post in (b for b in boards if b.part["role"] == "foot"):
        mine = [w for w in welds if w["type"] == "foot" and w["pieces"][0] == post.name] 
        carried = sum(w["composantes_N"][1] for w in mine)
        feet.append({"pied": post.name, "sous": mine[0]["pieces"][1] if mine else "", "effort_N": carried,
                     "kg": carried / 9.81, "position": [post.lo[0] + FOOT_SIDE / 2, post.lo[2] + FOOT_SIDE / 2]})
    per_board = []
    for board in wood:
        values = [disp[n] for n in board.nodes if n in disp]
        down = min((v[1] for v in values), default=0.0)
        size = max((math.hypot(*v) for v in values), default=0.0)
        sag, settle = own_sag(board, disp)
        per_board.append({"piece": board.name, "role": board.part["role"], "fleche_propre_mm": sag,
                          "tassement_mm": settle, "fleche_verticale_max_mm": -down,
                          "deplacement_max_mm": size, "longueur_mm": board.length, "largeur_mm": board.width,
                          "epaisseur_mm": board.thick, "box": [board.lo, board.hi],
                          "contour": [add(add(board.origin, scale(board.along, u)), scale(board.across, v))
                                      for u, v in board.shape] if board.shape else None})
    fasteners = [w for w in welds if w["type"] != "foot"]
    report = {"source": SOURCE, "empreinte": FINGERPRINT, "maille_mm": CELL, "panneaux": len(wood), "noeuds": nodes,
              "briques": bricks,
              "soudures": len(fasteners), "contacts": len(contacts), "points_fixes": len(fixed), "pieds": len(feet),
              "appuis_sol": len(upright), "charges_pieds": sorted(feet, key=lambda f: -f["effort_N"]),
              "pied_modele": {"cote_mm": FOOT_SIDE, "E_MPa": E_FOOT,
                              "source": "fût AXILO 78 Ø 30 (Häfele 637.76.35x), carré de même aire ; plastique sans module "
                                        "publié : acier, pied indéformable"},
              "poids_bois_N": weight, "charge_totale_N": applied, "reactions_N": totals, "passes": history,
              "contacts_a_tort_N": wrong,
              "raideur_soudure_N_mm": WELD_K,
              "materiaux": {name: {**TABLE["materials"][name], "nu": TABLE["poisson"]}
                            for name in sorted({b.part["material"] for b in wood})},
              "poisson_source": TABLE["poissonSource"],
              "hypotheses": ["soudure rigide à chaque fixation (borne favorable : aucune vis ne glisse), ses deux bouts "
                             "au même point, chacun interpolé dans la brique qui le contient (aucune raideur ajoutée "
                             "quand le meuble tourne d'un bloc)",
                             "contact unilatéral entre panneaux qui se touchent, sans frottement, ses deux bouts "
                             "interpolés de même",
                             "portes, façades, tiroirs, étagères réglables, fileurs : poids et contenu là où ils pendent",
                             "plinthes écartées, pieds maillés et soudés sous leur panneau, posés au sol, vis au mur en "
                             "points fixes",
                             f"contenu {LIGHT} kg/dm2 dans les placards hauts, {MODEL['shelfLoad']} kg/dm2 ailleurs"],
              "notes": notes, "charges": [{**{k: v for k, v in load.items() if k != "nodes"},
                                           "noeuds": load.get("nodes", [])}
                                          for load in loads],
              "fixations": sorted(fasteners, key=lambda w: -w["effort_N"]), "pieces": per_board}
    with open(os.path.join(OUT, JOB + "_fem.json"), "w") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: report[k] for k in ("panneaux", "noeuds", "soudures", "contacts", "poids_bois_N",
                                             "charge_totale_N", "reactions_N")}, ensure_ascii=False))


def wrong_forces(contacts, active, disp):
    """N carried the wrong way by each contact : a pull on one that bears, a crossing on one let go"""
    out = {}
    for k, (a, b, normal, clearance) in enumerate(contacts):
        if (a in disp and b in disp):
            closing = sum((disp[a][i] - disp[b][i]) * normal[i] for i in range(3))
            force = CONTACT_K * (clearance - closing if active[k] else closing - clearance)
            if (force > 0.0 or not math.isfinite(force)):
                out[k] = force
    return out


def own_sag(board, disp):
    """A flat board : its own sag and how far it settled, or None twice for any other board"""
    # Each point against the straight line between the 2 ends of its own line along the length, wherever a curved
    # outline cut that line short. One chord per line takes off any rigid motion, a turn about the length included
    # which a chord averaged over the depth left in
    if (abs(board.normal[1]) <= 0.5):
        return None, None
    lines = {}
    for (i, j, k), n in board.grid.items():
        if n in disp:
            lines.setdefault((j, k), {})[i] = disp[n][1]
    chords = [(min(line), max(line), line) for line in lines.values() if len(line) > 1]
    if not chords:
        return None, None
    settle = -sum(line[i0] + line[i1] for i0, i1, line in chords) / (2 * len(chords))
    sag = max(line[i0] + (line[i1] - line[i0]) * (i - i0) / (i1 - i0) - down
              for i0, i1, line in chords for i, down in line.items())
    return sag, settle


def boards_node(boards, node):
    for board in boards:
        if node in board.nodes:
            return board.nodes[node]
    return None


if __name__ == "__main__":
    # Usage : fem_meuble.py <job>_entree.json <output folder> [cell size], the input from scripts/fem_charges.ts
    try:
        SOURCE, OUT, CELL, JOB = checked_args(sys.argv)
    except ValueError as err:
        sys.exit(str(err))
    # Read once : the bytes hashed are the bytes the model is built from
    with open(SOURCE, "rb") as handle:
        RAW = handle.read()
    MODEL, FINGERPRINT = json.loads(RAW.decode("utf-8")), fingerprint(RAW)
    TABLE = MODEL["materials"]
    main()
