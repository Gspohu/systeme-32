import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { tvWall } from "./templates";
import { DIAM } from "../data/glyphs";
import { plugPull } from "./hung_items";
import { placedHardware } from "./io/cad_model";
import type { WallShelf } from "./model";


describe("concealed shelf supports", () =>
{
    it("drill 116 from the back edge, 104 past the pocket of 12, the pin being 112 long (Häfele p. 7.142)", () =>
    {
        const labels = analyse(tvWall()).build.parts.flatMap((q) =>
        {
            return q.holes.map((h) =>
            {
                return h.label;
            });
        }).filter((l) =>
        {
            return l.startsWith("Fixation 283.33.910");
        });
        expect(labels.length).toBeGreaterThan(0);
        for (const l of labels)
        {
            expect(l).toBe(`Fixation 283.33.910 : perçage ${DIAM}12 x 116 pour la broche`);
        } 
    });
});


describe("wall shelves on hollow brick", () =>
{
    it("tells the cabinet maker the pull on each plug, 31 to 60 daN on the 1600 shelf of the TV wall", () =>
    {
        // Review of Vibe (2026-11-09) : the plug against its load was never worked out, only the Häfele table
        // of the support
        const p = tvWall();
        const b = analyse(p).build;
        const shelf = p.items.find((it) => { return it.kind === "wallShelf" && it.width === 1600; })!;
        const part = b.parts.find((q) => { return q.item === shelf.id; })!;
        const pull = plugPull(shelf as WallShelf, 123.4, 5);
        expect(pull[0]).toBeCloseTo(60.5, 0);
        expect(pull[1]).toBeCloseTo(31.0, 0);
        expect(part.notes.some((n) => { return /^Fixation au mur au choix de l'ébéniste : arrachement estimé de \d+ à \d+ daN/.test(n); })).toBe(true);
        expect(b.warnings.some((w) => { return w.startsWith(`${shelf.name} : arrachement estimé`); })).toBe(true);
    });


    it("draws the plug the hardware list buys behind each screw into the wall, and no machine screw", () =>
    {
        // The CAD turned them into M5 screws in a red plug à confirmer while the list bought wood screws and DuoPower
        const p = tvWall();
        const b = analyse(p).build;
        const { instances, every } = placedHardware(p, b);
        const toWall = every.filter((s) => { return /au mur/.test(s.label); });
        expect(toWall.length).toBeGreaterThan(10);
        expect(toWall.filter((s) => { return s.kind === "metric"; })).toEqual([]);
        expect(instances.filter((i) => { return i.model === "PLUG_DUOPOWER_8x40"; })).toHaveLength(toWall.length);
        const bought = b.hardware.filter((h) => { return h.ref === "PLUG_DUOPOWER_8x40"; }).reduce((n,
            h) => { return n + h.qty; }, 0);
        expect(bought).toBeGreaterThan(0);
    });
});
