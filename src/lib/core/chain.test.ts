import { describe, expect, it } from "vitest";
import { Canvas, textWidth } from "./drawing/display";
import { chain } from "./drawing/plan";
import { composition } from "./drawing/views"; 
import { analyse } from "./analysis";
import { tvWall } from "./templates";

type Text = Extract<Canvas["prims"][number], { k: "text" }>;

function textsOf(prims: Canvas["prims"]): Text[]
{
    return prims.filter((x): x is Text =>
    {
        return x.k === "text";
    });
}

function wordsOf(texts: Text[]): string[]
{
    return texts.map((t) =>
    {
        return t.t;
    });
}


// the box a fiure need on the sheet, a vertical one turned a quarter
function extent(t: Text): [number, number, number, number]
{
    const w = textWidth(t.t, t.size);
    return t.rot === 90 ? [t.x - t.size, t.y - w / 2, t.x, t.y + w / 2] : [t.x - w / 2, t.y - t.size, t.x + w / 2, t.y];
}


function overlapping(texts: Text[]): string[]
{
    const out: string[] = [];
    texts.forEach((a, i) =>
    {
        const [ax0, ay0, ax1, ay1] = extent(a);
        for (const b of texts.slice(i + 1))
        {
            const [bx0, by0, bx1, by1] = extent(b);
            if (ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1)
            {
                out.push(`${a.t} / ${b.t}`);
            }
        }
    });
    return out;
}


describe("chains of dimensions", () =>
{
    // the right of the TV compositon at 1:20 : 600 of low unit, 19, 31 and 14 up to the column, 286 to the screen
    for (const dir of ["v", "h"] as const)
    {
        it(`never prints a figure over another, ${dir === "v" ? "standing" : "lying"}`, () =>
        {
            const canvas = new Canvas();
            chain(canvas, [0, 600, 619, 650, 664, 950], (v) =>
            {
                return 300 - v / 20;
            }, 100, 107, dir);
            const texts = textsOf(canvas.prims);
            expect(wordsOf(texts).sort()).toEqual(["14", "19", "286", "31", "600"]);
            expect(overlapping(texts)).toEqual([]);
        });
    }


    it("marks an appliance whose name is wider than it, and names it in the legend", () =>
    {
        const p = tvWall();
        const texts = wordsOf(textsOf(composition(p, analyse(p)).canvas.prims));
        expect(texts.filter((t) =>
        {
            return t.includes("...");
        })).toEqual([]);
        expect(texts.join("\n")).toMatch(/Repères : .*Freebox Server mini 4K/);
    });
});
