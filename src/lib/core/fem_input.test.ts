import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { femFingerprint, femInput, femText } from "./fem_input";
import { exportedParts } from "./io/export_selection";
import { decorById, materialOfDecor } from "../data/materials";
import { dresser, tvWall } from "./templates";
import { SIMULATED_TOPS } from "../data/fem_results";
import type { Carcass, Project } from "./model";

function fingerprintOf(p: Project): string
{
    return femFingerprint(femInput(p, analyse(p).build));
}


function carcass(p: Project, name: string): Carcass
{
    return p.items.find((it) => { return it.kind === "carcass" && it.name === name; }) as Carcass;
}


describe("the fingerprint of what a simulation of the piece was fed", () =>
{
    it("is the same for the same piece built again, its ids new each time", () =>
    {
        expect(fingerprintOf(dresser())).toBe(fingerprintOf(dresser()));
        expect(fingerprintOf(tvWall())).toBe(fingerprintOf(tvWall()));
    });

    // Each a change the run would have seen : the result of the piece before it is no longer the one of this one
    const changes: [string, () => Project, (p: Project) => void][] = [
        ["the link screws in a triangle taken off", dresser, (p) => { carcass(p, "Niche").linkTriangle = false; }],
        ["the screws into the wall taken off", dresser, (p) => { carcass(p, "Placards hauts").backWallScrews = []; }],
        ["a carcass thicker", dresser, (p) => { carcass(p, "Colonne droite").thickness = 22; }],
        ["the decor of a carcass", dresser, (p) => { carcass(p, "Niche").decor = carcass(p, "Niche").decor +
                                                    "-autre"; }],
        ["a device ten times as heavy", tvWall, (p) =>
        {
            const device = p.items.find((it) => { return it.kind === "device"; })!;
            if (device.kind === "device")
            {
                device.massKg *= 10;
            }
        }],
        ["the test load of the shelves", dresser, (p) => { p.settings.shelfLoad = 1.5; }],
        // Its footprint spreads its weight : the amplifier half as wide and deep left the old fingerprint as it was
        ["a device half as wide and deep", tvWall, (p) =>
        {
            const device = p.items.find((it) => { return it.kind === "device"; })!;
            if (device.kind === "device")
            {
                device.width /= 2;
                device.depth /= 2;
            }
        }],
    ];
    for (const [what, make, change] of changes)
    {
        it(`changes with ${what}`, () =>
        {
            const before = fingerprintOf(make());
            const p = make();
            change(p);
            expect(fingerprintOf(p)).not.toBe(before);
        });
    }

    it("changes with the modulus of a material, not only its name", () =>
    {
        const p = dresser();
        const board = analyse(p).build.parts.find((part) => { return part.frame !== null; })!;
        const stock = materialOfDecor(decorById(board.decor));
        const before = fingerprintOf(p);
        const kept = stock.modulus;
        stock.modulus = kept / 2;
        try
        {
            expect(fingerprintOf(dresser())).not.toBe(before);
        }
        finally
        {
            stock.modulus = kept;
        }
    });

    it("takes the boards and drillings the CAD export takes, a screw mark left out", () =>
    {
        const p = dresser();
        const b = analyse(p).build;
        const input = femInput(p, b) as { parts: { label: string; holes: { diameter: number; depth: number }[] }[] };
        expect(input.parts.map((part) => { return part.label; }))
            .toEqual(exportedParts(b).map((part) => { return part.label; }));
        // The witness : marks with no drilling there are, the catch plates and the flap screws
        const marks = exportedParts(b).flatMap((part) =>
        {
            return part.holes.filter((h) => { return !(h.diameter > 0 && h.depth > 0); });
        });
        expect(marks.length).toBeGreaterThan(0);
        expect(input.parts.every((part) =>
        {
            return part.holes.every((h) => { return h.diameter > 0 && h.depth > 0; });
        })).toBe(true);
    });

    // FNV-1a over UTF-8, the bytes the run hashes : an accent is 2 bytes there, 1 UTF-16 unit for charCodeAt
    it("hashes the UTF-8 bytes of the text, as the run does on its file", () =>
    {
        expect(femFingerprint("a")).toBe("d4272417d7c77eea");
        expect(femFingerprint("é")).toBe("162b0081d9700039");
        expect(femText({ a: "é" })).toBe("{\"a\":\"é\"}");
    });

    it("lets the piece cite the run recorded on its own fingerprint, and only that one", () =>
    {
        // The witness : a fingerprint that never matched would pass every test of a change above
        const p = dresser();
        const run = { item: "Niche", over: ["Placards hauts"], input: fingerprintOf(dresser()), mesh: 35, ownSag: 0.5,
                      source: "essai" };
        // Ahead of the recorded ones, the first that matches is the one cited
        SIMULATED_TOPS.unshift(run);
        try
        {
            const niche = carcass(p, "Niche");
            const result = analyse(p);
            const top = result.build.parts.find((part) => { return part.item === niche.id && part.role === "top"; })!;
            expect(result.deflections.find((d) => { return d.part === top.id; })?.instant).toBe(0.5);
            const changed = dresser();
            carcass(changed, "Niche").linkTriangle = false;
            const again = analyse(changed);
            const top2 = again.build.parts.find((part) => { return part.item === carcass(changed, "Niche").id
                && part.role === "top"; })!;
            expect(again.deflections.some((d) => { return d.part === top2.id; })).toBe(false);
            // The same run on a 60 mm cell reads the sag low : never cited
            run.mesh = 60;
            const same = dresser();
            const coarse = analyse(same);
            const top3 = coarse.build.parts.find((part) => { return part.item === carcass(same, "Niche").id
                && part.role === "top"; })!;
            expect(coarse.deflections.find((d) => { return d.part === top3.id; })?.instant).not.toBe(0.5);
        }
        finally
        {
            SIMULATED_TOPS.splice(SIMULATED_TOPS.indexOf(run), 1);
        }
    });
});
