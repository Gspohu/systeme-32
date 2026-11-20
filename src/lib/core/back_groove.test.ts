import { describe, expect, it } from "vitest";
import { newCarcass, newProject } from "./factory";
import { addItem } from "./commands";
import { analyse } from "./analysis";
import type { Carcass } from "./model";
import type { Part } from "./part_types";

describe("grooves of a back in grooves", () =>
{
    for (const sidesOnBottom of [false, true])
    {
        for (const topOverSides of [false, true])
        {
            it(`holds every edge of the back in a groove, none run out in view (sides on bottom ${sidesOnBottom}, `
                + `top over sides ${topOverSides})`, () =>
            {
                const c = newCarcass({ width: 800, height: 800, depth: 500 });
                c.back = { type: "groove", thickness: 8, offset: 16, depth: 8 };
                c.sidesOnBottom = sidesOnBottom;
                c.topOverSides = topOverSides;
                const p = addItem(newProject("essai"), c);
                const id = (p.items[0] as Carcass).id;
                const parts = analyse(p).build.parts.filter((q) => { return q.item === id; });
                const of = (role: string): Part[] => { return parts.filter((q) => { return q.role === role; }); };
                const back = of("back")[0]!;
                // The back in the room : its lowest and highest x and y
                const xs = [back.frame!.o[0], back.frame!.o[0] + (back.frame!.u[0] * back.length + back.frame!.v[0] *
                                                                  back.width)];
                const ys = [back.frame!.o[1], back.frame!.o[1] + (back.frame!.u[1] * back.length +
                                                                  back.frame!.v[1] * back.width)];
                const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
                const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
                for (const panel of [...of("side"), ...of("top"), ...of("bottom")])
                {
                    const groove = panel.grooves.find((g) => { return g.label.startsWith("Rainure de fond"); })!;
                    const f = panel.frame!;
                    const axis = panel.role === "side" ? 1 : 0;
                    const from = f.o[axis]! + f.u[axis]! * groove.from;
                    const to = f.o[axis]! + f.u[axis]! * groove.to;
                    const [low, high] = axis === 1 ? [y0, y1] : [x0, x1];
                    const name = `${panel.label}`;
                    // The back reaches into it over its whole lenght within the board
                    const start = f.o[axis]!;
                    const end = f.o[axis]! + f.u[axis]! * panel.length;
                    expect(Math.min(from, to), name).toBeLessThanOrEqual(Math.max(low, start) + 1e-6);
                    expect(Math.max(from, to), name).toBeGreaterThanOrEqual(Math.min(high, end) - 1e-6);
                    // An end of the board in view is never opened : run out only where another board covers it
                    const length = panel.length;
                    // A side's foot is in view unless it stands on the bottom, its head unless the top lies over it
                    const inView = panel.role === "side" ? [!sidesOnBottom, !topOverSides]
                        : [length >= c.width - 1, length >= c.width - 1];
                    if (inView[0])
                    {
                        expect(groove.from, `${name} : début dans le vide`).toBeGreaterThan(0);
                    }
                    if (inView[1])
                    {
                        expect(groove.to, `${name} : fin dans le vide`).toBeLessThan(length);
                    }
                }
            });
        }
    }
});
