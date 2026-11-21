import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { drawingSet } from "./io/workshop";
import { OVERLAY_EM, SMALL_TEXT, inkBox, inkedBoxes, scaleText, textWidth, type Prim } from "./drawing/display";
import { CELL_PAD, ROW, TABLE_COLS, TABLE_HEAD, TABLE_TEXT, TABLE_W, machiningTable, outlineArcs } from
    "./drawing/machining_table";
import { segmentHits } from "./drawing/workpiece";
import type { PartView } from "./drawing/draft";
import type { Part } from "./parts";
import { tessellate } from "./geometry";
import { round1 } from "./text";

// What the workshop read is what FreeCAD print : each table and mark measured here where it land

const fits = (t: string, w: number): boolean =>
{
    return textWidth(t, TABLE_TEXT) + CELL_PAD <= w + 1e-9;
};

type Box = { x: number; y: number; w: number; h: number };

const overlaps = (a: Box, b: Box): boolean =>
{
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
};

const MARK = /^[A-Z]+\d+$/;
// Share of the marks of a point on the outline written inside the board : measured, then kept under it
const INWARD_SHARE = 0.5;


// Where a point of face A lands on the sheet, the way the sheet lays its view out from its box
function paperOf(part: Part, view: PartView): (u: number, v: number) => [number, number]
{
    let [maxU, maxV] = [0, 0];
    for (const [u, v] of tessellate(part.outline))
    {
        maxU = Math.max(maxU, u);
        maxV = Math.max(maxV, v);
    }
    const { su, sv, scale, box } = view;
    const minX = Math.min(0, maxU * su[0]) + Math.min(0, maxV * sv[0]);
    const maxY = Math.max(0, maxU * su[1]) + Math.max(0, maxV * sv[1]);
    const [ox, oy] = [box.x, box.y + box.h];
    return (u, v) =>
    {
        return [ox + (u * su[0] + v * sv[0] - minX) / scale, oy + (u * su[1] + v * sv[1] - maxY) / scale];
    };
}


// The face column as a maker reads it, written again here apart from the code that fills the table
function faceOf(h: Part["holes"][number]): string
{
    if (h.face === "A" || h.face === "B")
    {
        return h.face;
    }
    return h.w === undefined ? `chant ${h.face}` : `chant ${h.face} w${round1(h.w)}`;
}


// The advance of each capital and figure in DejaVu Sans, read again from DejaVuSans.ttf for this test : a mark
// measured with the widths the code places it with would agree with any mistake in them
const DEJAVU_EM: Record<string, number> = {
    A: 0.684, B: 0.686, C: 0.698, D: 0.77, E: 0.632, F: 0.575, G: 0.775, H: 0.752, I: 0.295, J: 0.295, K: 0.656,
    L: 0.557, M: 0.863, N: 0.748, O: 0.787, P: 0.603, Q: 0.787, R: 0.695, S: 0.635, T: 0.611, U: 0.732, V: 0.684,
    W: 0.989, X: 0.685, Y: 0.611, Z: 0.685, 0: 0.636, 1: 0.636, 2: 0.636, 3: 0.636, 4: 0.636, 5: 0.636, 6: 0.636,
    7: 0.636, 8: 0.636, 9: 0.636,
};

type Text = Extract<Prim, { k: "text" }>;


// A text as the PDF prints it, its box from its own letters, its descenders under the baseline
function printed(m: Text): Box
{
    const w = [...m.t].reduce((s, c) => { return s + (DEJAVU_EM[c] ?? 0.66); }, 0) * m.size;
    const lead = m.anchor === "start" ? 0 : m.anchor === "middle" ? w / 2 : w;
    // Turned a quarter anticlockwise, its letters stand left of the point and run up the page
    return m.rot === 90 ? { x: m.x - m.size, y: m.y - w + lead, w: m.size * 1.25, h: w }
        : { x: m.x - lead, y: m.y - m.size, w, h: m.size * 1.25 };
}


// Where each line of a table says its machining is, read off its own cells and not off the code that places the
// marks : an arc by the middle of its curve, a hole of a face with its radius
function tableSpots(row: Parameters<typeof machiningTable>[0], part: Part, P: (u: number, v: number) => [number,
    number]):
    { tag: string; at: [number, number]; r: number }[]
{
    const arcs = outlineArcs(part);
    const num = (t: string): number => { return Number(t.replace(",", ".")); };
    return machiningTable(row, part).lines.filter((c) => { return c.length > 1 && c[1] !== ""; }).map((c) =>
    {
        const [u, v] = [num(c[1]!), num(c[2]!)];
        if (c[3]!.startsWith("R"))
        {
            const a = arcs.find((x) => { return Math.abs(x.cu - u) < 0.06 && Math.abs(x.cv - v) < 0.06; })!;
            return { tag: c[0]!, at: P(a.cu + a.r * Math.cos(a.mid), a.cv + a.r * Math.sin(a.mid)), r: 0 };
        }
        const onFace = c[5] === "A" || c[5] === "B";
        return { tag: c[0]!, at: P(u, v), r: onFace && !Number.isNaN(num(c[3]!)) ? num(c[3]!) / 2 : 0 };
    });
}


// The cut edges of a part on the sheet, its outline and its cutouts, as segments
function outlineOf(part: Part, P: (u: number, v: number) => [number, number]): [number, number, number, number][]
{
    return [part.outline, ...part.cutouts].flatMap((o) =>
    {
        const pts = tessellate(o).map(([u, v]) => { return P(u, v); });
        return pts.map((p, i) =>
        {
            const q = pts[(i + 1) % pts.length]!;
            return [p[0], p[1], q[0], q[1]] as [number, number, number, number];
        });
    });
}


// Whether a segment runs through a box, sampled every tenth of a millimetre
function crosses(s: [number, number, number, number], b: Box): boolean
{
    const steps = Math.max(1, Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 0.1));
    for (let i = 0; i <= steps; i++)
    {
        const [x, y] = [s[0] + (s[2] - s[0]) * i / steps, s[1] + (s[3] - s[1]) * i / steps];
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)
        {
            return true;
        }
    }
    return false;
}


for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
    describe(`the machining tables of the ${name}`, () =>
    {
        const p = make();
        const o = computeOutputs(p);
        const rows = [...o.bom.cut, ...o.bom.offSheet];
        const pages = drawingSet(p, o);
        const byPart = new Map(rows.map((r) => { return [r.parts[0]!.id, r] as const; }));
        const partPages = pages.filter((pg) => { return /^Pièces /.test(pg.title) && (pg.views ?? []).length > 0; });

        it("hold every value inside its own column, a full line inside the table", () =>
        {
            const over: string[] = [];
            for (const row of rows)
            {
                const t = machiningTable(row, row.parts[0]!);
                expect(t.widths.reduce((a, b) => { return a + b; }, 0)).toBeCloseTo(TABLE_W, 9);
                for (const cells of [TABLE_HEAD, ...t.lines])
                {
                    const spans = cells.length === 1 ? [TABLE_W] : t.widths;
                    cells.forEach((text, c) =>
                    {
                        if (!fits(text, spans[c]!))
                        {
                            over.push(`${row.code} colonne ${c + 1} : ${text}`);
                        }
                    });
                }
                for (const note of t.notes)
                {
                    if (textWidth(note, TABLE_TEXT, OVERLAY_EM) > TABLE_W)
                    {
                        over.push(`${row.code} note : ${note}`);
                    }
                }
            }
            expect(over).toEqual([]);
        });

        it("widen a column for a value longer than its narrowest width", () =>
        {
            const row = rows.find((r) => { return r.parts[0]!.holes.some((h) => { return h.w !== undefined; }); })!;
            const part = structuredClone(row.parts[0]!);
            part.holes.find((h) => { return h.w !== undefined; })!.w = 123456.75;
            const t = machiningTable({ ...row, parts: [part] }, part);
            const face = TABLE_HEAD.indexOf("Face");
            expect(t.widths[face]!).toBeGreaterThan(TABLE_COLS[face]!);
            for (const cells of t.lines.filter((c) => { return c.length > 1; }))
            {
                cells.forEach((text, c) => { expect(fits(text, t.widths[c]!), text).toBe(true); });
            }
        });

        it("give each hole its own line, its u, v, Ø, depth and face as the part has them", () =>
        {
            for (const row of rows)
            {
                const part = row.parts[0]!;
                const t = machiningTable(row, part);
                const printed = t.lines.filter((c) => { return c.length > 1 && c[1] !== ""; }).map((c) =>
                {
                    return c.slice(1, 6).join("|");
                });
                for (const h of part.holes)
                {
                    const want = [round1(h.u), round1(h.v), h.diameter === 0 ? "-" : `${h.diameter}`,
                                  h.depth === 0 ? "-" : `${h.depth}`, faceOf(h)].join("|");
                    const at = printed.indexOf(want);
                    expect(at, `${row.code} : ${want}`).toBeGreaterThanOrEqual(0);
                    printed.splice(at, 1);
                }
            }
        });

        it("keep the notes out of the columns, under the table as FreeCAD draws it", () =>
        {
            // FreeCAD draws a row a whole number of pixels high at 96 dpi : the sheet counts the same
            const px = ROW / (25.4 / 96);
            expect(Math.abs(px - Math.round(px))).toBeLessThan(1e-9);
            for (const pg of pages)
            {
                for (const column of pg.tables ?? [])
                {
                    expect(column.lines.length).toBeGreaterThan(0);
                    expect(column.lines.some((cells) => { return cells[0]!.startsWith("Note"); })).toBe(false);
                    // From its head row down, every row of the table and then whatever is written under it
                    const bottom = column.top - ROW + (column.lines.length + 1) * ROW;
                    for (const m of pg.marks ?? [])
                    {
                        if (m.k === "text" && Math.abs(m.x - column.x) < 1e-6 && m.y > column.top)
                        {
                            expect(m.y - m.size, `${pg.title} : ${m.t}`).toBeGreaterThanOrEqual(bottom - 1e-6);
                        }
                    }
                }
            }
            // Whatever width the lines were broken at, a note reads whole once its lines are put back together
            const text = pages.flatMap((pg) => { return (pg.marks ?? []).flatMap((m) =>
            {
                return m.k === "text" ? [m.t] : [];
            }); }).join(" ");
            for (const row of rows)
            {
                for (const note of row.notes)
                {
                    expect(text, `${row.code} : ${note}`).toContain(`Note : ${note}`);
                }
            }
        });

        it("mark every machining, a letter a setting of the machine then a number", () =>
        {
            for (const row of rows)
            {
                const t = machiningTable(row, row.parts[0]!);
                const placed = t.lines.filter((cells) => { return cells.length > 1 && cells[1] !== ""; });
                const tags = placed.map((cells) => { return cells[0]!; });
                expect(tags.every((tag) => { return MARK.test(tag); }), row.code).toBe(true);
                expect(new Set(tags).size, row.code).toBe(tags.length);
                // One letter, one setting : Ø, depth, face and use alike
                const byLetter = new Map<string, string>();
                const numbers = new Map<string, number[]>();
                for (const cells of placed)
                {
                    const letter = cells[0]!.replace(/\d+$/, "");
                    const setting = cells.slice(3).join("|");
                    expect(byLetter.get(letter) ?? setting, `${row.code} ${cells[0]}`).toBe(setting);
                    byLetter.set(letter, setting);
                    numbers.set(letter, [...numbers.get(letter) ?? [], Number(cells[0]!.slice(letter.length))]);
                }
                expect(new Set(byLetter.values()).size, row.code).toBe(byLetter.size);
                for (const [letter, run] of numbers)
                {
                    expect(run, `${row.code} ${letter}`).toEqual(run.map((_, k) => { return k + 1; }));
                }
            }
        });

        // Each machining of a sheet where its line of the table puts it, with the mark it's given
        const sheetSpots = (pg: (typeof partPages)[number]) =>
        {
            return pg.views!.flatMap((v) =>
            {
                const row = byPart.get(v.part)!;
                const P = paperOf(row.parts[0]!, v);
                return tableSpots(row, row.parts[0]!, P).map((s) =>
                {
                    // The table rounds to a tenth : a point read off it is that close to the one the code drew from
                    return { ...s, code: row.code, reach: s.r / v.scale, slack: 0.051 / v.scale };
                });
            });
        };
        const dist = (a: [number, number], b: [number, number]): number =>
        {
            return Math.hypot(a[0] - b[0], a[1] - b[1]);
        };

        it("write each mark at 2 mm by its own machining, nearer to it than to any other or tied to it", () =>
        {
            for (const pg of partPages)
            {
                const texts = (pg.marks ?? []).filter((m): m is Text => { return m.k === "text"; });
                // A leader is a thin line : a hole in an edge is drawn in a centre line from the same point
                const leaders = (pg.marks ?? []).filter((m): m is Extract<Prim, { k: "line" }> =>
                {
                    return m.k === "line" && m.s === "thin";
                });
                const spots = sheetSpots(pg);
                for (const s of spots)
                {
                    const centre = (m: Text): [number, number] =>
                    {
                        const b = printed(m);
                        return [b.x + b.w / 2, b.y + b.h / 2];
                    };
                    // Two parts on a sheet both have an A1 : the one by this spot
                    const own = texts.filter((m) => { return m.t === s.tag; }).reduce<Text | undefined>((best, m) =>
                    {
                        return best === undefined || dist(centre(m), s.at) < dist(centre(best), s.at) ? m : best;
                    }, undefined);
                    expect(own, `${pg.title} : ${s.code} ${s.tag} absent`).toBeDefined();
                    expect(own!.size, `${s.code} ${s.tag}`).toBe(SMALL_TEXT);
                    const c = centre(own!);
                    // A pocket centred on its hole shares its point : no position tells the 2 apart
                    const nearest = spots.every((x) =>
                    {
                        return dist(x.at, s.at) < 1e-6 || dist(c, x.at) > dist(c, s.at);
                    });
                    const tied = leaders.some((l) => { return Math.hypot(l.x1 - s.at[0], l.y1 - s.at[1]) < s.slack; });
                    const other = spots.filter((x) => { return dist(x.at, s.at) > 1e-6; }).reduce((a, b) =>
                    {
                        return dist(c, a.at) < dist(c, b.at) ? a : b;
                    });
                    expect(nearest || tied, `${pg.title} : ${s.code} ${s.tag} à ${dist(c, s.at).toFixed(2)} mm de son `
                        + `usinage, ${other.tag} à ${dist(c, other.at).toFixed(2)}`).toBe(true);
                    expect(dist(c, s.at), `${s.code} ${s.tag}`).toBeLessThan(35);
                }
            }
        });

        it("run no leader through another machining, which it would seem to name", () =>
        {
            const through: string[] = [];
            for (const pg of partPages)
            {
                const spots = sheetSpots(pg);
                for (const l of (pg.marks ?? []).filter((m): m is Extract<Prim, { k: "line" }> =>
                {
                    return m.k === "line" && m.s === "thin";
                }))
                {
                    const from = spots.find((s) => { return Math.hypot(l.x1 - s.at[0], l.y1 - s.at[1]) < s.slack; });
                    if (from === undefined)
                    {
                        continue;
                    }
                    const [lx, ly] = [l.x2 - l.x1, l.y2 - l.y1];
                    const length2 = lx * lx + ly * ly;
                    for (const x of spots)
                    {
                        const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x.at[0] - l.x1) * lx + (x.at[1] -
                            l.y1) * ly)
                            / length2));
                        const off = Math.hypot(l.x1 + t * lx - x.at[0], l.y1 + t * ly - x.at[1]);
                        if (dist(x.at, from.at) > 1e-6 && off < Math.max(0.5, x.reach))
                        {
                            through.push(`${pg.title} : le trait de ${from.tag} passe sur ${x.tag}`);
                        }
                    }
                }
            }
            expect(through).toEqual([]);
        });

        it("lay no mark over a text, a line or the cut edge of the part, measured in the font TechDraw prints", () =>
        {
            const over: string[] = [];
            for (const pg of partPages)
            {
                const prims = pg.marks ?? [];
                const edges = pg.views!.flatMap((v) =>
                {
                    const part = byPart.get(v.part)!.parts[0]!;
                    return outlineOf(part, paperOf(part, v));
                });
                for (const m of prims)
                {
                    // A mark, not the R50 of a radius written at 2.5 mm
                    if (m.k !== "text" || !MARK.test(m.t) || m.size !== SMALL_TEXT)
                    {
                        continue;
                    }
                    // With a little air round it : 2 marks touching read as one word, B2D11
                    const ink = printed(m);
                    const b = { x: ink.x - 0.2, y: ink.y - 0.2, w: ink.w + 0.4, h: ink.h + 0.4 };
                    for (const e of edges.filter((s) => { return crosses(s, b); }))
                    {
                        over.push(`${pg.title} : ${m.t} barré par le contour en ${e[0].toFixed(1)} ${e[1].toFixed(1)}`);
                    }
                    for (const q of prims)
                    {
                        // Its own leader ends on the edge of its letters
                        if (q === m || (q.k === "line" && Math.abs(q.x2 - Math.min(Math.max(q.x1, ink.x), ink.x +
                            ink.w)) < 0.05
                            && Math.abs(q.y2 - Math.min(Math.max(q.y1, ink.y), ink.y + ink.h)) < 0.05))
                        {
                            continue;
                        }
                        // A text by its own letters, an outline by its sides, not its inside
                        const inked = q.k === "text" ? [printed(q)] : inkedBoxes(q);
                        if (inked.some((ob) => { return overlaps(b, ob); }))
                        {
                            const what = q.k === "text" ? q.t : q.k;
                            over.push(`${pg.title} : ${m.t} en ${b.x.toFixed(1)} ${b.y.toFixed(1)} sur ${what}`);
                        }
                    }
                }
            }
            expect(over).toEqual([]);
        });

        it("draw a hole of face A in full line and one of face B dashed, where the part has it", () =>
        {
            for (const pg of partPages)
            {
                const circles = (pg.marks ?? []).filter((m): m is Extract<Prim, { k: "circle" }> =>
                {
                    return m.k === "circle";
                });
                for (const v of pg.views!)
                {
                    const part = byPart.get(v.part)!.parts[0]!;
                    const P = paperOf(part, v);
                    for (const h of part.holes.filter((x) => { return (x.face === "A" || x.face === "B") &&
                                                              x.diameter > 0; }))
                    {
                        const [x, y] = P(h.u, h.v);
                        const drawn = circles.filter((c) => { return Math.hypot(c.x - x, c.y - y) < 1e-6; });
                        expect(drawn.length, `${pg.title} : trou en ${h.u} ${h.v}`).toBeGreaterThan(0);
                        expect(drawn.every((c) => { return c.s === (h.face === "A" ? "normal" : "dashed"); }),
                               `${pg.title} : trou face ${h.face} en ${h.u} ${h.v}`).toBe(true);
                    }
                }
            }
        });

        it("say the scale each part is drawn at, by it and in the title block, its drawing that large", () =>
        {
            for (const pg of partPages)
            {
                const written = (pg.marks ?? []).flatMap((m) => { return m.k === "text" ? [m.t] : []; });
                for (const v of pg.views!)
                {
                    const part = byPart.get(v.part)!.parts[0]!;
                    let [maxU, maxV] = [0, 0];
                    for (const [u, w] of tessellate(part.outline))
                    {
                        maxU = Math.max(maxU, u);
                        maxV = Math.max(maxV, w);
                    }
                    const drawn = [v.box.w * v.scale, v.box.h * v.scale].sort((a, b) => { return a - b; });
                    const real = [maxU, maxV].sort((a, b) => { return a - b; });
                    expect(drawn[0]!, pg.title).toBeCloseTo(real[0]!, 6);
                    expect(drawn[1]!, pg.title).toBeCloseTo(real[1]!, 6);
                    expect(pg.fields?.scale, pg.title).toContain(scaleText(v.scale));
                    expect(written, pg.title).toContain(scaleText(v.scale));
                }
            }
        });

        it("write every mark of the delivered sets on its view, none sent to the table", () =>
        {
            const sent = pages.flatMap((pg) => { return (pg.marks ?? []).flatMap((m) =>
            {
                return m.k === "text" && m.t.includes("non écrits sur la vue") ? [`${pg.title} : ${m.t}`] : [];
            }); });
            expect(sent).toEqual([]);
        });

        it("write most marks of a hole in an edge inside the board, where the paper is free", () =>
        {
            let [inside, all] = [0, 0];
            for (const pg of partPages)
            {
                for (const v of pg.views!)
                {
                    const row = byPart.get(v.part)!;
                    const part = row.parts[0]!;
                    const P = paperOf(part, v);
                    const shape = tessellate(part.outline).map(([u, w]) => { return P(u, w); });
                    const holds = ([x, y]: [number, number]): boolean =>
                    {
                        let odd = false;
                        shape.forEach(([ax, ay], i) =>
                        {
                            const [bx, by] = shape[(i + 1) % shape.length]!;
                            if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay))
                            {
                                odd = !odd;
                            }
                        });
                        return odd;
                    };
                    for (const s of tableSpots(row, part, P).filter((x) => { return x.r === 0; }))
                    {
                        const mark = (pg.marks ?? []).filter((m): m is Text => { return m.k === "text" &&
                            m.t === s.tag; })
                            .reduce<Text | undefined>((best, m) =>
                            {
                                const b = printed(m);
                                const near = Math.hypot(b.x + b.w / 2 - s.at[0], b.y + b.h / 2 - s.at[1]);
                                const was = best === undefined ? Infinity : Math.hypot(printed(best).x
                                    + printed(best).w / 2 - s.at[0], printed(best).y + printed(best).h / 2 - s.at[1]);
                                return near < was ? m : best;
                            }, undefined);
                        if (mark !== undefined)
                        {
                            const b = printed(mark);
                            all++;
                            inside += holds([b.x + b.w / 2, b.y + b.h / 2]) ? 1 : 0;
                        }
                    }
                }
            }
            expect(inside / all, `${inside} sur ${all}`).toBeGreaterThan(INWARD_SHARE);
        });
    });
}


// A leader drawn corner to corner : the box it spans takes in a word the line itself keeps well clear of
describe("a leader crossing a word", () =>
{
    it("is the line, never the box round it", () =>
    {
        const word = { x: 7, y: 0, w: 2, h: 2 };
        expect(segmentHits([0, 0], [10, 10], word)).toBe(false);
        expect(segmentHits([0, 1], [10, 1], word)).toBe(true);
        expect(segmentHits([8, -5], [8, 5], word)).toBe(true);
        expect(segmentHits([0, 0], [6.9, 6.9], { x: 7, y: 7, w: 1, h: 1 })).toBe(false);
    });
});


// 2 cotes of a delivered set moved by a few millimetres, the way a customer's room moves them : a sheet of marks
// with no room for one of them came out as no sheet at all
describe("the drawings of a set whose sizes moved", () =>
{
    const variants: [string, () => ReturnType<typeof tvWall>][] = [
        ...[2520, 2528, 2536, 2540].map((w) =>
        {
            return [`meuble bas TV de ${w}`, () =>
            {
                const p = tvWall();
                const k = p.items.find((it) => { return it.name === "Meuble bas"; })! as { width: number };
                k.width = w;
                return p;
            }] as [string, () => ReturnType<typeof tvWall>];
        }),
        ...[510, 520, 530, 545].map((d) =>
        {
            return [`placards hauts de ${d} de profondeur`, () =>
            {
                const p = dresser();
                const k = p.items.find((it) => { return it.name === "Placards hauts"; })! as { depth: number };
                k.depth = d;
                return p;
            }] as [string, () => ReturnType<typeof tvWall>];
        }),
    ];
    for (const [name, make] of variants)
    {
        it(`still draws every sheet, each mark on its view or sent to the table : ${name}`, () =>
        {
            const p = make();
            const o = computeOutputs(p);
            const pages = drawingSet(p, o);
            const text = pages.flatMap((pg) => { return (pg.marks ?? []).flatMap((m) =>
            {
                return m.k === "text" ? [m.t] : [];
            }); }).join(" ");
            for (const row of [...o.bom.cut, ...o.bom.offSheet])
            {
                const pg = pages.find((x) =>
                {
                    return x.views?.some((v) => { return v.part === row.parts[0]!.id; }) === true;
                });
                if (pg === undefined)
                {
                    continue;
                }
                const own = (pg.marks ?? []).flatMap((m) => { return m.k === "text" ? [m.t] : []; });
                for (const s of machiningTable(row, row.parts[0]!).spots)
                {
                    expect(own.includes(s.tag) || text.includes(` ${s.tag}`), `${row.code} ${s.tag}`).toBe(true);
                }
            }
        });
    }
});
