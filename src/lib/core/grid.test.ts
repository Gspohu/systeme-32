import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { addItem, moveDivider, setDividerKind, splitCell } from "./commands";
import { newCarcass, newProject } from "./factory";
import { resolveLayout } from "./layout";
import type { Carcass, SplitNode } from "./model";


// how far a carcass height sits from the line 9.5 + 32k of a 19 mm carcass
function offLine(y: number): number
{
    const r = ((y - 9.5) % 32 + 32) % 32;
    return Math.min(r, 32 - r);
}


describe("system 32 line", () =>
{
    // the dresser has ifxed shelves only, the TV wall carry the pins
    for (const make of [tvWall])
    {
        it(`puts every pin hole of ${make.name} on the line of its carcass`, () =>
        {
            const p = make();
            const a = analyse(p);
            let seen = 0;
            for (const q of a.build.parts)
            {
                const c = p.items.find((it) =>
                {
                    return it.id === q.item;
                });
                if (c?.kind !== "carcass" || q.frame === null)
                {
                    continue;
                }
                for (const h of q.holes)
                {
                    if (h.diameter === 5 && /^(Taquet|Réglage|Série)/.test(h.label))
                    {
                        // carcass height of the hole : the frame of a side or upright runs u up
                        const y = q.frame.o[1] + h.u * q.frame.u[1] - c.y;
                        expect(offLine(y)).toBeLessThan(0.01);
                        seen++;
                    }
                }
            }
            expect(seen).toBeGreaterThan(20);
        });
    }


    for (const make of [tvWall, dresser])
    {
        it(`sets every connector of the panels of ${make.name} on a 37 row or a whole number of 32 from one`, () =>
        {
            const off: string[] = [];
            let seen = 0;
            for (const q of analyse(make()).build.parts)
            {
                if (!["side", "top", "bottom", "vdivider", "hdivider"].includes(q.role))
                {
                    continue;
                }
                for (const h of q.holes)
                {
                    if ((h.face === "A" || h.face === "B") && /^(Tourillon|Goujon)/.test(h.label))
                    {
                        seen++;
                        const onRow = [37, q.width - 37].some((r) =>
                        {
                            const k = (h.v - r) / 32;
                            return Math.abs(k - Math.round(k)) < 0.02;
                        });
                        if (!onRow)
                        {
                            off.push(`${q.itemName} ${q.label} v ${h.v}`);
                        }
                    }
                }
            }
            expect(seen).toBeGreaterThan(40);
            expect(off).toEqual([]);
        });
    }


    for (const make of [tvWall, dresser])
    {
        it(`hangs every overlay door of ${make.name} on plates whose dowels go in holes of the line`, () =>
        {
            const p = make();
            let seen = 0;
            for (const q of analyse(p).build.parts)
            {
                const c = p.items.find((it) =>
                {
                    return it.id === q.item;
                });
                for (const h of q.holes)
                {
                    if (c?.kind === "carcass" && q.frame !== null && h.label.startsWith("Embase 174H7100E"))
                    {
                        expect([h.diameter, h.v]).toEqual([5, 37]);
                        expect(offLine(q.frame.o[1] + h.u * q.frame.u[1] - c.y)).toBeLessThan(0.01);
                        seen++;
                    }
                }
            }
            expect(seen).toBeGreaterThan(10);
        });
    }


    it("sets an adjustable shelf on the pins of the line, a typed height included", () =>
    {
        let p = addItem(newProject("Colmar"), newCarcass({ name: "Bibliothèque de Colmar", width: 600, height: 1200,
                                                          depth: 300 }));
        const c = p.items[0] as Carcass;
        p = splitCell(p, c.id, c.root.id, "h", 500, "adjustable");
        const root = (p.items[0] as Carcass).root as SplitNode;
        const underside = (q: typeof p): number =>
        {
            const k = q.items[0] as Carcass;
            return resolveLayout(k).nodes.get(root.id)!.y + (k.root as SplitNode).cuts[0]!;
        };
        // 500 typed : the pin 4 under it lands within half a mm of 9.5 + 32k
        expect(offLine(underside(p) - 4)).toBeLessThanOrEqual(0.5);
        const typed = moveDivider(p, c.id, root.id, 0, 611, true);
        expect(offLine(underside(typed) - 4)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(underside(typed) - 611)).toBeLessThanOrEqual(16);
        expect(analyse(typed).checks.filter((k) =>
        {
            return k.message.includes("hors des trous");
        })).toEqual([]);
        // a fixed shelf typed anywhere stays there, made adjustable it moves onto the line
        const fixed = setDividerKind(moveDivider(setDividerKind(typed, c.id, root.id, 0, "fixed"), c.id, root.id, 0, 611,
                                                 true), c.id, root.id, 0, "fixed");
        expect(underside(fixed)).toBe(611);
        expect(offLine(underside(setDividerKind(fixed, c.id, root.id, 0, "adjustable")) - 4)).toBeLessThanOrEqual(0.5);
    });
});
