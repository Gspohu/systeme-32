#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The gas stay 365.01.901 rebuilt as sound solids off its Häfele STEP, 4 articles framed for their joints"""

import json
import math
import os
import sys

import FreeCAD as App
import Part

# Run by exec, the script has no __file__ : the folder of its neighbours comes from the launcher
sys.path.insert(0, os.environ.get("S32_SCRIPTS", os.getcwd()))
from stay_joints import LONGEST, STROKE, stay_joints

SOURCES = os.environ["S32_SOURCES"]
OUT = os.environ.get("S32_OUT", os.path.join(SOURCES, "hafele", "step"))
STEP_IN = os.path.join(SOURCES, "hafele", "step", "365_01_901_3.stp")
STEP_DIR = os.path.join(SOURCES, "hafele", "step")
Vec = App.Vector

# Centres of the 2 sockets in the STEP, the strut axis runs from the rod one to the body one
ROD_SOCKET = Vec(-47.511, -0.549, 0)
BODY_SOCKET = Vec(125.478, 1.451, 0)
AXIS = BODY_SOCKET - ROD_SOCKET
SPAN = AXIS.Length
AXIS.normalize()
UP = Vec(0, 0, 1)
SIDE = UP.cross(AXIS)
# Inside the tube the STEP shows nothing : the rod goes on in a bore of its own size, engaged 5 at full stroke
# TODO a stay cut in half would give the true bore and piston, invisible but they weigh in its mass
ROD_ENGAGED = 5.0


# Distance along the axis from the rod socket of a centre read in the STEP
def station(x, y):
    return (Vec(x, y, 0) - ROD_SOCKET).dot(AXIS)


# Every station off a centre the STEP give, both ends
HOUSING = (station(-47.761, -0.552), station(125.728, 1.453))
ROUNDING = (station(-44.961, -0.52), station(122.928, 1.421))
APEX = (station(-37.895, -0.438), station(115.862, 1.339))
FLARE = (station(-40.628, -0.47), station(118.595, 1.371))
NECK = (station(-30.512, -0.353), station(108.479, 1.254))
TUBE_START = station(0.0, 0.0)
TUBE_ROUND_0 = station(1.5, 0.017)
GROOVE = station(16.749, 0.194)
TUBE_ROUND_1 = station(105.879, 1.224)
TUBE_END = station(107.379, 1.241)
STEP_END = station(107.479, 1.243)
CONE_SLOPE = math.tan(math.radians(53.73))
R_HOUSING, R_ROUNDING, R_FLARE, R_COLLAR, R_NECK = 8.25, 2.0, 3.006, 5.8, 1.0
R_ROD, R_TUBE, R_EDGE, R_GROOVE, R_STEP, R_BALL = 3.0, 7.5, 1.5, 0.75, 5.0, 5.0
FLAT, SLOT_HALF, CLIP_FLOOR, CLIP_LEDGE = 5.8, 3.0, 6.215, -0.72


def at(t, r):
    return Vec(t, r, 0)


def tangent_foot(centre, line_point, line_dir):
    unit = Vec(line_dir)
    unit.normalize()
    return line_point + unit * (centre - line_point).dot(unit)


def arc(start, centre, end, radius, away=True):
    """The arc from start to end round centre, a half circle bulging away from the axis or toward it"""
    middle = (start + end) * 0.5 - centre
    if (middle.Length < 1e-9):
        middle = Vec(0, 1 if away else -1, 0)
    middle.normalize()
    return Part.Arc(start, centre + middle * radius, end).toShape()


def line(start, end):
    return Part.LineSegment(start, end).toShape()


def end_profile(index, sign):
    """One end from the tip of its housing to the start of its neck, in (t, r), sign 1 toward the body"""
    house, rounding, apex, flare, neck = (HOUSING[index], ROUNDING[index], APEX[index], FLARE[index], NECK[index])
    top = at(house, R_HOUSING)
    edges = [arc(at(house - sign * R_HOUSING, 0), at(house, 0), top, R_HOUSING),
             line(top, at(rounding, R_HOUSING))]
    round_centre = at(rounding, R_HOUSING - R_ROUNDING)
    cone_dir = Vec(-sign, CONE_SLOPE, 0)
    upper = tangent_foot(round_centre, at(apex, 0), cone_dir)
    flare_centre = at(flare, R_COLLAR + R_FLARE)
    lower = tangent_foot(flare_centre, at(apex, 0), cone_dir)
    edges += [arc(at(rounding, R_HOUSING), round_centre, upper, R_ROUNDING), line(upper, lower),
              arc(lower, flare_centre, at(flare, R_COLLAR), R_FLARE), line(at(flare, R_COLLAR), at(neck, R_COLLAR))]
    return edges


def revolved_strut():
    """The whole strut as one solid of revolution about its axis, x along it from the rod socket"""
    edges = end_profile(0, 1)
    rod_face = NECK[0] + R_NECK
    edges += [arc(at(NECK[0], R_COLLAR), at(NECK[0], R_COLLAR - R_NECK), at(rod_face, R_COLLAR - R_NECK), R_NECK),
              line(at(rod_face, R_COLLAR - R_NECK), at(rod_face, R_ROD)),
              line(at(rod_face, R_ROD), at(TUBE_START, R_ROD)),
              line(at(TUBE_START, R_ROD), at(TUBE_START, R_TUBE - R_EDGE)),
              arc(at(TUBE_START, R_TUBE - R_EDGE), at(TUBE_ROUND_0, R_TUBE - R_EDGE), at(TUBE_ROUND_0, R_TUBE), R_EDGE),
              line(at(TUBE_ROUND_0, R_TUBE), at(GROOVE - R_GROOVE, R_TUBE)),
              arc(at(GROOVE - R_GROOVE, R_TUBE), at(GROOVE, R_TUBE), at(GROOVE + R_GROOVE, R_TUBE), R_GROOVE, False),
              line(at(GROOVE + R_GROOVE, R_TUBE), at(TUBE_ROUND_1, R_TUBE)),
              arc(at(TUBE_ROUND_1, R_TUBE), at(TUBE_ROUND_1, R_TUBE - R_EDGE), at(TUBE_END, R_TUBE - R_EDGE), R_EDGE),
              line(at(TUBE_END, R_TUBE - R_EDGE), at(TUBE_END, R_STEP)),
              line(at(TUBE_END, R_STEP), at(STEP_END, R_STEP))]
    neck_centre = at(NECK[1], R_COLLAR - R_NECK)
    meet = at(NECK[1] - math.sqrt(R_NECK ** 2 - (R_STEP - neck_centre.y) ** 2), R_STEP)
    edges += [line(at(STEP_END, R_STEP), meet), arc(meet, neck_centre, at(NECK[1], R_COLLAR), R_NECK)]
    edges += [piece.reversed() for piece in reversed(end_profile(1, -1))]
    edges.append(line(at(HOUSING[1] + R_HOUSING, 0), at(HOUSING[0] - R_HOUSING, 0)))
    wire = Part.Wire(Part.__sortEdges__(edges))
    if not wire.isClosed():
        raise RuntimeError("profil du vérin ouvert")
    return Part.Face(wire).revolve(Vec(0, 0, 0), Vec(1, 0, 0), 360)


def housing_cuts(centre, flat_end, slot_end, walls, sign):
    """Flat under the housing, slot over it, the clip channel round its top, the socket of the ball"""
    far = centre - sign * 20
    cuts = []
    low, high = sorted((far, flat_end))
    cuts.append(Part.makeBox(high - low, 40, 20, Vec(low, -20, -FLAT - 20)))
    low, high = sorted((far, slot_end))
    cuts.append(Part.makeBox(high - low, 2 * SLOT_HALF, 20, Vec(low, -SLOT_HALF, FLAT)))
    low, high = sorted(walls)
    ring = Part.makeCylinder(20, high - low, Vec(low, 0, 0), Vec(1, 0, 0))
    ring = ring.cut(Part.makeCylinder(CLIP_FLOOR, high - low, Vec(low, 0, 0), Vec(1, 0, 0)))
    cuts.append(ring.common(Part.makeBox(high - low, 40, 30, Vec(low, -20, CLIP_LEDGE))))
    cuts.append(Part.makeCylinder(R_BALL, FLAT, Vec(centre, 0, -FLAT), Vec(0, 0, 1))
                .fuse(Part.makeSphere(R_BALL, Vec(centre, 0, 0))))
    return cuts


# The axis frame (t, across, up) into the frame of the STEP
def to_step():
    return App.Matrix(AXIS.x, SIDE.x, UP.x, ROD_SOCKET.x, AXIS.y, SIDE.y, UP.y, ROD_SOCKET.y,
                      AXIS.z, SIDE.z, UP.z, ROD_SOCKET.z, 0, 0, 0, 1)


def cabinet_bracket():
    """Upright plate on the side with 2 countersunk holes, its foot, the ball stud : drawn off the faces of the STEP"""
    back, face = -16.549, -13.549
    plate = Part.makeBox(32.0, 3.0, 14.0, Vec(-63.511, back, -15.0))
    for centre in (-63.511, -31.511):
        plate = plate.fuse(Part.makeCylinder(7.0, 3.0, Vec(centre, back, -8.0), Vec(0, 1, 0)))
    for centre in (-63.511, -31.511):
        hole = Part.makeCylinder(2.0, 3.2, Vec(centre, back - 0.1, -8.0), Vec(0, 1, 0))
        plate = plate.cut(hole.fuse(Part.makeCone(2.0, 3.5, 1.5, Vec(centre, face - 1.5, -8.0), Vec(0, 1, 0))))
    corner_a, corner_b = Vec(-57.511, face, -15), Vec(-37.511, face, -15)
    touch_a, touch_b = Vec(-52.25, 2.05, -15), Vec(-42.77, 2.05, -15)
    outline = Part.Wire([line(Vec(-57.511, back, -15), corner_a), line(corner_a, touch_a),
                         Part.Arc(touch_a, Vec(-47.511, 5.451, -15), touch_b).toShape(), line(touch_b, corner_b),
                         line(corner_b, Vec(-37.511, back, -15)), line(Vec(-37.511, back, -15), Vec(-57.511, back,
                             -15))])
    footing = Part.Face(outline).extrude(Vec(0, 0, 3))
    stud = Part.makeCylinder(5.0, 3.0, Vec(-47.511, -0.549, -12), Vec(0, 0, 1))
    stud = stud.fuse(Part.makeCone(5.0, 3.0, 5.0, Vec(-47.511, -0.549, -9), Vec(0, 0, 1)))
    stud = stud.fuse(Part.makeSphere(R_BALL, ROD_SOCKET))
    return plate.fuse(footing).fuse(stud).removeSplitter()


def framed(shape, matrix):
    copy = shape.copy()
    copy.transformShape(matrix)
    return copy


# STEP to an article frame : origin at the ball, z along the stay (x of the STEP), x along the stud (its z)
def bracket_frame(ball):
    place = App.Placement(App.Matrix(0, 0, 1, ball.x, 0, -1, 0, ball.y, 1, 0, 0, ball.z, 0, 0, 0, 1))
    return place.inverse().toMatrix()


# Axis frame to an article frame : origin on the axis at origin_t, z along the axis, x along the stud
def strut_frame(origin_t):
    place = App.Placement(App.Matrix(0, 0, 1, origin_t, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1))
    return place.inverse().toMatrix()


def sampled(source, pieces):
    """Each sound face of the broken shell of the STEP, its farthest sample from the rebuilt pieces"""
    rows = []
    for index, face in enumerate(source.Faces):
        try:
            sound = face.isValid() and face.Area > 0.01
        except (RuntimeError, Part.OCCError):
            # A face of no area : its check finds the shape empty
            sound = False
        if not sound:
            continue
        u0, u1, v0, v1 = face.ParameterRange
        worst = 0.0
        for a in (0.15, 0.5, 0.85):
            for b in (0.15, 0.5, 0.85):
                point = face.valueAt(u0 + (u1 - u0) * a, v0 + (v1 - v0) * b)
                if face.isInside(point, 1e-3, True):
                    worst = max(worst, pieces.distToShape(Part.Vertex(point))[0])
        rows.append({"face": index, "ecart": round(worst, 4), "centre": [round(c, 2) for c in face.BoundBox.Center]})
    return rows


def stay_assembly(articles, path):
    """The 4 articles shut, cabinet bracket grounded, the flap bracket free to swing the stay through its stroke"""
    doc = App.newDocument("Compas_365_01_901")
    assembly = doc.addObject("Assembly::AssemblyObject", "Compas")
    assembly.Label = "365.01.901 Compas, assemblage"
    joints = assembly.newObject("Assembly::JointGroup", "Liaisons")
    links = {}
    for key, (shape, placement) in articles.items():
        base = doc.addObject("Part::Feature", "Article")
        base.Shape = shape
        base.Label = f"365.01.901 {key}"
        base.Visibility = False
        link = assembly.newObject("App::Link", "Lien")
        link.LinkedObject = base
        link.Label = base.Label
        link.Placement = placement
        link.Visibility = True
        links[key] = link
    stay_joints(assembly, joints, links["équerre de corps"], links["tige"], links["corps"], links["équerre d'abattant"],
                ground=False)
    doc.recompute()
    status = assembly.solve()
    doc.saveAs(path)
    return status


def main():
    whole = Part.read(STEP_IN)
    broken = max(whole.Shells, key=lambda shell: shell.Area)
    sound = [Part.Solid(shell) for shell in whole.Shells if shell.isClosed() and shell.BoundBox.DiagonalLength > 1e-6]
    clip_flap = next(s for s in sound if abs(s.BoundBox.XLength - 5.6) < 0.2 and abs(s.BoundBox.YLength - 15.1) < 0.2)
    plate_flap = next(s for s in sound if abs(s.BoundBox.XLength - 46.0) < 0.2 and abs(s.BoundBox.ZLength - 3.0) < 0.1)
    stud_flap = next(s for s in sound if abs(s.BoundBox.ZLength - 19.5) < 0.1)
    ball_flap = next(f.Surface.Center for f in stud_flap.Faces if f.Surface.__class__.__name__ == "Sphere")
    # The ends are the smae piece turned half round about the upright through the middle of the stay
    clip_rod = clip_flap.copy()
    clip_rod.rotate((ROD_SOCKET + BODY_SOCKET) * 0.5, UP, 180)

    strut = revolved_strut()
    walls_rod = (station(-44.811, -0.518), station(-50.211, -0.58))
    walls_body = (station(122.582, 1.42), station(128.181, 1.484))
    for cut in (housing_cuts(0.0, station(-39.511, -0.46), station(-40.611, -0.47), walls_rod, 1)
                + housing_cuts(SPAN, station(117.481, 1.36), station(118.581, 1.37), walls_body, -1)):
        strut = strut.cut(cut)
    into_axis = App.Placement(to_step()).inverse().toMatrix()
    # The channels of the clips are the clips themselves takne off the housings : fitted, no clearance
    strut = strut.cut(framed(clip_rod, into_axis)).cut(framed(clip_flap, into_axis)).removeSplitter()
    inner_end = TUBE_START + (LONGEST - SPAN) + ROD_ENGAGED
    bore_end = inner_end + (SPAN - (LONGEST - STROKE))
    rod_side = Part.makeBox(TUBE_START + 20, 60, 60, Vec(-20, -30, -30))
    rod = strut.common(rod_side).fuse(Part.makeCylinder(R_ROD, inner_end - TUBE_START, Vec(TUBE_START, 0, 0),
                                                        Vec(1, 0, 0))).removeSplitter()
    body = strut.cut(rod_side).cut(Part.makeCylinder(R_ROD, bore_end - TUBE_START, Vec(TUBE_START, 0, 0), Vec(1, 0, 0)))
    bracket = cabinet_bracket()

    # Checked in the frame of the STEP : every sound face, then no 2 articles sharing matter
    in_step = to_step()
    pieces = {"tige": Part.Compound([framed(rod, in_step), clip_rod]),
              "corps": Part.Compound([framed(body, in_step), clip_flap]),
              "équerre de corps": bracket,
              "équerre d'abattant": Part.Compound([plate_flap, stud_flap])}
    rows = sampled(broken, Part.Compound(list(pieces.values())))
    clashes = {}
    names = list(pieces)
    for k, first in enumerate(names):
        for second in names[k + 1:]:
            # Solid by solid : a clip holding a ball is meant to touch it, a housing isn't
            for i, one in enumerate(pieces[first].Solids):
                for j, other in enumerate(pieces[second].Solids):
                    shared = one.common(other).Volume
                    if (shared > 1e-4):
                        clashes[f"{first} {i} ({one.Volume:.0f}) / {second} {j} ({other.Volume:.0f})"] = round(shared, 4)
    report = {"source": STEP_IN, "entraxe_ferme": round(SPAN, 4), "boule_abattant": [round(c, 3) for c in ball_flap],
              "solides_valides": {key: all(s.isValid() for s in shape.Solids) for key, shape in pieces.items()},
              "volumes": {key: round(shape.Volume, 1) for key, shape in pieces.items()},
              "interferences_mm3": clashes, "faces_saines": len(rows),
              "faces_exactes": sum(1 for row in rows if row["ecart"] < 0.01),
              "ecarts": sorted([row for row in rows if row["ecart"] >= 0.01], key=lambda row: -row["ecart"])}

    # Each article in the frame its joints use
    articles = {"tige": (Part.Compound([rod, framed(clip_rod, into_axis)]).transformGeometry(strut_frame(0.0)),
                         "365_01_901_tige.step"),
                "corps": (Part.Compound([body, framed(clip_flap, into_axis)]).transformGeometry(strut_frame(SPAN)),
                          "365_01_901_corps.step"),
                "équerre de corps": (framed(bracket, bracket_frame(ROD_SOCKET)), "365_01_901_equerre_corps.step"),
                "équerre d'abattant": (framed(Part.Compound([plate_flap, stud_flap]), bracket_frame(ball_flap)),
                                       "365_01_901_equerre_abattant.step")}
    for shape, name in articles.values():
        shape.exportStep(os.path.join(STEP_DIR, name))
    # Shut as in the STEP : each article put back where it was
    back = {"tige": App.Placement(in_step).multiply(App.Placement(strut_frame(0.0)).inverse()),
            "corps": App.Placement(in_step).multiply(App.Placement(strut_frame(SPAN)).inverse()),
            "équerre de corps": App.Placement(bracket_frame(ROD_SOCKET)).inverse(),
            "équerre d'abattant": App.Placement(bracket_frame(ball_flap)).inverse()}
    # 0 : the solver met every joint with the articles where the STEP has them
    report["resolution"] = stay_assembly({key: (shape, back[key]) for key, (shape, _) in articles.items()},
                                         os.path.join(OUT, "365_01_901_assemblage.FCStd"))
    with open(os.path.join(OUT, "365_01_901_controle.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(json.dumps({key: value for key, value in report.items() if key != "ecarts"}, ensure_ascii=False))


main()
