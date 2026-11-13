// The assembly sequence of a piece after the Cairn notebook "Gamme de montage" : one table per PBS item, lowest
// first, each CAD solid in one step only, moving in the FreeCAD axes (x along the wall, y towards it, z up)

import type { Project } from "../model";
import type { Frame, Vec3 } from "../geometry";
import { assemblyOrder } from "../assembly";
import { CLEAT_WIDTH } from "../ceiling";

export interface GammeRow
{
    pbs: string[];
    count: number;
    type: string;
    operation: string;
    tool: string;
    direction: string;
    comment: string;
}

export interface GammeTable
{
    code: string;
    rows: GammeRow[];
}

// assembly : the item or the sub-assembly built on the bench it goes into, its table (#100, #110)
interface Board { code: string; item: string; label: string; role: string; id: string; frame: Frame | null;
                 length: number; width: number; thickness: number; bands?: { edge: string }[]; bandInner?: unknown;
                 assembly?: string }
interface Placed { model: string; item: string; part: string; o: Vec3; x: Vec3; z: Vec3; after?: string[]; covers?: string;
                   assembly?: string }
interface Screwed { item: string; label: string; tag: string; out: Vec3; kind: string; diameter: number; washer?: boolean;
                    assembly?: string }
interface Assembly { item: string; code: string; name: string; parent?: string | null }

// A table of what's built on the bench : #110, a second digit to the item's code
function isBench(table: string): boolean
{
    return /^#[0-9A-Z][1-9A-Z]0$/.test(table);
}

const BENCH_TITLE: Partial<Record<Phase, string>> = { 6: "Monter le tiroir", 7: "Monter la façade" };

const NA = "N/A";
const SPECIAL = "Spécial";
// Each family of the sequence of one carcass, in the order it go together
const PHASE = { pre: 0, shell: 1, back: 2, end: 3, feet: 4, runners: 5, drawers: 6, doors: 7, inside: 8, plinth: 9,
                lining: 10, filler: 11, other: 12 } as const;
type Phase = (typeof PHASE)[keyof typeof PHASE];
const PHASE_TITLE: Record<Phase, string> = {
    0: "Préparer les panneaux", 1: "Monter la coque", 2: "Poser le fond", 3: "Monter le bout arrondi", 4: "Poser les pieds",
    5: "Poser les coulisses", 6: "Monter les tiroirs", 7: "Poser les portes", 8: "Équiper l'intérieur", 9: "Poser la plinthe",
    10: "Poser l'habillage", 11: "Poser le fileur", 12: "Poser le reste",
};
// What waits for the room : the plugs, what is screwed to the wall before the item comes, what after, what ties 2
// items together once both stand
type Room = "plug" | "before" | "wall" | "link" | "loose" | "ceiling" | "finish";
const ROOM_TITLE: Record<Room, string> = { plug: "Percer et cheviller le mur", before: "Fixer au mur",
                                          wall: "Fixer au mur",
                                           link: "Lier les meubles", loose: "Poser une fois les caissons libres en place",
                                           ceiling: "Fermer jusqu'au plafond", finish: "Poser les cache-vis" };
// The screws driven in the room, between items : the caps over them wait for them (screw_caps.ts)
const ROOM_SCREWS = new Set(["link-screw", "wall-fixing"]);
// Those meant to come out : their caps on double sided tape, the others glued
const TAPED = new Set(["link-screw", "wall-fixing", "lining-screw", "back-screw", "plinth-screw"]);
// More than this under the ceiling past what a carcass needs to stand up from its side, it goes down onto the one
// under it. Less, it's set on the front of that one and slid back to the wall
const STAND_UP_MARGIN = 50;
// The way they go into the wood the dowels and the Minifix bolts tie 2 boards, and how far past their mouth
const CONNECTORS: Record<string, { axis: "x" | "z"; reach: number }> = {
    "DOWEL_8x35": { axis: "z", reach: 30 },
    "262.28.020": { axis: "x", reach: 8 },
};
// The first board laid on the bench, when a group of boards has to start somewhere
const FIRST: Record<string, number> = { bottom: 0, boxBottom: 1, endPanel: 2, former: 2, side: 3 };


// The bodies of edge banding of a board : one for each banded side of a rectangle, one bent around any other outline
function bandsOf(q: Board): number
{
    return (q.bands ?? []).length + (q.bandInner === null || q.bandInner === undefined ? 0 : 1);
}


// The way a move in the frame of the wall reads in the axes of the FreeCAD document, N/A when it runs along none
function axis(v: Vec3): string
{
    const fc: Vec3 = [v[0], -v[2], v[1]];
    const k = [0, 1, 2].find((i) => { return Math.abs(fc[i]!) > 0.99; });
    return k === undefined ? NA : `${fc[k]! > 0 ? "+" : "-"}${"xyz"[k]}`;
}


function dot(a: Vec3, b: Vec3): number
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}


function inBoard(q: Board, p: Vec3): boolean
{
    const f = q.frame!;
    const d: Vec3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
    const [u, v, n] = [dot(d, f.u), dot(d, f.v), dot(d, f.n)];
    return u > 0 && u < q.length && v > 0 && v < q.width && n > 0 && n < q.thickness;
}


// A board : where it goes in its carcass, and the way it comes when nothing it's tied to says otherwise
function boardStep(q: Board): { phase: Phase; direction: string; type: string }
{
    switch (q.role)
    {
        case "bottom": case "top": case "hdivider": case "vdivider": case "stiffener": case "side":
            return { phase: PHASE.shell, direction: NA, type: "Assemblage Minifix ou tourillons" };
        case "back":
            return { phase: PHASE.back, direction: "-y", type: "Vissage" };
        case "endPanel": case "former":
            return { phase: PHASE.end, direction: NA, type: "Tourillons collés" };
        case "plinth":
            return { phase: PHASE.plinth, direction: SPECIAL, type: "Clipsage" };
        case "boxSide": case "boxEnd": case "boxBottom":
            return { phase: PHASE.drawers, direction: NA, type: "Tourillons collés" };
        case "drawerFront":
            return { phase: PHASE.drawers, direction: "+y", type: "Vissage" };
        case "door": case "flap": case "leaf":
            return { phase: PHASE.doors, direction: SPECIAL, type: "Clipsage" };
        case "shelf":
            return { phase: PHASE.inside, direction: "-z", type: "Pose sur taquets" };
        case "lining":
            return { phase: PHASE.lining, direction: "+y", type: "Glissé dans la case" };
        case "filler": case "cleat":
            return { phase: PHASE.filler, direction: q.role === "filler" ? "+y" : NA, type: "Vissage" };
        case "wallShelf":
            return { phase: PHASE.shell, direction: "+y", type: "Emboîtement sur platines" };
        default:
            return { phase: PHASE.other, direction: NA, type: "Pose" };
    }
}


// An article : the family it goes with. Small parts set in their holes take N/A, each one its own way
function articleStep(ref: string): { phase: Phase | Room; direction: string; type: string }
{
    if (ref === "DOWEL_8x35")
    {
        return { phase: PHASE.pre, direction: NA, type: "Tourillons collés" };
    }
    if (ref === "262.28.020" || ref === "262.26.535" || ref === "174H7100E")
    {
        return { phase: PHASE.pre, direction: NA, type: "Insertion" };
    }
    if (ref === "637.76.333" || ref === "637.76.353")
    {
        return { phase: PHASE.feet, direction: "+z", type: ref === "637.76.333" ? "Vissage" : "Emboîtement" };
    }
    if (ref === "637.38.054")
    {
        return { phase: PHASE.plinth, direction: SPECIAL, type: "Clipsage" };
    }
    if (ref.startsWith("760H"))
    {
        return { phase: PHASE.runners, direction: NA, type: "Vissage" };
    }
    if (ref.startsWith("T51") || ref === "84335807")
    {
        // The Oslo pull screwed again since 2026-11-09, by its own countersunk screws (handles.ts)
        return { phase: PHASE.drawers, direction: NA, type: ref === "84335807" ? "Vissage" : "Clipsage" };
    }
    if (ref.startsWith("70T"))
    {
        return { phase: PHASE.doors, direction: SPECIAL, type: "Clipsage" };
    }
    if (ref.startsWith("956"))
    {
        return { phase: PHASE.doors, direction: NA, type: "Insertion ou vissage" };
    }
    if (ref === "282.24.727")
    {
        return { phase: PHASE.inside, direction: NA, type: "Insertion" };
    }
    // The plate of a wall shelf goes on the wall before the shelf slides onto it
    if (ref === "283.33.910")
    {
        return { phase: "before", direction: "+y", type: "Vissage au mur" };
    }
    if (ref.startsWith("PLUG"))
    {
        return { phase: "plug", direction: "+y", type: "Cheville" };
    }
    if (ref.startsWith("267.07"))
    {
        return { phase: "link", direction: NA, type: "Liaison" };
    }
    if (ref === "ANTI_TIP_BRACKET")
    {
        return { phase: "wall", direction: NA, type: "Vissage au mur" };
    }
    return { phase: PHASE.other, direction: NA, type: "Pose" };
}


// A screw : what it fixes, said by its label. Those into the wall or into another item wait for the room
function screwPhase(label: string): Phase | Room
{
    // The most particular first : the screws of the AXILO bases say "50 du fond" in their label
    const rules: [RegExp, Phase | Room][] = [
        [/Embase AXILO/, PHASE.feet], [/du fond/, PHASE.back], [/Clip de plinthe|Retour de plinthe/, PHASE.plinth],
        [/Coulisse/, PHASE.runners], [/façade|poignée/i, PHASE.drawers], [/Cuvette|Embase TIP-ON|Charnière d'abattant/,
            PHASE.doors],
        [/habillage/, PHASE.lining], [/Tasseau|fileur/, PHASE.filler],
        [/de la platine/, "before"], [/au mur/, "wall"], [/vers |étagère murale/, "link"],
    ];
    return rules.find(([r]) => { return r.test(label); })?.[1] ?? PHASE.other;
}


// The tool a head takes : Pozidriv by its size, a hex key for the button head of an M5 (ISO 7380-1:2011, key 3). The
// screws supplied with the Oslo pull have a plain cross, a Pozidriv bit would cam out of it
function toolOf(kind: string, diameter: number, label: string): string
{
    if (kind === "metric")
    {
        return "Clé six pans 3";
    }
    if (/poignée Oslo/i.test(label))
    {
        return "Tournevis PH2";
    }
    return diameter <= 3 ? "Tournevis PZ1" : "Tournevis PZ2";
}


// Glob characters in a label kept as they are
function literal(s: string): string
{
    return s.replace(/([*?[\]])/g, "[$1]");
}


// The order the boards of an item go together and the way each one comes : a board joins those already set when
// every dowel and bolt between them runs one way, and it moves along it. Where none can, the crossed one waits for a
// human eye
function connectorOrder(boards: Board[], placed: Placed[], models: Record<string, { ref: string }>,
                        phaseOf: (q: Board) => Phase): Map<string, { rank: number; direction: string; crossed: boolean }>
{
    const byTag = new Map(boards.map((q) => { return [`${q.item}|${q.code} ${q.label}`, q]; }));
    const ties: { a: string; b: string; way: Vec3 }[] = [];
    for (const i of placed)
    {
        const c = CONNECTORS[models[i.model]?.ref ?? ""];
        const host = byTag.get(`${i.item}|${i.part}`);
        if (c === undefined || host === undefined)
        {
            continue;
        }
        const way = c.axis === "x" ? i.x : i.z;
        const tip: Vec3 = [i.o[0] + way[0] * c.reach, i.o[1] + way[1] * c.reach, i.o[2] + way[2] * c.reach];
        const other = boards.find((q) => { return q.item === host.item && q !== host && q.frame !== null && inBoard(q,
            tip); });
        if (other !== undefined)
        {
            ties.push({ a: host.id, b: other.id, way });
        }
    }
    const tied = boards.filter((q) => { return ties.some((t) => { return t.a === q.id || t.b === q.id; }); });
    const first = (q: Board): number => { return FIRST[q.role] ?? 9; };
    const prefer = (a: Board, b: Board): number => { return phaseOf(a) - phaseOf(b) || first(a) - first(b); };
    // The ways a board could come in : towards each board already set, along the tie
    const ways = (q: Board, set: Set<string>): Vec3[] =>
    {
        return ties.flatMap((t) =>
        {
            if (t.a === q.id && set.has(t.b))
            {
                return [t.way];
            }
            return t.b === q.id && set.has(t.a) ? [[-t.way[0], -t.way[1], -t.way[2]] as Vec3] : [];
        });
    };
    const oneWay = (w: Vec3[]): boolean => { return w.every((v) => { return dot(v, w[0]!) > 0.99; }); };
    // Depth first with going back : a board caught between 2 ways 2 steps on, the top of a carcass once its sides
    // stand, is only seen by going on. Bounded, the greedy order kept past it
    let nodes = 0;
    const NODES = 50000;
    const seq: Board[] = [];
    const set = new Set<string>();
    const search = (): boolean =>
    {
        if (seq.length === tied.length)
        {
            return true;
        }
        if (++nodes > NODES)
        {
            return false;
        }
        const left = tied.filter((q) => { return !set.has(q.id); });
        if (left.some((q) => { return !oneWay(ways(q, set)); }))
        {
            return false;
        }
        const free = left.filter((q) => { return ways(q, set).length > 0; });
        // The first of a group, laid on the bench, when nothing set touches what is left
        const tries = (free.length > 0 ? free : left).sort(prefer);
        for (const q of tries)
        {
            seq.push(q);
            set.add(q.id);
            if (search())
            {
                return true;
            }
            seq.pop();
            set.delete(q.id);
        }
        return false;
    };
    const found = search();
    const out = new Map<string, { rank: number; direction: string; crossed: boolean }>();
    if (!found)
    {
        // No order found in the bound : the role order, each board with what its ties say, crossed ones to judge
        seq.length = 0;
        seq.push(...[...tied].sort(prefer));
    }
    const before = new Set<string>();
    for (const q of seq)
    {
        const w = ways(q, before);
        const crossed = !oneWay(w);
        out.set(q.id, { rank: out.size, direction: w.length === 0 || crossed ? NA : axis(w[0]!), crossed });
        before.add(q.id);
    }
    return out;
}


export function gamme(p: Project, boards: Board[], placed: Placed[], screws: Screwed[],
                      models: Record<string, { ref: string; label: string }>, assemblies: Assembly[]):
    GammeTable[]
{
    // The items alone : a sub-assembly shares its item's id and would take its place
    const codeOf = new Map(assemblies.filter((a) => { return !a.parent; }).map((a) => { return [a.item,
        a.code.slice(0, 4)]; }));
    const subsOf = (code: string): Assembly[] =>
    {
        return assemblies.filter((a) => { return a.parent === `${code}-000`; });
    };
    const groupOf = (item: string): string => { return codeOf.get(item) ?? "#000"; };
    const tableOf = (o: { item: string; assembly?: string }): string => { return o.assembly || groupOf(o.item); };
    // One entry for each solid : its table, its phase or what it waits for in the room, the key it's grouped by
    interface Entry { table: string; phase: Phase | Room; rank: number; key: string; pattern: string; direction: string;
                      type: string; tool: string; what: string; comment: string; host?: string; waits?: string;
                      also?: { pattern: string; count: number } }
    const entries: Entry[] = [];
    const boardKey = new Map(boards.map((q) => { return [`${q.item}|${q.code} ${q.label}`, `b|${q.id}`]; }));
    const order = connectorOrder(boards, placed, models, (q) => { return boardStep(q).phase; });
    // The ceiling filler is set once the carcass stands, it wouldn't go under the ceiling with it (ceiling.ts)
    // TODO the filler screws from the back edge of its cleat, against the wall : its fixing is still to choose
    const up = new Map(boards.filter((q) => { return /\/filler$/.test(q.id); }).map((q) =>
    {
        return [`${q.code} ${q.label}`, q.item];
    }));
    const closed = new Set(up.values());
    for (const q of boards)
    {
        const table = tableOf(q);
        // On the bench a door is laid flat, what goes onto it comes to it : nothing to clip yet
        const laid = isBench(table) && ["door", "flap", "leaf"].includes(q.role);
        const s = laid ? { phase: PHASE.doors, direction: NA, type: "Pose sur l'établi" } : boardStep(q);
        const o = order.get(q.id);
        const ceiling = up.get(`${q.code} ${q.label}`);
        // The filler up to the ceiling is glued on its cleat once the carcass stands
        entries.push({ table, phase: ceiling !== undefined ? "ceiling" : s.phase,
                      rank: o?.rank ?? 0, key: `b|${q.id}`,
                       pattern: literal(`${q.code} ${q.label}`), direction: o?.direction ?? s.direction,
                       type: ceiling !== undefined ? "Collage" : s.type, tool: "Aucun",
                       what: `${q.code} ${q.label}`, waits: ceiling,
                       // Its edge bands, glued on in the workshop, come with it (freecad_build.py, "<board>, chant L1")
                       also: bandsOf(q) > 0 ? { pattern: `${literal(`${q.code} ${q.label}`)}, chant *`,
                                               count: bandsOf(q) }
                           : undefined,
                       comment: o?.crossed === true ? "Goujons ou tourillons dans deux sens : ordre et mouvement à juger" : NA });
    }
    // A light in the way of a loose carcass goes in once the last of them stands (loose.ts)
    const rank = new Map(assemblyOrder(p).map((it, k) => { return [it.id, k]; }));
    const nameOf = new Map(p.items.map((it) => { return [it.id, it.name]; }));
    for (const i of placed)
    {
        const m = models[i.model]!;
        const liaison = m.ref.startsWith("267.07");
        if (i.after !== undefined && i.after.length > 0)
        {
            const last = i.after.reduce((a, q) => { return (rank.get(q) ?? 0) >= (rank.get(a) ?? 0) ? q : a; });
            // The profile screwed under its panel, the strip already stuck in it
            const profile = m.ref.startsWith("LED_PROFILE");
            entries.push({ table: "#000", phase: "loose", rank: 0, key: `a|${i.model}|${i.item}|${i.part}`,
                           pattern: `${literal(`${m.ref} ${m.label}`)} *, ${literal(i.part)}`, direction: "+z",
                           type: profile ? "Vissage" : "Collage", tool: profile ? "Tournevis PZ1" : "Aucun",
                           what: `${m.label} sur ${i.part}`, waits: last,
                           comment: profile ? `À dévisser avant de sortir ${i.after.map((x) => { return nameOf.get(x) ?? x; }).join(", ")}`
                               : "Collé dans le profilé, il en sort avec lui" });
            continue;
        }
        // A screw cap, once the screw it covers is in : last of its table, or of the whole for a screw of the room
        if (m.ref === "EDGE_CAP")
        {
            const room = ROOM_SCREWS.has(i.covers ?? "");
            entries.push({ table: room ? "#000" : tableOf(i), phase: room ? "finish" : PHASE.other, rank: 0,
                           // One row for the caps of a board laid the same way : their pattern
                           // tells the screws not apart
                           key: `a|${i.model}|${i.item}|${i.part}|${room ? "room" : "own"}`,
                           pattern: `${literal(`${m.ref} ${m.label}`)} *, ${literal(i.part)}`, direction: NA,
                           type: TAPED.has(i.covers ?? "") ? "Double face" : "Collage", tool: "Aucun",
                           what: `cache-vis sur ${i.part}`, comment: "Taillé dans le chant du décor, fil orienté comme le panneau" });
            continue;
        }
        const table = tableOf(i);
        // The arm of a hinge is pressed into its cup on the bench : it clips onto its plate when the door is hung
        const s = isBench(table) && /^(70T|71B)/.test(m.ref) ? { phase: PHASE.doors, direction: NA, type: "Insertion" }
            : articleStep(m.ref);
        entries.push({ table, phase: s.phase, rank: 0, key: `a|${i.model}|${i.item}|${i.part}`,
                       pattern: `${literal(`${m.ref} ${m.label}`)} *, ${literal(i.part)}`, direction: s.direction, type: s.type,
                       tool: liaison ? "Tournevis PZ2" : "Aucun", what: `${m.label} sur ${i.part}`,
                       comment: liaison ? "Empreinte de la vis de liaison à confirmer sur la fiche Häfele" : NA,
                       host: s.phase === PHASE.pre ? boardKey.get(`${i.item}|${i.part}`) : undefined });
    }
    for (const s of screws)
    {
        // Those holding the filler on its cleat go with the filler
        const ceiling = up.get(s.tag) ?? (/dans le fileur/.test(s.label) && closed.has(s.item) ? s.item : undefined);
        const phase = ceiling !== undefined ? "ceiling" as const : screwPhase(s.label);
        const direction = axis([-s.out[0], -s.out[1], -s.out[2]]);
        const table = tableOf(s);
        // The washer goes on before its screw
        if (s.washer === true)
        {
            entries.push({ table, phase, rank: 0, key: `w|${s.tag}`, pattern: `Rondelle *, ${literal(s.tag)}`, direction,
                           type: "Pose", tool: "Aucun", what: `rondelles sur ${s.tag}`, comment: NA, waits: ceiling });
        }
        // Cut at the comma before the next words, not at the one of "Ø3,5"
        entries.push({ table, phase, rank: 0, key: `s|${s.label}|${s.tag}`, pattern: literal(`${s.label}, ${s.tag}`),
                      direction,
                       type: "Vissage", tool: toolOf(s.kind, s.diameter,
                                                     s.label), what: `${s.label.replace(/, .*$/, "")} sur ${s.tag}`,
                       comment: NA, waits: ceiling });
    }
    // Each sub-assembly fitted whole into its item, once what holds it's there : last of its phase, after the runners
    // and the plates. Its kind read off its own boards
    for (const sub of assemblies.filter((a) => { return !!a.parent; }))
    {
        const code = sub.code.slice(0, 4);
        const own = boards.filter((q) => { return q.assembly === code; });
        const front = own.find((q) => { return ["door", "drawerFront", "flap", "leaf"].includes(q.role); });
        const pose = front === undefined || front.role === "drawerFront"
            ? { phase: PHASE.drawers, type: "Clipsage", direction: "+y" }
            : front.role === "leaf" ? { phase: PHASE.doors, type: "Emboîtement", direction: SPECIAL }
            : front.role === "flap" && /^Abattant tombant/.test(front.label) ? { phase: PHASE.doors,
                type: "Vissage", direction: SPECIAL }
            : { phase: PHASE.doors, type: "Clipsage", direction: SPECIAL };
        entries.push({ table: sub.parent!.slice(0, 4), phase: pose.phase, rank: Number.MAX_SAFE_INTEGER,
                       key: `u|${code}`, pattern: `${code}-000`, direction: pose.direction, type: pose.type, tool: "Aucun",
                       what: `${code}-000 ${sub.name}, monté à l'établi`, comment: NA });
    }
    // Rows : one for each key, in the order of the phases, then of the boards tied together, then as met. What is
    // set in a board before it goes in, its dowels and bolts, comes with it in its step : alone it would hang in the air
    const rowsOf = (mine: Entry[]): GammeRow[] =>
    {
        const keys = [...new Set(mine.map((e) => { return e.key; }))];
        const own = new Set(keys);
        const carried = (k: string): Entry[][] =>
        {
            const groups = [...new Set(mine.filter((e) => { return e.host === k; }).map((e) => { return e.key; }))];
            return groups.map((g) => { return mine.filter((e) => { return e.key === g; }); });
        };
        const riding = new Set(mine.filter((e) => { return e.host !== undefined &&
                                                   own.has(e.host); }).map((e) => { return e.key; }));
        return keys.filter((k) => { return !riding.has(k); }).map((k, n) =>
        {
            const group = mine.filter((e) => { return e.key === k; });
            // One label driven 2 ways, the runner screws of a middle upright : the pattern tells them not apart
            const ways = new Set(group.map((e) => { return e.direction; }));
            return { e: group[0]!, n: group.length, met: n, way: ways.size > 1 ? NA : group[0]!.direction };
        }).sort((a, b) =>
        {
            const pa = typeof a.e.phase === "number" ? a.e.phase : 0;
            const pb = typeof b.e.phase === "number" ? b.e.phase : 0;
            return pa - pb || a.e.rank - b.e.rank || a.met - b.met;
        }).map(({ e, n, way }) =>
        {
            const title = typeof e.phase !== "number" ? ROOM_TITLE[e.phase]
                : (isBench(e.table) ? BENCH_TITLE[e.phase] : undefined) ?? PHASE_TITLE[e.phase];
            const withIt = carried(e.key);
            const garnish = withIt.length === 0 ? "" : `, garni : ${withIt.map((g) =>
            {
                return `${g.length} x ${g[0]!.what.replace(/ sur .*$/, "")}`;
            }).join(", ")}`;
            const bands = e.also?.count ?? 0;
            return { pbs: [e.pattern, ...(e.also === undefined ? [] : [e.also.pattern]),
                           ...withIt.map((g) => { return g[0]!.pattern; })],
                     count: n + bands + withIt.reduce((s, g) => { return s + g.length; }, 0), type: e.type,
                     operation: `${title} : ${e.what}${garnish}`, tool: e.tool, direction: way,
                     comment: way === SPECIAL ? "Mouvement non rectiligne, à juger" : e.comment };
        });
    };
    const inRoom = (e: Entry): boolean => { return typeof e.phase !== "number"; };
    const tables: GammeTable[] = [];
    const items = assemblyOrder(p).filter((it) => { return codeOf.has(it.id); });
    // Each item after what is built on the bench for it, a drawer ready before the carcass it goes into
    for (const it of items)
    {
        const code = codeOf.get(it.id)!;
        for (const sub of subsOf(code))
        {
            const own = sub.code.slice(0, 4);
            tables.push({ code: own, rows: rowsOf(entries.filter((e) => { return e.table === own && !inRoom(e); })) });
        }
        tables.push({ code, rows: rowsOf(entries.filter((e) => { return e.table === code && !inRoom(e); })) });
    }
    // The whole : each item in turn, its plugs in the wall first, what it hangs on, the item on the floor towards the
    // wall or down onto the one under it, its screws into the wall, then what ties the items to each other
    const whole: GammeRow[] = [];
    const room = (code: string, what: Room): GammeRow[] =>
    {
        return rowsOf(entries.filter((e) => { return e.phase === what && e.table === code; }));
    };
    for (const it of items)
    {
        const code = codeOf.get(it.id)!;
        // A shelf screwed down onto a carcass top : its plates drilled at the height that top really has once set
        const shelf = it.kind === "wallShelf" && it.tied === true ? it : null;
        const under = shelf === null ? undefined : p.items.find((q) =>
        {
            return q.kind === "carcass" && q.wall === shelf.wall && Math.abs(q.y + q.height - shelf.y) < 0.5
                && q.x < shelf.x + shelf.width && q.x + q.width > shelf.x;
        });
        if (under !== undefined)
        {
            whole.push({ pbs: [`${codeOf.get(under.id) ?? code}-000`], count: 1, type: "Contrôle",
                         operation: `Mesurer la hauteur réelle du dessus de ${codeOf.get(under.id) ?? ""}-000 ${under.name}, `
                             + "posé et réglé", tool: "Mètre et niveau", direction: NA,
                         comment: "Avant de percer le mur : platines percées à cette cote, au centre de leurs oblongs de "
                             + "réglage en hauteur" });
        }
        whole.push(...room(code, "plug"), ...room(code, "before"));
        // A loose carcass slides in towards the wall, the others go down onto what stands under them. Too near the
        // ceiling to be stood up there, set on the front of the one under it and slid back : the column of the TV wall
        // has 6 mm over the cleat of its filler, screwed on its top before it goes up
        const loose = it.kind === "carcass" && it.freeStanding === true;
        // On another when a carcass stands right under it : the base unit stands on its feet, 100 off the floor
        const onAnother = it.kind === "carcass" && !loose && p.items.some((q) =>
        {
            return q.kind === "carcass" && q !== it && q.wall === it.wall && Math.abs(q.y + q.height - it.y) < 0.5
                && q.x < it.x + it.width && q.x + q.width > it.x;
        });
        const gap = it.kind === "carcass" ? p.room.height - (it.y + it.height) : Infinity;
        // The flat cleat of a ceiling filler goes up with it (ceiling.ts)
        const flat = it.kind === "carcass" && it.ceilingFiller === true && gap >= it.thickness && gap < CLEAT_WIDTH;
        const over = flat ? gap - it.thickness : gap;
        const stand = it.kind === "carcass" ? Math.hypot(it.height, it.depth) - it.height : 0;
        const slid = onAnother && over < stand + STAND_UP_MARGIN;
        whole.push({ pbs: [`${code}-000`], count: 1, type: "Mise en place",
                    operation: `Mettre en place ${code}-000 ${it.name}`,
                     tool: "Aucun", direction: slid ? "-z puis +y" : onAnother ? "-z" : "+y",
                     comment: loose ? "Glissée à la main, sans fixation"
                         : slid ? `Posée sur l'avant du meuble du dessous puis glissée vers le mur : ${Math.round(over)} mm sous le `
                             + `plafond${flat ? ", tasseau du fileur compris" : ""}`
                         : NA });
        whole.push(...room(code, "wall"));
        whole.push(...rowsOf(entries.filter((e) => { return e.phase === "ceiling" && e.waits === it.id; })));
        whole.push(...rowsOf(entries.filter((e) => { return e.phase === "loose" && e.waits === it.id; })));
    }
    whole.push(...rowsOf(entries.filter((e) => { return e.phase === "link"; })));
    whole.push(...rowsOf(entries.filter((e) => { return e.phase === "finish"; })));
    // Anything of an item left out of the PBS : still one step of the whole
    whole.push(...rowsOf(entries.filter((e) => { return e.table === "#000" && !inRoom(e); })));
    tables.push({ code: "#000", rows: whole });
    return tables;
}
