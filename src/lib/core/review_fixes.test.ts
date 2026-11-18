import { describe, expect, it } from "vitest";
import { analyse, noteHousingsUnderRunners } from "./analysis";
import { computeOutputs } from "./outputs";
import { cadModel, screwPlaces } from "./io/cad_model";
import { at } from "./geometry";
import { dresser, tvWall } from "./templates";
import type { GammeTable } from "./io/gamme";


function gammeOf(make: typeof tvWall): GammeTable[]
{
    const p = make();
    return (cadModel(p, computeOutputs(p), true) as { gamme: GammeTable[] }).gamme;
}


describe("corrections de la revue des deux meubles", () =>
{
    it("perce à l'atelier l'avant-trou de chaque vis de façade de tiroir et cote la pose du caisson", () =>
    {
        const b = analyse(tvWall()).build;
        const ends = b.parts.filter((q) => { return q.holes.some((h) => { return h.purpose === "front-screw" &&
            h.diameter !== 2.5; }); });
        expect(ends.length).toBeGreaterThan(0);
        for (const end of ends)
        {
            const screws = end.holes.filter((h) => { return h.purpose === "front-screw"; });
            for (const s of screws)
            {
                const p = at(end.frame!, s.u, s.v, end.thickness);
                const hit = b.parts.some((q) =>
                {
                    return q.role === "drawerFront" && q.holes.some((h) =>
                    {
                        if (!/façade : avant-trou/.test(h.label))
                        {
                            return false;
                        }
                        const f = q.frame!;
                        const d = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
                        const [u, v] = [f.u, f.v].map((a) => { return d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2]; });
                        return Math.abs(h.u - u!) < 0.5 && Math.abs(h.v - v!) < 0.5 && h.diameter === 2.5;
                    });
                });
                expect(hit).toBe(true);
            }
        }
        const fronts = b.parts.filter((q) => { return q.holes.some((h) => { return /façade : avant-trou/.test(h.label); }); });
        expect(fronts.length).toBeGreaterThan(0);
        expect(fronts.every((q) => { return q.notes.some((n) => { return /avant du caisson à .* des chants l1 et l2/.test(n); }); }))
            .toBe(true);
        expect(b.parts.some((q) => { return q.notes.some((n) => { return /sans pré-perçage/.test(n); }); })).toBe(false);
    });

    it("ne place aucune vis de plus sur l'avant-trou percé pour elle dans la pièce qui la reçoit", () =>
    {
        for (const make of [tvWall, dresser])
        {
            const places = screwPlaces(analyse(make()).build.parts);
            expect(places.filter((s) => { return /avant-trou/.test(s.label); })).toEqual([]);
        }
    });

    it("serre aux serre-joints un tiroir collé, jamais un caisson tiré par ses Minifix", () =>
    {
        const tables = gammeOf(tvWall);
        const drawer = tables.find((t) => { return /^Tiroir/.test(t.name); })!;
        expect(drawer.rows.some((r) => { return r.type === "Serrage" && /serre-joints/.test(r.operation); })).toBe(true);
        const minifix = tables.filter((t) => { return t.rows.some((r) => { return /Minifix/.test(r.operation) &&
            r.type === "Serrage"; }); });
        expect(minifix.length).toBeGreaterThan(0);
        expect(minifix.some((t) => { return t.rows.some((r) => { return /serre-joints/.test(r.operation); }); })).toBe(false);
    });

    it("dit de déposer la coulisse pour desserrer un Minifix qu'elle couvre", () =>
    {
        const b = analyse(tvWall()).build;
        const under = /Minifix sous la coulisse/;
        // No housing of this wall lies under a runner : the note stay away
        expect(b.parts.some((q) => { return q.notes.some((n) => { return under.test(n); }); })).toBe(false);
        const runner = b.fitted.find((f) => { return f.purpose === "runner"; })!;
        const board = b.parts.find((q) =>
        {
            return q.item === runner.item && q.role === "vdivider" && q.holes.some((h) => { return h.purpose === "minifix-housing"; });
        })!;
        const f = board.frame!;
        const d = [0, 1, 2].map((k) => { return runner.centre[k]! - f.o[k]!; });
        const [u, v, n] = [f.u, f.v, f.n].map((a) => { return d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2]; });
        const housing = board.holes.find((h) => { return h.purpose === "minifix-housing"; })!;
        board.holes.push({ ...housing, u: u!, v: v!, face: n! > board.thickness / 2 ? "B" : "A" });
        noteHousingsUnderRunners(runner.item, b);
        expect(board.notes.filter((x) => { return under.test(x); })).toHaveLength(1);
    });

    it("clipse les pieds des colonnes du vaisselier une fois relevées, pas ceux du meuble bas TV", () =>
    {
        const whole = gammeOf(dresser).at(-1)!.rows;
        const late = whole.filter((r) => { return /Poser les pieds une fois le meuble relevé/.test(r.operation); });
        expect(late.length).toBeGreaterThan(0);
        expect(late.every((r) => { return /#[17]00/.test(r.pbs.join(" ")); })).toBe(true);
        expect(gammeOf(tvWall).at(-1)!.rows.some((r) => { return /une fois le meuble relevé/.test(r.operation); })).toBe(false);
    });

    it("dit qu'une porte arrêtée par le mur est un choix volontaire", () =>
    {
        const all = gammeOf(tvWall).flatMap((t) => { return t.rows; });
        expect(all.some((r) => { return /elle touche le mur .* choix volontaire, modifiable sur demande/.test(r.comment); }))
            .toBe(true);
    });
});
