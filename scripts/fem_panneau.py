#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""One board of a piece meshed in 20 node bricks, its outline followed when it is curved"""

import math

# Cell of a board with a curved outline, fine enough for its staircase to follow the arc
CURVED_CELL = 10.0
# How far past a face, in mm, a fastener may sit and still be tied to the board : a screw seat on the face of a
# lining. TODO : a hanging upright, sat on nothing under it, still reach a top and count as one of its carriers
OUTSIDE_MM = 2.0


def add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def scale(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def outline_polygon(outline, steps=32):
    """The outline of a board in its own u, v, its arcs cut in short lines : None for a plain rectangle"""
    if (not outline or not any(seg["kind"] == "arc" for seg in outline["segments"])):
        return None
    points = [tuple(outline["start"])]
    for seg in outline["segments"]:
        x0, y0 = points[-1]
        if (seg["kind"] != "arc"):
            points.append((seg["x"], seg["y"]))
            continue
        cx, cy = seg["cx"], seg["cy"]
        radius = math.hypot(x0 - cx, y0 - cy)
        a0, a1 = math.atan2(y0 - cy, x0 - cx), math.atan2(seg["y"] - cy, seg["x"] - cx)
        # Ccw turns the angle up, the other way down, never more then a turn
        while (seg["ccw"] and a1 <= a0):
            a1 += 2 * math.pi
        while (not seg["ccw"] and a1 >= a0):
            a1 -= 2 * math.pi
        sweep = a1 - a0
        points += [(cx + radius * math.cos(a0 + sweep * k / steps), cy + radius * math.sin(a0 + sweep * k / steps))
                   for k in range(1, steps + 1)]
    return points


def inside(point, polygon):
    """Even-odd ray cast along +u"""
    x, y = point
    crossings = 0
    for (x0, y0), (x1, y1) in zip(polygon, polygon[1:] + polygon[:1]):
        if ((y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0)):
            crossings += 1
    return crossings % 2 == 1


def hole_point(part, hole):
    frame = part["frame"]
    # A hole in an edge : its u and v on that edge, w across the thickness
    depth = 0.0 if hole["face"] == "A" else part["thickness"] if hole["face"] == "B" else hole.get("w",
        part["thickness"] / 2)
    return add(add(add(frame["o"], scale(frame["u"], hole["u"])), scale(frame["v"], hole["v"])), scale(frame["n"],
        depth))


class Board:
    """One board, its box in the room and its bricks"""

    def __init__(self, part, index):
        self.part = part
        self.name = f"{part['itemName']} / {part['label']}"
        frame = part["frame"]
        self.origin, self.along, self.across, self.normal = frame["o"], frame["u"], frame["v"], frame["n"]
        self.length, self.width, self.thick = part["length"], part["width"], part["thickness"]
        corners = [add(add(self.origin, scale(self.along, a)), scale(self.across, b))
                   for a in (0, self.length) for b in (0, self.width)]
        corners += [add(c, scale(self.normal, self.thick)) for c in corners]
        self.lo = [min(c[k] for c in corners) for k in range(3)]
        self.hi = [max(c[k] for c in corners) for k in range(3)]
        self.index = index
        self.nodes, self.bricks, self.grid = {}, [], {}
        self.shape = None
        self.kept = set()


    # What the kept bricks cover : a curved board its outline, not its rectangel
    def area(self):
        return len(self.bricks) * (self.length / self.cells_u) * (self.width / self.cells_v)

    def contains(self, point, tol=0.5):
        return all(self.lo[k] - tol <= point[k] <= self.hi[k] + tol for k in range(3))

    def mesh(self, node_id, brick_id, cell):
        # A curved outline : finer, and only the bricks whose middle lies inside it, the corners it cuts off don't exist
        self.shape = outline_polygon(self.part.get("outline"))
        size = min(cell, CURVED_CELL) if self.shape else cell
        self.cells_u = max(1, math.ceil(self.length / size))
        self.cells_v = max(1, math.ceil(self.width / size))
        step_u, step_v = self.length / (2 * self.cells_u), self.width / (2 * self.cells_v)
        for k in range(3):
            for j in range(2 * self.cells_v + 1):
                for i in range(2 * self.cells_u + 1):
                    if ((i % 2) + (j % 2) + (k % 2) >= 2):
                        continue
                    node_id += 1
                    self.grid[(i, j, k)] = node_id
                    self.nodes[node_id] = add(add(add(self.origin, scale(self.along, i * step_u)),
                                                  scale(self.across, j * step_v)), scale(self.normal, k *
                                                      self.thick / 2))
        # A left handed frame takes its corners the other way round : each brick keeps a positive volume
        right = dot(cross(self.along, self.across), self.normal) > 0
        for j in range(self.cells_v):
            for i in range(self.cells_u):
                a, b = 2 * i, 2 * j
                if (self.shape and not inside(((a + 1) * step_u, (b + 1) * step_v), self.shape)):
                    continue

                def at(di, dj, dk):
                    return self.grid[(a + di, b + dj, dk)] if right else self.grid[(a + dj, b + di, dk)]
                brick_id += 1
                self.kept.add((i, j))
                self.bricks.append((brick_id, [at(0, 0, 0), at(2, 0, 0), at(2, 2, 0), at(0, 2, 0),
                                               at(0, 0, 2), at(2, 0, 2), at(2, 2, 2), at(0, 2, 2),
                                               at(1, 0, 0), at(2, 1, 0), at(1, 2, 0), at(0, 1, 0),
                                               at(1, 0, 2), at(2, 1, 2), at(1, 2, 2), at(0, 1, 2),
                                               at(0, 0, 1), at(2, 0, 1), at(2, 2, 1), at(0, 2, 1)]))
        if self.shape:
            # Nodes no brick uses : nothing may hang on them
            used = {n for _, corners in self.bricks for n in corners}
            self.nodes = {n: p for n, p in self.nodes.items() if n in used}
            self.grid = {key: n for key, n in self.grid.items() if n in used}
        return node_id, brick_id

    def nearest(self, point):
        """The node of the board next to a point, None when no wood lies within a cell of it"""
        best, far = None, 1e18
        offset = [point[k] - self.origin[k] for k in range(3)]
        i0 = round(dot(offset, self.along) / (self.length / (2 * self.cells_u)))
        j0 = round(dot(offset, self.across) / (self.width / (2 * self.cells_v)))
        k0 = round(dot(offset, self.normal) / (self.thick / 2))
        for i in range(i0 - 1, i0 + 2):
            for j in range(j0 - 1, j0 + 2):
                for k in range(k0 - 1, k0 + 2):
                    key = (min(2 * self.cells_u, max(0, i)), min(2 * self.cells_v, max(0, j)), min(2, max(0, k)))
                    node = self.grid.get(key)
                    if node is None:
                        continue
                    gap = sum((self.nodes[node][m] - point[m]) ** 2 for m in range(3))
                    if (gap < far):
                        best, far = node, gap
        return best

    def weights(self, point):
        """Each node of the brick holding a point with its share, the 20 node serendipity functions at it, or None"""
        offset = [point[k] - self.origin[k] for k in range(3)]
        u, v, w = dot(offset, self.along), dot(offset, self.across), dot(offset, self.normal)
        # Off the board by more than OUTSIDE_MM : no wood there, never a point pulled in without a word
        out = max(-u, u - self.length, -v, v - self.width, -w, w - self.thick)
        if (out > OUTSIDE_MM):
            return None
        size_u, size_v = self.length / self.cells_u, self.width / self.cells_v
        i = min(max(int(u // size_u), 0), self.cells_u - 1)
        j = min(max(int(v // size_v), 0), self.cells_v - 1)
        if (i, j) not in self.kept:
            return None
        # xi, eta, zeta : the point in the brick, -1 to 1 inside it. Just past a face they run a little over 1 : the
        # functions hold every linear field there too, a rigid motion of the brick given back exactly at the point
        xi, eta, zeta = 2 * (u - (i + 0.5) * size_u) / size_u, 2 * (v - (j + 0.5) *
                                                                    size_v) / size_v, 2 * w / self.thick - 1
        shares = []
        for dk in range(3):
            for dj in range(3):
                for di in range(3):
                    if ((di % 2) + (dj % 2) + (dk % 2) >= 2):
                        continue
                    node = self.grid.get((2 * i + di, 2 * j + dj, dk))
                    if node is None:
                        # A brick a curved outline left out : no wood at that point
                        return None
                    a, b, c = di - 1, dj - 1, dk - 1
                    if (a and b and c):
                        share = (1 + xi * a) * (1 + eta * b) * (1 + zeta * c) * (xi * a + eta * b + zeta * c - 2) / 8
                    elif not a:
                        share = (1 - xi * xi) * (1 + eta * b) * (1 + zeta * c) / 4
                    elif not b:
                        share = (1 + xi * a) * (1 - eta * eta) * (1 + zeta * c) / 4
                    else:
                        share = (1 + xi * a) * (1 + eta * b) * (1 - zeta * zeta) / 4
                    if (abs(share) > 1e-12):
                        shares.append((node, share))
        return shares

    def on_plane(self, axis, level):
        return [node for node, pos in self.nodes.items() if abs(pos[axis] - level) < 0.01]
