import { describe, expect, it } from "vitest";
import { CommandError, NICHE_SETBACK, addItem, setDividerSetback, setFront, splitCell, splitZone } from "./commands";
import { cell, newCarcass, newProject, split } from "./factory";
import { analyse } from "./analysis";
import { resolveLayout } from "./layout";
import { validateProject } from "./io/project_file";
import { dresser } from "./templates";
import type { Carcass, Project, SplitNode } from "./model";
import type { Part } from "./part_types";

function carcassNamed(p: Project, name: string): Carcass
{
    return p.items.find((it) =>
    {
        return it.kind === "carcass" && it.name === name;
    }) as Carcass;
}


function partsOf(p: Project, itemName: string, role: string): Part[]
{
    return analyse(p).build.parts.filter((q) =>
    {
        return q.itemName === itemName && q.role === role;
    });
}


// 600 x 800 x 400 on the floor, one shelf on pins at 380 and an upright in the lower half
function cupboard(): { p: Project; c: Carcass }
{
    const c = newCarcass({ name: "Placard de Riom", width: 600, height: 800, depth: 400, base: { type: "floor" },
                           root: split("h", [380], [split("v", [280], [cell(), cell()]), cell()], ["adjustable"]) });
    const p = addItem(newProject("Riom"), c);
    return { p, c: p.items[0] as Carcass };
}


describe("shelves behind a door over several cells", () =>
{
    it("adds one in the tallest cell of the right column of the dresser, its door kept over the whole", () =>
    {
        const p = dresser();
        const kr = carcassNamed(p, "Colonne droite");
        // The zone the door covers is no single cell : the inspector had no way to cut it
        expect(() =>
        {
            return splitCell(p, kr.id, kr.root.id, "h", 1000);
        }).toThrow(CommandError);
        const r = splitZone(p, kr.id, kr.root.id, "h", "adjustable");
        const after = carcassNamed(r, "Colonne droite");
        const root = after.root as SplitNode;
        expect(root.cuts.length).toBe(3);
        // 776, 871 and 533 high : the new shelf parts the middle one
        const added = resolveLayout(after).dividers.find((d) =>
        {
            return d.index === 1 && d.split === root.id;
        })!;
        expect(added.y).toBeGreaterThan(19 + 776 + 19);
        expect(added.y + added.h).toBeLessThan(19 + 1666);
        expect(added.kind).toBe("adjustable");
        expect(after.fronts[0]!.node).toBe(root.id);
        expect(root.setbacks).toEqual([null, null, null]);
    });

    it("refuses a zone of drawers as it refuses their cell", () =>
    {
        const p = dresser();
        const low = carcassNamed(p, "Placards et tiroirs");
        const drawer = low.fronts.find((f) =>
        {
            return f.spec.type === "drawers";
        })!;
        expect(() =>
        {
            return splitZone(p, low.id, drawer.node, "h");
        }).toThrow(CommandError);
    });
});


describe("dividers standing back from the front", () =>
{
    it("sets the shelves and uprights of the small niches of the dresser back, the opening keeps its depth", () =>
    {
        const p = dresser();
        const side = partsOf(p, "Niche", "side")[0]!;
        const uprights = partsOf(p, "Niche", "vdivider");
        const shelves = partsOf(p, "Niche", "hdivider");
        expect(uprights.length).toBe(2);
        expect(shelves.length).toBe(4);
        for (const q of [...uprights, ...shelves])
        {
            expect(side.width - q.width).toBe(NICHE_SETBACK);
            expect(side.frame!.o[2] - q.frame!.o[2]).toBe(NICHE_SETBACK);
        }
        // Nothing stands back anywhere else in the piece
        for (const name of ["Colonne gauche", "Placards et tiroirs", "Placards hauts", "Colonne droite"])
        {
            const k = partsOf(p, name, "side")[0]!;
            for (const q of [...partsOf(p, name, "hdivider"), ...partsOf(p, name, "vdivider")])
            {
                expect(q.width).toBe(k.width);
            }
        }
        expect(analyse(p).build.errors.filter((e) =>
        {
            return e.startsWith("Niche");
        })).toEqual([]);
    });

    it("joins a shelf standing back over the depth it shares with each side", () =>
    {
        const p = dresser();
        const b = analyse(p).build;
        const shelf = partsOf(p, "Niche", "hdivider")[0]!;
        const joints = b.joints.filter((j) =>
        {
            return j.edgePart === shelf.id;
        });
        expect(joints.length).toBe(2);
        const side = joints.find((j) =>
        {
            return j.facePart.endsWith("/side/L");
        })!;
        const upright = joints.find((j) =>
        {
            return j.facePart.includes("/div/");
        })!;
        // On the side its joint starts 100 in, on the upright standing back as much it starts at its front
        expect([side.from, side.to, side.edgeFrom]).toEqual([100, 492, 0]);
        expect([upright.from, upright.to, upright.edgeFrom]).toEqual([0, 392, 0]);
    });

    it("drills the pins of a shelf standing back under it, and back at 37 once flush again", () =>
    {
        const { p, c } = cupboard();
        const rows = (q: Project): number[] =>
        {
            const side = analyse(q).build.parts.find((x) =>
            {
                return x.id === `${c.id}/side/L`;
            })!;
            return [...new Set(side.holes.filter((h) =>
            {
                return h.purpose === "shelf-pin";
            }).map((h) =>
            {
                return h.v;
            }))].sort((m, n) =>
            {
                return m - n;
            });
        };
        expect(rows(p)).toEqual([37, 400 - 8 - 37]);
        const back = setDividerSetback(p, c.id, c.root.id, 0, NICHE_SETBACK);
        // 17 behind its front edge, as a shelf at the 20 of the settings is from 37
        expect(rows(back)).toEqual([117, 400 - 8 - 37]);
        const shelf = analyse(back).build.parts.find((x) =>
        {
            return x.role === "shelf";
        })!;
        expect(shelf.width).toBe(400 - 8 - NICHE_SETBACK);
        expect(rows(setDividerSetback(back, c.id, c.root.id, 0, null))).toEqual([37, 400 - 8 - 37]);
    });

    it("refuses an upright standing back beside a door, and a setback that leaves too little", () =>
    {
        const { p, c } = cupboard();
        const lower = (c.root as SplitNode).children[0] as SplitNode;
        const withDoor = setFront(p, c.id, lower.children[0]!.id, { type: "door", hinge: "left" });
        const back = setDividerSetback(withDoor, c.id, lower.id, 0, NICHE_SETBACK);
        expect(analyse(back).build.errors.some((e) =>
        {
            return e.includes("montant en retrait de 100 mm borde une case qui porte une façade");
        })).toBe(true);
        expect(analyse(setDividerSetback(p, c.id, lower.id, 0, NICHE_SETBACK)).build.errors).toEqual([]);
        for (const wrong of [400, -5])
        {
            expect(() =>
            {
                return setDividerSetback(p, c.id, lower.id, 0, wrong);
            }).toThrow(CommandError);
        }
    });

    it("gives the dividers of an older project no setback", () =>
    {
        const { p } = cupboard();
        const old = JSON.parse(JSON.stringify({ ...p, schema: 10 }));
        delete old.items[0].root.setbacks;
        delete old.items[0].root.children[0].setbacks;
        const back = validateProject(old);
        const root = (back.items[0] as Carcass).root as SplitNode;
        expect(root.setbacks).toEqual([null]);
        expect((root.children[0] as SplitNode).setbacks).toEqual([null]);
    });
});
