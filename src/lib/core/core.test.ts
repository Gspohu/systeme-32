import { describe, expect, it } from "vitest";
import { DEFAULT_BATTENS, newCarcass, newProject, cell, split } from "./factory";
import { addItem, moveFront, rename, setFront, setPrice, splitCell, toSliding, undo, redo, historyOf, push,
        moveDivider } from "./commands";
import { resolveLayout, findNode } from "./layout";
import { cupDistance, frontPanels } from "./fronts";
import { antiTipPositions, spread } from "./fittings";
import { analyse } from "./analysis";
import { validateProject } from "./io/project_file";
import { computeOutputs } from "./outputs";
import { hardwareKey } from "./costing";
import { hingeCount, minGap } from "./doors";
import { chooseRunner, chooseTipOnSet } from "./drawers";
import { shelfDeflection } from "./mechanics";
import { newPart } from "./parts";
import { nest, type NestResult, type Placement } from "./nesting";
import { encodeWinAnsi } from "./drawing/pdf";
import { endReach } from "./extent";
import type { CutRow } from "./bom";
import type { Carcass, End, Front, Project } from "./model";
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from "./model";
import { DIAM } from "./text";

function oneBox(): { p: Project; c: Carcass }
{
    const c = newCarcass({ width: 600, height: 800, depth: 500 });
    const p = addItem(newProject("essai"), c);
    return { p, c: p.items[0] as Carcass };
}

function frontOfType(k: Carcass, type: Front["spec"]["type"]): Front
{
    for (const f of k.fronts)
    {
        if (f.spec.type === type)
        {
            return f;
        }
    }
    throw new Error(`Aucune façade de type ${type}`);
}


function placementsOf(r: NestResult): Placement[]
{
    const all: Placement[] = [];
    for (const sh of r.sheets)
    {
        all.push(...sh.placements);
    }
    return all;
}


function row(code: string, length: number, width: number, quantity: number, decor: string, grain: boolean): CutRow
{
    return { code, items: ["x"], label: "p", quantity, length, width, thickness: 19, decor, decorLabel: "", grain,
             edges: [], shaped: false, curved: false, areaM2: 0, massKg: 0, notes: [], parts: [] };
}


describe("layout and commands", () =>
{
    it("snaps a new shelf on the 32 mm grid from the inner bottom", () =>
    {
        const { p, c } = oneBox();
        const q = splitCell(p, c.id, c.root.id, "h", 19 + 300);
        const k = q.items[0] as Carcass;
        expect(k.root.kind).toBe("split");
        // 300 frm the inner bottom snaps to 288 (9 x 32)
        expect((k.root as ReturnType<typeof split>).cuts[0]).toBe(288);
    });

    it("keeps a door over the whole area after the area is split", () =>
    {
        const { p, c } = oneBox();
        const withDoor = setFront(p, c.id, c.root.id, { type: "door", hinge: "left" });
        const q = splitCell(withDoor, c.id, c.root.id, "h", 400);
        const k = q.items[0] as Carcass;
        expect(k.fronts).toHaveLength(1);
        expect(k.fronts[0]!.node).toBe(k.root.id);
        expect(k.root.kind).toBe("split");
    });

    it("refuses to split a drawer cell", () =>
    {
        const { p, c } = oneBox();
        const q = setFront(p, c.id, c.root.id, { type: "drawers", count: 3, loadKg: 10 });
        expect(() =>
        {
            splitCell(q, c.id, c.root.id, "h", 400);
        }).toThrow(/tiroirs/);
    });

    it("swaps fronts when a front is dropped on an occupied zone", () =>
    {
        const a = cell();
        const b = cell();
        const c = newCarcass({ width: 900, height: 800, depth: 500, root: split("v", [412], [a, b]) });
        let p = addItem(newProject("essai"), c);
        p = setFront(p, c.id, a.id, { type: "drawers", count: 2, loadKg: 10 });
        p = setFront(p, c.id, b.id, { type: "door", hinge: "right" });
        const drawers = frontOfType(p.items[0] as Carcass, "drawers");
        const q = moveFront(p, c.id, drawers.id, c.id, b.id);
        const k2 = q.items[0] as Carcass;
        expect(frontOfType(k2, "drawers").node).toBe(b.id);
        expect(frontOfType(k2, "door").node).toBe(a.id);
    });

    it("turns a door into a single track leaf that leaves room to slide", () =>
    {
        const { p, c } = oneBox();
        const q = setFront(p, c.id, c.root.id, { type: "door", hinge: "left" });
        const k = q.items[0] as Carcass;
        const r = toSliding(q, c.id, k.fronts[0]!.id);
        const spec = (r.items[0] as Carcass).fronts[0]!.spec;
        expect(spec.type).toBe("sliding");
        if (spec.type === "sliding")
        {
            expect(spec.leaves).toBe(1);
            expect(spec.leafWidth).toBeLessThan(600);
        }
    });


    it("rejects moving a divider that would squeeze a cell under 32 mm", () =>
    {
        const { p, c } = oneBox();
        const q = splitCell(p, c.id, c.root.id, "h", 400);
        const k = q.items[0] as Carcass;
        expect(() =>
        {
            moveDivider(q, c.id, k.root.id, 0, 30);
        }).toThrow();
    });


    it("keeps no undo step for a command that changed nothing", () =>
    {
        const { p } = oneBox();
        const renamed = rename(p, "Vaisselier"); 
        const h = push(historyOf(p), renamed);
        expect(push(h, rename(renamed, "Vaisselier"))).toBe(h);
        expect(undo(h).present).toBe(p);
    });


    it("never mutates the project it is given, and undo restores it", () =>
    {
        const { p, c } = oneBox();
        const before = JSON.stringify(p);
        const q = splitCell(p, c.id, c.root.id, "v", 300);
        expect(JSON.stringify(p)).toBe(before);
        let h = push(historyOf(p), q);
        h = undo(h);
        expect(h.present).toBe(p);
        h = redo(h);
        expect(h.present).toBe(q);
    });
});

describe("Blum and Hettich rules", () =>
{
    it("reads the hinge chart for a 600 wide front", () =>
    {
        expect(hingeCount(700, 5)).toBe(2);
        expect(hingeCount(760, 5)).toBe(3);
        expect(hingeCount(1400, 13)).toBe(4);
        expect(hingeCount(2338, 18)).toBe(5);
        expect(hingeCount(2600, 10)).toBeNull();
    });

    it("derives TB from the overlay : 19 mm side with 1.5 reveal gives 6.5, twin gives 6.5", () =>
    {
        const c = newCarcass({ width: 600, height: 800, depth: 500 });
        c.fronts.push({ id: "f", node: c.root.id, spec: { type: "door", hinge: "left" }, opening: "handle",
                       mount: "overlay", decor: null, colour: null, colourName: null });
        const fp = frontPanels(c, resolveLayout(c), DEFAULT_SETTINGS)[0]!;
        expect(fp.hingeKind).toBe("full");
        expect(cupDistance(fp)).toBeCloseTo(6.5, 6);
        expect(minGap(6.5, 19)).toBe(0.9);
    });


    it("chooses the longest MOVENTO that fits, the heavy series above 40 kg", () =>
    {
        expect(chooseRunner(492, 10)!.ref).toBe("760H4800S");
        expect(chooseRunner(282, 10)!.ref).toBe("760H2700S");
        expect(chooseRunner(492, 55)!.ref).toBe("766H4500S");
        expect(chooseRunner(240, 10)).toBeNull();
        expect(chooseRunner(492, 80)).toBeNull();
        expect(chooseTipOnSet(480, 12)).toBe("T60L7340");
        expect(chooseTipOnSet(270, 15)).toBe("T60L7140");
    });

    it("spreads connectors at the inset and never further apart than asked", () => 
    {
        const pos = spread(492, 37, 256);
        expect(pos[0]).toBe(37);
        expect(pos[pos.length - 1]).toBe(455);
        for (let i = 1; i < pos.length; i++)
        {
            expect(pos[i]! - pos[i - 1]!).toBeLessThanOrEqual(256);
        }
    });
});


describe("rounded ends", () =>
{
    it("reach as far as the skin that gets built, from the front face to the applied back", () =>
    {
        const quarter = (radius: number): Extract<End, { type: "rounded" }> =>
        {
            return { type: "rounded", radius, sweep: 90, technique: "battens", flexThickness: 9,
                     battens: DEFAULT_BATTENS, decor: "W1000_ST9" };
        };
        const c = newCarcass({ width: 600, height: 800, depth: 500,
                               ends: { left: { ...quarter(250), sweep: 180 }, right: quarter(600) } });
        // 500 deep less the 8 mm applied back : 492 usable, half of it for the half ruond
        expect(endReach(c, "left")).toBe(246);
        expect(endReach(c, "right")).toBe(492);
        expect(endReach({ ...c, ends: { ...c.ends, right: quarter(300) } }, "right")).toBe(300);
        expect(endReach({ ...c, back: { type: "none" } }, "left")).toBe(250);
        expect(endReach({ ...c, ends: { ...c.ends, right: { type: "square" } } }, "right")).toBe(0);
    });
});

describe("anti-tip fixing", () =>
{
    const hardwareOf = (p: Project): Map<string, number> =>
    {
        const qty = new Map<string, number>();
        for (const h of analyse(p).build.hardware)
        {
            qty.set(h.ref, (qty.get(h.ref) ?? 0) + h.qty);
        }
        return qty;
    };

    it("spreads the brackets : one central up to 500, 120 from the ends and 800 apart at most beyond", () =>
    {
        expect(antiTipPositions(450)).toEqual([225]);
        expect(antiTipPositions(1000)).toEqual([120, 880]);
        const wide = antiTipPositions(2600);
        expect(wide).toHaveLength(4);
        expect(wide[0]).toBe(120);
        expect(wide[3]).toBe(2480);
    });


    it("drills the top and lists the plug the wall needs, nothing at all when the box is unticked", () =>
    {
        const { p, c } = oneBox();
        const solid = hardwareOf(p);
        expect(solid.get("ANTI_TIP_BRACKET")).toBe(2);
        expect(solid.get("WALL_SCREW_5x50")).toBe(2);
        expect(solid.get("PLUG_NYLON_8x40")).toBe(2);
        const top = analyse(p).build.parts.find((q) => { return q.id === `${c.id}/top`; })!;
        const screws = top.holes.filter((h) => { return h.label.startsWith("Équerre anti-basculement"); });
        expect(screws).toMatchObject([{ u: 120 - 19, v: top.width - 20, face: "B" },
                                      { u: 480 - 19, v: top.width - 20, face: "B" }]);

        const plaster = hardwareOf({ ...p, settings: { ...p.settings, wallType: "plasterboard" } });
        expect(plaster.get("PLUG_HOLLOW_METAL")).toBe(2);
        expect(plaster.has("WALL_SCREW_5x50")).toBe(false);

        const loose = hardwareOf({ ...p, items: [{ ...c, fixToWall: false }] });
        expect(loose.has("ANTI_TIP_BRACKET")).toBe(false);
    });

    it("prices each generic article on its own, though they all read Générique", () =>
    {
        const { p } = oneBox();
        const priced = setPrice(p, hardwareKey("ANTI_TIP_BRACKET"),
                                { value: 1.2, unit: "u", source: null, date: "2026-09-29" });
        const lines = computeOutputs(priced).cost.lines;
        const bracket = lines.find((l) => { return l.label.includes("Équerre anti-basculement"); })!;
        const screw = lines.find((l) => { return l.label.includes("Vis aggloméré 4 x 16"); })!;
        expect(bracket.total).toBeCloseTo(2.4, 9);
        expect(screw.price).toBeNull();
    }); 


    it("gives an older project the default wall and the current schema", () =>
    {
        const { p } = oneBox();
        const old = JSON.parse(JSON.stringify({ ...p, schema: 1 }));
        delete old.settings.wallType;
        old.items[0].base = { type: "wall", clearance: 0 };
        const back = validateProject(old);
        expect(back.settings.wallType).toBe("solid");
        expect(back.schema).toBe(SCHEMA_VERSION);
        expect((back.items[0] as Carcass).base).toEqual({ type: "wall" });
    });
});

describe("mechanics", () =>
{
    it("matches the closed form 5 q L^4 / 384 E I", () =>
    {
        const p = newPart({ id: "s", item: "i", itemName: "i", label: "étagère", role: "shelf", length: 551,
                           width: 472, thickness: 19, decor: "W1000_ST9", edges: [], frame: null });
        const d = shelfDeflection(p, 1.0)!;
        const q = 1.0 * 4.72 * 9.81 / 100 + 600e-9 * 472 * 19 * 9.81;
        const I = 472 * 19 ** 3 / 12;
        expect(d.instant).toBeCloseTo(5 * q * 551 ** 4 / (384 * 1600 * I), 9);
        expect(d.final).toBeCloseTo(d.instant * 3.25, 9);
        expect(d.limit).toBeCloseTo(2.755, 3);
    });


    it("bends a veneered MDF shelf with the prudent Decospan values, E 1500 and 720 kg/m3", () =>
    {
        console.log("encore chien");
        const p = newPart({ id: "v", item: "i", itemName: "i", label: "étagère", role: "shelf", length: 551,
                           width: 472, thickness: 19, decor: "CHENE_PLAQUE", edges: [], frame: null });
        const d = shelfDeflection(p, 1.0)!;
        const q = 1.0 * 4.72 * 9.81 / 100 + 720e-9 * 472 * 19 * 9.81;
        const I = 472 * 19 ** 3 / 12;
        expect(p.material).toBe("mdf_veneer");
        expect(d.instant).toBeCloseTo(5 * q * 551 ** 4 / (384 * 1500 * I), 9);
    });
});

describe("nesting", () =>
{
    it("never overlaps two parts and keeps the kerf between them", () =>
    {
        const rows: CutRow[] = [];
        const byCode = new Map<string, CutRow>();
        let n = 0;
        for (const length of [800, 600, 450, 1200, 300])
        {
            const r = row(`#${n}`, length, 400 + n * 50, 3, "W1000_ST9", false);
            rows.push(r);
            byCode.set(r.code, r);
            n++;
        }
        const r = nest(rows, DEFAULT_SETTINGS);
        const kerf = DEFAULT_SETTINGS.kerf;
        expect(r.unplaced).toHaveLength(0);
        expect(placementsOf(r)).toHaveLength(15);
        for (const sh of r.sheets)
        {
            const pl = sh.placements;
            for (let i = 0; i < pl.length; i++)
            {
                const a = pl[i]!;
                // a placement has exactly the size of its part, rotated or not
                const part = byCode.get(a.code)!;
                const size = a.rotated ? [part.width, part.length] : [part.length, part.width];
                expect([a.w, a.h]).toEqual(size);
                expect(a.x).toBeGreaterThanOrEqual(sh.trim);
                expect(a.y).toBeGreaterThanOrEqual(sh.trim);
                expect(a.x + a.w).toBeLessThanOrEqual(sh.length - sh.trim + 0.001);
                expect(a.y + a.h).toBeLessThanOrEqual(sh.width - sh.trim + 0.001);
                for (let j = i + 1; j < pl.length; j++)
                {
                    const b = pl[j]!;
                    const apart = a.x + a.w + kerf <= b.x + 0.001 || b.x + b.w + kerf <= a.x + 0.001
                        || a.y + a.h + kerf <= b.y + 0.001 || b.y + b.h + kerf <= a.y + 0.001;
                    expect(apart).toBe(true);
                }
            }
        }
    });


    it("never rotates a grained part", () =>
    {
        const r = nest([row("#g", 2300, 500, 4, "H1180_ST37", true)], DEFAULT_SETTINGS);
        expect(placementsOf(r)).toHaveLength(4);
        for (const p of placementsOf(r))
        {
            expect(p.rotated).toBe(false);
        }
    });
});


describe("pdf text", () =>
{
    it("encodes French text and the diameter sign in WinAnsi", () =>
    {
        expect(encodeWinAnsi(`é${DIAM}°`)).toEqual([0xe9, 0xd8, 0xb0]);
        expect(encodeWinAnsi(String.fromCharCode(0x2014))).toEqual([0x97]);
        expect(encodeWinAnsi(String.fromCharCode(0x2265))).toEqual([0x3e, 0x3d]);
    });
});

describe("tree helpers", () =>
{
    it("finds nodes", () =>
    {
        const a = cell();
        const s = split("v", [100], [a, cell()]);
        expect(findNode(s, a.id)).toBe(a);
    });
});
