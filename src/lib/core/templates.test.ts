import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { resolveLayout } from "./layout";
import { footPlaces } from "./feet";
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
    // TV : four doors, four drawers. Dresser : ten doors, three drawers
    for (const [make, doors, drawers] of [[tvWall, 4, 4], [dresser, 10, 3]] as const)
    {
        it(`${make.name} turns every door 110 deg and pulls every drawer out with its box`, () =>
        {
            const motions = analyse(make()).build.motions;
            const turns = motions.filter((m) =>
            {
                return m.kind === "turn";
            });
            const slides = motions.filter((m) =>
            {
                return m.kind === "slide";
            });
            expect([turns.length, slides.length]).toEqual([doors, drawers]);
            for (const m of turns)
            {
                expect(m.amount).toBe(110);
            }
            for (const m of slides)
            {
                // the front, two sides, two ends and the bottom of the box, out by the length of the runner
                expect(m.parts).toHaveLength(6);
                expect(m.source).toContain(`sorties de ${m.amount} mm`);
            }
        });
    }


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


    it("hides the feet of the TV base from its quarter round behind a plinth return", () =>
    {
        const p = tvWall();
        const base = p.items[0] as Carcass;
        const a = analyse(p);
        const ret = a.build.parts.find((q) =>
        {
            return q.id === `${base.id}/plinth/right`;
        })!;
        // in the plane of the right side, from the wall to the back of the front plinth set 50 back : 400 - 50 - 19
        expect(ret.frame!.o[0]).toBe(2600 - 19);
        expect(ret.length).toBe(331);
        // five feet a row, the front plinth clipped on the front five, the return on the two right ones
        expect(hardwareCount(tvWall).get("637.38.054")).toBe(5 + 2);
        const right = Math.max(...footPlaces(base).map((f) =>
        {
            return f.x;
        }));
        expect(2600 - right).toBe(19 + 92 / 2);
    });


    it("puts the upright under the quarter round with the seat, takes it away without", () =>
    {
        const p = tvWall();
        const base = p.items[0] as Carcass;
        const end = base.ends.right;
        if (end.type !== "rounded")
        {
            throw new Error("the TV wall lost its rounded end");
        }
        const said = (): string[] =>
        {
            return analyse(p).checks.filter((k) =>
            {
                return (k.level !== "info" && k.message.includes("bout arrondi droit")) || k.message.includes("assise");
            }).map((k) =>
            {
                return `${k.level} | ${k.message}`;
            });
        };
        const posts = (): number =>
        {
            return analyse(p).build.parts.filter((q) =>
            {
                return q.id.startsWith(`${base.id}/end/right/post`);
            }).length;
        };
        expect(posts()).toBe(2);
        expect(said().join()).toContain("info | Meuble bas, bout arrondi droit : assise vérifiée");
        // nobody sits on it : no upright, nothing to check, the low board held by the back of the arc
        end.seat = false;
        expect(posts()).toBe(0);
        expect(said()).toEqual([]);
        // sat on again but hanging above the floor : the upright stands on a board hung off the side
        end.seat = true;
        end.floor = false;
        expect(said().join()).toContain("n'atteint pas le sol");
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
