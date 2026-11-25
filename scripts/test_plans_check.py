#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The check of texts struck by a line on an exported page : python3 -I -m unittest discover -s scripts -p test_plans_check.py"""

import os
import unittest

from plans_check import crossed_texts, matrix_of, path_points

# The frame and title block of TV sheet 14 as TechDraw 1.1.4 exported it, its view taken out and its owner renamed
TITLE_BLOCK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_plans_check_title_block.svg")


# Ink of a text in a plain font : each glyph 0.6 of the size wide, a tenth more in bold, from 0.7 above the baseline to
# 0.2 under it, the advance as wide as the ink
def ink(text, family, size, bold):
    wide = 0.6 * size * len(text) * (1.1 if bold else 1.0)
    return (0.0, -0.7 * size, wide, 0.2 * size, wide)


# Ink of Helvetica at the average width the title block is fitted with, AVG_CHAR of drawing/display.ts
def helvetica(text, family, size, bold):
    wide = 0.52 * size * len(text) * (1.1 if bold else 1.0)
    return (0.0, -0.7 * size, wide, 0.2 * size, wide)


def styled(x, y, t, style, group=""):
    return f'<g stroke="#000000" {group}><text stroke="none" style="{style}" x="{x}" y="{y}">{t}</text></g>'


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
        # A leader stopping 0.03 mm into the ink, within TOUCH of its edge at 124, doesn't strkie it
        self.assertEqual(crossed_texts(page(text(100, 100, "E1") + line(123.7, 95, 160, 95)), ink), [])

    def test_leader_into_its_mark(self):
        self.assertEqual(len(crossed_texts(page(text(100, 100, "E1") + line(122, 95, 160, 95)), ink)), 1)

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

    def test_text_sized_by_its_style(self):
        # A field of the title block : its size in style=, in the template scaled 10 times
        body = styled(25, 10, "Titre", "font-family:Helvetica;font-size:2.4px", 'transform="scale(10)"')
        self.assertEqual(len(crossed_texts(page(body + line(260, 50, 260, 150)), ink)), 1)

    def test_centred_text_struck_on_its_left(self):
        # 0.6 x 20 x 4 = 48 wide, centred on 100 : from 76 to 124
        body = styled(100, 100, "Nom1", "font-size:20px;text-anchor:middle")
        self.assertEqual(len(crossed_texts(page(body + line(80, 50, 80, 150)), ink)), 1)
        self.assertEqual(crossed_texts(page(body + line(126, 50, 126, 150)), ink), [])

    def test_bold_text_is_wider(self):
        # Plain the ink stops at 124, bold at 126.4
        plain = text(100, 100, "D2") + line(125.5, 50, 125.5, 150)
        bold = plain.replace('font-size="20"', 'font-size="20" font-weight="bold"')
        self.assertEqual(crossed_texts(page(plain), ink), [])
        self.assertEqual(len(crossed_texts(page(bold), ink)), 1)

    def test_line_stroked_by_its_style(self):
        body = text(100, 100, "fil") + '<polyline style="stroke:#000;stroke-width:0.5" points="110,50 110,150"/>'
        self.assertEqual(len(crossed_texts(page(body), ink)), 1)

    def test_text_without_size_refused(self):
        with self.assertRaises(ValueError):
            crossed_texts(page('<g stroke="#000"><text x="1" y="1">sans taille</text></g>'), ink)
        with self.assertRaises(ValueError):
            crossed_texts(page(styled(1, 1, "en points", "font-size:10pt")), ink)
        with self.assertRaises(ValueError):
            crossed_texts(page(styled(1, 1, "raccourci", "font-size:20px;font:bold 20px Helvetica")), ink)

    def test_weights_and_case_of_a_style(self):
        strike = line(125.5, 50, 125.5, 150)
        for weight, struck in (("700", 1), ("600", 1), ("500", 0), ("normal", 0)):
            body = styled(100, 100, "D2", f"Font-Size:20px;FONT-WEIGHT:{weight}")
            self.assertEqual(len(crossed_texts(page(body + strike), ink)), struck, weight)


class TitleBlock(unittest.TestCase):
    """A page TechDraw wrote, not one writen in the dialect the check reads"""

    def setUp(self):
        with open(TITLE_BLOCK, encoding="utf-8") as f:
            self.svg = f.read()

    def test_clear_as_exported(self):
        self.assertEqual(crossed_texts(self.svg, helvetica), [])

    def test_struck_owner_found(self):
        # The owner, bold and centred on 250 of the template, struck at 243 : on its left half, in page units
        struck = self.svg.replace("</svg>", '<line stroke="#000" x1="2430" y1="2690" x2="2430" y2="2720"/></svg>')
        self.assertEqual([f["text"] for f in crossed_texts(struck, helvetica)], ["Martin Dupont"])


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

    def test_unread_path_command_refused(self):
        # An arc read under the move before it made up a polyline
        with self.assertRaises(ValueError):
            path_points("M 0,0 A 5 5 0 0 1 10 10 8")
        with self.assertRaises(ValueError):
            path_points("M 0,0 L 10")


if __name__ == "__main__":
    unittest.main()
