#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The verdict on blank views and missing pages : python3 -I -m unittest discover -s scripts -p test_freecad_verdict.py"""

import json
import os
import tempfile
import time
import unittest
from unittest import mock

from freecad_verdict import expected_pages, reasons


def sheet(title, views=1):
    return {"title": title, "views": [{}] * views, "tables": [], "items": [], "overlay": None}


# 2 sheets of parts, a sheet of sections and one with nothign on it, cut along both axes : 3 sheets and 2 FreeCAD pages
MODEL = {"drawings": [sheet("Pièces #100-001"), sheet("Pièces #100-002"), sheet("Coupes"), sheet("Vide", 0)],
         "sectionCuts": [{"axis": "x"}, {"axis": "y"}, {"axis": "x"}]}


class Verdict(unittest.TestCase):

    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.out = self.scratch.name
        os.makedirs(os.path.join(self.out, "json"))
        self.marker = os.path.join(self.out, "tv.run.start")
        open(self.marker, "w").close()
        past = time.time() - 60
        os.utime(self.marker, (past, past))
        self.write("json/tv", MODEL)
        self.write("tv_controle", {"parts_json": 3, "links": 3, "verdict": {"raisons": []}})

    def tearDown(self):
        self.scratch.cleanup()

    def write(self, name, data):
        with open(os.path.join(self.out, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(data, f)

    def run_with(self, pages=5, built=5, blank=()):
        self.write("tv_rapport", {"drawings": [{"page": f"P{k}", "faults": [], "invalid": []} for k in range(built)]})
        screws = {"valid": True, "struck_texts": [], "pages": [f"P{k}.pdf" for k in range(pages)]}
        if blank is not None:
            screws["blank_views"] = list(blank)
        self.write("tv_visserie", screws)
        with mock.patch.dict(os.environ, {"S32_DRAWINGS": ""}):
            return reasons(self.out, "tv", self.marker)

    def test_whole_run_passes(self):
        self.assertEqual(self.run_with(), [])

    def test_blank_view_blocks(self):
        found = self.run_with(blank=["Planche 5 bis : vue Coupe A sans arête après 120 s"])
        self.assertEqual(found, ["plans, Planche 5 bis : vue Coupe A sans arête après 120 s"])

    def test_report_without_the_wait_blocks(self):
        self.assertEqual(len(self.run_with(blank=None)), 1)

    def test_missing_page_blocks(self):
        self.assertEqual(self.run_with(pages=4), ["plans : 4 pages exportées pour 5 planches attendues du JSON"])

    def test_missing_built_page_blocks(self):
        self.assertEqual(len(self.run_with(built=4)), 1)

    def test_filter_counts_its_pages_only(self):
        self.assertEqual(expected_pages(MODEL, "Pièces"), 2)
        self.assertEqual(expected_pages(MODEL, "Coupes"), 3)
        self.assertEqual(expected_pages({"drawings": [sheet("Coupes")], "sectionCuts": [{"axis": "y"}]}, ""), 2)


if __name__ == "__main__":
    unittest.main()
