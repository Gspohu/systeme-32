import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { writeFileSync, mkdirSync } from "node:fs";
import { drawingSet, workshopArchive } from "./workshop";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, TITLE_BLOCK_W, frameAndTitle, textWidth,
        type Prim } from "../drawing/display";
import { computeOutputs } from "../outputs";
import { dresser, tvWall } from "../templates";


// every xref entry must piont at the "n 0 obj" line it announces, byte for byte
function checkXref(pdf: Uint8Array): void
{
    const text = strFromU8(pdf, true);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const rows = text.slice(start).split("\n").slice(3);
    let n = 1;
    for (const row of rows)
    {
        const m = /^(\d{10}) 00000 n $/.exec(row);
        if (m === null)
        {
            break;
        }
        const off = Number(m[1]);
        expect(text.slice(off, off + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
        n++;
    }
    expect(n).toBeGreaterThan(5);
}

function entry(names: string[], suffix: string): string
{
    for (const n of names)
    {
        if (n.endsWith(suffix))
        {
            return n;
        }
    }
    throw new Error(`Aucun fichier en ${suffix} dans le dossier d'atelier`);
}


describe("workshop archive", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`builds a consistent package for ${make.name}`, () =>
        {
            const p = make();
            const o = computeOutputs(p);
            const zip = unzipSync(workshopArchive(p, o)); 
            const names = Object.keys(zip);
            const pdf = zip[entry(names, "_plans.pdf")]!;
            expect(strFromU8(pdf.slice(0, 8), true)).toBe("%PDF-1.4");
            checkXref(pdf);
            const dxfs: string[] = [];
            for (const n of names)
            {
                if (n.startsWith("dxf/"))
                {
                    dxfs.push(n);
                }
            }
            expect(dxfs.length).toBe(o.bom.cut.length + o.bom.offSheet.length);
            for (const d of dxfs)
            {
                const t = strFromU8(zip[d]!, true);
                expect(t.startsWith("0\nSECTION")).toBe(true);
                expect(t.trimEnd().endsWith("0\nEOF")).toBe(true);
            }
            // TextDecoder drops a leading byte order mark : the raw UTF-8 bytes are wat holds it
            const csv = zip[entry(names, "_fiche_de_debit.csv")]!;
            expect([...csv.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
            const pbs = JSON.parse(strFromU8(zip[entry(names, ".json")]!));
            expect(pbs.root.code).toBe("#000-000");
            if (process.env.S32_DUMP !== undefined)
            {
                mkdirSync(process.env.S32_DUMP, { recursive: true });
                writeFileSync(`${process.env.S32_DUMP}/${make.name}.pdf`, pdf);
                writeFileSync(`${process.env.S32_DUMP}/${make.name}_${dxfs[0]!.slice(4)}`, zip[dxfs[0]!]!);
            }
        });


        it(`keeps every sheet of ${make.name} clear of its title block`, () =>
        {
            const p = make();
            const pages = drawingSet(p, computeOutputs(p));
            // the title block draws itself last : what it adds is left out of the search
            const probe = new Canvas();
            frameAndTitle(probe, { project: "", title: "", date: "", scale: "", index: 1, count: 1, revision: "",
                                   identification: "" });
            const [bx, by] = [A3.w - MARGIN - TITLE_BLOCK_W, A3.h - MARGIN - TITLE_BLOCK_H];
            const inside: string[] = [];
            for (const page of pages)
            {
                for (const q of page.prims.slice(0, -probe.prims.length))
                {
                    const [x0, y0, x1, y1] = extent(q);
                    if (x1 > bx + 0.2 && y1 > by + 0.2 && x0 < A3.w - MARGIN && y0 < A3.h - MARGIN)
                    {
                        inside.push(`${page.title} : ${q.k}${q.k === "text" ? ` ${q.t} ` : ""}`);
                    }
                }
            }
            expect(inside).toEqual([]);
        });
    }
});


// Page box of a primitive, a text taken at its average glyph width
function extent(q: Prim): [number, number, number, number]
{
    if (q.k === "line")
    {
        return [Math.min(q.x1, q.x2), Math.min(q.y1, q.y2), Math.max(q.x1, q.x2), Math.max(q.y1, q.y2)];
    }
    if (q.k === "rect")
    {
        return [q.x, q.y, q.x + q.w, q.y + q.h];
    }
    if (q.k === "circle")
    {
        return [q.x - q.r, q.y - q.r, q.x + q.r, q.y + q.r];
    }
    if (q.k === "poly")
    {
        const xs = q.pts.map((pt) =>
        {
            return pt[0];
        });
        const ys = q.pts.map((pt) =>
        {
            return pt[1];
        });
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    const w = textWidth(q.t, q.size);
    if (q.rot === 90)
    {
        return [q.x - q.size, q.y - w, q.x, q.y];
    }
    const x0 = q.anchor === "start" ? q.x : q.anchor === "middle" ? q.x - w / 2 : q.x - w;
    return [x0, q.y - q.size * 0.8, x0 + w, q.y + q.size * 0.2];
}


describe("nesting sheets", () =>
{
    it("are marked for the screen to pick, three panels a sheet", () =>
    {
        for (const make of [tvWall, dresser])
        {
            const p = make();
            const o = computeOutputs(p);
            const marked = drawingSet(p, o).filter((page) =>
            {
                return page.kind === "nesting";
            });
            expect(o.nesting.sheets.length).toBeGreaterThan(0);
            expect(marked.length, make.name).toBe(Math.ceil(o.nesting.sheets.length / 3));
        }
    });
});


describe("cover", () =>
{
    it("states the shelf test load the deflection was checked under", () =>
    {
        const p = tvWall();
        p.settings.shelfLoad = 1.5;
        const cover = drawingSet(p, computeOutputs(p))[0]!;
        const text = cover.prims.filter((q) =>
        {
            return q.k === "text";
        }).map((q) =>
        {
            return q.k === "text" ? q.t : "";
        }).join(" ");
        expect(text).toContain("0,5 % de la portée sous 1,5 kg/dm², Cuisine et salle de bains (UNI 11663)");
    });
});


describe("title block", () =>
{
    it("is 180 wide and holds its longest fields inside their own cells", () =>
    {
        const c = new Canvas();
        frameAndTitle(c, { project: "Vaisselier de la salle à manger, côté fenêtre", title: "Gamme de montage (suite)",
                           date: "31/12/2026", scale: "1:100", index: 99, count: 99, revision: "FFFFFF",
                           identification: "S32-ABCDEFGHIJKL" });
        // ISO 7200:2004 § 6
        expect(TITLE_BLOCK_W).toBe(180);
        const [bx, by] = [A3.w - MARGIN - TITLE_BLOCK_W, A3.h - MARGIN - TITLE_BLOCK_H];
        // the sheet frame comes first, the block is everything after it
        const block = c.prims.slice(1);
        const walls = block.filter((q) =>
        {
            return q.k === "line" && q.x1 === q.x2 && q.x1 > bx + 0.1;
        }).map((q) =>
        {
            return extent(q)[0];
        });
        const out: string[] = [];
        for (const q of block)
        {
            const [x0, y0, x1, y1] = extent(q);
            const crossed = q.k === "text" && walls.some((wx) =>
            {
                return wx > x0 && wx < x1;
            });
            if (x0 < bx - 0.01 || x1 > bx + TITLE_BLOCK_W + 0.01 || y0 < by - 0.01 || crossed)
            {
                out.push(`${q.k}${q.k === "text" ? ` ${q.t}` : ""} ${x0.toFixed(1)}..${x1.toFixed(1)} ${y1.toFixed(1)}`);
            }
        }
        expect(walls.length).toBe(3);
        expect(out).toEqual([]);
    });
});
