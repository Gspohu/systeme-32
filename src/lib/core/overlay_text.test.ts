import { describe, expect, it } from "vitest";
import { inkBox, type Prim } from "./drawing/display";
import { overlaySvg } from "./drawing/svg";
import { computeOutputs } from "./outputs";
import { drawingSet } from "./io/workshop";
import { tvWall } from "./templates";

// TechDraw anchors the texts of its symbols on a width of its own, half as wide again as the glyphs it hold : a
// centerd 65 between its extension lines ran 0.63 mm into the left one


type Text = Extract<Prim, { k: "text" }>;

const NUM = String.raw`([-\d.]+)`;
const TEXT = new RegExp(String.raw`<text x="${NUM}" y="${NUM}"[^>]*font-size="${NUM}" text-anchor="(\w+)"[^>]*?`
    + String.raw`(?: transform="rotate\(-90 ${NUM} ${NUM}\)")?>([^<]*)<\/text>`, "g");


// The texts of an overlay read back as prims, each with its anchor
function readBack(svg: string): Text[]
{
    const out: Text[] = [];
    for (const m of svg.matchAll(TEXT))
    {
        const rot = m[5] === undefined ? 0 : 90;
        if (rot === 90)
        {
            // Turned round its own point, never round another
            expect(Number(m[5])).toBeCloseTo(Number(m[1]), 3);
            expect(Number(m[6])).toBeCloseTo(Number(m[2]), 3);
        }
        out.push({ k: "text", x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), anchor: m[4] as Text["anchor"],
                   t: m[7]!, bold: false, rot });
    }
    return out;
}


describe("the texts of an overlay", () =>
{
    const asked: Text[] = [
        { k: "text", x: 84.63, y: 72.76, t: "65", size: 2.2, anchor: "middle", bold: false, rot: 0 },
        { k: "text", x: 336.4, y: 73.07, t: "39", size: 2.2, anchor: "middle", bold: false, rot: 90 },
        { k: "text", x: 120, y: 40, t: "B12", size: 2, anchor: "end", bold: false, rot: 0 },
        { k: "text", x: 60, y: 90, t: "1250", size: 2.5, anchor: "end", bold: false, rot: 90 },
        { k: "text", x: 15, y: 20, t: "Note", size: 2.4, anchor: "start", bold: false, rot: 0 },
    ];

    it("go out written from their start, their ink where the sheet reckoned it", () =>
    {
        const back = readBack(overlaySvg(asked, 420, 297));
        expect(back.length).toBe(asked.length);
        asked.forEach((q, i) =>
        {
            const r = back[i]!;
            expect(r.anchor, q.t).toBe("start");
            const [want, got] = [inkBox([q])!, inkBox([r])!];
            for (const key of ["x", "y", "w", "h"] as const)
            {
                expect(got[key], `${q.t} ${key}`).toBeCloseTo(want[key], 2);
            }
        });
    });

    it("never anchor a text of a delivered sheet on its middle or its end", () =>
    {
        const p = tvWall();
        const pages = drawingSet(p, computeOutputs(p));
        const anchored = pages.flatMap((pg) =>
        {
            const svg = pg.marks === undefined ? "" : overlaySvg(pg.marks, pg.w, pg.h);
            return [...svg.matchAll(/text-anchor="(middle|end)"[^>]*>([^<]*)</g)].map((m) =>
            {
                return `${pg.title} : ${m[2]}`;
            });
        });
        expect(anchored).toEqual([]);
    });
});
