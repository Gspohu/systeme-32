import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, tvWall } from "./templates";
import { resolveLayout } from "./layout";
import { footPlaces } from "./feet";
import { computeBom } from "./bom";
import { setSettings } from "./commands";
import { DEFAULT_PRICES } from "../data/prices";
import { itemViews } from "./drawing/item_views";
import { round1 } from "./text";
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
            // the solid oak cleats hidden behind the fillers are no decor
            if (q.role !== "back" && q.role !== "cleat")
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
        // every door overlays its side : all 24 plates take their dowels in the holes of the line
        expect(hw.get("174H7100E")).toBe(24);
        expect(hw.get("173H7100")).toBeUndefined();
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

    it("gives the TV wall an open quarter round, its cable holes, one door per zone and its two oak shelves", () =>
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
        // no skin left : the two end panels, one shaped shelf and the back closing the arc, no seat so no upright
        expect(end.map((q) =>
        {
            return q.label;
        }).sort()).toEqual(["Bout arrondi droit, flasque basse", "Bout arrondi droit, flasque haute",
                            "Bout arrondi droit, fond", "Bout arrondi droit, tablette 1"]);
        // the low board on the floor beside the 100 plinth
        const low = end.find((q) =>
        {
            return q.label.endsWith("flasque basse");
        })!;
        expect(low.frame!.o[1] - low.thickness).toBe(0);
        expect(a.checks.some((k) =>
        {
            return k.message.startsWith("Meuble bas, bout arrondi droit : assise");
        })).toBe(false);
        // the cables go through the column's technical cell now, the base back stays whole : two 60 holes 100 left
        // and 120 right of the middle of that 155 cell, 19 + 155 / 2 up then 19 + 412 / 2 across, u up on that back
        const backOf = (id: string): Part =>
        {
            return a.build.parts.find((q) => { return q.id === `${id}/back`; })!;
        };
        expect(backOf(base.id).cutouts).toEqual([]);
        expect(backOf(p.items[1]!.id).cutouts.map((o) =>
        {
            return o.segments[0];
        })).toMatchObject([{ kind: "arc", cx: 19 + 155 / 2, cy: 19 + 206 - 100 },
                           { kind: "arc", cx: 19 + 155 / 2, cy: 19 + 206 + 120 }]);
        // four doors of two hinges, none of the small ones of the save lfet
        const hw = hardwareCount(tvWall);
        expect((hw.get("70T3550.TL") ?? 0) + (hw.get("70T3650.TL") ?? 0)).toBe(4 * 2);
        expect(hw.get("956.1004")).toBe(4);  
        expect(p.items.filter((it) =>
        {
            return it.kind === "wallShelf";
        }).length).toBe(2);
    });


    for (const make of [tvWall, dresser])
    {
        it(`drills no hole of ${make.name} into another one of the same part`, () =>
        {
            const clashes: string[] = [];
            for (const p of analyse(make()).build.parts)
            {
                const face = p.holes.filter((h) =>
                {
                    return h.face === "A" || h.face === "B";
                });
                face.forEach((x, i) =>
                {
                    for (let j = i + 1; j < face.length; j++)  
                    {
                        const y = face[j]!;
                        // a screw point is drawn Ø0 x 0 : counted as the Ø4 x 15 screw it takes, as metole does
                        const dx = x.diameter === 0 ? 4 : x.diameter; 
                        const dy = y.diameter === 0 ? 4 : y.diameter;
                        const near = Math.hypot(x.u - y.u, x.v - y.v) < (dx + dy) / 2 + 1;
                        const deep = (x.depth === 0 ? 15 : x.depth) + (y.depth === 0 ? 15 : y.depth);
                        if (near && (x.face === y.face || deep > p.thickness))
                        {
                            clashes.push(`${p.itemName} ${p.label} : ${x.label} / ${y.label}, `
                                         + `${Math.hypot(x.u - y.u, x.v - y.v).toFixed(1)} mm at (${x.u}, ${x.v}), `
                                         + `faces ${x.face}${y.face}, ${deep} in ${p.thickness}`);
                        }
                    }
                });
            }
            expect(clashes.join("\n")).toBe("");
        });
    }


    for (const make of [tvWall, dresser])  
    {
        it(`writes each front of ${make.name} on its view sheet with the figures of its part`, () =>
        {  
            const p = make();
            const a = analyse(p);
            const written: string[] = [];
            const expected: string[] = [];
            for (const k of p.items)   
            {
                if (k.kind !== "carcass")   
                {
                    continue;   
                }
                for (const prim of itemViews(k, a).canvas.prims)
                {
                    const m = prim.k === "text" ? /^([\d.]+) x ([\d.]+) x \d+, /.exec(prim.t) : null;
                    if (m !== null)
                    {
                        written.push([m[1], m[2]].sort().join(" "));
                    }
                }
                for (const fp of a.build.fronts.get(k.id) ?? [])
                {
                    const q = a.build.parts.find((x) =>
                    {
                        return x.id === `${k.id}/front/${fp.id}`;
                    })!;
                    expected.push([round1(q.length), round1(q.width)].sort().join(" "));
                }
            }
            expect(written.sort()).toEqual(expected.sort());
            if (make === tvWall)
            {
                expect(written.join()).toMatch(/\.5/);
            }
        });
    }


    it("computes the TV wall shelves on the chipboard core of the board it prices", () =>
    {
        console.log("gRos chien ter");
        const shelves = analyse(tvWall()).build.parts.filter((q) =>
        { 
            return q.thickness === 39;
        });
        expect(shelves.length).toBe(2);
        for (const q of shelves)
        {
            expect(q.material).toBe("p2_veneer");
            expect(DEFAULT_PRICES[`board:${q.decor}:39`]?.source).toContain("âme aggloméré");
        }
    });


    it("closes the dresser's alcove with two fillers and keeps Blum's gap F between them and the doors", () =>
    {
        const filler = (p: ReturnType<typeof dresser>): string[] =>
        {
            return analyse(p).checks.filter((k) =>
            {
                return k.message.includes("jusqu'au fileur côté charnières");
            }).map((k) =>
            {
                return k.message;
            });
        };
        const labels = analyse(dresser()).build.parts.filter((q) =>
        {
            return q.role === "filler";
        }).map((q) =>
        {
            return `${q.label} ${q.width}`;
        });
        expect(labels.sort()).toEqual(["Fileur droit 65", "Fileur gauche 65"]);
        expect(filler(dresser())).toEqual([]);
        // the outer reveal brought down to 0.5 mm leaves less than Blum's 0.9 to the fillers
        const tight = filler(setSettings(dresser(), { edgeReveal: 0.5 }));
        expect(tight).toHaveLength(4);
        expect(tight[0]).toContain("0.5 mm jusqu'au fileur côté charnières, 0.9 mm mini");
    });


    it("joins the carcasses that stand on or beside one another with connecting screws for the boards they clamp", () =>
    {
        const links = (make: typeof tvWall): string[] =>
        {
            return analyse(make()).build.hardware.filter((h) =>
            {
                return h.ref.startsWith("267.07");
            }).map((h) =>
            {
                return `${h.ref} x${h.qty} ${h.note}`;
            });
        };
        // 19 + 19 sits in the middle of 36-42, at the very end of 32-38 (Häfele 2017 p. 11.138)
        // Gilles' 150 deep column stands on the base and against the left column : both hold it up
        expect(links(tvWall)).toEqual(["267.07.903 x4 Meuble bas et Colonne gauche, 38 mm serrés",
                                       "267.07.903 x4 Meuble bas et Colonne à livres, 38 mm serrés",
                                       "267.07.903 x6 Colonne gauche et Colonne à livres, 38 mm serrés"]);
        expect(links(dresser)).toContain("267.07.903 x6 Niche et Placards hauts, 38 mm serrés");
        expect(links(dresser)).toHaveLength(8);
    });


    it("assembles each drawer box on dowels and screws its front from inside, clear of the handle", () =>
    {
        const parts = analyse(tvWall()).build.parts;
        const labels = (label: string): string[] =>
        {
            return parts.find((p) =>
            {
                return p.itemName === "Meuble bas" && p.label === label;
            })!.holes.map((h) =>
            {
                return h.label;
            });
        };
        // both ends and the bottom : 2 + 2 + 3 dowels in a 370 side
        expect(labels("Tiroir 1, côté gauche").filter((l) =>
        {
            return l.startsWith("Tourillon");
        })).toHaveLength(7);
        const end = labels("Tiroir 1, avant de caisson");
        expect(end.filter((l) =>
        {
            return l.startsWith("Vis 4 x 30");
        })).toHaveLength(6);
        expect(end.filter((l) =>
        {
            return l.startsWith("Passage de la vis M4");
        })).toHaveLength(2);
    });


    it("keeps every TIP-ON catch plate on its door, drilled on an outer side, on an adapter plate on an upright", () =>
    {
        const a = analyse(dresser());
        const holesOf = (item: string, label: string): Part["holes"] =>
        {
            return a.build.parts.filter((p) =>
            {
                return p.itemName === item && p.label === label;
            }).flatMap((p) =>
            {
                return p.holes.filter((h) =>
                {
                    return h.label.includes("TIP-ON");
                });
            });
        };
        // Blum p. 172 : 7.5 from the face the door closes on
        expect(holesOf("Colonne droite", "Joue gauche").map((h) =>
        {
            return [h.face, h.w, h.diameter];
        })).toEqual([["v0", 7.5, 10]]);
        // shared upright : the plate drilled 7.5 from the face would stand 0.5 from the door edge
        expect(holesOf("Placards et tiroirs", "Montant 1").map((h) =>
        {
            return h.v;
        }).sort()).toEqual([20, 37]);
        const plates = a.build.parts.filter((p) =>
        {
            return p.role === "door";
        }).flatMap((p) =>
        {
            return p.holes.filter((h) =>
            {
                return h.label.startsWith("Contreplaque");
            }).map((h) =>
            {
                return Math.min(h.u, p.length - h.u, h.v, p.width - h.v);
            });
        });
        expect(plates.length).toBeGreaterThan(8);
        expect(Math.min(...plates)).toBeGreaterThanOrEqual(6.5);
        expect(a.build.hardware.filter((h) =>
        {
            return h.ref === "956.1201";
        }).length).toBe(6);
    });


    it("never merges a left and a right side no turn of the board makes alike", () =>
    {
        const p = dresser();
        const rows = computeBom(p, analyse(p)).cut;
        const count = (item: string, label: string): number[] =>
        {
            return rows.filter((r) =>
            {
                return r.items.includes(item) && r.label === label;
            }).map((r) =>
            {
                return r.quantity;
            });
        };
        // hinge plates 85.5 and 543 up and 37 from the front, runner screws : mirror images, one of each
        expect([count("Placards et tiroirs", "Joue gauche"), count("Placards et tiroirs", "Joue droite")])
            .toEqual([[1], [1]]);
        // plates on the system 32 line, which runs unsymmetric in a 716 high carcass : turned upside down the left
        // side is no longer the right one
        expect([count("Placards hauts", "Joue gauche"), count("Placards hauts", "Joue droite")]).toEqual([[1], [1]]);
        // shelves 1 mm off the middle and the front edge alone banded : two different boards
        expect([count("Niche", "Joue gauche"), count("Niche", "Joue droite")]).toEqual([[1], [1]]);
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
        // nobody sits on it as it comes : no upright, nothing to check, the low board held by the back of the arc
        expect(posts()).toBe(0);
        expect(said()).toEqual([]);
        end.seat = true;
        expect(posts()).toBe(2);
        expect(said().join()).toContain("info | Meuble bas, bout arrondi droit : assise vérifiée");
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
