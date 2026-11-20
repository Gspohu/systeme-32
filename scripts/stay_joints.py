#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""The joints of a gas stay 365.01.901 : balls at both ends, the rod sliding in the body over its stroke"""

import FreeCAD as App

from JointObject import GroundedJoint, Joint

# Catalogue MB 5.313 : 235 between the sockets out, a stroke of 74
LONGEST, STROKE = 235.0, 74.0
FIXED, SLIDER, BALL = 0, 3, 4


def stay_joints(assembly, joints, cabinet, rod, body, flap, ground=True):
    """Each article of scripts/gas_stay_step.py has its joint at its origin, z along the stay : the 2 brackets held
    where they're screwed, or only the cabinet one for the stay swung by hand"""
    def joint(kind, name, first, second):
        made = joints.newObject("App::FeaturePython", name)
        Joint(made, kind)
        # Rooted at the component : rooted at the assembly, a visible link back to it made a cycle in the graph
        made.Reference1 = (first, ["Face1", "Vertex1"])
        made.Reference2 = (second, ["Face1", "Vertex1"])
        made.Detach1 = True
        made.Detach2 = True
        made.Placement1 = App.Placement()
        made.Placement2 = App.Placement()
        return made
    for bracket in (cabinet, flap) if ground else (cabinet,):
        GroundedJoint(joints.newObject("App::FeaturePython", "Ancrage"), bracket)
    joint(BALL, "Rotule_corps", cabinet, rod)
    joint(BALL, "Rotule_abattant", flap, body)
    slide = joint(SLIDER, "Glissiere", rod, body)
    slide.EnableLengthMin = True
    slide.EnableLengthMax = True
    slide.LengthMin = LONGEST - STROKE
    slide.LengthMax = LONGEST
    return slide
