#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The pieces of the finite element model a wrong figure would hide in : python3 -I -m unittest discover -s scripts"""

import math
import os
import random
import tempfile
import unittest

import fem_calculix
import fem_meuble
from fem_meuble import checked_args, fingerprint, own_sag
from fem_panneau import OUTSIDE_MM, Board

# A left handed frame and a right handed one, both turned in the room
FRAMES = ({"o": [10, 20, 30], "u": [1, 0, 0], "v": [0, 0, -1], "n": [0, 1, 0]},
          {"o": [5, 0, 0], "u": [0, 1, 0], "v": [0, 0, -1], "n": [-1, 0, 0]})


def board(frame, length=437.0, width=291.0, role="side"):
    b = Board({"itemName": "x", "label": "y", "role": role, "holes": [], "length": length, "width": width,
               "thickness": 19.0, "frame": frame}, 0)
    b.mesh(0, 0, 35)
    return b


def at(frame, u, v, w):
    return [frame["o"][k] + frame["u"][k] * u + frame["v"][k] * v + frame["n"][k] * w for k in range(3)]


class Fingerprint(unittest.TestCase):

    # The published vectors of FNV-1a over 64 bits, what femFingerprint gives in the software for the same bytes
    def test_known_vectors(self):
        self.assertEqual(fingerprint(b""), "cbf29ce484222325")
        self.assertEqual(fingerprint(b"a"), "af63dc4c8601ec8c")
        self.assertEqual(fingerprint('"é"'.encode()), "162b0081d9700039")


class Ties(unittest.TestCase):

    # A tie moves as its brick at the point it stand for : its shares must sum to 1 and give the point back, or a
    # weld between 2 boards turning together would be loaded by the turn alone
    def test_point_given_back_inside_and_just_past_a_face(self):
        rng = random.Random(7)
        for frame in FRAMES:
            b = board(frame)
            worst = 0.0
            for _ in range(1500):
                u = rng.uniform(-OUTSIDE_MM * 0.9, 437 + OUTSIDE_MM * 0.9)
                v = rng.uniform(-OUTSIDE_MM * 0.9, 291 + OUTSIDE_MM * 0.9)
                w = rng.uniform(-OUTSIDE_MM * 0.9, 19 + OUTSIDE_MM * 0.9)
                point = at(frame, u, v, w)
                shares = b.weights(point)
                self.assertIsNotNone(shares)
                back = [sum(s * b.nodes[n][k] for n, s in shares) for k in range(3)]
                worst = max(worst, abs(sum(s for _, s in shares) - 1), max(abs(back[k] - point[k]) for k in range(3)))
            self.assertLess(worst, 1e-9)

    def test_point_far_off_the_board_refused(self):
        b = board(FRAMES[0])
        self.assertIsNone(b.weights(at(FRAMES[0], 100, 100, 19 + OUTSIDE_MM + 1)))
        self.assertIsNone(b.weights(at(FRAMES[0], -OUTSIDE_MM - 1, 100, 5)))


class OwnSag(unittest.TestCase):

    def setUp(self):
        self.frame = {"o": [0, 700, 0], "u": [1, 0, 0], "v": [0, 0, 1], "n": [0, 1, 0]}
        self.top = board(self.frame, 800.0, 500.0, "top")

    def sag(self, field):
        return own_sag(self.top, {n: field(p) for n, p in self.top.nodes.items()})[0]

    # A rigid motion is no sag : the turn about the length, read as 0,25 mm on a 500 mm deep board by a chord
    # averaged over the depth, above all
    def test_rigid_motion_is_no_sag(self):
        c = [400, 709, 250]
        for th in ((1e-3, 0, 0), (0, 1e-3, 0), (0, 0, 1e-3)):
            def rigid(p, th=th):
                d = [p[k] - c[k] for k in range(3)]
                return [0.1 + th[1] * d[2] - th[2] * d[1], -0.3 + th[2] * d[0] - th[0] * d[2],
                        th[0] * d[1] - th[1] * d[0]]
            self.assertLess(abs(self.sag(rigid)), 1e-12)

    def test_bending_read_whole(self):
        self.assertAlmostEqual(self.sag(lambda p: [0, -0.5 * math.sin(math.pi * p[0] / 800), 0]), 0.5, places=9)

    def test_upright_board_has_none(self):
        side = board(FRAMES[1])
        self.assertEqual(own_sag(side, {n: [0, 0, 0] for n in side.nodes}), (None, None))


class Contacts(unittest.TestCase):

    # A bottom against the face of a side : a 19 mm strip some meshes leave with no row of nodes, the edge held by
    # its own nodes then
    def test_from_both_boards_on_every_mesh(self):
        frame = lambda o, u, n: {"o": o, "u": u, "v": [0, 0, 1], "n": n}
        part = lambda label, role, length, f: {"item": "i0", "itemName": "Essai", "label": label, "role": role,
                                              "length": length, "width": 400, "thickness": 19, "frame": f,
                                              "outline": None, "material": "p2", "holes": []}
        fem_meuble.MODEL = {"parts": [part("Joue", "side", 700, frame([0, 0, 0], [0, 1, 0], [1, 0, 0])),
                                      part("Dessous", "bottom", 600, frame([19, 100, 0], [1, 0, 0], [0, 1, 0]))],
                            "fitted": [], "loads": [], "shelfLoad": 1.0,
                            "materials": {"poisson": 0.3, "poissonSource": "", "materials": {"p2": {"modulus": 3000,
                                                                                                "density": 600}}}}
        fem_meuble.TABLE = fem_meuble.MODEL["materials"]
        for cell in (60.0, 35.0, 30.0):
            fem_meuble.CELL = cell
            boards, welds, contacts = fem_meuble.build(fem_meuble.MODEL)[:3]
            notes = fem_meuble.build(fem_meuble.MODEL)[6]
            side = next(b for b in boards if b.part["role"] == "side")
            bottom = next(b for b in boards if b.part["role"] == "bottom")
            self.assertTrue(any(a in side.nodes for a, _, _, _ in contacts), cell)
            self.assertTrue(any(b in bottom.nodes for _, b, _, _ in contacts), cell)
            self.assertFalse([n for n in notes if n[0] == "contact sans point"], cell)


class Supports(unittest.TestCase):

    # The reaction is read on anchors of their own : a share a tie or a load sends straight into a held node of a
    # board is left out of CalculiX's total, 0,42 % of the TV at 60 mm
    def test_held_through_anchors_alone(self):
        fem_meuble.CELL = 60.0
        model = {"parts": [{"item": "i0", "itemName": "Essai", "label": "Dessous", "role": "bottom", "length": 600,
                            "width": 400, "thickness": 19, "outline": None, "material": "p2", "holes": [],
                            "frame": {"o": [0, 100, 0], "u": [1, 0, 0], "v": [0, 0, 1], "n": [0, 1, 0]}}],
                 "fitted": [], "loads": [], "shelfLoad": 1.0,
                 "materials": {"poisson": 0.3, "poissonSource": "", "materials": {"p2": {"modulus": 3000,
                                                                                    "density": 600}}}}
        fem_meuble.MODEL, fem_meuble.TABLE = model, model["materials"]
        boards = fem_meuble.build(model)[0]
        nodes = sorted(boards[0].nodes)
        fixed, upright = nodes[:3], nodes[3:6]
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "essai.inp")
            fem_calculix.write(path, boards, [], [], [], fixed, upright, [], [], set(nodes), model["materials"])
            with open(path) as handle:
                deck = handle.read()
        held = deck.split("*NSET,NSET=APPUIS\n")[1].split("*")[0].split()
        anchors = {int(n) for n in held}
        # Each support an anchor of its own, none of them a node of the board
        self.assertEqual(len(anchors), 6)
        self.assertFalse(anchors & set(boards[0].nodes))
        # The springs of the supports run from the board to an anchor, all 3 axes for a fixed point, the vertical
        # one for a foot
        springs = {}
        for dof in (1, 2, 3):
            block = deck.split(f"*ELEMENT,TYPE=SPRING2,ELSET=A{dof}\n")
            pairs = [line.split(",")[1:] for line in block[1].split("*")[0].split()] if len(block) > 1 else []
            springs[dof] = {(int(a), int(b)) for a, b in pairs}
        for dof in (1, 2, 3):
            ends = {a for a, b in springs[dof]}
            self.assertTrue(all(b in anchors for _, b in springs[dof]))
            self.assertEqual(ends, set(fixed) | (set(upright) if dof == 2 else set()))
        self.assertIn("APPUIS,1,3,0.", deck)
        self.assertNotIn("FIXES", deck)


# TODO : the passes of the contacts, the balance and FEM_POST are only proved by a real run of ccx, none of them
# run here on a model small enought to keep in a test
class Input(unittest.TestCase):

    def test_only_an_input_written_by_fem_charges(self):
        with self.assertRaises(ValueError):
            checked_args(["fem_meuble.py", __file__, "/tmp"])


if __name__ == "__main__":
    unittest.main()
