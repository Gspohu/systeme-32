// Slat walls : vertical slats on cleats against a wall, or a room divider between a floor and a ceiling rail

import type { Settings, SlatWall } from "./model";
import type { Build, Hole, Purpose } from "./part_types";
import { CLEAT_THICKNESS, newPart } from "./part_base";
import { X, Y, Z, neg } from "./geometry";
import { spread } from "./fittings";
import { decorById, materialOfDecor } from "../data/materials";
import { DIAM } from "./text";

// Workshop conventions, stated in the drawings as such : cleats 20 x 40 no more than 600 apart and 100 from
// the ends, a wall screw at least every 400, rails 30 thick, room for a screw head between two slats
const CLEAT_HEIGHT = 40;
const CLEAT_INSET = 100;
const CLEAT_MAX_SPACING = 600;
const SCREW_INSET = 50;
const SCREW_MAX_SPACING = 400;
export const RAIL_THICKNESS = 30;
export const SCREW_GAP_MIN = 12;


// Left edge of every slat from the left of the wall, and the gap they realy leave between them
export function slatLayout(it: SlatWall): { xs: number[]; gap: number }
{
    const n = Math.max(1, Math.floor((it.width + it.gap) / (it.slatWidth + it.gap)));
    const gap = n > 1 ? (it.width - n * it.slatWidth) / (n - 1) : 0;
    const xs: number[] = [];
    let k = 0;
    while (k < n)
    {
        xs.push(k * (it.slatWidth + gap));
        k++;
    }
    return { xs, gap };
}


// Screws of a rail go between two slats, one gap every 400 mm at most, the two end gaps always
function railScrews(xs: number[], slatWidth: number, gap: number): number[]
{
    const centres: number[] = [];
    let k = 0;
    while (k < xs.length - 1)
    {
        centres.push(xs[k]! + slatWidth + gap / 2);
        k++;
    }
    const kept: number[] = [];
    for (const c of centres)
    {
        const last = kept[kept.length - 1];
        if (last === undefined || c - last >= SCREW_MAX_SPACING || c === centres[centres.length - 1])
        {
            kept.push(c);
        }
    }
    return kept;
}


function wallPlug(s: Settings): string
{
    if (s.wallType === "plasterboard")
    {
        return "PLUG_HOLLOW_METAL";
    }
    return s.wallType === "aerated" ? "PLUG_AERATED" : "PLUG_NYLON_8x40";
}


export function buildSlats(it: SlatWall, s: Settings, b: Build): void
{
    const { xs, gap } = slatLayout(it);
    const slatCount = xs.length;
    const base = { item: it.id, itemName: it.name, decor: it.decor };
    // a melamine or veneered strip shows its two long raw edges, solid wood and lacquer need no band
    const kind = materialOfDecor(decorById(it.decor)).kind;
    const banded = decorById(it.decor).id !== "MDF_LAQUE" && (kind === "melamine" || kind === "mdf");
    const edges: ("v0" | "v1")[] = banded ? ["v0", "v1"] : [];
    const gapNote = `${slatCount} lattes, jour réel ${gap.toFixed(1).replace(".", ",")} mm (demandé ${it.gap})`;
    const plug = wallPlug(s);
    // the metal plug of a plasterboard wall carry its own screw
    const plasterboard = plug === "PLUG_HOLLOW_METAL"; 
    const line = (ref: string, qty: number, note: string | null, purpose: Purpose): void =>
    {
        if (qty > 0)
        {
            b.hardware.push({ ref, qty, item: it.id, itemName: it.name, target: null, note, purpose });
        }
    };
    if (it.slatWidth > it.width)
    {
        b.errors.push(`${it.name} : latte de ${it.slatWidth} mm plus large que la zone de ${it.width} mm.`);
        return;
    }


    if (it.mode === "wall")
    {
        const levels = spread(it.height, CLEAT_INSET, CLEAT_MAX_SPACING);
        const screws = spread(it.width, SCREW_INSET, SCREW_MAX_SPACING);
        let c = 0; 
        for (const yc of levels)
        {
            c++;
            const cleat = newPart({
                ...base, id: `${it.id}/cleat/${c}`, label: `Liteau ${c}`, role: "cleat", length: it.width,
                width: CLEAT_HEIGHT, thickness: CLEAT_THICKNESS, edges: [],
                frame: { o: [it.x, it.y + yc - CLEAT_HEIGHT / 2, it.z], u: X, v: Y, n: Z }, 
            });
            for (const u of screws)
            {
                cleat.holes.push({ u, v: CLEAT_HEIGHT / 2, diameter: 5, depth: CLEAT_THICKNESS, face: "B",
                                   label: `Vis murale 5 x 70 et cheville, ${DIAM}5 traversant (convention)`,
                                   purpose: "wall-screw" });
            }
            cleat.notes.push("Vissé au mur avant la pose des lattes, de niveau");
            b.parts.push(cleat);
        }
        let k = 0;
        for (const x of xs)
        {
            k++;
            const slat = newPart({
                ...base, id: `${it.id}/slat/${k}`, label: `Latte ${k}`, role: "slat", length: it.height,
                width: it.slatWidth, thickness: it.slatDepth, edges,
                frame: { o: [it.x + x, it.y, it.z + CLEAT_THICKNESS], u: Y, v: X, n: Z },
            });
            slat.notes.push(k === 1 ? gapNote : "Collée et pointée sur chaque liteau");
            b.parts.push(slat);
        }
        const fixings = levels.length * screws.length;
        line("WALL_SCREW_5x70", plasterboard ? 0 : fixings, "liteaux dans le mur", "wall-fixing");
        line(plug, fixings, "liteaux dans le mur", "wall-fixing");
        line("BRAD_1_6x40", 2 * slatCount * levels.length, "2 pointes par croisement latte et liteau, avec colle",
             "slat-nail");
        return;
    }


    // divider : slats doweled into a floor and a ceiling rail, seen from both sides
    const inner = it.height - 2 * RAIL_THICKNESS;
    const screws = railScrews(xs, it.slatWidth, gap);
    const rails = [
        { key: "bottom", label: "Lisse basse", y: it.y, face: "B" as const },
        { key: "top", label: "Lisse haute", y: it.y + it.height - RAIL_THICKNESS, face: "A" as const },
    ];
    for (const r of rails)
    {
        const rail = newPart({
            ...base, id: `${it.id}/rail/${r.key}`, label: r.label, role: "cleat", length: it.width,
            width: it.slatDepth, thickness: RAIL_THICKNESS, edges,
            frame: { o: [it.x, r.y, it.z + it.slatDepth], u: X, v: neg(Z), n: Y },
        });
        for (const x of xs)
        {
            rail.holes.push({ u: x + it.slatWidth / 2, v: it.slatDepth / 2, diameter: 8, depth: s.dowelFaceDepth,
                              face: r.face, label: `Tourillon ${DIAM}8 x 35`, purpose: "dowel" });
        }
        for (const u of screws)
        {
            rail.holes.push({ u, v: it.slatDepth / 2, diameter: 5, depth: RAIL_THICKNESS, face: r.face,
                              label: `Vis 5 x 70 et cheville, entre deux lattes, ${DIAM}5 traversant (convention)`,
                              purpose: "wall-screw" });
        }
        rail.notes.push(r.key === "top" ? "Vissée au plafond : hauteur sol à plafond relevée sur place"
                                        : "Vissée au sol");
        b.parts.push(rail);
    }
    let k = 0;
    for (const x of xs)
    {
        k++;
        const slat = newPart({
            ...base, id: `${it.id}/slat/${k}`, label: `Latte ${k}`, role: "slat", length: inner, width: it.slatDepth,
            thickness: it.slatWidth, edges,
            frame: { o: [it.x + x, it.y + RAIL_THICKNESS, it.z + it.slatDepth], u: Y, v: neg(Z), n: X },
        });
        const end = (face: "u0" | "u1"): Hole =>
        {
            return { u: face === "u0" ? 0 : inner, v: it.slatDepth / 2, diameter: 8, depth: s.dowelEdgeDepth, face,
                     w: it.slatWidth / 2, label: `Tourillon ${DIAM}8 x 35`, purpose: "dowel" };
        };
        slat.holes.push(end("u0"), end("u1"));
        if (k === 1)
        {
            slat.notes.push(gapNote);
        }
        b.parts.push(slat);
    }
    line("DOWEL_8x35", 2 * slatCount, "collés, une latte par paire", "dowel");
    line("WALL_SCREW_5x70", plasterboard ? 0 : 2 * screws.length, "lisses au sol et au plafond", "wall-fixing");
    line(plug, 2 * screws.length, "lisses au sol et au plafond", "wall-fixing");
    if (gap < SCREW_GAP_MIN)
    {
        b.errors.push(`${it.name} : jour de ${gap.toFixed(1)} mm entre lattes, ${SCREW_GAP_MIN} mm mini pour visser `
            + "les lisses entre deux lattes. Élargir le jour ou réduire le nombre de lattes.");
    }
}
