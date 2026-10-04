import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { assemblySequences } from "./assembly";
import { addItem, setFront, setLight, setRail, setShoeRack, splitCell, updateFront } from "./commands";
import { newCarcass, newLadder, newProject, newSlats, newWallShelf } from "./factory";
import { computeOutputs } from "./outputs";
import { letInFittings } from "./fitted";
import { solids } from "./solids";
import { stability } from "./stability";
import { dresser, tvWall } from "./templates";
import { PURPOSES, type Purpose } from "./part_types";
import type { Carcass, Item, Project } from "./model";

// a zero width space between every letter : no literal matches the text any more, digits and words read the same
const ZWSP = String.fromCharCode(0x200b);


function scramble(t: string): string
{
    return t.split("").join(ZWSP);
}


function plain(t: string): string
{
    return t.split(ZWSP).join("");
}


function one(name: string, o: Partial<Carcass>): { p: Project; c: Carcass }
{
    const p = addItem(newProject("Kaysersberg"), newCarcass({ name, width: 800, height: 800, depth: 450, ...o }));
    return { p, c: p.items[0] as Carcass };
}


function rootOf(p: Project): string
{
    return (p.items[0] as Carcass).root.id;
}


// Every producer of hardware called at least once : templates, joinery, runners, façade openings, base, hung
// and standing items : a family left out of the assembly shows here, not on a customer's sheet
function fixture(): Project[]
{
    const out: Project[] = [tvWall(), dresser()];
    const clamex = dresser();
    clamex.settings.joinery = "clamex";
    out.push(clamex);
    const heavy = dresser();
    for (const it of heavy.items)
    {
        for (const f of it.kind === "carcass" ? it.fronts : [])
        {
            if (f.spec.type === "drawers")
            {
                f.spec.runner = "766H";
            }
        }
    }
    out.push(heavy);

    const flap = one("Haut de Riquewihr", { height: 400, depth: 350, y: 1500, base: { type: "wall" } });
    const lifted = setFront(flap.p, flap.c.id, rootOf(flap.p), { type: "lift", handleKg: 0.5 });
    const k = lifted.items[0] as Carcass;
    out.push(lifted, updateFront(lifted, k.id, k.fronts[0]!.id, { opening: "push" }));

    const hung = one("Meuble suspendu d'Obernai", { width: 1200, height: 700, depth: 500, y: 800,
                                                    base: { type: "wall", hanger: "camar" } });
    out.push(setFront(hung.p, hung.c.id, rootOf(hung.p), { type: "door", hinge: "left" }));
    const sliding = one("Buffet de Sélestat", { width: 1200 });
    out.push(setFront(sliding.p, sliding.c.id, rootOf(sliding.p), { type: "sliding", leaves: 2, leafWidth: 500,
                                                                    damped: true }));
    const inset = one("Armoire de Ribeauvillé", {});
    out.push(setFront(inset.p, inset.c.id, rootOf(inset.p), { type: "door", hinge: "right" }, { mount: "inset" }));
    const drawers = one("Commode de Molsheim", { depth: 500 });
    out.push(setFront(drawers.p, drawers.c.id, rootOf(drawers.p), { type: "drawers", count: 3, loadKg: 10 }));

    const lit = one("Vitrine de Thann", {});
    out.push(setLight(lit.p, lit.c.id, rootOf(lit.p), { kind: "strip", spots: 0, setback: 40, kelvin: 3000,
                                                       wifi: true }));
    const spots = one("Niche de Guebwiller", {});
    out.push(setLight(spots.p, spots.c.id, rootOf(spots.p), { kind: "spots", spots: 2, setback: 40, kelvin: 3000 }));
    const wardrobe = one("Penderie de Saverne", { width: 1000, height: 2000, depth: 600 });
    out.push(setRail(wardrobe.p, wardrobe.c.id, rootOf(wardrobe.p), true));
    const lift = one("Penderie de Wissembourg", { width: 1000, height: 2000, depth: 600 });
    out.push(setRail(lift.p, lift.c.id, rootOf(lift.p), true, "lift"));
    const shoes = one("Meuble à chaussures de Haguenau", { depth: 400 });
    out.push(setShoeRack(shoes.p, shoes.c.id, rootOf(shoes.p), 2));
    out.push(one("Meuble TV de Munster", { width: 1800, height: 500, y: 100,
                                           base: { type: "plinth", height: 100, setback: 50, grills: 2 } }).p);
    out.push(one("Bahut de Cernay", { y: 100, base: { type: "feet", height: 100 } }).p);
    out.push(embase());

    const standing: Item[] = [newLadder({ name: "Échelle de Bergheim", x: 200 }),
                              newSlats({ name: "Lattes d'Altkirch" }),
                              newSlats({ name: "Claustra de Soultz", mode: "divider" }),
                              newWallShelf({ name: "Étagère d'Eguisheim" })];
    for (const it of standing)
    {
        out.push(addItem(newProject("Kaysersberg"), it));
    }
    return out;
}


// an adjustable shelf at 400 rests its pins in the holes of the middle hinge plate
function embase(): Project
{
    const b = one("Buffet de Rouffach", { width: 600, depth: 500 });
    const door = setFront(b.p, b.c.id, rootOf(b.p), { type: "door", hinge: "left" });
    return splitCell(door, b.c.id, rootOf(door), "h", 400, "adjustable");
}


describe("hardware purposes", () =>
{
    const projects = fixture();

    it("are each set by some producer of the fixture, none declared for nothing", () =>
    {
        const seen = new Set<Purpose>();
        for (const p of projects)
        {
            const b = analyse(p).build;
            for (const h of b.hardware)
            {
                seen.add(h.purpose);
            }
            for (const f of b.fitted)
            {
                seen.add(f.purpose);
            }
            for (const q of b.parts)
            {
                for (const h of q.holes)
                {
                    seen.add(h.purpose);
                }
            }
        }
        expect(PURPOSES.filter((x) =>
        {
            return !seen.has(x);
        })).toEqual([]);
    });


    it("leave no hardware line of a carcass to the catch-all step", () =>
    {
        for (const p of projects)
        {
            const o = computeOutputs(p);
            for (const s of assemblySequences(p, o.analysis, o.bom))
            {
                const item = p.items.find((it) =>
                {
                    return it.id === s.item;
                })!;
                if (item.kind === "carcass")
                {
                    expect(s.steps.map((st) =>
                    {
                        return st.title;
                    }), `${p.name}, ${s.name}`).not.toContain("Autres quincailleries");
                }
            }
        }
    });


    it("give the same assembly sequence whatever the notes and hole labels say", () =>
    {
        for (const p of projects)
        {
            const o = computeOutputs(p);
            const before = JSON.stringify(assemblySequences(p, o.analysis, o.bom));
            for (const h of o.analysis.build.hardware)
            {
                h.note = h.note === null ? null : scramble(h.note);
            }
            for (const q of o.analysis.build.parts)
            {
                for (const h of q.holes)
                {
                    h.label = scramble(h.label);
                }
            }
            expect(plain(JSON.stringify(assemblySequences(p, o.analysis, o.bom))), p.name).toBe(before);
        }
    });


    it("give the same tipping whatever the hardware volumes are called", () =>
    {
        for (const p of projects)
        {
            const b = analyse(p).build;
            const all = solids(p, b);
            const before = JSON.stringify(stability(p, b, all));
            const renamed = all.map((s) =>
            {
                return { ...s, label: scramble(s.label) };
            });
            expect(JSON.stringify(stability(p, b, renamed)), p.name).toBe(before);
        }
    });


    it("let the same hinge cups and Minifix housings into the boards whatever their holes are called", () =>
    {
        for (const p of projects)
        {
            const parts = analyse(p).build.parts;
            const before = letInFittings(parts).map((f) =>
            {
                return `${f.key} ${f.purpose}`;
            });
            const renamed = parts.map((q) =>
            {
                return { ...q, holes: q.holes.map((h) =>
                {
                    return { ...h, label: scramble(h.label) };
                }) };
            });
            expect(letInFittings(renamed).map((f) =>
            {
                return `${f.key} ${f.purpose}`;
            }), p.name).toEqual(before);
        }
    });


    it("warn when a shelf pin would land in a hinge plate hole", () =>
    {
        expect(analyse(embase()).checks.map((k) =>
        {
            return k.message;
        }).join("\n")).toContain("son taquet tombe dans un trou d'embase de charnière");
    });


    it("warn and drill no pin when it would run 3 mm from a TIP-ON adapter screw", () =>
    {
        const a = analyse(buffet(516));
        expect(said(a)).toContain("son taquet tombe dans un trou de l'embase TIP-ON 956.1201");
        expect(nearAdapter(a, "shelf-pin")).toEqual([]);
    });


    it("drill a spare hole 3 mm from a TIP-ON adapter screw, and say it takes no pin", () =>
    {
        const a = analyse(buffet(460));
        expect(said(a)).toContain("un trou de réglage de sa série");
        expect(said(a)).toContain("Il ne pourra pas recevoir de taquet");
        expect(nearAdapter(a, "pin-spare")).not.toEqual([]);
    });
});


// two push doors either side of an upright : its adapter screws sit off the 32 series, by the door tops
function buffet(shelfAt: number): Project
{
    let p = addItem(newProject("Kaysersberg"), newCarcass({ name: "Buffet de Hunawihr", width: 1000, height: 620,
                                                            depth: 500 }));
    let c = p.items[0] as Carcass;
    p = splitCell(p, c.id, c.root.id, "v", 500, "fixed");
    c = p.items[0] as Carcass;
    const [left, right] = c.root.kind === "split" ? c.root.children : [];
    p = setFront(setFront(p, c.id, left!.id, { type: "door", hinge: "left" }), c.id, right!.id,
                 { type: "door", hinge: "right" });
    for (const f of (p.items[0] as Carcass).fronts)
    {
        p = updateFront(p, c.id, f.id, { opening: "push" });
    }
    return splitCell(p, c.id, left!.id, "h", shelfAt, "adjustable");
}


function said(a: ReturnType<typeof analyse>): string
{
    return a.checks.map((k) =>
    {
        return k.message;
    }).join("\n");
}


// holes of that purpose drilled closer than a pin and a screw allow to an adapter screw of the same face
function nearAdapter(a: ReturnType<typeof analyse>, purpose: Purpose): string[]
{
    const close: string[] = [];
    for (const q of a.build.parts)
    {
        for (const x of q.holes.filter((h) => { return h.purpose === purpose; }))
        {
            for (const screw of q.holes.filter((h) => { return h.purpose === "adapter-screw"; }))
            {
                if (x.face === screw.face && Math.hypot(x.u - screw.u, x.v - screw.v) < 6.5)
                {
                    close.push(`${q.label} : ${x.label} / ${screw.label}`);
                }
            }
        }
    }
    return close;
}
