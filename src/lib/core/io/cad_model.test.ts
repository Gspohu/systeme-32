import { describe, expect, it } from "vitest";
import { analyse } from "../analysis";
import { dresser, tvWall } from "../templates";
import { cadModel, placedHardware, screwPlaces } from "./cad_model";
import { plainRectangle } from "../edge_bands";
import { computeOutputs } from "../outputs";
import type { Outline } from "../geometry";
import { cadHardware, type CadInstance } from "./cad_hardware";
import { CAD_MODELS } from "../../data/cad_models";
import type { Part } from "../part_types";
import type { Vec3 } from "../geometry";


function inBoard(q: Vec3, p: Part): boolean
{
    const f = p.frame!;
    const d = [q[0] - f.o[0], q[1] - f.o[1], q[2] - f.o[2]];
    const along = (a: Vec3): number =>
    {
        return d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2];
    };
    return along(f.u) > 0 && along(f.u) < p.length && along(f.v) > 0 && along(f.v) < p.width
        && along(f.n) > 0 && along(f.n) < p.thickness;
}


describe("the bought articles of the CAD export", () =>
{
    const listed = (b: ReturnType<typeof analyse>["build"], ref: string): number =>
    {
        return b.hardware.filter((h) => { return h.ref === ref; }).reduce((n, h) => { return n + h.qty; }, 0);
    };
    const tv = (): { p: ReturnType<typeof tvWall>; b: ReturnType<typeof analyse>["build"] } =>
    {
        const p = tvWall();
        return { p, b: analyse(p).build };
    };
    const count = (i: CadInstance[], model: string): number =>
    {
        return i.filter((k) => { return k.model === model; }).length;
    };

    // An instance of a model the CAD build doesn't know was left out of the file without a word : the runners
    // of the dresser
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`knows a model for every article placed on the ${name}`, () =>
        {
            const p = make();
            const { instances, drawn } = placedHardware(p, analyse(p).build);
            expect([...new Set(instances.map((i) =>
            {
                return i.model;
            }))].filter((m) => { return CAD_MODELS[m] === undefined && drawn[m] === undefined; })).toEqual([]);
        });
    }

    // The 3D placed a full overlay hinge where the list orders a twin one, on the uprights of the dresser : each model
    // of an ordered reference, its hand or its part, placed as many times as the list orders it
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`places each model of every ordered reference of the ${name} as many times as it is ordered`, () =>
        {
            const p = make();
            const b = analyse(p).build;
            const { instances: i, drawn } = placedHardware(p, b);
            const off: string[] = [];
            for (const [key, m] of Object.entries(CAD_MODELS))
            {
                const ordered = listed(b, m.ref);
                if ((ordered > 0 || count(i, key) > 0) && count(i, key) !== ordered)
                {
                    off.push(`${key} : ${count(i, key)} posés pour ${ordered} commandés`);
                }
            }
            // A drawn model is cut to its length : counted by its reference over all its lengths, an article drawn in
            // several solids once (the strut and the brackets of a gas stay)
            for (const ref of new Set(Object.values(drawn).map((m) => { return m.ref; })))
            {
                const mine = i.filter((x) => { return drawn[x.model]?.ref === ref; });
                const placed = new Set(mine.map((x, k) => { return x.unit ?? `#${k}`; })).size;
                if (placed !== listed(b, ref))
                {
                    off.push(`${ref} : ${placed} posés pour ${listed(b, ref)} commandés`);
                }
            }
            expect(off).toEqual([]);
        });
    }

    it("places as many of each as the list orders on the TV wall, a pair counting two", () =>
    {
        const { p, b } = tv();
        const i = cadHardware(p, b).instances;
        // One article, one model
        for (const ref of ["DOWEL_8x35", "262.26.535", "262.28.020", "174H7100E", "70T3550.TL", "84335807", "282.24.727",
                           "283.33.910", "267.07.903", "637.76.353", "637.76.333", "637.38.054", "956.1004"])
        {
            expect([ref, count(i, ref)]).toEqual([ref, listed(b, ref)]);
        }
        // The pair of runners and of couplings of a drawer
        for (const ref of ["760H3800S", "T51.7601"])
        {
            expect([ref, count(i, `${ref}.left`), count(i, `${ref}.right`)]).toEqual([ref, listed(b, ref), listed(b,
                ref)]);
        }
        // Every unit with its catch plate, an adapter is a case and a plate
        expect(count(i, "956.1004.catch")).toBe(listed(b, "956.1004"));
        expect(count(i, "956.1201.box")).toBe(listed(b, "956.1201"));
        expect(count(i, "956.1201.plate")).toBe(listed(b, "956.1201"));
    });

    // Run on the TV wall alone, it let the LED profile, strip, driver and controller of the dresser go without a model
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`leaves no reference of the ${name} without a place, but what is still to choose`, () =>
        {
            const p = make();
            const b = analyse(p).build;
            const { instances, drawn } = placedHardware(p, b);
            const models = { ...CAD_MODELS, ...drawn };
            const placedRefs = new Set(instances.map((i) => { return models[i.model]!.ref; }));
            // The screws and the washer go through Fasteners, the lead of a strip is a flexible cable laid
            // on site, a glue
            // is no solid
            const apart = new Set(["609.1500", "SCREW_4x35", "SCREW_4x30", "SCREW_2.5x16", "SCREW_4x16",
                                   "WALL_SCREW_5x50", "WALL_SCREW_5x50_PAN",
                                   "WASHER_5x20", "LED_LEAD", "GLUE_PU"]);
            expect([...new Set(b.hardware.map((h) => { return h.ref; }))].filter((r) =>
            {
                return !placedRefs.has(r) && !apart.has(r);
            })).toEqual([]);
        });
    }

    it("places every screw the TV wall lists, by size", () =>
    {
        const { p, b } = tv();
        // Those of the pulls come with them, the list doesn't order them
        const drilled = screwPlaces(b.parts).filter((s) => { return s.kind !== "bolt" &&
                                                            !s.label.includes("fournie"); });
        const all = [...drilled, ...cadHardware(p, b).screws];
        const size = (d: number, l: number, kind?: string): number =>
        {
            return all.filter((s) => { return s.diameter === d && s.length === l && (kind === undefined ||
                s.kind === kind); }).length;
        };
        expect(size(4, 35)).toBe(listed(b, "SCREW_4x35"));
        expect(size(4, 30)).toBe(listed(b, "SCREW_4x30"));
        // By their heads : a countersunk one in the plate of a shelf support bit into it (essai25)
        expect(size(5, 50, "countersunk")).toBe(listed(b, "WALL_SCREW_5x50"));
        expect(size(5, 50, "pan")).toBe(listed(b, "WALL_SCREW_5x50_PAN"));
        expect(size(3.5, 15)).toBe(listed(b, "609.1500"));
    });

    it("gives every model a right handed frame of unit axes", () =>
    {
        const { p, b } = tv();
        for (const i of cadHardware(p, b).instances)
        {
            const det = i.x[0] * (i.y[1] * i.z[2] - i.y[2] * i.z[1]) - i.x[1] * (i.y[0] * i.z[2] - i.y[2] * i.z[0])
                + i.x[2] * (i.y[0] * i.z[1] - i.y[1] * i.z[0]);
            expect(det).toBeCloseTo(1, 6);
        }
    });

    it("knows a model for everything it places on the TV wall", () =>
    {
        const { p, b } = tv();
        // The catalogue, or a model drawn for it : the screw caps cut out of the banding since 2026-11-09
        const { instances, drawn } = cadHardware(p, b);
        for (const i of instances)
        {
            expect(CAD_MODELS[i.model] ?? drawn[i.model]).toBeDefined();
        }
    });
});


describe("the screws of the CAD export", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`${make.name} places one connecting bolt per bolt listed, not one per drilling`, () =>
        {
            const b = analyse(make()).build;
            const listed = b.hardware.filter((h) =>
            {
                return h.ref.startsWith("267.07");
            }).reduce((n, h) =>
            {
                return n + h.qty;
            }, 0);
            const placed = screwPlaces(b.parts).filter((s) =>
            {
                return s.kind === "bolt";
            });
            expect(listed).toBeGreaterThan(0);
            expect(placed.length).toBe(listed);
        });
    }

    it("takes the screws of the plinth return from inside the plinth into the low board of the round end", () =>
    {
        const b = analyse(tvWall()).build;
        const low = b.parts.find((q) =>
        {
            return q.label === "Bout arrondi droit, flasque basse";
        })!;
        const screws = screwPlaces(b.parts).filter((s) =>
        {
            return s.label.startsWith("Retour de plinthe");
        });
        expect(screws.length).toBe(2);
        for (const s of screws)
        {
            const tip: Vec3 = [s.point[0] - s.out[0] * s.length, s.point[1] - s.out[1] * s.length, s.point[2] -
                               s.out[2] * s.length];
            expect(inBoard(tip, low)).toBe(true);
        }
    });

    it("gives the wall screw a pan head on its washer and the board screws a countersunk one", () =>
    {
        const screws = screwPlaces(analyse(tvWall()).build.parts);
        const wall = screws.filter((s) =>
        {
            return s.label.startsWith("Fixation au mur");
        });
        expect(wall.length).toBeGreaterThan(0);
        expect(wall.every((s) =>
        {
            return s.kind === "pan" && s.washer === true;
        })).toBe(true);
        expect(screws.filter((s) =>
        {
            return s.label.includes("tête fraisée");
        }).every((s) =>
        {
            return s.kind === "countersunk";
        })).toBe(true);
    });
});


describe("the edge bands of the CAD export", () =>
{
    it("bands the banded edges of plain rectangles only, the quarter rounds of the rounded end left straight bands out",
       () =>
    {
        // 3 lines and an arc counted as 4 sides, straight bands floated along the arc
        const p = tvWall();
        const m = cadModel(p, computeOutputs(p)) as { parts: { label: string; edges: string[]; outline: Outline;
            length: number; width: number; bands: { edge: string; thickness: number }[] }[] };
        const curved = m.parts.filter((q) => { return q.outline.segments.some((s) => { return s.kind === "arc"; }); });
        expect(curved.length).toBeGreaterThan(0);
        expect(curved.flatMap((q) => { return q.bands; })).toEqual([]);
        const door = m.parts.find((q) => { return q.label === "Porte 1"; })!;
        expect(plainRectangle(door.outline, door.length, door.width)).toBe(true);
        expect(door.bands.map((b) => { return [b.edge, b.thickness]; })).toEqual([["u0", 0.8],
            ["u1", 0.8], ["v0", 0.8], ["v1", 0.8]]);
    });
});


describe("the plinth clips", () =>
{
    it("screws each clip of the TV wall where Häfele's fitting drawing puts it, its ring on the tube", () =>
    {
        // Drawing 637.76.333-1 : screws L/2 + 20 under the top of the plinth, 3 under the carcass. They stood at half
        // the base, the ring at the foot of the tube (review of 2026-11-09)
        const p = tvWall();
        const { instances } = placedHardware(p, analyse(p).build);
        const tops = instances.filter((i) => { return i.model === "637.76.353"; });
        const clips = instances.filter((i) => { return i.model === "637.38.054"; });
        expect(clips.length).toBeGreaterThan(4);
        for (const clip of clips)
        {
            const foot = tops.find((f) => { return f.o[0] === clip.o[0] && f.o[2] === clip.o[2]; })!;
            const front = clip.y[2] !== 0;
            expect(foot.o[1] - clip.o[1]).toBeCloseTo(front ? 3 + 35 / 2 + 20 : 3 + 35 / 2 + 20 + 8.5, 6);
            // The ring of the model 2.2 to 9.2 under its screws, the tube from 25 to 60 under the carcass
            expect(clip.o[1] - 9.2).toBeGreaterThanOrEqual(foot.o[1] - 60);
            expect(clip.o[1] - 2.2).toBeLessThanOrEqual(foot.o[1] - 25);
        }
    });
});
