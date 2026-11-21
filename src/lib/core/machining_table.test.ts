import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { drawingSet } from "./io/workshop";
import { OVERLAY_EM, SMALL_TEXT, inkBox, inkedBoxes, scaleText, textWidth, type Prim } from "./drawing/display";
import { CELL_PAD, ROW, TABLE_COLS, TABLE_HEAD, TABLE_TEXT, TABLE_W, machiningTable } from "./drawing/machining_table";
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

        it("write each mark at 2 mm by its own machining, nearer to it than to any other or tied to it", () =>
        {
            for (const pg of partPages)
            {
                const texts = (pg.marks ?? []).filter((m): m is Extract<Prim, { k: "text" }> =>
                {
                    return m.k === "text";
                });
                const leaders = (pg.marks ?? []).filter((m): m is Extract<Prim, { k: "line" }> =>
                {
                    return m.k === "line";
                });
                const spots = pg.views!.flatMap((v) =>
                {
                    const row = byPart.get(v.part)!;
                    const P = paperOf(row.parts[0]!, v);
                    return machiningTable(row, row.parts[0]!).spots.map((s) =>
                    {
                        return { code: row.code, tag: s.tag, at: P(s.u, s.v) };
                    });
                });
                for (const s of spots)
                {
                    const centre = (m: Prim): [number, number] =>
                    {
                        const b = inkBox([m])!;
                        return [b.x + b.w / 2, b.y + b.h / 2];
                    };
                    const dist = (a: [number, number], b: [number, number]): number =>
                    {
                        return Math.hypot(a[0] - b[0], a[1] - b[1]);
                    };
                    // Two parts on a sheet both have an A1 : the one by this spot
                    const own = texts.filter((m) => { return m.t === s.tag; }).reduce<typeof texts[number] | undefined>(
                        (best, m) =>
                        {
                            return best === undefined || dist(centre(m), s.at) < dist(centre(best), s.at) ? m : best;
                        }, undefined);
                    expect(own, `${pg.title} : ${s.code} ${s.tag} absent`).toBeDefined();
                    expect(own!.size, `${s.code} ${s.tag}`).toBe(SMALL_TEXT);
                    const c = centre(own!);
                    const nearest = spots.every((x) => { return x === s || dist(c, x.at) > dist(c, s.at); });
                    const tied = leaders.some((l) =>
                    {
                        return Math.hypot(l.x1 - s.at[0], l.y1 - s.at[1]) < 1e-6;
                    });
                    expect(nearest || tied, `${pg.title} : ${s.code} ${s.tag} plus près d'un autre usinage`).toBe(true);
                    expect(dist(c, s.at), `${s.code} ${s.tag}`).toBeLessThan(35);
                }
            }
        });

        it("lay no mark over another text or line of the overlay, measured in the font TechDraw draws it in", () =>
        {
            const over: string[] = [];
            for (const pg of partPages)
            {
                const prims = pg.marks ?? [];
                for (const m of prims)
                {
                    // A mark, not the R50 of a radius written at 2.5 mm
                    if (m.k !== "text" || !MARK.test(m.t) || m.size !== SMALL_TEXT)
                    {
                        continue;
                    }
                    const b = inkBox([m])!;
                    for (const q of prims)
                    {
                        // Its own leader ends on its edge
                        if (q === m || (q.k === "line" && Math.abs(q.x2 - Math.min(Math.max(q.x1, b.x), b.x +
                            b.w)) < 1e-6
                            && Math.abs(q.y2 - Math.min(Math.max(q.y1, b.y), b.y + b.h)) < 1e-6))
                        {
                            continue;
                        }
                        // An outline inks its sides, not its inside
                        if (inkedBoxes(q).some((ob) => { return overlaps(b, ob); }))
                        {
                            const ends = q.k === "line" ? [q.x1, q.y1, q.x2, q.y2].map((n) => { return n.toFixed(1); })
                                : [];
                            const what = q.k === "text" ? q.t : q.k === "line" ? `trait ${ends.join(" ")} ${q.s}` : q.k;
                            over.push(`${pg.title} : ${m.t} en ${b.x.toFixed(1)} ${b.y.toFixed(1)} sur ${what}`);
                        }
                    }
                }
            }
            expect(over).toEqual([]);
        });

        it("say the scale each part is drawn at, its drawing as large as that scale makes it", () =>
        {
            for (const pg of partPages)
            {
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
                }
            }
        });
    });
}
