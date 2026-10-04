import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { addItem, updateItem } from "./commands";
import { newCarcass, newDevice, newProject } from "./factory";
import { assemblySequences } from "./assembly";
import { computeOutputs } from "./outputs";
import { validateProject } from "./io/project_file";
import { tvWall } from "./templates";
import { carrierOf } from "./devices";
import type { Device, Project } from "./model";


// a 600 x 800 x 450 cupboard on a 100 plinth, one cell inside 19 to 581 wide and 19 to 781 high
function cupboard(d: Partial<Device>): Project
{
    const p = addItem(newProject("Sélestat"), newCarcass({ name: "Buffet de Sélestat", width: 600,
                                                          height: 800, depth: 450,
                                                           y: 100 }));
    return addItem(p, newDevice({ name: "Box", width: 230, height: 55, depth: 200, massKg: 1, source: "mesurée",
                                  x: 40, y: 119, z: 20, ...d }));
}


function said(p: Project, level: string): string
{
    let text = "";
    for (const k of analyse(p).checks)
    {
        if (k.level === level)
        {
            text += `${k.message}\n`;
        }
    }
    return text;
}


describe("appliances", () =>
{
    it("sit in a cell they fit, on its floor", () =>
    {
        expect(said(cupboard({}), "error")).toBe("");
        expect(said(cupboard({}), "warning")).not.toContain("Box");
    });


    it("are refused when they stick out of every cell", () =>
    {
        // the box stay inside the carcass, but over the left sied from 5
        expect(said(cupboard({ x: 5 }), "error")).toContain("Box ne tient dans aucune case de Buffet de Sélestat");
    });


    it("are told when they float above the floor of their cell", () =>
    {
        expect(said(cupboard({ y: 200 }), "warning")).toContain("Box flotte à 81 mm au-dessus du fond de sa case");
    });


    it("stand on a top without a word, and are told when they stand on nothing", () =>
    {
        expect(said(cupboard({ y: 900 }), "warning")).not.toContain("Box ne repose sur rien");
        expect(said(cupboard({ y: 950 }), "warning")).toContain("Box ne repose sur rien");
    });


    it("are refused across another item", () =>
    {
        expect(said(cupboard({ x: 500, y: 300 }), "error")).toContain("Box et Buffet de Sélestat se chevauchent");
    });


    it("weigh on the feet of the carcass carrying them", () =>
    {
        const perFoot = (p: Project): number =>
        {
            const told = said(p, "info").match(/(\d+) kg sur le pied le plus chargé/);
            return Number(told![1]);
        };
        const p = addItem(newProject("Sélestat"), newCarcass({ name: "Buffet de Sélestat", width: 600, height: 800,
                                                              depth: 450, y: 100, base: { type: "feet",
                                                                  height: 100 } }));
        // 200 kg over 4 feet : at least 50 more on the busiest one, the feet centred a little off the box
        const heavy = addItem(p, newDevice({ name: "Ampli", width: 400, height: 300, depth: 200, massKg: 200,
                                             source: "mesuré", x: 100, y: 900, z: 125 }));
        expect(perFoot(heavy) - perFoot(p)).toBeGreaterThanOrEqual(50);
        expect(perFoot(heavy) - perFoot(p)).toBeLessThan(60);
    });


    it("are left out of the assembly sequences, nothing is made of them", () =>
    {
        const p = tvWall();
        const o = computeOutputs(p);
        const names = assemblySequences(p, o.analysis, o.bom).map((s) =>
        {
            return s.name;
        });
        const devices = p.items.filter((it) =>
        {
            return it.kind === "device";
        });
        expect(devices.length).toBe(3);
        for (const d of devices)
        {
            expect(names).not.toContain(d.name);
        }
    });


    it("take impossible sizes neither from a file nor from the inspector", () =>
    {
        const p = cupboard({});
        const d = p.items[1]!;
        expect(() =>
        {
            return updateItem(p, d.id, { width: 0 } as Partial<Device>);
        }).toThrow("Un appareil a des cotes positives");
        const bad = structuredClone(p) as unknown as { items: Record<string, unknown>[] };
        bad.items[1]!.massKg = -1;
        expect(() =>
        {
            return validateProject(bad);
        }).toThrow("appareil de taille ou de masse impossible");
        expect(validateProject(structuredClone(p)).items[1]!.kind).toBe("device");
    });


    it("give the TV wall its amplifier on the base and its two boxes in the column's technical cell, all accepted", () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const devices = p.items.filter((it): it is Device =>
        {
            return it.kind === "device";
        });
        expect(devices.map((d) =>
        {
            return [d.name, carrierOf(p, d)?.name];
        })).toEqual([["Ampli Marshall Stanmore", "Meuble bas"], ["Freebox Server mini 4K", "Colonne gauche"],
                     ["Freebox Player mini 4K", "Colonne gauche"]]);
        expect(a.checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
        const top = a.build.parts.find((q) =>
        {
            return q.role === "top" && q.itemName === "Meuble bas";
        })!;
        expect(top.cutouts).toEqual([]);
    });
});
