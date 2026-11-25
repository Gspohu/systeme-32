#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cut letters stepped out of the way of their neighbours, checked by sampling the ink rather than by the module's own test"""

import unittest

import section_marks as sm

SIZE = 3
HEAD = 3.5
STEP = 0.02


def strokes(marks):
    """Every drawn segment, the whole line from tip to tip included"""
    out = []
    for m in marks:
        lo, hi = m["ends"]
        out.append((lo["line"][1], hi["line"][1]))
        for e in m["ends"]:
            a = e["arrow"]
            out += [e["thick"], e["shaft"], (a[0], a[1]), (a[1], a[2]), (a[2], a[0])]
    return out


def crossings(marks):
    """Pairs (letter, segment) where a sampled point of the segment falls in a letter box, and letter boxes overlapping"""
    found = []
    boxes = [(m["letter"], e["box"]) for m in marks for e in m["ends"]]
    for letter, (x0, y0, x1, y1) in boxes:
        for p, q in strokes(marks):
            n = max(1, int(max(abs(q[0] - p[0]), abs(q[1] - p[1])) / STEP))
            for i in range(n + 1):
                x = p[0] + (q[0] - p[0]) * i / n
                y = p[1] + (q[1] - p[1]) * i / n
                if (x0 <= x <= x1 and y0 <= y <= y1):
                    found.append((letter, p, q))
                    break
    for i, (la, a) in enumerate(boxes):
        for lb, b in boxes[i + 1:]:
            if (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]):
                found.append((la, lb))
    return found


class SectionMarks(unittest.TestCase):

    def test_two_cuts_at_tv_spacing(self):
        marks, faults = sm.lay_marks([("B", 100.0), ("C", 105.6)], 50, 150, 1, True, SIZE, HEAD)
        self.assertEqual(faults, [])
        self.assertEqual(crossings(marks), [])
        for end in (0, 1):
            b, c = marks[0]["ends"][end], marks[1]["ends"][end]
            apart = b["box"][2] < c["box"][0] or c["box"][2] < b["box"][0]
            self.assertTrue(b["row"] != c["row"] or apart)

    def test_tv_row_of_cuts(self):
        cuts = [(chr(65 + k), 80.0 + 5.6 * k) for k in range(5)]
        marks, faults = sm.lay_marks(cuts, 40, 160, 1, True, SIZE, HEAD)
        self.assertEqual(faults, [])
        self.assertEqual(crossings(marks), [])

    def test_close_cuts_take_rows(self):
        marks, faults = sm.lay_marks([("A", 100.0), ("B", 101.5), ("C", 103.0)], 50, 150, 1, True, SIZE, HEAD)
        self.assertEqual(faults, [])
        self.assertEqual(crossings(marks), [])
        self.assertGreater(max(e["row"] for m in marks for e in m["ends"]), 0)

    def test_horizontal_cuts_looking_down(self):
        marks, faults = sm.lay_marks([("E", 60.0), ("F", 61.8), ("G", 70.0)], 30, 300, 1, False, SIZE, HEAD)
        self.assertEqual(faults, [])
        self.assertEqual(crossings(marks), [])
        # Seen from above, y down the page : the arrows point down
        for m in marks:
            for e in m["ends"]:
                self.assertGreater(e["arrow"][0][1], e["shaft"][0][1])

    def test_arrows_follow_sight(self):
        for sight in (1, -1):
            marks, _ = sm.lay_marks([("A", 100.0)], 50, 150, sight, True, SIZE, HEAD)
            top, bottom = marks[0]["ends"]
            for e in (top, bottom):
                self.assertEqual((e["arrow"][0][0] > 100.0), (sight > 0))
            self.assertLess(top["line"][1][1], 50)
            self.assertGreater(bottom["line"][1][1], 150)

    def test_letter_box_holds_its_ink(self):
        marks, _ = sm.lay_marks([("D", 100.0)], 50, 150, 1, True, SIZE, HEAD)
        x0, y0, x1, y1 = marks[0]["ends"][0]["box"]
        # DejaVu Sans as TechDraw draws the overlay : 0.66 em a character, capitals 0.73 em tall
        self.assertGreaterEqual(x1 - x0, 0.66 * SIZE)
        self.assertGreaterEqual(y1 - y0, 0.73 * SIZE)

    def test_mutant_without_rows_is_caught(self):
        # Staging switched off : every letter on the first row, the checker above muts see the crossings
        marks, faults = sm.lay_marks([("A", 100.0), ("B", 101.5), ("C", 103.0)], 50, 150, 1, True, SIZE, HEAD,
                                     max_rows=1)
        self.assertNotEqual(faults, [])
        self.assertNotEqual(crossings(marks), [])


if __name__ == "__main__":
    unittest.main()
