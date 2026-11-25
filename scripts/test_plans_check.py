#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The check of texts struck by a line on an exported page : python3 -I -m unittest discover -s scripts -p test_plans_check.py"""

import unittest

from plans_check import crossed_texts, matrix_of, path_points


# Ink of a text in a plain font : each glyph 0.6 of the size wide, from 0.7 above the baseline to 0.2 under it
def ink(text, family, size):
    return (0.0, -0.7 * size, 0.6 * size * len(text), 0.2 * size)


# A page of 420 mm on a viewBox 10 times as large, as TechDraw exports it
def page(body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 4200 2970">'
            + body + "</svg>")


def text(x, y, t, size=20, group=""):
    return (f'<g stroke="#000000" stroke-width="1" font-family="osifont" font-size="{size}" {group}>'
            f'<text stroke="none" x="{x}" y="{y}">{t}</text></g>')


def line(x1, y1, x2, y2, stroke="#000000", group=""):
    return f'<g stroke="{stroke}" stroke-width="1" {group}><polyline fill="none" points="{x1},{y1} {x2},{y2}"/></g>'


class Struck(unittest.TestCase):

    def test_line_through_a_mark(self):
        # D2 writen over the line of a dimension, as on the TV sheet 14
        found = crossed_texts(page(text(100, 100, "D2") + line(110, 50, 110, 150)), ink)
        self.assertEqual([f["text"] for f in found], ["D2"])
        self.assertAlmostEqual(found[0]["x"], 11.2, places=1)

    def test_line_beside_a_mark(self):
        self.assertEqual(crossed_texts(page(text(100, 100, "D2") + line(130, 50, 130, 150)), ink), [])

    def test_leader_ending_at_its_mark(self):
        # A leader stopping on the edge of the ink, within TOUCH, doesn't strkie it
        self.assertEqual(crossed_texts(page(text(100, 100, "E1") + line(124.2, 95, 160, 95)), ink), [])

    def test_white_and_unstroked_lines_ignored(self):
        body = text(100, 100, "fil") + line(90, 95, 150, 95, stroke="#ffffff") + line(90, 95, 150, 95, stroke="none")
        self.assertEqual(crossed_texts(page(body), ink), [])

    def test_turned_text(self):
        # A vertical dimension text : turned a quarter, the line along it crosses, one beside it doesn't
        turned = 'transform="matrix(0,-1,1,0,200,300)"'
        self.assertEqual(len(crossed_texts(page(text(0, 0, "392", group=turned) + line(195, 200, 195, 400)), ink)), 1)
        self.assertEqual(crossed_texts(page(text(0, 0, "392", group=turned) + line(210, 200, 210, 400)), ink), [])

    def test_nested_groups_carry_the_stroke(self):
        body = ('<g stroke="#000000" transform="matrix(10,0,0,10,0,0)"><g><path d="M 9,8 L 13,12"/></g></g>'
                + text(100, 100, "C2"))
        self.assertEqual(len(crossed_texts(page(body), ink)), 1)

    def test_curve_through_a_radius(self):
        # The arc of a board running through its R300
        body = text(100, 100, "R300") + '<g stroke="#000000"><path d="M 90,120 C 110,60 130,60 150,120"/></g>'
        self.assertEqual(len(crossed_texts(page(body), ink)), 1)


class Geometry(unittest.TestCase):

    def test_matrix_composition(self):
        m = matrix_of("translate(10,20) scale(2)")
        self.assertEqual(m, (2.0, 0.0, 0.0, 2.0, 10.0, 20.0))

    def test_unknown_transform_refused(self):
        with self.assertRaises(ValueError):
            matrix_of("skewX(10)")

    def test_relative_path_and_close(self):
        runs = path_points("m 0,0 l 10,0 v 10 z")
        self.assertEqual(runs[0], [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 0.0)])


if __name__ == "__main__":
    unittest.main()
