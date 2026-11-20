#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The CalculiX deck of a piece written, solved and read back : bricks, welds, contacts, supports, loads"""

import os
import re
import subprocess

# N/mm, rigid next to a board : FEM_WELD_K lowers it for a sensitivity run, no slip modulus of a fastener in P2 being
# sourced
WELD_K = float(os.environ.get("FEM_WELD_K", "1e6"))
CONTACT_K = 1e5
FRICTION_K = 10.0
# mm/s2 : with t and mm, forces come out in N
GRAVITY = 9810.0
# The plastic of the AXILO 78 has no published modulus : steel, a foot that doesn't give, the worst case for the
# most loaded one
E_FOOT, POISSON_FOOT = 210000.0, 0.3


# t/mm3 of a board : the check density of its material, the one the software weigh loads with
def density(table, part):
    return table["materials"][part["material"]]["density"] * 1e-12


def write(path, boards, welds, contacts, active, fixed, upright, loads, friction, watched, table, ties=()):
    lines = ["*NODE"]
    for board in boards:
        lines += [f"{n},{p[0]:.4f},{p[1]:.4f},{p[2]:.4f}" for n, p in board.nodes.items()]
    lines += [f"{n},{p[0]:.4f},{p[1]:.4f},{p[2]:.4f}" for n, p, _ in ties]
    # Each support an anchor of its own, held on all 3 axes and sprung to the board on the axes the support holds :
    # the reaction read on the anchors is whole, a share a tie or a load sends straight into a held node of the
    # board left out of CalculiX's total otherwize
    held = {n: (1, 2, 3) for n in fixed}
    for n in upright:
        held.setdefault(n, (2,))
    supports = sorted(held)
    top = max([n for board in boards for n in board.nodes] + [n for n, _, _ in ties])
    anchor = {n: top + k for k, n in enumerate(supports, start=1)}
    where = {n: p for board in boards for n, p in board.nodes.items()}
    lines += [f"{anchor[n]},{where[n][0]:.4f},{where[n][1]:.4f},{where[n][2]:.4f}" for n in supports]
    # Each tie moves as its board at its point : u_tie - sum(share u_node) = 0 on each axis, 4 terms a line at most
    if ties:
        lines.append("*EQUATION")
        for node, _, shares in ties:
            for dof in (1, 2, 3):
                terms = [(node, dof, 1.0)] + [(n, dof, -share) for n, share in shares]
                lines.append(str(len(terms)))
                for k in range(0, len(terms), 4):
                    lines.append(",".join(f"{n},{d},{c:.12g}" for n, d, c in terms[k:k + 4]))
    for board in boards:
        lines.append(f"*ELEMENT,TYPE=C3D20R,ELSET=B{board.index}")
        # 16 values at most on a line : a 20 node brick goes on 2
        lines += [f"{e}," + ",".join(map(str, c[:15])) + ",\n" + ",".join(map(str, c[15:])) for e, c in board.bricks]
    wood = [board for board in boards if board.part["role"] != "foot"]
    posts = [board for board in boards if board.part["role"] == "foot"]
    # Only the wood weighs, the feet carry
    lines += ["*ELSET,ELSET=BOIS"] + [f"B{board.index}" for board in wood]
    # Numbered right after the last brick : CalculiX sizes its tables by the highest element number
    spring = max(board.bricks[-1][0] for board in boards)
    for dof in (1, 2, 3):
        lines.append(f"*ELEMENT,TYPE=SPRING2,ELSET=W{dof}")
        for weld in welds:
            spring += 1
            lines.append(f"{spring},{weld['a']},{weld['b']}")
        lines += [f"*SPRING,ELSET=W{dof}", f"{dof},{dof}", f"{WELD_K}"]
    for dof in (1, 3):
        lines.append(f"*ELEMENT,TYPE=SPRING1,ELSET=F{dof}")
        for node in friction:
            spring += 1
            lines.append(f"{spring},{node}")
        lines += [f"*SPRING,ELSET=F{dof}", f"{dof}", f"{FRICTION_K}"]

    for axis in range(3):
        pairs = [c for k, c in enumerate(contacts) if active[k] and c[2][axis] > 0.5]
        if pairs:
            lines.append(f"*ELEMENT,TYPE=SPRING2,ELSET=C{axis + 1}")
            for a, b, *_ in pairs:
                spring += 1
                lines.append(f"{spring},{a},{b}")
            lines += [f"*SPRING,ELSET=C{axis + 1}", f"{axis + 1},{axis + 1}", f"{CONTACT_K}"]
    # Each board its own material : its modulus and its density, one Poisson ratio for every panel
    for name in sorted({board.part["material"] for board in wood}):
        spec = table["materials"][name]
        lines += [f"*MATERIAL,NAME=M_{name.upper()}", "*ELASTIC", f"{spec['modulus']},{table['poisson']}", "*DENSITY",
                  f"{spec['density'] * 1e-12}"]
    lines += [f"*SOLID SECTION,ELSET=B{board.index},MATERIAL=M_{board.part['material'].upper()}" for board in wood]
    if posts:
        lines += ["*MATERIAL,NAME=PIED", "*ELASTIC", f"{E_FOOT},{POISSON_FOOT}", "*DENSITY", "1e-12"]
        lines += [f"*SOLID SECTION,ELSET=B{board.index},MATERIAL=PIED" for board in posts]
    for axis in (1, 2, 3):
        sprung = [n for n in supports if axis in held[n]]
        if sprung:
            lines.append(f"*ELEMENT,TYPE=SPRING2,ELSET=A{axis}")
            for n in sprung:
                spring += 1
                lines.append(f"{spring},{n},{anchor[n]}")
            lines += [f"*SPRING,ELSET=A{axis}", f"{axis},{axis}", f"{WELD_K}"]
    lines += ["*NSET,NSET=APPUIS"] + [str(anchor[n]) for n in supports] + ["*BOUNDARY", "APPUIS,1,3,0."]
    lines += ["*NSET,NSET=SUIVIS"] + [str(n) for n in sorted(watched)]
    lines += ["*STEP", "*STATIC", "*DLOAD", f"BOIS,GRAV,{GRAVITY},0.,-1.,0."]
    for load in loads:
        if (load["kind"] == "pressure"):
            lines += [f"{e},{load['face']},{load['rate']}" for e, _ in boards[load["board"]].bricks]
    lines.append("*CLOAD")
    for load in loads:
        if (load["kind"] == "points"):
            lines += [f"{n},2,{-load['total'] / len(load['nodes'])}" for n in load["nodes"]]
    # A contact with a gap pushes only past it : its spring counts from the start, a pair of forces k.gap takes the
    # gap back off, k (closing - gap) on the boards
    for k, (a, b, normal, clearance) in enumerate(contacts):
        if (active[k] and clearance > 0.0):
            axis = max(range(3), key=lambda i: abs(normal[i]))
            lines += [f"{a},{axis + 1},{CONTACT_K * clearance * normal[axis]}",
                      f"{b},{axis + 1},{-CONTACT_K * clearance * normal[axis]}"]
    lines += ["*NODE FILE", "U", "*EL FILE", "S", "*NODE PRINT,NSET=SUIVIS", "U",
              "*NODE PRINT,NSET=APPUIS,TOTALS=ONLY", "RF", "*END STEP"]
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def solve(folder, job):
    out = subprocess.run(["flatpak", "run", "--command=ccx", "org.freecad.FreeCAD", "-i", job], cwd=folder,
                         capture_output=True, text=True)
    with open(os.path.join(folder, job + ".log"), "w") as f:
        f.write(out.stdout + out.stderr)
    disp, totals = read_results(folder, job)
    return disp, totals, "Job finished" in out.stdout


def read_results(folder, job):
    """The displacements of the watched nodes and the total reaction, off the .dat of the last solve"""
    disp, totals, mode = {}, [], None
    for line in open(os.path.join(folder, job + ".dat")):
        low = line.strip().lower()
        if low.startswith("displacements"):
            mode = "u"
            continue
        if low.startswith("total force"):
            mode = "rf"
            continue
        cells = line.split()
        if (mode == "u" and len(cells) == 4 and re.match(r"^\d+$", cells[0])):
            disp[int(cells[0])] = tuple(float(x) for x in cells[1:])
        elif (mode == "rf" and len(cells) == 3):
            totals = [float(x) for x in cells]
    return disp, totals
