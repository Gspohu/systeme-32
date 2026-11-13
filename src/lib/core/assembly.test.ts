import { describe, expect, it } from "vitest";
import { assemblySequences } from "./assembly";
import { computeOutputs } from "./outputs";
import { dresser, tvWall } from "./templates";


function sequences(make: typeof dresser): ReturnType<typeof assemblySequences>
{
    const p = make();
    const o = computeOutputs(p);
    return assemblySequences(p, o.analysis, o.bom);
}


function text(s: ReturnType<typeof assemblySequences>[number]): string
{
    return s.steps.map((st) =>
    {
        return `${st.title}\n${st.lines.join("\n")}`;
    }).join("\n");
}


describe("assembly sequences", () =>
{
    for (const make of [tvWall, dresser])
    {
        it(`gives every part and every hardware line of ${make.name} a named step`, () =>
        {
            for (const s of sequences(make))
            {
                expect(s.steps.map((st) =>
                {
                    return st.title;
                })).not.toContain("Autres quincailleries");
                expect(s.steps.map((st) =>
                {
                    return st.title;
                })).not.toContain("Autres pièces");
            }
        });

        // The hinges of a door built on the bench came back in the step that hangs it : twice the bill
        it(`lists the hinges and pulls of ${make.name} once, as many as the bill holds`, () =>
        {
            const p = make();
            const o = computeOutputs(p);
            for (const s of assemblySequences(p, o.analysis, o.bom))
            {
                const mine = o.analysis.build.hardware.filter((x) => { return x.item === s.item &&
                                                                      x.partner === undefined; });
                // A screw serves several purposes, the runners take 609.1500 too : every line of the reference counts
                const refs = new Set(mine.filter((x) =>
                {
                    return ["hinge", "flap-hinge", "handle", "cup-screw"].includes(x.purpose);
                }).map((x) => { return x.ref; }));
                const bill = new Map<string, number>();
                for (const h of mine.filter((x) => { return refs.has(x.ref); }))
                {
                    bill.set(h.ref, (bill.get(h.ref) ?? 0) + h.qty);
                }
                const said = s.steps.flatMap((st) => { return st.lines; });
                for (const [ref, n] of bill)
                {
                    const re = new RegExp(`^(\\d+) x .*${ref.replace(/[.]/g, "\\.")} `);
                    const listed = said.reduce((sum, l) => { return sum + Number(re.exec(l)?.[1] ?? 0); }, 0);
                    expect(`${s.name} ${ref} : ${listed}`).toBe(`${s.name} ${ref} : ${n}`);
                }
            }
        });
    }


    it("puts the dresser up floor first, and each link with the second carcass of the pair", () =>
    {
        const all = sequences(dresser);
        expect(all.map((s) =>
        {
            return s.name;
        })).toEqual(["Colonne gauche", "Placards et tiroirs", "Niche", "Placards hauts", "Colonne droite",
                     "Petite colonne gauche", "Petite colonne droite"]);
        const of = (name: string): string =>
        {
            return text(all.find((s) =>
            {
                return s.name === name;
            })!);
        };
        expect(of("Niche")).toContain("4 vis 4 x 30 depuis l'intérieur du caisson fermé : Colonne gauche et Niche");
        expect(of("Colonne gauche")).not.toContain("Niche, 38 mm");
        // Seven hinges, their plates pushed into the line before the box stands
        expect(of("Colonne gauche")).toContain("7 embases 174H7100E enfoncées dans les trous de la série");
        // 3 drawers and the pull-out behind the flap, 10 screws each
        expect(of("Placards et tiroirs")).toContain("40 x Blum 609.1500 Vis agglo Ø3,5 x 15, coulisses vissées");
    });


    it("screws the heavy 766H runners on the panels before the box stands, like the 760H", () =>
    {
        // The TV base is too shallow for the shortest 766H (NL 450), the dresser drawers take 766H4500S
        const p = dresser();
        let drawers = 0;
        for (const it of p.items)
        {
            for (const f of it.kind === "carcass" ? it.fronts : [])
            {
                if (f.spec.type === "drawers")
                {
                    f.spec.runner = "766H";
                    drawers++;
                }
            }
        }
        expect(drawers).toBeGreaterThan(0);
        const o = computeOutputs(p);
        const steps = assemblySequences(p, o.analysis, o.bom).flatMap((s) =>
        {
            return s.steps;
        });
        const said = (title: string): string =>
        {
            return steps.filter((st) =>
            {
                return st.title === title;
            }).flatMap((st) =>
            {
                return st.lines;
            }).join("\n");
        };
        expect(said("Préparer les panneaux")).toContain("766H");
        expect(said("Tiroirs")).not.toContain("766H");
    });


    it("puts the Clamex connectors in a named step when the carcasses are joined with them", () =>
    {
        const p = dresser();
        p.settings.joinery = "clamex";
        const o = computeOutputs(p);
        const all = assemblySequences(p, o.analysis, o.bom);
        expect(all.flatMap((s) =>
        {
            return s.steps;
        }).filter((st) =>
        {
            return st.title === "Préparer les panneaux";
        }).flatMap((st) =>
        {
            return st.lines;
        }).join("\n")).toContain("145334");
        for (const s of all)
        {
            expect(s.steps.map((st) =>
            {
                return st.title;
            })).not.toContain("Autres quincailleries");
        }
    });


    it("puts the Minifix housings in the faces, and an open rounded end out of flat shaped panels", () =>
    {
        const all = sequences(tvWall).map(text).join("\n"); 
        // Dowels do go into the edges, the housnigs don't
        expect(all).toContain("posés dans les faces, flèche vers le chant");
        expect(all).not.toContain("dans leurs chants");
        expect(all).toContain("boîtiers Minifix dans leurs faces");
        expect(all).toContain("flasques et tablettes découpées");
        expect(all).not.toContain("galbées");
        expect(all).not.toContain("gabarits"); 
    });
});
