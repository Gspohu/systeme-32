#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The pieces of the finite element model a wrong figure would hide in : python3 -I -m unittest discover -s scripts"""

import json
import math
import os
import random
import tempfile
import unittest

import fem_calculix
import fem_meuble
import fem_rapport
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


class Fasteners(unittest.TestCase):

    # A link screw is drilled through both joues : a weld from each hole, the same point, the pieces the other way
    # round. The screw carries the sum, 2 x 138 N on the most loaded one of the dresser
    def test_screw_through_both_boards_counted_once_with_the_sum(self):
        one = {"type": "link-screw", "pieces": ["A", "B"], "position": [10.0, 20.0, 30.0],
               "composantes_N": [3.0, -4.0, 0.0], "effort_N": 5.0}
        back = {**one, "pieces": ["B", "A"], "position": [10.0, 20.0, 30.004], "composantes_N": [-3.0, 4.0, 0.0]}
        apart = {**one, "position": [10.0, 52.0, 30.0], "composantes_N": [0.0, 1.0, 0.0], "effort_N": 1.0}
        merged = fem_meuble.merged_fasteners([one, back, apart])
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["soudures"], 2)
        self.assertAlmostEqual(merged[0]["effort_N"], 10.0)
        self.assertEqual(merged[1]["soudures"], 1)
        self.assertAlmostEqual(merged[1]["effort_N"], 1.0)


class Deck(unittest.TestCase):

    # FEM_POST reads node numbers off the .dat : the deck the code builds again must be told apart from another one
    def test_digest_sees_a_support_moved(self):
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
        digest = lambda upright: fem_meuble.deck_digest(boards, [], [], [], nodes[:3], upright, [], [], set(nodes), [])
        self.assertEqual(digest(nodes[3:6]), digest(nodes[3:6]))
        self.assertNotEqual(digest(nodes[3:6]), digest(nodes[3:5] + nodes[7:8]))


class Report(unittest.TestCase):

    # The .frd glues a negative value to the one before it : read by columns of 12, never split on blanks
    def test_stress_read_by_columns(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "essai.frd")
            with open(path, "w") as handle:
                handle.write(" -4  STRESS      6    1\n -5  SXX         1    4    1    1\n"
                             " -1         1-3.01902E-02 3.99358E-03 3.21025E-02-6.00173E-02 7.41549E-02-1.27243E-02\n"
                             " -1        12 1.00000E+00 2.00000E+00 3.00000E+00 4.00000E+00 5.00000E+00 6.00000E+00\n"
                             " -3\n -4  ERROR       1    1\n -1         1 9.00000E+00\n")
            out = fem_rapport.stresses(path)
        self.assertEqual(sorted(out), [1, 12])
        self.assertEqual(out[1], [-3.01902e-02, 3.99358e-03, 3.21025e-02, -6.00173e-02, 7.41549e-02, -1.27243e-02])
        self.assertEqual(out[12][5], 6.0)

    def test_largest_principal_keeps_its_sign(self):
        values = fem_rapport.largest_principal([[-5, 1, 0, 0, 0, 0], [0, 0, 0, 2, 0, 0]])
        self.assertAlmostEqual(values[0], -5.0)
        self.assertAlmostEqual(abs(values[1]), 2.0)

    # A report on the run of an older model would be read as the piece of today
    def test_stale_run_refused(self):
        with tempfile.TemporaryDirectory() as root:
            run = os.path.join(root, "tv")
            os.makedirs(run)
            raw = b'{"parts": []}'
            with open(os.path.join(root, "tv_entree.json"), "wb") as handle:
                handle.write(raw)
            for name, body in (("tv.inp", b"deck"), ("tv.dat", b"results")):
                with open(os.path.join(run, name), "wb") as handle:
                    handle.write(body)
            stamp = fingerprint(raw)
            identity = {"empreinte": stamp, "sha256_inp": fem_rapport.sha256_of(os.path.join(run, "tv.inp")),
                        "sha256_dat": fem_rapport.sha256_of(os.path.join(run, "tv.dat"))}
            for name, body in (("tv_identite.json", identity), ("tv_fem.json", {"empreinte": stamp, "fixations": []})):
                with open(os.path.join(run, name), "w") as handle:
                    json.dump(body, handle)
            today = os.path.join(root, "today.json")
            with open(today, "wb") as handle:
                handle.write(raw)
            self.assertEqual(fem_rapport.checked_run(run, "tv", today)[2], {"parts": []})
            with open(today, "wb") as handle:
                handle.write(b'{"parts": [1]}')
            with self.assertRaises(SystemExit) as caught:
                fem_rapport.checked_run(run, "tv", today)
            self.assertIn("périmé", str(caught.exception))

    # The field own_sag takes the max of : a turn of the board is no sag, a bow is read whole
    def test_sag_field(self):
        top = board({"o": [0, 700, 0], "u": [1, 0, 0], "v": [0, 0, 1], "n": [0, 1, 0]}, 800.0, 500.0, "top")
        turned = fem_rapport.sag_field(top, {n: [0, 1e-3 * p[0] - 0.2, 0] for n, p in top.nodes.items()})
        self.assertLess(max(abs(v) for v in turned.values()), 1e-12)
        bowed = {n: [0, -0.5 * math.sin(math.pi * p[0] / 800), 0] for n, p in top.nodes.items()}
        self.assertAlmostEqual(max(fem_rapport.sag_field(top, bowed).values()), own_sag(top, bowed)[0], places=12)


# TODO : the passes of the contacts, the balance and FEM_POST are only proved by a real run of ccx, none of them
# run here on a model small enought to keep in a test
class Input(unittest.TestCase):

    def test_only_an_input_written_by_fem_charges(self):
        with self.assertRaises(ValueError):
            checked_args(["fem_meuble.py", __file__, "/tmp"])


if __name__ == "__main__":
    unittest.main()
