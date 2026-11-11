import { describe, expect, it } from "vitest";
import { computeOutputs } from "../outputs";
import { dresser, tvWall } from "../templates";
import { cadModel } from "./cad_model";
import type { GammeTable } from "./gamme";

// The shell glob the control of the sequence reads a step with : * any run, ? one character, [x] that one
function glob(pattern: string): RegExp
{
    let re = "";
    for (let i = 0; i < pattern.length; i++)
    {
        const c = pattern[i]!;
        if (c === "*")
        {
            re += ".*";
        }
        else if (c === "?")
        {
            re += ".";
        }
        else if (c === "[")
        {
            const end = pattern.indexOf("]", i + 2);
            re += `[${pattern.slice(i + 1, end).replace(/[\\^]/g, "\\$&")}]`;
            i = end;
        }
        else
        {
            re += c.replace(/[.+^${}()|\\]/g, "\\$&");
        }
    }
    return new RegExp(`^${re}$`);
}


// The dresser's sequence isn't sent yet : worked out all the same, to hold to the same rules
for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
{
describe(`the assembly sequence of the ${name}`, () =>
{
    const p = make();
    const m = cadModel(p, computeOutputs(p), true) as
    {
        gamme: GammeTable[];
        parts: { code: string; label: string; bands?: { edge: string }[]; bandInner?: unknown }[];
        instances: { model: string; part: string }[];
        screws: { kind: string; diameter: number; length: number; washer?: boolean; tag: string; label: string }[];
        models: Record<string, { ref: string; label: string }>;
    };
    // Every solid by the label the FreeCAD file gives it (freecad_build.py, freecad_view.py)
    const edgeName: Record<string, string> = { v0: "L1", v1: "L2", u0: "l1", u1: "l2" };
    const solids: string[] = [
        ...m.parts.map((q) => { return `${q.code} ${q.label}`; }),
        // Each edge band a body of its own since 2026-11-08 (freecad_build.py)
        ...m.parts.flatMap((q) => { return (q.bands ?? []).map((b) => { return `${q.code} ${q.label}, chant ${edgeName[b.edge]}`; }); }),
        // A board of another outline, its banding bent around it in one body
        ...m.parts.filter((q) => { return q.bandInner !== null &&
                                  q.bandInner !== undefined; }).map((q) => { return `${q.code} ${q.label}, chant cintré`; }),
        ...m.instances.map((i, k) => { return `${m.models[i.model]!.ref} ${m.models[i.model]!.label} ${k + 1}, ${i.part}`; }),
    ];
    m.screws.forEach((s, k) =>
    {
        if (s.washer === true)
        {
            solids.push(`Rondelle ${k + 1}, ${s.tag}`);
        }
        // The link of a screw is matched by its note, what it holds and where
        solids.push(`${s.label}, ${s.tag}`);
    });

    it("puts each solid of the file in one step and one only", () =>
    {
        const steps = m.gamme.flatMap((t) => { return t.rows.flatMap((r) => { return r.pbs.map((x) => { return { x,
            re: glob(x), t: t.code }; }); }); })
            .filter((s) => { return !/-000$/.test(s.x); });
        const left = solids.filter((l) => { return !steps.some((s) => { return s.re.test(l); }); });
        const twice = solids.filter((l) => { return steps.filter((s) => { return s.re.test(l); }).length > 1; });
        expect(left).toEqual([]);
        expect([...new Set(twice)]).toEqual([]);
    });

    it("screws each Oslo pull right after laying it, with a Phillips bit", () =>
    {
        // Its supplied screws have a plain cross, they went to the last step of all as "other" (2026-11-09)
        const pulls = m.gamme.flatMap((t) =>
        {
            return t.rows.map((r, k) => { return { t: t.code, k, r }; });
        });
        const laid = pulls.filter((x) => { return x.r.pbs.some((s) => { return s.startsWith("84335807"); }); });
        const screwed = pulls.filter((x) => { return x.r.pbs.some((s) => { return s.includes("poignée Oslo"); }); });
        expect(laid.length).toBeGreaterThan(0);
        expect(screwed.map((x) => { return [x.t, x.r.tool, x.r.type]; })).toEqual(laid.map((x) => { return [x.t,
            "Tournevis PH2", "Vissage"]; }));
        for (const [k, x] of screwed.entries())
        {
            expect(x.k).toBeGreaterThan(laid[k]!.k);
        }
    });


    it("counts on each row the solids it names", () =>
    {
        for (const t of m.gamme)
        {
            for (const r of t.rows.filter((x) => { return !/-000$/.test(x.pbs[0]!); }))
            {
                const res = r.pbs.map(glob);
                const n = solids.filter((l) => { return res.some((re) => { return re.test(l); }); }).length;
                expect(`${t.code} ${r.operation} : ${n}`).toBe(`${t.code} ${r.operation} : ${r.count}`);
            }
        }
    });

    it("leaves no cell empty and ends on the whole", () =>
    {
        expect(m.gamme.at(-1)!.code).toBe("#000");
        const empty = m.gamme.flatMap((t) => { return t.rows; }).filter((r) =>
        {
            return [r.type, r.operation, r.tool, r.direction,
                    r.comment].some((c) => { return c.trim() === ""; }) || r.pbs.length === 0;
        });
        expect(empty).toEqual([]);
        expect(m.gamme.find((t) => { return t.code === "#000"; })!.rows.filter((r) => { return /-000$/.test(r.pbs[0]!); }).length)
            .toBe(new Set(p.items.filter((it) => { return it.kind !== "device"; }).map((it) => { return it.id; })).size);
    });
});
}


describe("the light in the way of the small columns of the dresser", () =>
{
    it("goes in once both columns stand, said to be unscrewed to take them out", () =>
    {
        // Screwed and not clipped, the columns slide in under its top before it
        const p = dresser();
        const m = cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] };
        const rows = m.gamme.at(-1)!.rows;
        const at = (re: RegExp): number => { return rows.findIndex((r) => { return re.test(r.operation); }); };
        const profile = at(/Profilé LED/);
        expect(profile).toBeGreaterThan(at(/Mettre en place .* Petite colonne gauche/));
        expect(profile).toBeGreaterThan(at(/Mettre en place .* Petite colonne droite/));
        expect(rows[profile]!.comment).toBe("À dévisser avant de sortir Petite colonne gauche, Petite colonne droite");
        expect(rows[at(/Mettre en place .* Petite colonne gauche/)]!.direction).toBe("+y");
        // And nowhere in the table of the niche, built before the columns go in
        expect(m.gamme.find((t) => { return t.code === "#300"; })!.rows.some((r) => { return /LED/.test(r.operation); })).toBe(false);
    });
});
