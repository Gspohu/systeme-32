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
    }


    it("puts the dresser up floor first, and each link with the second carcass of the pair", () =>
    {
        const all = sequences(dresser);
        expect(all.map((s) =>
        {
            return s.name;
        })).toEqual(["Colonne gauche", "Placards et tiroirs", "Colonne droite", "Niche", "Placards hauts"]);
        const of = (name: string): string =>
        {
            return text(all.find((s) =>
            {
                return s.name === name;
            })!);
        };
        expect(of("Niche")).toContain("4 vis de liaison 267.07.903 : Colonne gauche et Niche");
        expect(of("Colonne gauche")).not.toContain("Niche, 38 mm");
        // seven hinges, their plates pushed into the line before the box stands
        expect(of("Colonne gauche")).toContain("7 embases 174H7100E enfoncées dans les trous de la série");
        expect(of("Placards et tiroirs")).toContain("30 x Blum 609.1500 Vis agglo Ø3,5 x 15, coulisses vissées");
    });


    it("screws the heavy 766H runners on the panels before the box stands, like the 760H", () =>
    {
        // the TV base is too shallow for the shortest 766H (NL 450), the dresser drawers take 766H4500S
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
});
