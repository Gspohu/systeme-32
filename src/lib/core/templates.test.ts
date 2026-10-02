import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { resolveLayout } from "./layout";
import type { Part } from "./parts";
import type { Carcass, SplitNode } from "./model";


function hardwareCount(make: typeof tvWall): Map<string, number>
{
    const agg = new Map<string, number>();
    for (const h of analyse(make()).build.hardware)
    {
        agg.set(h.ref, (agg.get(h.ref) ?? 0) + h.qty);
    }
    return agg;
}

describe("the sketch templates", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`${make.name} builds without any manufacturing error`, () =>
        {
            const a = analyse(make());
            const errors: string[] = [];
            for (const c of a.checks)
            {
                if (c.level === "error")
                {
                    errors.push(c.message);
                }
            }
            expect(errors).toEqual([]);
            expect(a.build.parts.length).toBeGreaterThan(50);
        });
    }


    it("keeps the dresser to the two decors the parents picked, Halifax oak and the green", () =>
    {
        const decors = new Set<string>();
        for (const q of analyse(dresser()).build.parts)
        {
            if (q.role !== "back")
            {
                decors.add(q.decor);
            }
        }
        expect([...decors].sort()).toEqual(["H1180_ST37", "U604_ST9"]);
    });


    // the TV wall keeps oak backs, cut from the oak 8 mm sheet its niche lining opens anyway
    for (const [make, decor] of [[tvWall, "H1180_ST37"], [dresser, "SNOW_WHITE_8685"]] as const)
    {
        it(`${make.name} puts every back in ${decor}, the rounded end's one included`, () =>
        {
            const backs = analyse(make()).build.parts.filter((q) =>
            {
                return q.role === "back";
            });
            expect(backs.length).toBeGreaterThan(1);
            for (const q of backs)
            {
                expect([q.decor, q.thickness]).toEqual([decor, 8]);
            }
        });
    }


    it("fits the dresser with 24 unsprung hinges, a TIP-ON per door and three 480 runner pairs", () =>
    {
        // nine short doors of two hinges, the 861 one of the left column three, the full height right one five
        const hw = hardwareCount(dresser);
        expect((hw.get("70T3550.TL") ?? 0) + (hw.get("70T3650.TL") ?? 0)).toBe((8 * 2) + 3 + 5);
        expect((hw.get("71B3550") ?? 0) + (hw.get("71B3650") ?? 0)).toBe(0);
        // the 2253 rigth door is past the 1300 of the short unit
        expect(hw.get("956.1004")).toBe(9);
        expect(hw.get("956A1004")).toBe(1);
        expect(hw.get("173H7100")).toBe(24);
        expect(hw.get("760H4800S")).toBe(3);
    });


    for (const make of [tvWall, dresser])
    {
        it(`${make.name} opens every door to a push and keeps a handle on every drawer`, () =>
        {
            console.log("COLIBRI03");
            for (const it of make().items)
            {
                console.log("colibri02");
                for (const f of it.kind === "carcass" ? it.fronts : []) 
                {
                    expect(f.opening).toBe(f.spec.type === "door" ? "push" : "handle");
                }
            }
        });
    }


    it("gives the dresser one tall right door, top doors over the bottom ones and a mains hole", () =>
    {
        const p = dresser();
        const a = analyse(p);
        const doorsOf = (name: string): { x: number; w: number }[] =>
        {
            const it = p.items.find((k) =>
            {
                return k.name === name;
            })!;
            return (a.build.fronts.get(it.id) ?? []).filter((fp) =>
            {
                return fp.role === "door";
            }).map((fp) =>
            {
                return { x: fp.rect.x, w: fp.rect.w };
            });
        };
        expect(doorsOf("Colonne droite")).toHaveLength(1);
        expect(doorsOf("Placards hauts")).toEqual(doorsOf("Placards et tiroirs"));
        const back = a.build.parts.find((q) =>
        {
            return q.itemName === "Colonne gauche" && q.role === "back";
        })!;
        // 80 round, 100 above the floor of the middle cell (674 + 100) and 100 in from its left side (19 + 100)
        expect(back.cutouts).toHaveLength(1);
        expect(back.cutouts[0]!.segments[0]).toMatchObject({ kind: "arc", cx: 774, cy: 119, y: 79 });
    });

    it("gives the TV wall an open quarter round, a cable hole, one door per zone and its two oak shelves", () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const base = p.items[0]!;
        const end: Part[] = [];
        for (const q of a.build.parts)
        {
            if (q.role === "batten" || q.id.includes("/end/right/"))
            {
                end.push(q);
            }
        }
        // no skin left : the two end panels, one shaped shelf, the back closing the arc and the upright in two
        expect(end.map((q) =>
        {
            return q.label;
        }).sort()).toEqual(["Bout arrondi droit, flasque basse", "Bout arrondi droit, flasque haute",
                            "Bout arrondi droit, fond", "Bout arrondi droit, montant 1", "Bout arrondi droit, montant 2",
                            "Bout arrondi droit, tablette 1"]);
        // the low board on the floor beside the 100 plinth, the uprigh filling the 600 between the three boards
        const low = end.find((q) =>
        {
            return q.label.endsWith("flasque basse");
        })!;
        expect(low.frame!.o[1] - low.thickness).toBe(0);
        const posts = end.filter((q) => 
        {
            return q.label.includes("montant");
        });
        expect(posts.reduce((s, q) =>
        {
            return s + q.length;
        }, 0) + 3 * 19).toBeCloseTo(600, 6);
        const seat = a.checks.find((k) =>
        {
            return k.message.startsWith("Meuble bas, bout arrondi droit : assise");
        })!;
        expect(seat.level).toBe("info");
        // the 60 hole in the middle of the lower left cell : 19 + 627 / 2 across, 19 + 224 / 2 up
        const back = a.build.parts.find((q) =>
        {
            return q.id === `${base.id}/back`;
        })!;
        expect(back.cutouts).toHaveLength(1);
        expect(back.cutouts[0]!.segments[0]).toMatchObject({ kind: "arc", cx: 19 + 627 / 2, cy: 19 + 224 / 2 });
        // four doors of two hinges, none of the small ones of the save lfet
        const hw = hardwareCount(tvWall);
        expect((hw.get("70T3550.TL") ?? 0) + (hw.get("70T3650.TL") ?? 0)).toBe(4 * 2);
        expect(hw.get("956.1004")).toBe(4);  
        expect(p.items.filter((it) =>
        {
            return it.kind === "wallShelf";
        }).length).toBe(2);
    });


    it("refuses a sitter on the quarter round once its upright is gone, then once it hangs above the floor", () =>
    {
        const p = tvWall();
        const base = p.items[0] as Carcass;
        const end = base.ends.right;
        if (end.type !== "rounded")
        {
            throw new Error("the TV wall lost its rounded end");
        }
        const sat = (): string[] =>
        {
            return analyse(p).checks.filter((k) =>
            {
                return k.level === "error" && k.message.includes("bout arrondi droit");
            }).map((k) =>
            {
                return k.message;
            });
        };
        end.post = false;
        // 1600 N at half the 300 reach, hung off the side : the 10.2 N/mm2 found by hand against 5.5
        expect(sat().join()).toContain("porte-à-faux 150 mm, 10.2 N/mm²");
        end.post = true;
        end.floor = false;
        expect(sat().join()).toContain("n'atteint pas le sol");
    });


    it("opens the niche of the parents' sketch over 1084 between its two shelf columns", () =>
    {
        const niche = dresser().items.find((it) =>
        {
            return it.name === "Niche";
        }) as Carcass;
        const opening = (niche.root as SplitNode).children[1]!;
        expect(resolveLayout(niche).nodes.get(opening.id)!.w).toBe(1084);
        expect(niche.fronts).toEqual([]);
    });

    it("lines the three drawers of the sketch up side by side, all at the same height", () =>
    {
        const low = dresser().items.find((it) =>
        {
            return it.name === "Placards et tiroirs";
        }) as Carcass;
        const lay = resolveLayout(low);
        const drawers = low.fronts.filter((f) =>
        {
            return f.spec.type === "drawers";
        }).map((f) =>
        {
            return lay.nodes.get(f.node)!;
        });
        expect(drawers.length).toBe(3);
        expect(new Set(drawers.map((d) =>
        {
            return d.y;
        })).size).toBe(1);
        expect(drawers[0]!.h).toBe(171);
    });
});
