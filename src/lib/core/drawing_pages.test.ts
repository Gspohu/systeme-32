import { describe, expect, it } from "vitest";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";
import { drawingSet } from "./io/workshop";
import { sheetTemplate } from "./drawing/sheets";
import { pageToSvg } from "./drawing/svg";
import { paperAxes } from "./drawing/workpiece";
import { machiningTable } from "./drawing/machining_table";
import { A3 } from "./drawing/display";
import { sectionPlanes, sectionSpecs } from "./drawing/sections";

// The TechDraw page of a sheet is built from what the sheet says of itself : a field missing, a view pointing at no
// board or a table short of lines and the FreeCAD plan todl otherwise than the printed one, with nothing to see it

// Lines a value runs on to, empty when it fit on the one before
const CONTINUATION = new Set(["legal_owner_2", "legal_owner_3", "supplementary_title_2"]);

function editable(svg: string): string[]
{
    return [...svg.matchAll(/freecad:editable="([^"]+)"/g)].map((m) => { return m[1]!; }).sort();
}


for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
    describe(`the TechDraw pages of the ${name}`, () =>
    {
        const p = make();
        const o = computeOutputs(p);
        const pages = drawingSet(p, o);
        const parts = new Map(o.analysis.build.parts.map((q) => { return [q.id, q]; }));
        const sheets = pages.filter((pg) => { return /^Pièces /.test(pg.title) && !/\(suite\)$/.test(pg.title); });

        it("gives each workpiece sheet a view of its board seen as the sheet draws it", () =>
        {
            expect(sheets.length).toBeGreaterThan(20);
            for (const pg of sheets)
            {
                expect(pg.views?.length, pg.title).toBeGreaterThan(0);
                for (const v of pg.views!)
                {
                    const q = parts.get(v.part);
                    expect(q, `${pg.title} : ${v.part}`).toBeDefined();
                    expect({ su: v.su, sv: v.sv }).toEqual(paperAxes(q!));
                    expect(v.box.x > 0 && v.box.y > 0 && v.box.x + v.box.w < A3.w && v.box.y + v.box.h < A3.h,
                           pg.title).toBe(true);
                }
                expect(pg.marks?.length, pg.title).toBeGreaterThan(0);
            }
        });

        it("gives each carcass its 4 views, whole and without its fronts, inside the frame", () =>
        {
            const carcasses = p.items.filter((it) => { return it.kind === "carcass"; });
            expect(carcasses.length).toBeGreaterThan(0);
            for (const k of carcasses)
            {
                const pg = pages.find((x) => { return x.title === `${k.name}, vues`; });
                expect(pg?.items?.map((v) => { return `${v.view}${v.whole ? "" : " nue"}`; }).sort(), k.name)
                    .toEqual(["front", "front nue", "left", "top"]);
                for (const v of pg!.items!)
                {
                    expect(v.item).toBe(k.id);
                    expect(v.box.x > 0 && v.box.y > 0 && v.box.x + v.box.w < A3.w && v.box.y + v.box.h < A3.h,
                           `${k.name} ${v.view}`).toBe(true);
                }
                // The marks keep the titles and the tables, the projected boards left to TechDraw
                expect(pg!.marks!.length).toBeLessThan(pg!.prims.length);
                // Left in the marks, the plan was drawn twice : once projected, once laid over it
                const scale = pg!.items![0]!.scale;
                const plan = pg!.marks!.filter((m) =>
                {
                    return m.k === "rect" && Math.abs(m.w - k.width / scale) < 1e-6
                        && Math.abs(m.h - k.depth / scale) < 1e-6;
                });
                expect(plan, k.name).toEqual([]);
            }
        });

        it("projects every carcass and wall shelf of the back wall on its composition, and leaves no sheet empty", () =>
        {
            const compo = pages.find((x) => { return x.title === "Composition"; });
            const wanted = p.items.filter((it) =>
            {
                return it.wall === "back" && (it.kind === "carcass" || it.kind === "wallShelf");
            }).map((it) => { return it.id; });
            const projected = compo?.walls?.[0]?.items ?? [];
            expect(projected.length).toBe(wanted.length);
            expect(new Set(projected)).toEqual(new Set(wanted));
            // A page TechDraw would show blank : no view of its own and nothing laid over it
            expect(pages.filter((pg) =>
            {
                return !pg.views?.length && !pg.items?.length && !pg.walls?.length && !pg.marks?.length;
            }).map((pg) => { return pg.title; })).toEqual([]);
        });

        // Counted up the sheet, the depth showed the fronts at the top of a horizontal section : the mirror of the
        // setting out, its back wall at the top
        it("sees each horizontal section from above, the wall at the top and the fronts at the bottom", () =>
        {
            const flat = sectionPlanes(p, o.analysis, "back").filter((s) =>
            {
                return s.axis === "y" && s.cut.some((c) => { return c.front; });
            });
            expect(flat.length, name).toBeGreaterThan(0);
            for (const s of flat)
            {
                const top = s.cut.reduce((m, c) => { return c.b1 > m.b1 ? c : m; });
                expect(top.front, s.title).toBe(false);
            }
        });

        // Set at the floor and the left end of the wall, TechDraw centred the lines there, half of them off the sheet
        it("puts each FreeCAD cut on its plane, its line centred in front of the wall", () =>
        {
            const specs = sectionSpecs(p, o.analysis);
            expect(specs.length, name).toBeGreaterThan(0);
            for (const s of specs)
            {
                const [x, y, z] = s.origin;
                expect(s.axis === "x" ? x : z, s.title).toBe(s.at);
                expect(y! < 0 && (s.axis === "x" ? z! > 0 : x! > 0), `${s.title} : ${s.origin}`).toBe(true);
            }
        });

        it("fills every field of the template with what the sheet prints", () =>
        {
            const fields = editable(sheetTemplate(p));
            expect(fields.length).toBeGreaterThan(15);
            const wanted = new Set(fields);
            for (const pg of pages)
            {
                expect(new Set(Object.keys(pg.fields ?? {})), pg.title).toEqual(wanted);
                const svg = pageToSvg(pg);
                for (const [k, value] of Object.entries(pg.fields!))
                {
                    if (CONTINUATION.has(k) && value === "")
                    {
                        continue;
                    }
                    expect(value, `${pg.title} : ${k}`).not.toBe("");
                    // Escaped as the sheet writes it
                    const said = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    expect(svg.includes(`>${said}</text>`), `${pg.title} : ${k} "${value}"`).toBe(true);
                }
            }
        });

        it("hands TechDraw every line of the table of each board, its runs on included", () =>
        {
            const rows = [...o.bom.cut, ...o.bom.offSheet];
            for (const row of rows)
            {
                const code = row.code.split(",")[0]!;
                const own = pages.filter((pg) =>
                {
                    return pg.title === `Pièces ${code} (suite)` || (/^Pièces /.test(pg.title)
                        && pg.views?.some((v) => { return v.part === row.parts[0]!.id; }) === true);
                });
                // A sheet holding 2 boards gives each its columns, the first board's first
                const columns = own.flatMap((pg) => { return pg.tables ?? []; });
                const lines = columns.flatMap((c) => { return c.lines; });
                // A board alone with its table in a side column has it narrower : its lines run on otherwise
                const total = columns[0]?.widths.reduce((a, b) => { return a + b; }, 0);
                const wanted = machiningTable(row, row.parts[0]!, total).lines;
                expect(wanted.every((l) => { return lines.some((x) => { return x.join("|") === l.join("|"); }); }),
                       code).toBe(true);
            }
        });
    });
}
