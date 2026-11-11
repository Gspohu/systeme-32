import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { addItem, setLight } from "./commands";
import { newCarcass, newProject } from "./factory";
import type { Carcass } from "./model";

describe("errors of the steps across items", () =>
{
    // The lead of the niche strip gave way to a Minifix bolt and said so too late to be shown
    it("shows an error found once every item is built", () =>
    {
        const p = addItem(newProject("Kaysersberg"), newCarcass({ name: "Vitrine seule", width: 800,
                                                                 height: 800, depth: 450 }));
        const c = p.items[0] as Carcass;
        const lit = setLight(p, c.id, c.root.id, { kind: "strip", spots: 0, setback: 40, kelvin: 3000,
                                                  leadThrough: "left" });
        const a = analyse(lit);
        expect(a.build.errors.some((e) => { return e.includes("aucun caisson à gauche"); })).toBe(true);
        expect(a.checks.some((k) => { return k.level === "error" &&
                                     k.message.includes("aucun caisson à gauche"); })).toBe(true);
    });
});
