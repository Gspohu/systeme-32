import { describe, expect, it } from "vitest";
import { computeOutputs } from "../outputs";
import { dresser, tvWall } from "../templates";
import { PHASE_CHECK, PHASE_DEBIT, PHASE_EDGES, PHASE_EDGE_DRILL, PHASE_FACE_DRILL, PHASE_FINISH, PHASE_MARK,
         fabrication, fabricationCsv, type Fabrication } from "./fabrication";
import { addItem, setDividerFinish, splitCell } from "../commands";
import { DEFAULT_BATTENS, newCarcass, newProject } from "../factory";
import { newPart } from "../part_base";
import { groupBySignature } from "../signature";
import { sawSize } from "../bom";
import type { Carcass, End } from "../model";
import { decorById } from "../../data/materials";
import type { Edge } from "../part_types";
import type { PbsNode } from "../bom";


const PROJECTS = [{ name: "composition TV", make: tvWall }, { name: "vaisselier", make: dresser }];

// The count a drilling spec give, "8 x face A : ..." summed over its groups
function counted(spec: string | undefined): number
{
    return (spec ?? "").split(" ; ").reduce((s, g) => { return s + (Number(/^(\d+) x /.exec(g)?.[1]) || 0); }, 0);
}


// Every machine or tool word met in the route and the supplies, plurals included. A part's own name is left out : the
// shaped boards of a rounded end are called "Gabarit 1", "Gabarit 2"
const MEANS = new RegExp("\\b(CNC|CN|commandes? numériques?|Zeta|scies?|perceuses?|défonceuses?|plaqueuses?|"
    + "toupies?|forets?|fraises?|Pozidriv|PZ\\d|tournevis|gabarits?)\\b", "i");

const CLAMEX_EDGE = /P-14 dans le chant/;

function neutral(f: Fabrication): string[]
{
    const said = [
        ...f.routes.flatMap((r) =>
        {
            return r.steps.map((s) => { return `${s.title} ${s.spec} ${s.why}`.split(r.label).join(""); });
        }),
        ...f.supplies.map((s) => { return `${s.label} ${s.note}`; }),
    ];
    return said.filter((t) => { return MEANS.test(t); });
}


describe.each(PROJECTS)("gamme de fabrication du $name", ({ make }) =>
{
    const o = computeOutputs(make());
    const f = fabrication(o.bom, o.nesting);
    const rows = [...o.bom.cut, ...o.bom.offSheet];

    it("donne une route à chaque pièce débitée, du débit au marquage", () =>
    {
        expect(f.routes.map((r) => { return r.code; })).toEqual(rows.map((r) => { return r.code; }));
        for (const r of f.routes)
        {
            const phases = r.steps.map((s) => { return s.phase; });
            expect(phases[0]).toBe(PHASE_DEBIT);
            expect([phases.at(-2), phases.at(-1)]).toEqual([PHASE_CHECK, PHASE_MARK]);
        }
    });

    it("compte chaque perçage réel une fois, sans les positions de vis Ø0", () =>
    {
        expect(rows.some((r) => { return r.parts[0]!.holes.some((h) => { return h.diameter === 0; }); })).toBe(true);
        for (const [k, r] of rows.entries())
        {
            const holes = r.parts[0]!.holes.filter((h) => { return h.diameter > 0; });
            const steps = f.routes[k]!.steps;
            const face = steps.find((s) => { return s.phase === PHASE_FACE_DRILL; })?.spec;
            const edge = steps.find((s) => { return s.phase === PHASE_EDGE_DRILL; })?.spec;
            expect(counted(face) + counted(edge)).toBe(holes.length);
            expect(`${face ?? ""}${edge ?? ""}`).not.toMatch(/Ø0 /);
        }
    });

    it("perce un chant plaqué après son placage, et rien n'attend une phase absente ou postérieure", () =>
    {
        let throughBand = 0;
        for (const [k, r] of rows.entries())
        {
            const steps = f.routes[k]!.steps;
            const banded = r.parts[0]!.holes.some((h) =>
            {
                return h.diameter > 0 && h.face !== "A" && h.face !== "B" && r.edges.includes(h.face as Edge);
            });
            if (banded)
            {
                throughBand++;
                expect(steps.find((s) => { return s.phase === PHASE_EDGE_DRILL; })!.after).toContain(PHASE_EDGES);
            }
            steps.forEach((s, i) =>
            {
                const earlier = steps.slice(0, i).map((x) => { return x.phase; });
                for (const a of s.after)
                {
                    expect(earlier).toContain(a);
                }
            });
        }
        expect(throughBand).toBeGreaterThan(0);
    });

    it("reste neutre : aucune machine ni aucun outil nommé", () =>
    {
        expect(neutral(f)).toEqual([]);
    });

    it("commande les plaques du calepinage, les chants et toute la quincaillerie", () =>
    {
        const plates = f.supplies.filter((s) => { return s.unit === "plaque"; });
        expect(plates.reduce((n, s) => { return n + Number(s.qty); }, 0)).toBe(o.nesting.sheets.length);
        const made = o.bom.hardware.filter((h) => { return h.made; });
        expect(made.map((h) => { return h.id; })).toContain("EDGE_CAP");
        const bought = f.supplies.filter((s) => { return s.kind === "Quincaillerie"; });
        expect(bought.length).toBe(o.bom.hardware.length - made.length);
        expect(bought.some((s) => { return s.ref === "Atelier"; })).toBe(false);
        // The PBS says the same : cut in the workshop, not bought on the shelf
        const nodes = (n: PbsNode): PbsNode[] => { return [n, ...n.children.flatMap(nodes)]; };
        const cap = nodes(o.bom.pbs).filter((n) => { return n.manufacturer_ref === "Atelier"; });
        expect(cap.length).toBeGreaterThan(0);
        expect(cap.every((n) => { return n.fab_source === "interne"; })).toBe(true);
        // Split by board thickness, the banding still adds up to the bill's, worked out the other way
        const metres = (q: string): number => { return Number(q.replace(",", ".")); };
        const bands = f.supplies.filter((s) => { return s.kind === "Chant"; });
        expect(bands.length).toBeGreaterThanOrEqual(o.bom.edges.length);
        // The board's reference is no banding's : the 8685 white is banded with an Egger W1000
        const boardRefs = new Set(o.bom.cut.map((r) => { return decorById(r.decor).ref; }));
        expect(bands.every((s) => { return !boardRefs.has(s.ref) && / pour panneau de \d+/.test(s.label); })).toBe(true);
        expect(bands.reduce((m, s) => { return m + metres(s.qty); }, 0))
            .toBeCloseTo(o.bom.edges.reduce((m, e) => { return m + e.metres; }, 0), 0);
    });

    it("écrit une ligne de CSV par phase", () =>
    {
        const csv = fabricationCsv(f);
        const steps = f.routes.reduce((n, r) => { return n + r.steps.length; }, 0);
        expect(csv.route.trimEnd().split("\r\n").length).toBe(1 + steps);
        expect(csv.supplies.trimEnd().split("\r\n").length).toBe(1 + f.supplies.length);
    });

    it("garde la surlargeur d'un fileur jusqu'au contrôle", () =>
    {
        const scribed = f.routes.filter((r, k) => { return (rows[k]!.scribe ?? 0) > 0; });
        expect(scribed.length).toBeGreaterThan(0);
        for (const r of scribed)
        {
            const row = rows.find((x) => { return x.code === r.code; })!;
            const wide = String(Math.round((row.width + row.scribe!) * 10) / 10).replace(".", ",");
            expect(r.steps.find((s) => { return s.phase === PHASE_CHECK; })!.spec).toContain(`x ${wide}`);
        }
    });
});


// One carcass alone in a project
function alone(c: Carcass): ReturnType<typeof computeOutputs>
{
    return computeOutputs(addItem(newProject("essai"), c));
}


// A cabinet with one adjsutable shelf, its finish given
function cabinet(decor: string, colour: string | null): ReturnType<typeof computeOutputs>
{
    let p = addItem(newProject("vitrine"), newCarcass({ name: "Vitrine", width: 600, height: 800, depth: 400 }));
    const c = p.items[0] as Carcass;
    p = splitCell(p, c.id, c.root.id, "h", 371, "adjustable");
    const k = p.items[0] as Carcass;
    return computeOutputs(setDividerFinish(p, k.id, k.root.id, 0, { decor, colour }));
}


// TODO no project here has a groove or a pocket running out into a banded edge : the wait for the band it cuts is
// writen in fabrication.ts and never seen by a test
describe("gamme de fabrication, cas que les deux meubles n'ont pas", () =>
{
    it("perce le logement de la charnière d'abattant après le placage du chant qu'il entame", () =>
    {
        const o = computeOutputs(dresser());
        const f = fabrication(o.bom, o.nesting);
        const flap = f.routes.find((r) => { return /^Abattant tombant/.test(r.label); })!;
        expect(flap.steps.find((s) => { return s.phase === PHASE_FACE_DRILL; })!.spec).toContain("Ø26");
        expect(flap.steps.find((s) => { return s.phase === PHASE_FACE_DRILL; })!.after).toContain(PHASE_EDGES);
    });

    it("débite le dessus sous rampant assez long pour sa face B", () =>
    {
        // A decor that give its band thickness, else the saw size is left to the cabinet maker
        const o = alone(newCarcass({ name: "Comble", width: 1038, height: 2000, depth: 500, decor: "U604_ST9",
                                     slope: { low: "left", height: 1500 } }));
        const top = o.bom.cut.find((r) => { return r.parts[0]!.role === "top"; })!;
        const d = top.parts[0]!.bevel.u1;
        expect(d).toBeGreaterThan(5);
        const band = decorById(top.decor).edgeThickness ?? 0;
        const banded = top.edges.filter((e) => { return e === "u0" || e === "u1"; }).length * band;
        expect((sawSize(top) as { length: number }).length).toBeCloseTo(top.length + d - banded, 1);
    });

    it("commande le verre trempé à dimension et ne le fait pas débiter", () => 
    {
        const o = cabinet("VERRE_6", null);
        const f = fabrication(o.bom, o.nesting);
        const glass = o.bom.cut.find((r) => { return /en verre/.test(r.label); })!;
        expect(f.routes.some((r) => { return r.code === glass.code; })).toBe(false);
        const line = f.supplies.find((s) => { return s.kind === "Verre"; })!;
        expect(line.qty).toBe(String(glass.quantity));
        expect(line.note).toContain("miroitier");
    });


    it("laque le MDF sans chant à plaquer ni à commander, et commande sa laque", () =>
    {
        const o = cabinet("MDF_LAQUE", "#b0493a");
        const f = fabrication(o.bom, o.nesting);
        const row = o.bom.cut.find((r) => { return r.decor === "MDF_LAQUE"; })!;
        expect(row.edges).toEqual([]);
        expect(o.bom.edges.some((e) => { return e.decor === "MDF_LAQUE"; })).toBe(false);
        const route = f.routes.find((r) => { return r.code === row.code; })!;
        expect(route.steps.some((s) => { return s.phase === PHASE_EDGES; })).toBe(false);
        expect(route.steps.find((s) => { return s.phase === PHASE_FINISH; })!.spec).toContain("#b0493a");
        expect(f.supplies.find((s) => { return s.kind === "Laque"; })!.label).toContain("#b0493a"); 
    });

    it("ne confond pas deux pièces de teintes différentes", () =>
    {
        const base = { item: "x", itemName: "X", label: "Porte", role: "door" as const, length: 700, width: 400,
                       thickness: 19, decor: "MDF_LAQUE", edges: [], frame: null };
        const red = newPart({ ...base, id: "a", colour: "#b0493a" });
        const blue = newPart({ ...base, id: "b", colour: "#2f5d8a" });
        expect(groupBySignature([red, blue])).toHaveLength(2);
    });


    it("dit une profondeur non cotée au lieu d'un perçage débouchant, et reste neutre en Clamex", () =>
    {
        const p = dresser();
        p.settings.joinery = "clamex";
        const o = computeOutputs(p);
        const f = fabrication(o.bom, o.nesting);
        const said = f.routes.flatMap((r) => { return r.steps.map((s) => { return s.spec; }); }).join("\n");  
        expect(said).toContain("Accès levier Clamex");
        expect(said).not.toMatch(/Ø6 débouchant/);
        expect(said).toMatch(/Ø6 profondeur non cotée/);
        expect(neutral(f)).toEqual([]);
        // The edge half of each connector is a pocket in the butting edge, mid thickness, not a groove on a face
        const parts = o.analysis.build.parts;
        const pockets = parts.flatMap((q) =>
        {
            const clamex = (q.pockets ?? []).filter((k) => { return CLAMEX_EDGE.test(k.label); });
            return clamex.map((k) => { return { q, k }; });
        });
        expect(pockets.length).toBeGreaterThan(0);
        expect(pockets.every(({ q, k }) => { return (k.edge === "u0" || k.edge === "u1") &&
                                            k.w === q.thickness / 2; })).toBe(true);
        const asGroove = parts.some((q) => { return q.grooves.some((g) => { return CLAMEX_EDGE.test(g.label); }); });
        expect(asGroove).toBe(false);
        expect(said).toContain("Poche 70 x 7 prof. 14 dans le chant");
    });


    it("dit le quart de rond d'un profil massif et livre à plat une peau cintrable", () =>
    {
        const end = (technique: "solid" | "flex"): End =>
        {
            return { type: "rounded", radius: 80, sweep: 90, technique, flexThickness: 9, battens: DEFAULT_BATTENS,
                     decor: "W1000_ST9" };
        };
        const route = (technique: "solid" | "flex"): string =>
        {
            const o = alone(newCarcass({ width: 600, height: 800, depth: 500,
                                         ends: { left: { type: "square" }, right: end(technique) } }));
            const f = fabrication(o.bom, o.nesting);
            const skin = [...o.bom.cut, ...o.bom.offSheet].find((r) => { return r.parts[0]!.role === "skin"; })!;
            return f.routes.find((r) => { return r.code === skin.code; })!.steps
                .map((s) => { return `${s.title} : ${s.spec}`; }).join("\n");
        };
        expect(route("solid")).toMatch(/Profil : Quart de rond de rayon 80 dans la section 80 x 80/);
        expect(route("flex")).toContain("Livrée à plat : cintrée au montage");
        expect(route("flex")).not.toContain("Quart de rond");
    });
});
