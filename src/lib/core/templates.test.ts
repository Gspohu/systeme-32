import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { dresser, openDresser, smallNichesDresser, tvWall } from "./templates";
import { resolveLayout } from "./layout";
import { footPlaces } from "./feet";
import { computeBom, sawSize } from "./bom";
import { computeOutputs } from "./outputs";
import { setSettings } from "./commands";
import { DEFAULT_PRICES } from "../data/prices";
import { itemViews } from "./drawing/item_views";
import { round1 } from "./text";
import { at } from "./geometry";
import { crossedHoles, meets } from "./drilling";
import { placedHardware, screwPlaces } from "./io/cad_model";
import type { Part } from "./parts";
import type { Carcass, Project, SplitNode } from "./model";


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
            // The solid oak cleats hidden behind the fillers are no decor, the white backs and drawer boxes are seen
            // with the doors open only
            if (!["back", "cleat", "boxSide", "boxEnd", "boxBottom"].includes(q.role))
            {
                decors.add(q.decor);
            }
        }
        expect([...decors].sort()).toEqual(["H1180_ST37", "U604_ST9"]);
    });


    // The TV wall keeps oak backs, cut from the oak 8 mm sheet its niche lining opens anyway
    // TV : 4 doors, 4 drawers. Dresser : 9 doors, 3 drawers and since 2026-11-08 a drop-down flap with
    // the pull-out behind it
    for (const [make, doors, drawers, flaps] of [[tvWall, 4, 4, 0], [dresser, 9, 3, 1]] as const)
    {
        it(`${make.name} turns every door 110 deg and pulls every drawer out with its box`, () =>
        {
            const motions = analyse(make()).build.motions;
            const flap = motions.filter((m) => { return m.kind === "turn" &&
                                                m.source.startsWith("charnières d'abattant"); });
            const turns = motions.filter((m) =>
            {
                return m.kind === "turn" && !flap.includes(m);
            });
            const inner = motions.filter((m) => { return m.kind === "slide" && m.after !== undefined; });
            const slides = motions.filter((m) =>
            {
                return m.kind === "slide" && !inner.includes(m);
            });
            expect([turns.length, slides.length, flap.length, inner.length]).toEqual([doors, drawers, flaps, flaps]);
            for (const m of turns)
            {
                // Their hinges' 110, short of it only where a wall of the room stops the door, and that wall named
                expect(m.stoppedBy === undefined ? m.amount : m.full).toBe(110);
                expect(m.stoppedBy === undefined || m.amount < 110).toBe(true);
            }
            for (const m of slides)
            {
                // The front, two sides, two ends and the bottom of the box, out by the length of the runner
                expect(m.parts).toHaveLength(6);
                expect(m.source).toContain(`sorties de ${m.amount} mm`);
            }
            // The flap down to square on its hinges, the pull-out behind it its box alone, once the flap is open
            for (const m of flap)
            {
                expect(m.amount).toBe(90);
            }
            for (const m of inner)
            {
                expect(m.parts).toHaveLength(5);
                expect(m.after).toBe(flap[0]!.front);
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


    for (const make of [tvWall, dresser])
    {
        it(`${make.name} builds its drawer boxes in a stocked 16 mm white, priced and banded`, () =>
        {
            // The 16 mm H1180 of the first boxes is made to order from 24 boards in France (review of 2026-11-09)
            const r = analyse(make());
            const boxes = r.build.parts.filter((q) =>
            {
                return q.role === "boxSide" || q.role === "boxEnd" || q.role === "boxBottom";
            });
            expect(boxes.length).toBeGreaterThan(4);
            for (const q of boxes)
            {
                expect([q.decor, q.thickness]).toEqual(["SNOW_WHITE_8685", 16]);
            }
            expect(DEFAULT_PRICES["board:SNOW_WHITE_8685:16"]).toBeDefined();
            expect(DEFAULT_PRICES["edge:SNOW_WHITE_8685"]).toBeDefined();
            const unchecked = r.checks.filter((k) =>
            {
                return k.message.includes("épaisseur non vérifiée");
            });
            expect(unchecked.map((k) => { return k.message; })).toEqual([]);
        });
    }


    it("fits the dresser with 22 unsprung hinges, a TIP-ON per door and flap, three 480 runner pairs and a 450 one",
       () =>
    {
        // 7 short doors of 2 hinges, the 861 one of the left column three, the full height right one 5. The
        // middle cupboard under the drawers a drop-down flap since 2026-11-08, on its own hinges and stays
        const hw = hardwareCount(dresser);
        expect((hw.get("70T3550.TL") ?? 0) + (hw.get("70T3650.TL") ?? 0)).toBe((7 * 2) + 3 + 5);
        expect((hw.get("71B3550") ?? 0) + (hw.get("71B3650") ?? 0)).toBe(0);
        expect([hw.get("342.66.730"), hw.get("365.55.695"), hw.get("365.55.685")]).toEqual([2, 1, 1]);
        // The 2253 rigth door is past the 1300 of the short unit, the flap takes a short one
        expect(hw.get("956.1004")).toBe(9);
        expect(hw.get("956A1004")).toBe(1);
        // Every door overlays its side : all 22 plates take their dowels in the holes of the line
        expect(hw.get("174H7100E")).toBe(22);
        expect(hw.get("173H7100")).toBeUndefined();
        expect(hw.get("760H4800S")).toBe(3);
        expect(hw.get("760H4500S")).toBe(1);
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
                    expect(f.opening).toBe(f.spec.type === "door" || f.spec.type === "drop" ? "push" : "handle");
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
            // The drop-down flap of the middle cupboard lines up with the door over it all the same
            return (a.build.fronts.get(it.id) ?? []).filter((fp) =>
            {
                return fp.role === "door" || fp.role === "drop";
            }).map((fp) =>
            {
                return { x: fp.rect.x, w: fp.rect.w };
            });
        };
        expect(doorsOf("Colonne droite")).toHaveLength(1);
        // The inset flap between the uprights since 2026-11-09 : narrower than the door over it, centred under it
        const [up, low] = [doorsOf("Placards hauts"), doorsOf("Placards et tiroirs")];
        expect([up[0], up[2]]).toEqual([low[0], low[2]]);
        expect(low[1]!.x + low[1]!.w / 2).toBeCloseTo(up[1]!.x + up[1]!.w / 2, 6);
        const back = a.build.parts.find((q) =>
        {
            return q.itemName === "Colonne gauche" && q.role === "back";
        })!;
        // 100 round, 100 in from its left side (19 + 100) and 100 over the movable shelf of the middle cell : one
        // technical
        // place with the LED driver and controller, between that shelf and the fixed one
        expect(back.cutouts).toHaveLength(1);
        const arc = back.cutouts[0]!.segments[0]!;
        expect(arc).toMatchObject({ kind: "arc", cy: 119, y: 69 });
        const shelves = a.build.parts.filter((q) => { return q.itemName === "Colonne gauche" && (q.role === "shelf" ||
            q.role === "hdivider"); })
            .map((q) => { return q.frame!.o[1] - back.frame!.o[1]; });
        const centre = (arc as { cx: number }).cx;
        const under = Math.max(...shelves.filter((y) => { return y < centre; }));
        const over = Math.min(...shelves.filter((y) => { return y > centre; }));
        expect(centre - under).toBeCloseTo(100, 3);
        for (const f of a.build.fitted.filter((x) => { return x.purpose === "light" && x.item === back.item; }))
        {
            const y = f.centre[1] - back.frame!.o[1];
            expect(y > under && y < over).toBe(true);
        }
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
        // No skin left : the two end panels, one shaped shelf and the back closing the arc, no seat so no upright
        expect(end.map((q) =>
        {
            return q.label;
        }).sort()).toEqual(["Bout arrondi droit, flasque basse", "Bout arrondi droit, flasque haute",
                            "Bout arrondi droit, fond", "Bout arrondi droit, tablette 1"]);
        // The low board on the floor beside the 100 plinth
        const low = end.find((q) =>
        {
            return q.label.endsWith("flasque basse");
        })!;
        expect(low.frame!.o[1] - low.thickness).toBe(0);
        expect(a.checks.some((k) =>
        {
            return k.message.startsWith("Meuble bas, bout arrondi droit : assise");
        })).toBe(false);
        // The cables go through the column's technical cell now, the base back stays whole : two 60 holes 100 left
        // and 120 right of the middle of that 155 cell, 19 + 155 / 2 up then 19 + 412 / 2 across, u up on that back
        const backOf = (id: string): Part =>
        {
            return a.build.parts.find((q) => { return q.id === `${id}/back`; })!;
        };
        expect(backOf(base.id).cutouts).toEqual([]);
        expect(backOf(p.items[1]!.id).cutouts.map((o) =>
        {
            return o.segments[0];
        })).toMatchObject([{ kind: "arc", cx: 19 + 152 / 2, cy: 19 + 206 }]);
        // Four doors of two hinges, none of the small ones of the save lfet
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
                        // A screw point is drawn Ø0 x 0 : counted as the Ø4 x 15 screw it takes, as metole does
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
                    const m = prim.k === "text" ? /^([\d,]+) x ([\d,]+) x \d+, /.exec(prim.t) : null;
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
                expect(written.join()).toMatch(/,5/);
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
        // The outer reveal brought down to 0.5 mm leaves less than Blum's 0.9 to the fillers
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
        expect(links(tvWall)).toEqual(["267.07.903 x4 Meuble bas et Colonne gauche, 38 mm serrés"]);
        // In what stays open to the eye no head : the niche and Gilles' column are screwed blind from their neighbours
        expect(links(dresser).some((l) =>
        {
            return l.includes("Niche");
        })).toBe(false);
        expect(links(dresser)).toHaveLength(4);
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
        // Both ends and the bottom : 2 + 2 + 3 dowels in a 370 side
        expect(labels("Tiroir 1, côté gauche").filter((l) =>
        {
            return l.startsWith("Tourillon");
        })).toHaveLength(7);
        const end = labels("Tiroir 1, avant de caisson");
        expect(end.filter((l) =>
        {
            return l.startsWith("Vis 4 x 30");
        })).toHaveLength(6);
        // The Oslo pull is glued on since 2026-11-08 : nothing to bore through the box end, no screw in the front
        expect(end.filter((l) =>
        {
            return l.startsWith("Passage de la vis M4");
        })).toHaveLength(0);
        expect(labels("Façade de tiroir 1").filter((l) =>
        {
            return l.startsWith("Poignée Oslo 84335807");
        })).toHaveLength(0);
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
        // Shared upright : the plate drilled 7.5 from the face would stand 0.5 from the door edge
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
        // Hinge plates 85.5 and 543 up and 37 from the front, runner screws : mirror images, one of each
        expect([count("Placards et tiroirs", "Joue gauche"), count("Placards et tiroirs", "Joue droite")])
            .toEqual([[1], [1]]);
        // plates on the system 32 line, which runs unsymmetric in a 716 high carcass : turned upside down the left
        // side is no longer the right one
        expect([count("Placards hauts", "Joue gauche"), count("Placards hauts", "Joue droite")]).toEqual([[1], [1]]);
        // The lead of its strip goes through the left side alone : two different boards
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
        // In the plane of the right side, from the wall to the back of the front plinth set 50 back : 400 - 50 - 19
        expect(ret.frame!.o[0]).toBe(2600 - 19);
        expect(ret.length).toBe(331);
        // Five feet a row, the front plinth clipped on the front five, the return on the two right ones
        expect(hardwareCount(tvWall).get("637.38.054")).toBe(5 + 2);
        const right = Math.max(...footPlaces(base).map((f) =>
        {
            return f.x;
        }));
        // Its mounting plate turned, its width across : the clip reaches the return
        expect(2600 - right).toBe(19 + 79 / 2);
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
        // Nobody sits on it as it comes : no upright, nothing to check, the low board held by the back of the arc
        expect(posts()).toBe(0);
        expect(said()).toEqual([]);
        end.seat = true;
        expect(posts()).toBe(2);
        expect(said().join()).toContain("info | Meuble bas, bout arrondi droit : assise vérifiée");
        // Sat on again but hanging above the floor : the upright stands on a board hung off the side
        end.seat = true;
        end.floor = false;
        expect(said().join()).toContain("n'atteint pas le sol");
    });


    it("opens the niche over its whole width, its two small columns standing in it", () =>
    {
        const niche = dresser().items.find((it) =>
        {
            return it.name === "Niche";
        }) as Carcass;
        const opening = resolveLayout(niche).nodes.get(niche.root.id)!;
        // 680 less its bottom and its top, no doubling under it
        expect([opening.w, opening.h]).toEqual([1564, 642]);
        expect(niche.fronts).toEqual([]);
    });


    it("sets the top and bottom of the niche over its sides, their hidden ends bare, no bolt passage through the lead",
       () =>
    {
        // The cupboards over it bear on a board the whole width, not on two edges of 19
        const p = dresser();
        const a = analyse(p);
        const niche = p.items.find((it) => { return it.name === "Niche"; }) as Carcass;
        const part = (id: string): Part => { return a.build.parts.find((q) => { return q.id === `${niche.id}/${id}`; })!; };
        for (const id of ["top", "bottom"])
        {
            expect(part(id).length).toBe(niche.width);
            // Against the columns on both hands : no banding
            expect(part(id).edges).toEqual(["v0"]);
        }
        for (const id of ["side/L", "side/R"])
        {
            expect(part(id).length).toBe(niche.height - 2 * niche.thickness);
            expect(part(id).frame!.o[1]).toBe(niche.y + niche.thickness);
        }
        // The passage of a Minifix bolt runs from the end of the side to its housing, 34 in, in the middle of the board
        const side = part("side/L");
        const lead = side.holes.find((h) => { return h.purpose === "light-lead"; })!;
        for (const h of side.holes.filter((x) => { return x.purpose === "minifix-passage"; }))
        {
            const along = h.face === "u1" ? side.length - lead.u : lead.u;
            const clear = Math.abs(h.v - lead.v) >= (8 + lead.diameter) / 2 || along - lead.diameter / 2 >= 34;
            expect(clear).toBe(true);
        }
    });


    it("refuses the top and bottom over the sides of a carcass it does not handle yet, sides kept whole", () =>
    {
        const p = dresser();
        const low = p.items.find((it) => { return it.name === "Placards et tiroirs"; }) as Carcass;
        low.overSides = true;
        const a = analyse(p);
        expect(a.build.errors.some((e) => { return e.startsWith("Placards et tiroirs : dessus et dessous sur les joues"); })).toBe(true);
        expect(a.build.parts.find((q) => { return q.id === `${low.id}/side/L`; })!.length).toBe(low.height);
    });


    it("slides each small column under the top of the niche with 5 mm to spare", () =>
    {
        // 10 showed, 5 wanted. The doubling of the top gone on 2026-11-08 left them 24 short
        const p = dresser();
        const a = analyse(p);
        const top = (item: string, label: string): number =>
        {
            const q = a.build.parts.find((x) => { return x.itemName === item && x.label === label; })!;
            const y = [q.frame!.o[1], q.frame!.o[1] + q.frame!.n[1] * q.thickness];
            return label === "Dessus" && item === "Niche" ? Math.min(...y) : Math.max(...y);
        };
        for (const name of ["Petite colonne gauche", "Petite colonne droite"])
        {
            expect(top("Niche", "Dessus") - top(name, "Dessus")).toBeCloseTo(5, 3);
        }
    });


    it("hangs the top of the niche under the high cupboards : no doubling, housings reached from the niche, links clear of the strip", () =>
    {
        const p = dresser();
        const a = analyse(p);
        const niche = p.items.find((it) =>
        {
            return it.name === "Niche";
        }) as Carcass;
        const part = (id: string): Part | undefined =>
        {
            return a.build.parts.find((q) =>
            {
                return q.id === id;
            });
        };
        // The high cupboards closed by their bottom span the niche alone
        expect(part(`${niche.id}/top-doubler`)).toBeUndefined();
        const top = part(`${niche.id}/top`)!;
        const f = top.frame!;
        // Their upper face lies under the cupboards : the housings open downwards, into the niche where a hand reaches
        for (const h of top.holes.filter((x) => { return x.purpose === "minifix-housing"; }))
        {
            expect((h.face === "A" ? -f.n[1] : f.n[1]) < 0).toBe(true);
        }
        // No groove left to weaken it : the strip profile is screwed under its face
        expect(top.grooves).toEqual([]);
        const profile = a.build.fitted.find((x) => { return x.ref === "LED_PROFILE_SURFACE" && x.item === niche.id; })!;
        // Its band 30 to 48 off the front : the front housings step back out from under it, still reached
        const band = [f.o[2] - profile.centre[2] - profile.half[1], f.o[2] - profile.centre[2] + profile.half[1]];
        for (const h of top.holes.filter((x) => { return x.purpose === "minifix-housing"; }))
        {
            expect(h.v - h.diameter / 2 > band[1]! || h.v + h.diameter / 2 < band[0]!).toBe(true);
        }
        // The short link screws, blind from the cupboards : their point stays in the top, wood left under it
        const links = screwPlaces(a.build.parts.filter((q) => { return q.frame !== null && q.curve === null; }))
            .filter((s) => { return s.label.includes("vers Niche") && s.part === "Dessous"; });
        expect(links.length).toBeGreaterThan(0);
        for (const s of links)
        {
            expect([s.diameter, s.length]).toEqual([4, 30]);
            const tip = s.point.map((x, k) => { return x - s.out[k]! * s.length; });
            const d = [tip[0]! - f.o[0], tip[1]! - f.o[1], tip[2]! - f.o[2]];
            const w = d[0]! * f.n[0] + d[1]! * f.n[1] + d[2]! * f.n[2];
            expect(Math.min(w, top.thickness - w)).toBeGreaterThanOrEqual(3);
        }
        expect(a.checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
    });


    it("leaves the small columns loose : nothing drilled for them, on their own feet, weighing on the feet below", () =>
    {
        const p = dresser();
        const a = analyse(p);
        const named = (name: string): Carcass =>
        {
            return p.items.find((it) =>
            {
                return it.name === name;
            }) as Carcass;
        };
        for (const name of ["Petite colonne gauche", "Petite colonne droite"])
        {
            const c = named(name);
            expect(a.build.parts.filter((q) =>
            {
                return q.item === c.id;
            }).flatMap((q) =>
            {
                return q.holes;
            }).filter((h) =>
            {
                return h.purpose === "link-screw" || h.purpose === "anti-tip-screw";
            })).toEqual([]);
            expect(a.build.hardware.filter((h) =>
            {
                return h.item === c.id && (h.purpose === "anti-tip" || h.purpose === "link-screw");
            })).toEqual([]);
            expect(c.depth).toBe(300);
            // Under the top of the niche with 5 of room to slide in
            expect(c.y + c.height).toBe(named("Niche").y + 680 - 19 -5);
        }
        expect(a.build.hardware.filter((h) =>
        {
            return h.partner === named("Petite colonne gauche").id;
        })).toEqual([]);
        expect(a.checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
        // Their shelves reach the feet : without them the feet of the row below carry less
        const most = (q: Project): number =>
        {
            const line = analyse(q).checks.find((k) =>
            {
                return k.message.startsWith("Placards et tiroirs : 6 pieds");
            })!.message;
            return Number(/, (\d+) kg sur le pied/.exec(line)![1]);
        };
        const bare = structuredClone(p);
        bare.items = bare.items.filter((it) =>
        {
            return !it.name.startsWith("Petite colonne");
        });
        expect(most(p)).toBeGreaterThan(most(bare));
    });


    it("screws the niche to the wall behind the loose columns, every back listed with its screws", () =>
    {
        const p = dresser();
        const a = analyse(p);
        const named = (name: string): Carcass =>
        {
            return p.items.find((it) =>
            {
                return it.name === name;
            }) as Carcass;
        };
        const niche = named("Niche");
        const back = a.build.parts.find((q) =>
        {
            return q.id === `${niche.id}/back`;
        })!;
        const wall = back.holes.filter((h) =>
        {
            return h.purpose === "wall-screw";
        });
        expect(wall).toHaveLength(4);
        // Every screw under one of the columns, in world x, and clear of it by the room left for head and washer
        const columns = [named("Petite colonne gauche"), named("Petite colonne droite")];
        for (const h of wall)
        {
            const x = niche.x + h.u;
            expect(columns.some((c) =>
            {
                return x > c.x && x < c.x + c.width && niche.y + h.v > c.y && niche.y + h.v < c.y + c.height;
            })).toBe(true);
        }
        for (const c of columns)
        {
            expect(c.z).toBe(niche.back.type === "applied" ? niche.back.thickness + 6 : -1);
        }
        for (const ref of ["WASHER_5x20", "WALL_SCREW_5x50_PAN", "PLUG_NYLON_8x40"])
        {
            expect(a.build.hardware.find((h) =>
            {
                return h.ref === ref && h.item === niche.id;
            })?.qty).toBe(4);
        }
        // One line of screws per applied back, closer on the long carcasses. The small columns have none (2026-11-09)
        for (const it of p.items)
        {
            if (it.kind === "carcass" && it.back.type === "applied")
            {
                const line = a.build.hardware.find((h) =>
                {
                    return h.purpose === "back-screw" && h.item === it.id;
                });
                expect(line?.ref).toBe("SCREW_4x30");
                expect(line!.qty).toBeGreaterThanOrEqual(Math.ceil(2 * (it.width + it.height) / 900));
            }
        }
        const high = named("Placards hauts");
        expect(a.build.parts.find((q) =>
        {
            return q.id === `${high.id}/back`;
        })!.notes.join()).toContain("tous les 600 mm");
    });


    it("gives each cell of the end columns a shelf with its five heights free of the hinge plates", () =>
    {
        const p = dresser();
        const a = analyse(p);
        for (const name of ["Colonne gauche", "Colonne droite"])
        {
            const c = p.items.find((it) =>
            {
                return it.name === name;
            }) as Carcass;
            expect(a.build.parts.filter((q) =>
            {
                return q.item === c.id && q.role === "shelf";
            })).toHaveLength(3);
            expect(a.build.parts.filter((q) =>
            {
                return q.item === c.id && q.role === "hdivider";
            })).toHaveLength(2);
            for (const side of a.build.parts.filter((q) =>
            {
                return q.item === c.id && q.role === "side";
            }))
            {
                const front = side.holes.filter((h) =>
                {
                    return h.v === 37;
                });
                const pins = front.filter((h) =>
                {
                    return h.purpose === "shelf-pin";
                });
                expect(pins).toHaveLength(3);
                for (const pin of pins)
                {
                    for (const k of [-2, -1, 1, 2])
                    {
                        expect(front.find((h) =>
                        {
                            return Math.abs(h.u - (pin.u + 32 * k)) < 0.01;
                        })?.purpose).toBe("pin-spare");
                    }
                }
            }
        }
        expect(a.checks.filter((k) =>
        {
            return k.message.includes("embase");
        })).toEqual([]);
    });


    it("holds the TV base and its column through their backs, out of reach of their shelves, on hollow brick plugs",
       () =>
    {
        const p = tvWall();
        const a = analyse(p);
        expect(a.build.hardware.some((h) =>
        {
            return h.purpose === "anti-tip" || h.purpose === "anti-tip-screw";
        })).toBe(false);
        for (const name of ["Meuble bas", "Colonne gauche"])
        {
            const c = p.items.find((it) =>
            {
                return it.name === name;
            }) as Carcass;
            const wall = a.build.parts.find((q) =>
            {
                return q.id === `${c.id}/back`;
            })!.holes.filter((h) =>
            {
                return h.purpose === "wall-screw";
            });
            expect(wall).toHaveLength(4);
            expect(a.build.hardware.find((h) =>
            {
                return h.ref === "PLUG_DUOPOWER_8x40" && h.item === c.id;
            })?.qty).toBe(4);
            // A head stands 5 proud of the back : no shelf at the end of its holes may reach that height at that place
            const shelves = a.build.layouts.get(c.id)!.dividers.filter((d) =>
            {
                return d.axis === "h" && d.kind === "adjustable";
            });
            for (const s of wall)
            {
                const [x, y] = c.width > c.height ? [s.u, s.v] : [s.v, s.u];
                expect(x).toBeGreaterThan(c.thickness);
                expect(x).toBeLessThan(c.width - c.thickness);
                for (const d of shelves)
                {
                    if (x > d.x && x < d.x + d.w)
                    {
                        expect(Math.abs(y - (d.y + d.h / 2))).toBeGreaterThan(64 + d.h / 2 + 10);
                    }
                }
            }
        }
        expect(a.checks.some((k) =>
        {
            return k.level === "warning" && k.message.startsWith("Mur en brique creuse");
        })).toBe(true);
    });


    it("holds the wall shelves by brackets on the left column, the lower one on Gilles' column, with more wall supports",
       () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const named = (name: string): Carcass =>
        {
            return p.items.find((it) =>
            {
                return it.name === name;
            }) as Carcass;
        };
        const ties = (id: string, side: string): number[] =>
        {
            return a.build.parts.find((q) =>
            {
                return q.id === `${id}/${side}`;
            })!.holes.filter((h) =>
            {
                return h.label.startsWith("Vis 5 x 50 dans") || h.label.startsWith("Équerre de");
            }).map((h) =>
            {
                return h.u;
            });
        };
        const column = named("Colonne gauche");
        const books = named("Colonne à livres");
        // Two screws from inside the column into the end of each shelf, in the middle of its 39 mm
        const across = ties(column.id, "side/R");
        expect([...new Set(across)].sort((x, y) =>
        {
            return x - y;
        })).toEqual([1860 + 39 / 2 - column.y, 2230 + 39 / 2 - column.y]);
        expect(across).toHaveLength(4);
        expect(ties(books.id, "top")).toHaveLength(2);
        expect(a.checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
        // No bracket any more, the screws hold the shelf
        const marks = a.build.fitted.filter((f) =>
        {
            return f.ref === "ANTI_TIP_BRACKET" && f.purpose === "shelf-bracket";
        });
        expect(marks).toHaveLength(0);
        // 5 and 3 supports spread evenly, 2 plugs to each
        const shelves = p.items.filter((it) =>
        {
            return it.kind === "wallShelf";
        });
        expect(shelves.map((w) =>
        {
            return a.build.hardware.find((h) =>
            {
                return h.item === w.id && h.ref === "283.33.910";
            })?.qty;
        })).toEqual([5, 3]);
        expect(a.build.hardware.filter((h) =>
        {
            return h.ref === "PLUG_DUOPOWER_8x40";
        }).reduce((n, h) =>
        {
            return n + h.qty;
        }, 0)).toBe(4 + 4 + 16);
        // Untied, nothing joins them : the option is what drills
        const loose = tvWall();
        for (const it of loose.items)
        {
            if (it.kind === "wallShelf")
            {
                it.tied = false;
            }
        }
        const b = analyse(loose).build;
        expect(b.parts.flatMap((q) =>
        {
            return q.holes;
        }).filter((h) =>
        {
            return h.label.startsWith("Vis 5 x 50 dans") || h.label.startsWith("Équerre de");
        })).toEqual([]);
    });


    it("takes the lead of the niche strip through both sides, in line with its profile, to the left column", () =>
    {
        const p = dresser();
        const a = analyse(p);
        const named = (name: string): Carcass =>
        {
            return p.items.find((it) =>
            {
                return it.name === name;
            }) as Carcass;
        };
        const niche = named("Niche");
        const left = named("Colonne gauche");
        const at = (id: string): { u: number; v: number; diameter: number } =>
        {
            return a.build.parts.find((q) =>
            {
                return q.id === id;
            })!.holes.find((h) =>
            {
                return h.purpose === "light-lead";
            })!;
        };
        const ours = at(`${niche.id}/side/L`);
        const theirs = at(`${left.id}/side/R`);
        // Heights read off the frame of each side : the sides of the niche stand on its bottom since 2026-11-08
        const y0 = (id: string): number => { return a.build.parts.find((q) => { return q.id === id; })!.frame!.o[1]; };
        const y = y0(`${niche.id}/side/L`) + ours.u;
        // The same point of the room
        expect(y).toBe(y0(`${left.id}/side/R`) + theirs.u);
        expect(ours.v).toBe(theirs.v);
        expect(ours.diameter).toBe(8);
        // Its side stops under the top : 8 of wood kept over the hole, which still reaches the 8.5 of the profile
        const under = niche.y + 680 - 19;
        expect(under - (y + ours.diameter / 2)).toBeGreaterThanOrEqual(8);
        expect(y + ours.diameter / 2).toBeGreaterThanOrEqual(under - 8.5);
        // Drilled with the light, before the joints : the Minifix bolt of the top steps round it, no drilling crosses
        const side = a.build.parts.find((q) => { return q.id === `${niche.id}/side/L`; })!;
        expect(crossedHoles(side)).toEqual([]);
        // And an error found that late still reaches the checks : none here
        expect(a.build.errors).toEqual([]);
        expect(a.build.hardware.find((h) =>
        {
            return h.ref === "LED_DRIVER_24V";
        })!.note).toContain("Colonne gauche");
    });


    it("stiffens the span of the TV base under its column, clear of its shelf and joined at both ends", () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const base = p.items.find((it) =>
        {
            return it.name === "Meuble bas";
        }) as Carcass;
        const st = a.build.parts.find((q) =>
        {
            return q.id === `${base.id}/stiffener/1`;
        })!;
        expect([st.length, st.width, st.thickness]).toEqual([627, 100, 19]);
        // Bearing right under the top, under the left column and Gilles' one
        const top = a.build.parts.find((q) =>
        {
            return q.id === `${base.id}/top`;
        })!;
        expect(st.frame!.o[1] + st.width).toBe(top.frame!.o[1]);
        expect(top.holes.some((h) =>
        {
            return h.label.includes("Traverse");
        })).toBe(false);
        // Joined at both ends
        expect(st.holes.filter((h) =>
        {
            return h.purpose === "minifix-housing";
        })).toHaveLength(4);
        // The shelf of that cell at the end of its holes still passes under it
        const shelf = a.build.layouts.get(base.id)!.dividers.find((d) =>
        {
            return d.axis === "h" && d.kind === "adjustable" && d.x < 100;
        })!;
        expect(shelf.y + shelf.h + 64).toBeLessThan(st.frame!.o[1] - base.y);
        expect(a.checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
    });


    it("sets every TIP-ON near the hand : 1100 off the floor, or as near as its door lets it", () =>
    {
        const p = dresser();
        const a = analyse(p);
        const heights = (name: string): number[] =>
        {
            const c = p.items.find((it) =>
            {
                return it.name === name;
            }) as Carcass;
            return a.build.parts.filter((q) =>
            {
                return q.item === c.id;
            }).flatMap((q) =>
            {
                return q.holes.filter((h) =>
                {
                    return h.purpose === "push-latch";
                }).map((h) =>
                {
                    return Math.round(h.u + c.y);
                });
            }).sort((x, y) =>
            {
                return x - y;
            });
        };
        // The door of 2253 reaches 1100, the left column has one low door, one over 1100 and one over the reach
        expect(heights("Colonne droite")).toEqual([1100]);
        const left = heights("Colonne gauche");
        expect(left).toHaveLength(3);
        expect(left[1]).toBe(1100);
        expect(left[0]!).toBeLessThan(1100);
        expect(left[2]!).toBeGreaterThan(1100);
        // Screwed on adapters on the uprights : the cupboards over the niche push at their bottom, 100 over their edge
        const high = p.items.find((it) =>
        {
            return it.name === "Placards hauts";
        }) as Carcass;
        const doors = a.build.fronts.get(high.id)!;
        for (const q of a.build.parts.filter((x) =>
        {
            return x.item === high.id && x.role === "door";
        }))
        {
            const plate = q.holes.find((h) =>
            {
                return h.purpose === "catch-plate";
            })!;
            expect(plate.u).toBeLessThanOrEqual(100 + 50);
        }
        expect(doors).toHaveLength(3);
    });


    it("lists the screws the hardware does not come with, and places those of a foot where its plate has them", () =>
    {
        const p = dresser();
        const a = analyse(p);
        const qty = (ref: string, purpose: string): number =>
        {
            return a.build.hardware.filter((h) =>
            {
                return h.ref === ref && h.purpose === purpose;
            }).reduce((n, h) =>
            {
                return n + h.qty;
            }, 0);
        };
        const count = (purpose: string): number =>
        {
            return a.build.parts.flatMap((q) =>
            {
                return q.holes;
            }).filter((h) =>
            {
                return h.purpose === purpose;
            }).length;
        };
        // Every screw drilled for is bought, 4 to a foot plate and 2 to a TIP-ON adapter, 2 to a plinth clip
        expect(qty("SCREW_4x35", "foot-mount-screw")).toBe(count("foot-mount-screw"));
        expect(qty("637.76.333", "foot-mount") * 4).toBe(count("foot-mount-screw"));
        expect(qty("609.1500", "adapter-screw")).toBe(count("adapter-screw"));
        expect(qty("609.1500", "plinth-clip")).toBe(2 * qty("637.38.054", "plinth-clip"));
        // On a square of 64 off the shaft by 13 towards the middle (Häfele p. 11.43A), every one on the bottom and 23
        // clear of the side
        const c = p.items.find((it) =>
        {
            return it.name === "Colonne gauche";
        }) as Carcass;
        const bottom = a.build.parts.find((q) =>
        {
            return q.id === `${c.id}/bottom`;
        })!;
        const screws = bottom.holes.filter((h) =>
        {
            return h.purpose === "foot-mount-screw";
        });
        expect(screws).toHaveLength(16);
        expect(Math.min(...screws.map((h) =>
        {
            return h.u;
        }))).toBe(23);
        const us = [...new Set(screws.map((h) =>
        {
            return h.u;
        }))].sort((x, y) =>
        {
            return x - y;
        });
        expect(us[1]! - us[0]!).toBe(64);
        // Each square sits 13 on the middle side of its foot, on both sides of the carcass
        const axes = footPlaces(c).map((f) =>
        {
            return f.x - c.x - c.thickness;
        });
        const centres = [(us[0]! + us[1]!) / 2, (us.at(-2)! + us.at(-1)!) / 2];
        expect(centres[0]! - Math.min(...axes)).toBe(13);
        expect(centres[1]! - Math.max(...axes)).toBe(-13);
    });


    it("lists the fillers at their finished size and saws them 15 wider, their wall edge recut on site", () =>
    {
        // Review of 2026-11-09 : cut to the exact gap, nothing was left to scribe
        const p = dresser();
        const o = computeOutputs(p);
        const row = o.bom.cut.concat(o.bom.offSheet).find((r) =>
        {
            return r.label === "Fileur gauche";
        })!;
        expect(row.width).toBe(65);
        const saw = sawSize(row) as { width: number };
        const banded = (["v0", "v1"] as const).filter((e) => { return row.edges.includes(e); }).length;
        expect(saw.width).toBeCloseTo(65 + 15 - 0.8 * banded, 6);
        expect(row.parts[0]!.notes.join()).toContain("débitée à 80 mm");
    });


    it("shows nothing in what stays open : dowels in the small columns, blind screws from the closed side of the links",
       () =>
    {
        for (const [make, open] of [[dresser, ["Petite colonne gauche", "Petite colonne droite"]],
                                    [tvWall, ["Colonne à livres"]]] as const)
        {
            const p = make();
            const a = analyse(p);
            for (const name of open)
            {
                const c = p.items.find((it) =>
                {
                    return it.name === name;
                }) as Carcass;
                const holes = a.build.parts.filter((q) =>
                {
                    return q.item === c.id;
                }).flatMap((q) =>
                {
                    return q.holes;
                });
                expect(holes.some((h) =>
                {
                    return h.purpose.startsWith("minifix") || h.purpose === "link-screw";
                })).toBe(false);
                expect(holes.some((h) =>
                {
                    return h.purpose === "dowel";
                })).toBe(true);
            }
        }
        // The niche has no head at all, and a screw of 2 boards stays inside them
        const p = dresser();
        const a = analyse(p);
        const niche = p.items.find((it) =>
        {
            return it.name === "Niche";
        }) as Carcass;
        expect(a.build.parts.filter((q) =>
        {
            return q.item === niche.id;
        }).flatMap((q) =>
        {
            return q.holes;
        }).some((h) =>
        {
            return h.purpose === "link-screw";
        })).toBe(false);
        const side = a.build.hardware.find((h) =>
        {
            return h.purpose === "link-screw" && h.ref === "SCREW_4x30" && h.note?.includes("Niche");
        });
        expect(side).toBeDefined();
        // No housing shows either : its top and bottom over its sides since 2026-11-08, they go in the outer faces of
        // the sides, against the columns beside it
        const housings = a.build.parts.filter((q) => { return q.item === niche.id; }).flatMap((q) =>
        {
            return q.holes.filter((h) => { return h.purpose === "minifix-housing"; }).map((h) => { return `${q.role} ${h.face}`; });
        });
        expect(housings).toEqual(new Array(8).fill("side B"));
        expect(a.checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
    });


    it("shows no housing on the open round end, and holds its floor board by the return of the plinth", () =>
    {
        const p = tvWall();
        const a = analyse(p);
        const base = p.items.find((it) =>
        {
            return it.name === "Meuble bas";
        }) as Carcass;
        const end = (label: string): Part =>
        {
            return a.build.parts.find((q) =>
            {
                return q.id === `${base.id}/end/right/${label}`;
            })!;
        };
        for (const label of ["Flasque haute", "Tablette 1"])
        {
            const holes = end(label).holes;
            expect(holes.some((h) =>
            {
                return h.purpose.startsWith("minifix");
            })).toBe(false);
            expect(holes.some((h) =>
            {
                return h.purpose === "dowel";
            })).toBe(true);
        }
        // No cleat up the side : the plinth comes down to 2 off the floor, its return screwed into the low board
        expect(end("cleat")).toBeUndefined();
        const plinths = a.build.parts.filter((q) =>
        {
            return q.item === base.id && q.role === "plinth";
        });
        expect(plinths.map((q) => { return [q.frame!.o[1], q.width]; })).toEqual([[2, 95], [2, 95]]);
        const ret = plinths.find((q) => { return q.id === `${base.id}/plinth/right`; })!;
        const screws = ret.holes.filter((h) => { return h.purpose === "plinth-screw"; });
        expect(screws).toHaveLength(2);
        const low = end("Flasque basse");
        for (const h of screws)
        {
            // Through the return into the edge of the low board, on its middle
            const tip = at(ret.frame!, h.u, h.v, ret.thickness + 31);
            expect(tip[1]).toBeCloseTo(at(low.frame!, 0, 0, low.thickness / 2)[1], 6);
        }
        expect(a.checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
    });


    it("still tells a loose column out of its host that it overlaps", () =>
    {
        const p = dresser();
        const c = p.items.find((it) =>
        {
            return it.name === "Petite colonne gauche";
        }) as Carcass;
        c.y -= 200;
        expect(analyse(p).checks.some((k) =>
        {
            return k.level === "error" && k.message.includes("se chevauchent");
        })).toBe(true);
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


describe("the dresser with open columns", () =>
{
    it("runs an open column of shelves up each side of a narrower niche, under a cupboard of two doors", () =>
    {
        const p = openDresser();
        const named = (name: string): Carcass =>
        {
            return p.items.find((it) =>
            {
                return it.kind === "carcass" && it.name === name;
            }) as Carcass;
        };
        const top = named("Colonne gauche").y + named("Colonne gauche").height;
        for (const name of ["Colonne ouverte gauche", "Colonne ouverte droite"])
        {
            const c = named(name);
            expect(c.fronts).toEqual([]);
            expect(c.width).toBe(400);
            // From the top of the drawers to the top of the end columns
            expect(c.y).toBe(named("Placards et tiroirs").y + named("Placards et tiroirs").height);
            expect(c.y + c.height).toBe(top);
            expect((c.root as SplitNode).cuts.length).toBe(2);
        }
        const niche = named("Niche");
        expect(niche.width).toBe(802);
        expect(niche.root.kind).toBe("cell");
        expect(named("Placard haut").fronts.length).toBe(2);
        expect(named("Placard haut").y + named("Placard haut").height).toBe(top);
        expect(analyse(p).build.errors).toEqual([]);
    });
});


describe("the dresser with small niches", () =>
{
    it("sets two triple columns in the opening and lights it from under the cupboards above", () =>
    {
        const p = smallNichesDresser();
        expect(p.items.some((it) =>
        {
            return it.kind === "carcass" && it.name === "Niche";
        })).toBe(false);
        const a = analyse(p);
        expect(a.build.errors).toEqual([]);
        const shelves = a.build.parts.filter((q) =>
        {
            return q.itemName.startsWith("Petite niche") && q.role === "hdivider";
        });
        expect(shelves.length).toBe(4);
        // As their save has them : the box 300 deep against the wall stands back, its shelves flush with it
        for (const it of p.items)
        {
            if (it.kind === "carcass" && it.name.startsWith("Petite niche"))
            {
                expect([it.depth, it.z]).toEqual([300, 0]);
                expect((it.root as SplitNode).setbacks).toEqual([null, null]);
            }
        }
        const bottom = a.build.parts.find((q) =>
        {
            return q.itemName === "Placards hauts" && q.id.endsWith("/bottom");
        })!;
        // The profile screwed under it, on the face looking down : no groove, it hangs into the opening
        expect(bottom.grooves).toEqual([]);
        const profile = a.build.fitted.find((f) => { return f.ref === "LED_PROFILE_SURFACE" &&
                                                    f.item === bottom.item; })!;
        expect(profile.centre[1]).toBeLessThan(bottom.frame!.o[1] - bottom.thickness / 2);
    });

    it("refuses a light under the carcass from a cell that does not stand on its bottom", () =>
    {
        const p = smallNichesDresser();
        const high = p.items.find((it) =>
        {
            return it.kind === "carcass" && it.name === "Placards hauts";
        }) as Carcass;
        expect(analyse(p).build.errors).toEqual([]);
        // On feet the underside is the gap above the floor : nothing to light there
        high.base = { type: "feet", height: 100 };
        expect(analyse(p).build.errors.some((e) =>
        {
            return e.includes("éclairage sous le caisson");
        })).toBe(true);
    });
});


describe("the fronts of the dressers", () =>
{
    it("gives the three drawers and the cupboards under and over them one width of 531", () =>
    {
        for (const make of [dresser, smallNichesDresser, openDresser])
        {
            const p = make();
            const a = analyse(p);
            for (const name of ["Placards et tiroirs", "Placards hauts"])
            {
                const c = p.items.find((it) =>
                {
                    return it.kind === "carcass" && it.name === name;
                });
                if (c === undefined)
                {
                    continue;
                }
                // An outer front covers its side, a middle one half of each upright : unequal bays, equal fronts. The
                // drop flap stands inset between the uprights since 2026-11-09, on the leaves of its hinges
                expect(new Set((a.build.fronts.get(c.id) ?? []).filter((f) => { return f.role !== "drop"; }).map((f) =>
                {
                    return f.rect.w;
                }))).toEqual(new Set([531]));
            }
        }
    });
});


describe("the TV room as measured", () =>
{
    it("takes the left column 25 under their 2435 ceiling and closes the gap with a filler", () =>
    {
        const p = tvWall();
        expect([p.room.width, p.room.height]).toEqual([3050, 2435]);
        const column = p.items.find((it) =>
        {
            return it.kind === "carcass" && it.name === "Colonne gauche";
        }) as Carcass;
        expect(column.y + column.height).toBe(2435 - 25);
        const filler = analyse(p).build.parts.find((q) =>
        {
            return q.id === `${column.id}/filler`;
        })!;
        expect(filler.width).toBe(25);
    });
});


describe("the spacers of the dresser pull-out", () =>
{
    it("keeps each of their screws off the drillings of the upright it goes into", () =>
    {
        // essai25 : one 4 x 30 of each spacer ran into a Minifix housing, drilled after the flap was fitted
        const b = analyse(dresser()).build;
        const spacers = b.parts.filter((q) => { return q.label.startsWith("Cale de coulisse"); });
        expect(spacers).toHaveLength(2);
        const met: string[] = [];
        for (const sp of spacers)
        {
            for (const h of sp.holes.filter((x) => { return x.purpose === "spacer-screw"; }))
            {
                const name = /dans (montant \d+)/.exec(h.label)![1]!;
                const side = b.parts.find((q) => { return q.item === sp.item && q.label.toLowerCase() === name; })!;
                const p = at(sp.frame!, h.u, h.v, 0);
                const f = side.frame!;
                const d = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
                const dot = (a: number[]): number => { return d[0]! * a[0]! + d[1]! * a[1]! + d[2]! * a[2]!; };
                // The screw comes in through the face of the upright turned to the spacer
                const face: "A" | "B" = dot(f.n) > 0 ? "B" : "A";
                // Against the drillings of its edges too : essai30, lowered with the drawer, 2 ran into the passage of
                // a Minifix bolt up the bottom edge
                const probe = { u: dot(f.u), v: dot(f.v), diameter: 4, depth: 30 - sp.thickness, face,
                               label: "vis de cale",
                                purpose: "spacer-screw" as const };
                const crossed = crossedHoles({ ...side, holes: [...side.holes, probe] }).some(([x, y]) =>
                {
                    return x === probe || y === probe;
                });
                if (meets(side, face, probe.u, probe.v, 4, probe.depth) || crossed)
                {
                    met.push(`${sp.label} ${h.u} ${h.v}`);
                }
            }
        }
        expect(met).toEqual([]);
    });
});


describe("the small columns of the dresser", () =>
{
    it("stand without a back, their screws to it gone with it", () =>
    {
        // The back of the niche is behind them
        const p = dresser();
        const b = analyse(p).build;
        const small = p.items.filter((it) => { return it.name.startsWith("Petite colonne"); });
        expect(small).toHaveLength(2);
        for (const c of small)
        {
            expect(b.parts.filter((q) => { return q.item === c.id && q.role === "back"; })).toEqual([]);
            expect(b.hardware.filter((h) => { return h.item === c.id && h.purpose === "back-screw"; })).toEqual([]);
        }
    });
});


describe("the inset drop flap of the dresser", () =>
{
    // The hinge 342.66.730 has no cup, 2 leaves 14.5 thick screwed on the faces, the flap
    // inset between the uprights standing on the leaf of the carcass
    const p = dresser();
    const b = analyse(p).build;
    const low = p.items.find((it) => { return it.name === "Placards et tiroirs"; }) as Carcass;
    const fp = (b.fronts.get(low.id) ?? []).find((f) => { return f.role === "drop"; })!;
    const flap = b.parts.find((q) => { return q.id === `${low.id}/front/${fp.id}`; })!;
    const floor = b.parts.find((q) => { return q.item === low.id && q.role === "bottom"; })!;
    const floorTop = Math.max(...[0, floor.thickness].map((w) => { return at(floor.frame!, 0, 0, w)[1]; }));

    it("stands the flap inset on the carcass leaves, nothing drilled, 3 supplied screws at 30 degrees in each board",
       () =>
    {
        expect(fp.z).toBeCloseTo(low.depth - fp.thickness, 6);
        expect(low.y + fp.rect.y).toBeCloseTo(floorTop + 12.9, 6);
        expect([...floor.holes, ...flap.holes].filter((h) => { return h.diameter === 35 ||
                                                              /Charnière d'abattant/.test(h.label); })).toEqual([]);
        const { instances, every } = placedHardware(p, b);
        expect(instances.filter((i) => { return i.model === "342.66.730"; })).toHaveLength(2);
        const screws = every.filter((s) => { return s.holds === "342.66.730"; });
        expect(screws).toHaveLength(12);
        // Each leaf : 2 run 30 degrees off its face across the hinge, one 30 degrees off it along the depth
        for (const s of screws)
        {
            const off = Math.min(...[0, 1, 2].map((k) => { return Math.abs(Math.abs(s.out[k]!) - 0.866); }));
            expect(off).toBeLessThan(1e-3);
        }
    });


    it("sets the TIP-ON on its adapter plate back by the thickness of the flap, its catch plate on the back of it", () =>
    {
        const shelf = b.parts.filter((q) => { return q.item === low.id &&
                                             q.notes.some((n) => { return n.includes("la façade est intérieure"); }); });
        expect(shelf).toHaveLength(1);
        const screws = shelf[0]!.holes.filter((h) => { return h.purpose === "adapter-screw"; });
        expect(screws.map((h) => { return h.v; }).sort((x, y) => { return x - y; })).toEqual([20 + 19, 37 + 19]);
        expect(flap.holes.filter((h) => { return h.purpose === "catch-plate"; })).toHaveLength(1);
    });


    it("runs the bottle drawer 17.5 over the floor, behind the flap leaf, over the flap lying open level with the floor",
       () =>
    {
        const bottom = b.parts.find((q) => { return q.label === "Tiroir intérieur, côté gauche"; })!;
        const ys = [0, bottom.width].map((v) => { return at(bottom.frame!, 0, v, 0)[1]; });
        expect(Math.min(...ys) - floorTop).toBeCloseTo(17.5, 6);
        const front = b.parts.find((q) => { return q.label === "Tiroir intérieur, avant de caisson"; })!;
        const zs = [0, front.thickness].map((w) => { return at(front.frame!, 0, 0, w)[2]; });
        expect(Math.max(...zs)).toBeLessThanOrEqual(low.z + fp.z - 14.5 - 3 + 1e-6);
        // Turned open, the back of the flap comes level with the floor of the cell, its lower edge at the front
        const m = b.motions.find((x) => { return x.front === fp.id && x.kind === "turn"; })!;
        const back = [low.z + fp.z, low.y + fp.rect.y];
        const turned = (z: number, y: number): [number, number] =>
        {
            return [m.pivot[2] + (y - m.pivot[1]), m.pivot[1] - (z - m.pivot[2])];
        };
        expect(turned(back[0]!, back[1]! + fp.rect.h)[1]).toBeCloseTo(floorTop, 6);
        expect(turned(back[0]!, back[1]!)[0]).toBeCloseTo(low.z + low.depth, 6);
    });
});
