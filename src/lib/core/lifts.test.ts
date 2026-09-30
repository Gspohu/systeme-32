import { describe, expect, it } from "vitest";
import { addItem, setFront, setRail, splitCell, updateFront } from "./commands";
import { newCarcass, newProject, newWallShelf } from "./factory";
import { analyse, type Analysis, type Level } from "./analysis";
import { pickMechanism } from "./lifts";
import type { Carcass, LiftFront, Project } from "./model";
import type { Hole, Part } from "./parts";

// a wall cabinet over a desk in Colmar : 800 x 400 x 350, W1000 particleboard (700 kg/m3 for the checks)
function cabinet(o: Partial<Carcass> = {}): Carcass
{
    return newCarcass({ name: "Haut", width: 800, height: 400, depth: 350, y: 1500, base: { type: "wall" }, ...o });
}


function withFlap(c: Carcass, spec: LiftFront = { type: "lift", handleKg: 0 }): Project
{
    const p = addItem(newProject("essai"), c);
    const k = p.items[0] as Carcass;
    return setFront(p, k.id, k.root.id, spec);
}


function said(a: Analysis, level: Level | null, text: string): boolean
{
    for (const k of a.checks)
    {
        if ((level === null || k.level === level) && k.message.includes(text))
        {
            return true;
        }
    }
    return false;
}


function errorsOf(p: Project): string[]
{
    const out: string[] = [];
    for (const k of analyse(p).checks)
    {
        if (k.level === "error")
        {
            out.push(k.message);
        }
    }
    return out;
}


// every hardware line as "ref xqty", and the note of the first line with that ref
function refsOf(a: Analysis): string[]
{
    const out: string[] = [];
    for (const h of a.build.hardware)
    {
        out.push(`${h.ref} x${h.qty}`);
    }
    return out;
}


function noteOf(a: Analysis, ref: string): string | null
{
    for (const h of a.build.hardware)
    {
        if (h.ref === ref)
        {
            return h.note;
        }
    }
    return null;
}


function marks(part: Part, prefix: string): Hole[]
{
    const out: Hole[] = [];
    for (const h of part.holes)
    {
        if (h.label.startsWith(prefix))
        {
            out.push(h);
        }
    }
    return out;
}


describe("AVENTOS HK top flaps", () =>
{
    it("takes the strongest mechanism where two power factor ranges overlap", () =>
    {
        expect(pickMechanism(420)!.handle).toBe("22K2300");
        expect(pickMechanism(1000)!.handle).toBe("22K2500");
        expect(pickMechanism(5000)!.handle).toBe("22K2900");
        expect(pickMechanism(419)).toBeNull();
        expect(pickMechanism(9001)).toBeNull();
    });

    it("sizes the mechanism from LF = FH x FG and drills the brackets under the top", () =>
    {
        const p = withFlap(cabinet());
        const a = analyse(p);
        expect(errorsOf(p)).toEqual([]);
        const c = p.items[0] as Carcass;
        const kg = 0.797 * 0.397 * 0.019 * 700;
        expect(noteOf(a, "22K2300")).toBeNull();
        expect(noteOf(a, "22K2500")).toBe(`LF ${Math.round(397 * kg)} (397 mm x ${kg.toFixed(2)} kg)`);
        const refs = refsOf(a);
        expect(refs).toContain("22K8000 x1");
        expect(refs).toContain("20S4200 x1");
        expect(refs).toContain("609.1500 x8");
        const flap = a.build.parts.find((q) =>
        {
            return q.id.startsWith(`${c.id}/front/`);
        })!;
        expect(flap.label).toBe("Abattant 1");
        expect(flap.length).toBeCloseTo(797, 9);
        const holes = marks(flap, "Équerre");
        expect(holes.length).toBe(8);
        let uMin = Infinity;
        let uMax = -Infinity;
        let vMin = Infinity;
        let vMax = -Infinity;
        for (const h of holes)
        {
            uMin = Math.min(uMin, h.u);
            uMax = Math.max(uMax, h.u);
            vMin = Math.min(vMin, h.v);
            vMax = Math.max(vMax, h.v);
        }
        // underside of the top at 381, front from 1.5 : 62 lower is 317.5 up the flap, 12.5 inside each side
        expect(uMin).toBeCloseTo(30, 9);
        expect(uMax).toBeCloseTo(767, 9);
        expect(vMax).toBeCloseTo(317.5, 9);
        expect(vMin).toBeCloseTo(317.5 - 96, 9);
        // 397 x 0.29 + 19 - 19
        expect(flap.notes.join("|")).toContain("monte à 115 mm");
    });

    it("counts the handle twice and asks for it when left at zero", () =>
    {
        expect(said(analyse(withFlap(cabinet())), "warning", "poignée")).toBe(true);
        const a = analyse(withFlap(cabinet(), { type: "lift", handleKg: 0.5 }));
        // the flap weigh its panel plus twice the handle : LF 2067 sits in both 930-2800
        // and 1730-5200 ranges and the stronger set is taken
        const kg = 0.797 * 0.397 * 0.019 * 700 + 1;
        expect(noteOf(a, "22K2700"))
            .toBe(`LF ${Math.round(397 * kg)} (397 mm x ${kg.toFixed(2)} kg, poignée comptée deux fois)`);
        expect(said(a, null, "poignée de l'abattant non saisi")).toBe(false);
    });

    it("orders the TIP-ON set and its unit for a push flap", () =>
    {
        const p0 = withFlap(cabinet());
        const c = p0.items[0] as Carcass;
        const refs = refsOf(analyse(updateFront(p0, c.id, c.fronts[0]!.id, { opening: "push" })));
        expect(refs).toContain("22K2500T x1");
        expect(refs).toContain("956.1004 x1");
        expect(refs).toContain("956.1201 x1");
        expect(refs).not.toContain("22K2500 x1");
    });

    it("refuses a flap too tall, too heavy, inset or crossed by a shelf or a rail", () =>
    {
        expect(errorsOf(withFlap(cabinet({ height: 740 }))).join()).toContain("hors de 205 à 600");
        const heavy = withFlap(cabinet({ width: 1800, height: 600, thickness: 25, decor: "MDF_LAQUE" }));
        expect(errorsOf(heavy).join()).toContain("18 kg maxi");
        const p0 = withFlap(cabinet());
        const c = p0.items[0] as Carcass;
        expect(errorsOf(updateFront(p0, c.id, c.fronts[0]!.id, { mount: "inset" })).join()).toContain("en applique");
        // shelf 81 under the top of a 562 cell, then 231, narrow enough for the shelf itself to pass
        const tall = addItem(newProject("essai"), cabinet({ width: 600, height: 600 }));
        const k = tall.items[0] as Carcass;
        const high = splitCell(tall, k.id, k.root.id, "h", 562 - 100, "adjustable");
        const kh = high.items[0] as Carcass;
        expect(errorsOf(setFront(high, kh.id, kh.root.id, { type: "lift", handleKg: 0 })).join())
            .toContain("heurte le mécanisme");
        const low = splitCell(tall, k.id, k.root.id, "h", 562 - 250, "adjustable");
        const kl = low.items[0] as Carcass;
        expect(errorsOf(setFront(low, kl.id, kl.root.id, { type: "lift", handleKg: 0 }))).toEqual([]);
        const railed = setRail(p0, c.id, c.root.id, true);
        expect(errorsOf(railed).join()).toContain("tringle passe dans le mécanisme");
    });

    it("finds what the open flap would hit in front of the cabinet", () =>
    {
        const p = withFlap(cabinet());
        // the top face is at 1900, the open flap rises 115 above it and reaches 369 + 397 frmo the wall
        const hit = addItem(p, newWallShelf({ x: 0, y: 1950, depth: 400 }));
        expect(errorsOf(hit).join()).toContain("l'abattant ouvert heurte");
        const clear = addItem(p, newWallShelf({ x: 0, y: 2100, depth: 400 }));
        expect(errorsOf(clear)).toEqual([]);
        const shallow = addItem(p, newWallShelf({ x: 0, y: 1950, depth: 300 }));
        expect(errorsOf(shallow)).toEqual([]);
    });
});
