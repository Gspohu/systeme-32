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

    // A drawer was built inside its carcass board by board : it's built on the bench and fitted whole
    it("builds each drawer and door on the bench before the carcass it goes into", () =>
    {
        const codes = m.gamme.map((t) => { return t.code; });
        const subs = codes.filter((c) => { return /^#[0-9A-Z][1-9A-Z]0$/.test(c); });
        expect(subs.length).toBeGreaterThan(0);
        for (const c of subs)
        {
            expect(codes.indexOf(c)).toBeLessThan(codes.indexOf(`${c.slice(0, 2)}00`));
        }
    });


    // Coded #130 a drawer part still landed in the table of #100 : its code alone said nothing of the table
    it("lays each board in the table of its own code, a drawer part in its drawer and not in the carcass", () =>
    {
        for (const t of m.gamme.filter((x) => { return x.code !== "#000"; }))
        {
            for (const r of t.rows.filter((x) => { return !/-000$/.test(x.pbs[0]!); }))
            {
                for (const x of r.pbs.filter((s) => { return /^#[0-9A-Z]{3}-\d{3} /.test(s); }))
                {
                    expect(`${t.code} : ${x}`).toMatch(new RegExp(`^${t.code} : ${t.code}-`));
                }
            }
        }
        // And each table of the bench holds something to build
        for (const t of m.gamme.filter((x) => { return /^#[0-9A-Z][1-9A-Z]0$/.test(x.code); }))
        {
            expect(t.rows.length).toBeGreaterThan(0);
        }
    });


    it("fits each drawer whole once its runners are on", () =>
    {
        for (const t of m.gamme.filter((x) => { return /^#[0-9A-Z]00$/.test(x.code) && x.code !== "#000"; }))
        {
            const runners = t.rows.map((r, k) => { return { r, k }; })
                .filter((x) => { return x.r.pbs.some((s) => { return s.startsWith("760H"); }); });
            const poses = t.rows.map((r, k) => { return { r, k }; })
                .filter((x) => { return /^#[0-9A-Z][1-9A-Z]0-000$/.test(x.r.pbs[0]!) && x.r.type === "Clipsage" &&
                                x.r.direction === "+y"; });
            for (const pose of poses)
            {
                expect(pose.k).toBeGreaterThan(Math.max(-1, ...runners.map((x) => { return x.k; })));
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
        // One setting in place per item, a check on a whole item being no step of its own
        expect(m.gamme.find((t) => { return t.code === "#000"; })!.rows.filter((r) =>
        {
            return /-000$/.test(r.pbs[0]!) && r.type === "Mise en place";
        }).length)
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


describe("the drop-down flap of the dresser built on the bench", () =>
{
    const p = dresser();
    const m = cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] };
    const rowsOf = (pattern: RegExp) =>
    {
        return m.gamme.flatMap((t) => { return t.rows.filter((r) => { return r.pbs.some((s) => { return pattern.test(s); }); })
            .map((r) => { return { t: t.code, r }; }); });
    };

    it("screws both halves of its hinges in the table of the flap, the flap then screwed in whole", () =>
    {
        const halves = rowsOf(/^342\.78\.700/);
        expect(halves.length).toBeGreaterThan(0);
        const table = halves[0]!.t;
        expect(halves.every((x) => { return x.t === table; })).toBe(true);
        expect(table).toMatch(/^#[0-9A-Z][1-9A-Z]0$/);
        const pose = rowsOf(new RegExp(`^${table}-000$`));
        expect(pose.map((x) => { return [x.r.type, x.r.direction]; })).toEqual([["Vissage", "Spécial"]]);
    });

    it("keeps the spacers of the inner drawer in the carcass, the drawer itself on the bench", () =>
    {
        const spacers = rowsOf(/Cale de coulisse/);
        expect(spacers.length).toBeGreaterThan(0);
        expect(spacers.every((x) => { return /^#[0-9A-Z]00$/.test(x.t); })).toBe(true);
        const inner = rowsOf(/Tiroir intérieur 1, fond/);
        expect(inner.every((x) => { return /^#[0-9A-Z][1-9A-Z]0$/.test(x.t); })).toBe(true);
    });
});


describe("the heights the TV wall is set to on site", () =>
{
    const p = tvWall();
    const rows = (cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] }).gamme.at(-1)!.rows;

    it("says the room left over the column with the cleat of its filler already on its top", () =>
    {
        const column = rows.find((r) => { return /Mettre en place .* Colonne gauche$/.test(r.operation); })!;
        expect(column.direction).toBe("-z puis +y");
        expect(column.comment).toContain(": 6 mm sous le plafond, tasseau du fileur compris");
    });

    it("measures the top of the book column before drilling for the shelf screwed onto it", () =>
    {
        const measures = rows.filter((r) => { return r.type === "Contrôle"; });
        expect(measures).toHaveLength(1);
        const books = rows.find((r) => { return /Mettre en place .* Colonne à livres$/.test(r.operation); })!;
        expect(measures[0]!.pbs).toEqual(books.pbs);
        expect(measures[0]!.operation).toBe(`Mesurer la hauteur réelle du dessus de ${books.pbs[0]} Colonne à livres, `
            + "posé et réglé");
        const k = rows.indexOf(measures[0]!);
        expect(k).toBeGreaterThan(rows.indexOf(books));
        // The shelf laid onto that top is the first one hung after the check
        const shelf = rows.slice(k).find((r) => { return /Mettre en place .* Étagère murale$/.test(r.operation); })!;
        const drilled = rows.findIndex((r) =>
        {
            return r.type === "Cheville" && r.operation.includes(`${shelf.pbs[0]!.slice(0, 4)}-`);
        });
        expect(drilled).toBe(k + 1);
    });
});
