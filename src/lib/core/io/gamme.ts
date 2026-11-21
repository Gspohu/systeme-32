// The assembly sequence of a piece after the Cairn notebook "Gamme de montage" : one table per PBS item, lowest
// first, each CAD solid in one step only, moving in the FreeCAD axes (x along the wall, y towards it, z up)

import type { Project } from "../model";
import type { Frame, Vec3 } from "../geometry";
import { assemblyOrder } from "../assembly";
// Past this margin under the ceiling a carcass goes down onto the one under it, short of it it's
// slid back from its front
import { STAND_UP_MARGIN } from "../ceiling";
import { CAD_MODELS } from "../../data/cad_models";
import { SIEVE_BORE } from "../../data/hardware";


export interface GammeRow
{
    pbs: string[];
    count: number;  
    type: string; 
    operation: string;
    tool: string;
    direction: string;
    comment: string;
    // How the piece lise while the step is done, turned over by a step of its own when it changes
    position?: string;
    // The phase the step belongs to, what decides the position
    phase?: number | string;
}


export interface GammeTable
{
    code: string;
    // What the table builds : a step placing it whloe names it, not every board and csrew it holds
    name: string;
    rows: GammeRow[];  
}

// assembly : the item or the sub-assembly built on the bench it goes into, its table (#100, #110)
interface Board { code: string; item: string; label: string; role: string; id: string; frame: Frame | null;
                 length: number; width: number; thickness: number; bands?: { edge: string }[]; bandInner?: unknown;
                 assembly?: string; holes?: { purpose: string }[]; toFloor?: boolean }
interface Placed { model: string; item: string; part: string; o: Vec3; x: Vec3; z: Vec3; after?: string[]; covers?: string;
                   assembly?: string }
interface Screwed { item: string; label: string; tag: string; out: Vec3; kind: string; diameter: number; washer?: boolean;
                    assembly?: string; point?: Vec3 }
interface Assembly { item: string; code: string; name: string; parent?: string | null }

// A table of what's built on the bench : #110, a second digit to the item's code
function isBench(table: string): boolean
{
    return /^#[0-9A-Z][1-9A-Z]0$/.test(table);
} 


const NA = "N/A";
const SPECIAL = "Spécial";
// Each family of the sequence of one carcass, in the order it go together
// The adjustable shelves before the doors : set after them they came in through a door shut
const PHASE = { pre: 0, shell: 1, back: 2, end: 3, feet: 4, runners: 5, drawers: 6, shelves: 7, doors: 8, inside: 9,
                plinth: 10, lining: 11, filler: 12, other: 13 } as const;
type Phase = (typeof PHASE)[keyof typeof PHASE];
const PHASE_TITLE: Record<Phase, string> = {
    0: "Préparer les panneaux", 1: "Monter la coque", 2: "Poser le fond", 3: "Monter le bout arrondi", 4: "Poser les pieds",
    5: "Poser les coulisses", 6: "Monter les tiroirs", 7: "Poser les étagères", 8: "Poser les portes",
    9: "Équiper l'intérieur", 10: "Poser la plinthe", 11: "Poser l'habillage", 12: "Poser le fileur", 13: "Poser le reste",
};
// What wiats for the room : the plugs, the wall screws before and after the item, the ties once both stand. The
// drawers last, into carcasses carried empty : a screw to the niche went through the bottom of the top drawer
type Room = "plug" | "before" | "wall" | "link" | "loose" | "ceiling" | "scribe" | "drawers" | "finish" | "feet"
    | "plinth" | "fronts";
const ROOM_TITLE: Record<Room, string> = { plug: "Percer et cheviller le mur", before: "Fixer au mur",
                                          feet: "Poser les pieds une fois le meuble relevé",
                                          plinth: "Clipser la plinthe sur les pieds réglés",
                                          fronts: "Poser les étagères et les façades",
                                          wall: "Fixer au mur", scribe: "Poser le fileur à sa mesure",
                                           link: "Lier les meubles", loose: "Poser une fois les caissons libres en place",
                                           ceiling: "Fermer jusqu'au plafond", drawers: "Mettre les tiroirs",
                                           finish: "Poser les cache-vis" };
// The fronts and the loose shelves go into a carcass standing fixed, emptied of all a fitter would carry or stand
// up. A flap first, its stays at once : nothing else holds it open, the doors after
const FRONT_RANK = { pin: 0, shelf: 1, flap: 2, flapBracket: 3, strut: 4, door: 5 } as const;
// Up to the ceiling once the carcass stands : the cleat laid, screwed from under, the strip glued on it, then what
// goes into the strip
const CEILING_RANK = { cleat: 0, cleatScrew: 1, filler: 2, intoFiller: 3 } as const;
// The screws driven in the room, between items : the caps over them wait for them (screw_caps.ts)
const ROOM_SCREWS = new Set(["link-screw", "wall-fixing"]);
// Those meant to come out : their caps on double sided tape, the others glued
const TAPED = new Set(["link-screw", "wall-fixing", "lining-screw", "back-screw", "plinth-screw", "minifix-housing"]);
// The way they go into the wood the dowels and the Minifix bolts tie 2 boards, and how far past their mouth
const CONNECTORS: Record<string, { axis: "x" | "z"; reach: number }> = {
    "DOWEL_8x35": { axis: "z", reach: 30 },
    "262.28.020": { axis: "x", reach: 8 },
};
// The first board laid on the bench, when a group of boards has to start somewhere
const FIRST: Record<string, number> = { bottom: 0, boxBottom: 1, endPanel: 2, former: 2, side: 3 };
// On the bench what no dowel ties comes after the boards tied together in its phase : a drawer front, the couplings
// clipped on its sides, once its box stands. In a carcass the order met is kept, the spacers of an inner drawer
// first of their phase : the runners go onto them
const LOOSE = 1e6;
const SPACER_RANK = -1;
const PIN_RANK = -1;
// The 606N of Blum's MOVENTO notice is sold in the US : any countersunk chipboard screw of the same size does, its head
// no wider than 6.5, a head of 7 wedged in the pocket behind the slot of the coupling (cad_models.ts)
const COUPLING_SCREW = /^Accouplement MOVENTO/;
const COUPLING_SCREW_NOTE = "Vis recommandée Blum 606N : à défaut, toute vis aggloméré fraisée Ø3,5 x 15 ou 16 à tête de "
    + "Ø6,5 au plus, une tête de Ø7 ne tient pas derrière l'oblong de l'accouplement";
function looseRank(table: string): number
{
    return isBench(table) ? LOOSE : 0;
}
const SPACER = /^Cale de coulisse|vis de cale/;


// The bodies of edge banding of a board : one for each banded side of a rectangle, one bent around any other outline
function bandsOf(q: Board): number
{
    return (q.bands ?? []).length + (q.bandInner === null || q.bandInner === undefined ? 0 : 1);
}


// The way a move in the frame of the wall reasd in the axes of the FreeCAD document, N/A when it runs along none
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


// The gesture of a step that moves along no axis : a dor clips its hinge arms on thier plates (Blum CLIP top), a
// plinth its clips on the feet, a drop flap is screwed on its hinges held open
function specialMove(type: string, phase: Phase | Room): string
{
    const hung = phase === PHASE.doors || phase === "fronts";
    if (type === "Clipsage" && hung)
    {
        return "Accrocher le bras de chaque charnière sur son embase par l'avant, puis presser l'arrière jusqu'au clic";
    }
    if (type === "Clipsage" && (phase === PHASE.plinth || phase === "plinth"))
    {
        return "Présenter la plinthe, chaque clip en face de son pied, puis la pousser vers l'arrière jusqu'au clic";
    }
    if (type === "Vissage" && hung)
    {
        return "Présenter l'abattant ouvert, tenu par un aide, ses charnières dans leurs logements Ø26 du dessous, "
            + "puis visser les vis HOSPA 3 (fournies). Le garder tenu ouvert ou calé jusqu'à la pose de ses deux compas : "
            + "rien d'autre ne le retient";
    }
    return "Mouvement non rectiligne, à juger";
}


// A lining is a box open in front, built from its bottom up : the sides on the bottom, the top on their edges and
// screwed dwon, turned over for the bottom screws, on its face for its back. Each screw gose down
const LINING_SCREW = /de l'habillage/;
const LINING_BOARDS = { dessous: 0, gauche: 1, droite: 2, dessus: 3, fond: 6 };
const LINING_SCREWS = { dessus: 4, dessous: 5, fond: 7 };

function liningRank(label: string, screw = false): number
{
    const where = /, (\w+)$/.exec(label)?.[1] ?? "";
    const ranks: Record<string, number> = screw ? LINING_SCREWS : LINING_BOARDS;
    return ranks[where] ?? 0;
}


function endBack(q: Board): boolean
{
    return q.role === "back" && q.id.includes("/end/");
}


// Where a board goes in its carcass, and the way it comes when nothing it's tied to says otherwise
function boardStep(q: Board): { phase: Phase; direction: string; type: string }
{
    switch (q.role)
    {
        case "bottom": case "top": case "hdivider": case "vdivider": case "stiffener": case "side":
            return { phase: PHASE.shell, direction: NA, type: "Assemblage Minifix ou tourillons" };
        case "back":
            // A bearing back goes in with the shell, joined as the sides are. The back of a rounded end is screwed
            // into the back edge of its shaped boards : after them
            return q.label === "Fond porteur" ? { phase: PHASE.shell, direction: NA,
                                                 type: "Assemblage Minifix ou tourillons" }
                : { phase: q.id.includes("/end/") ? PHASE.end : PHASE.back, direction: "-y", type: "Vissage" };
        case "endPanel": case "former":
            // Held by what screws into it a few steps later, a board with no dowel stands on a block till then
            return { phase: PHASE.end, direction: NA,
                     type: q.holes?.some((h) => { return h.purpose === "dowel"; }) === false ? "Pose sur cale"
                         : "Tourillons collés" };
        case "plinth":
            // A return is screwed into the bottom shaped board first, its clips on it, the feet clipped in after. The
            // plinth of a side filler slides along the wall onto the dowels in the end of the front plinth, glued
            return /retour/.test(q.label) ? { phase: PHASE.feet, direction: NA, type: "Vissage" }
                : q.id.includes("/side-filler/") ? { phase: PHASE.plinth,
                                                    direction: q.id.includes("/left/") ? "+x" : "-x",
                                                      type: "Tourillons collés" }
                : { phase: PHASE.plinth, direction: SPECIAL, type: "Clipsage" };
        case "boxSide": case "boxEnd": case "boxBottom":
            return { phase: PHASE.drawers, direction: NA, type: "Tourillons collés" };
        case "drawerFront":
            return { phase: PHASE.drawers, direction: "+y", type: "Vissage" };
        case "door": case "flap": case "leaf":
            return { phase: PHASE.doors, direction: SPECIAL, type: "Clipsage" };
        // Slid in from the front at its height, then set down on its pins : straight down from the top it met the
        // hinge paltes on the sidse and the rail under the top
        case "shelf":
            return { phase: PHASE.shelves, direction: "+y", type: "Pose sur taquets" };
        case "lining":
            return { phase: PHASE.lining, direction: "+y", type: "Glissé dans la case" };
        case "filler": case "cleat":
            // The spacers of an inner drawer hold its runners : screwed on before them
            if (q.id.includes("/pull-out/"))
            {
                return { phase: PHASE.runners, direction: NA, type: "Vissage" };
            }
            return { phase: PHASE.filler, direction: q.role === "filler" ? "+y" : NA, type: "Vissage" };
        case "wallShelf":
            return { phase: PHASE.shell, direction: "+y", type: "Emboîtement sur platines" };
        default:
            return { phase: PHASE.other, direction: NA, type: "Pose" };
    }
}


// An article : the family it goes with. Small parts set in their holes take N/A, each one its own way
function articleStep(ref: string, label: string): { phase: Phase | Room; direction: string; type: string }
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
    // Screwed on its plinth : those of a return before the feet, which clip int them as they go on
    if (ref === "637.38.054")
    {
        return { phase: PHASE.feet, direction: NA, type: "Vissage" };
    }
    if (ref.startsWith("760H"))
    {
        return { phase: PHASE.runners, direction: NA, type: "Vissage" };
    }
    if (ref.startsWith("T51") || ref === "84335807")
    {
        // The Oslo pull screwed again sicne 2026-11-09, by its own countersunk screws (handles.ts)
        return { phase: PHASE.drawers, direction: NA, type: ref === "84335807" ? "Vissage" : "Clipsage" };
    }
    // The 71B of a door with a pull as the 70T, the bench sends both alike
    if (/^(70T|71B)/.test(ref))
    {
        return { phase: PHASE.doors, direction: SPECIAL, type: "Clipsage" };
    }
    // The catch plate of a TIP-ON is stuck on the door by its adhesive pad, its ref that of the whole kit
    if (/^Contreplaque/.test(label))
    {
        return { phase: PHASE.doors, direction: NA, type: "Collage" };
    }
    if (ref.startsWith("342.78.700"))
    {
        return { phase: PHASE.doors, direction: NA, type: "Vissage" };
    }
    // The stay ites the lfap to the carcass : once the flap hangs
    if (ref.startsWith("365.01.901"))
    {
        // Its brackets screwed, its strut clipped onto their studs
        return { phase: PHASE.inside, direction: NA, type: /vérin/.test(label) ? "Clipsage" : "Vissage" };
    }
    // The adapter of a TIP-ON is screwed to the carcass first, the TIP-ON ten clipped into it from the frot
    // (Blum KA-150 p. 173) : pushed in before the screws it went through its housing and hid them
    if (ref.startsWith("956.1201"))
    {
        return { phase: PHASE.doors, direction: NA, type: "Vissage" };
    }
    if (ref.startsWith("956"))
    {
        return { phase: PHASE.doors, direction: "+y", type: "Clipsage" };
    }
    if (ref === "282.24.727")
    {
        return { phase: PHASE.shelves, direction: NA, type: "Insertion" };
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
        [/Embase AXILO/, PHASE.feet], [SPACER, PHASE.runners], [/du fond/,
                                                                PHASE.back], [/Clip de plinthe|Retour de plinthe/,
            PHASE.feet],
        [/Coulisse/, PHASE.runners], [/façade|poignée|Accouplement/i,
                                      PHASE.drawers], [/Cuvette|Embase TIP-ON|Charnière d'abattant/,
            PHASE.doors],
        [/habillage/, PHASE.lining], [/Tasseau|fileur/, PHASE.filler],
        // The bracket screwed to the top once it stands against the wall : in the carcass they came before it
        [/de la platine/, "before"], [/au mur|^Équerre anti-basculement/, "wall"], [/vers |étagère murale/, "link"],
    ];
    return rules.find(([r]) => { return r.test(label); })?.[1] ?? PHASE.other;
}


// The standard first, ISO 8764-1:2004 (forms PH and PZ) and ISO 2936:2014 (hexagon socket screw keys), the trade name
// after : "PZ2" alone says nothing to whoever has nveer bought a bit. No standard names a tape or a level
const TOOL = {
    hexKey3: "Clé mâle coudée de 3, ISO 2936 (clé Allen de 3)",
    phillips2: "Tournevis forme PH 2, ISO 8764-1 (cruciforme Phillips PH2)",
    pozidriv1: "Tournevis forme PZ 1, ISO 8764-1 (cruciforme Pozidriv PZ1)",
    pozidriv2: "Tournevis forme PZ 2, ISO 8764-1 (cruciforme Pozidriv PZ2)",
    tape: "Mètre ruban",
    tapeAndLevel: "Mètre ruban et niveau à bulle",
    level: "Niveau à bulle",
    clamps: "Serre-joints",
    saw: "Scie plongeante sur rail ou scie égoïne à denture fine",
    // A hammer action breaks the webs of a hollow brick, the plug then holds on nothing
    drillHollow: "Perceuse sans percussion",
    drillSolid: "Perceuse à percussion",
    resinGun: "Pistolet à cartouche",
    // No room for a clamp between a filler and the wall or the ceiling it closes on
    maskingTape: "Ruban de masquage, pour le maintien pendant la prise",
    // What makers recommend for furniture : it strikes without marking, the block spreads the blow on a decor
    mallet: "Maillet à tête caoutchouc (cale de bois sur un panneau fragile)",
};
// The AXILO 78 foot H100, clipped into its base under the bottom
const AXILO_FOOT = ("637.76.353");
// The rounded end goes on where the fitter likes, what closes on the walls in the room whatever the choice
const END_CHOICE = "À l'atelier ou sur place, au choix du poseur selon l'accès : les fileurs et les fixations murales "
    + "se posent de toute façon sur place";
// A recommendation, the wall was never sounded : the fitter may choose another way on the spot
const RESIN_NOTE = "Recommandé : tamis glissé dans le trou et rempli de résine de scellement, cheville enfoncée dans la "
    + "résine fraîche, platine vissée après la prise. Le mur n'a pas été sondé : le poseur peut choisir un autre "
    + "scellement sur place";
// A board down to the floor keeps the height of the drawing whatever the feet are set to (analysis.ts)
const FLOOR_NOTE = "Descend au sol, cotée pour des pieds à leur hauteur nominale : après le réglage des pieds, un "
    + "ajustement sur place peut être possible ou nécessaire";
// A carcass is fixed through its back : drilled in the workshop to the size of the plug, the wall drilled through it
// once the carcass stands levelled, the plug pushed through to the wall
const THROUGH_NOTE = "Montage traversant, meuble en place et réglé : percer le mur à travers le trou du fond, pousser la "
    + "cheville à travers le fond jusqu'au mur, puis visser avec sa rondelle";
// A board going onto its dowels, a dowel tapped into its bore
const ON_DOWELS = /ourillons/;


// The tool a head takes : Pozidriv by its size, a hex key for the button head of an M5 (ISO 7380-1:2011, key 3). The
// screws supplied with the Oslo pull have a plain cross, a Pozidriv bit would cam out of it
function toolOf(kind: string, diameter: number, label: string): string
{
    if (kind === "metric")
    {
        return TOOL.hexKey3;
    }
    if (/poignée Oslo/i.test(label))
    {
        return TOOL.phillips2;
    }
    return diameter <= 3 ? TOOL.pozidriv1 : TOOL.pozidriv2;
}


// Glob characters in a label kept as thy are
function literal(s: string): string
{
    return s.replace(/([*?[\]])/g, "[$1]");
}


// Steps acting on what stands, placing nothing : they name solids an earlier step put in
export const ACTIONS = new Set(["Serrage", "Retourner"]);

// How the piece lise, its work going down to the floor : a carcass on its back, its sdes open to both hands, on its
// face for the screws of its back, upside down for its feet. A worker drives a screw down, never up from the lfoor
export const POSITION = { standing: "Debout", back: "Couché sur le dos", face: "Couché sur la face",
                          upside: "À l'envers", flat: "À plat, quincaillerie dessus" };   
// The articles set from below and thier screws, as their catalogue entry says
const UNDERNEATH = Object.values(CAD_MODELS).filter((m) => { return m.fromBelow === true; }).flatMap((m) =>
{
    return [literal(`${m.ref} ${m.label}`), ...(m.fixing?.screws ? [literal(m.fixing.screws.label)] : [])];
});
// The position a screw driven this way needs to go down : on its back it goes towards the wall, upside down it goes up
const DOWN_TO: Record<string, string> = { "-z": POSITION.standing, "+z": POSITION.upside, "-y": POSITION.face,
                                         "+y": POSITION.back };
const PHASE_POSITION: Record<number, string> = {
    // The rounded end on the face as the back : its own back is screwed from behind as well
    0: POSITION.back, 1: POSITION.back, 2: POSITION.face, 3: POSITION.face, 4: POSITION.upside,
};


// The position of each step of an tiem or a bench, a step turnng it over each time it changes. In the room the
// piece stands where it goes : nothing turn there
function positioned(rows: GammeRow[], code: string, bench: "flat" | "box" | "standing" | null): GammeRow[]
{
    const out: GammeRow[] = [];
    let current: string | undefined;
    for (const row of rows)
    {
        // A box turns with its screws, each going down : its back laid on its open bakc, the box on its face
        const box = bench !== "box" ? undefined : DOWN_TO[row.direction]
            ?? (row.pbs.some((p) => { return /, fond$/.test(p); }) ? POSITION.face : current ?? POSITION.standing);
        // What goes on from below, the couplings of a drawer : the box upside down for them and their csrews
        const below = bench === "standing" && UNDERNEATH.some((head) => { return row.pbs.some((p) => { return p.startsWith(head); }); });
        const wanted = code === "#000" ? POSITION.standing
            : bench === "flat" ? POSITION.flat : box !== undefined ? box
            : below ? POSITION.upside : bench === "standing" ? POSITION.standing
            : ACTIONS.has(row.type) || typeof row.phase !== "number" ? current ?? POSITION.standing
            : PHASE_POSITION[row.phase] ?? POSITION.standing;
        if (current !== undefined && wanted !== current)
        {
            const what = bench === null ? "le meuble" : "l'ensemble";
            out.push({ pbs: [`${code}-000`], count: 1, type: "Retourner",
                      operation: `Retourner ${what} : ${wanted.toLowerCase()}`,
                       tool: "Aucun", direction: NA, comment: NA, position: wanted });
        }
        current = wanted;
        out.push({ ...row, position: wanted });
    } 
    return out;
}

// The boards screwed on by screws named after them, set and screwed at once
const BOARD_SCREWS = [{ board: /^#[0-9A-Z]{3}-\d{3} Façade de tiroir/, screws: "Vis 4 x 30 dans la façade" },
                      { board: /^#[0-9A-Z]{3}-\d{3} Plinthe, retour/,
                       screws: "Retour de plinthe dans la flasque basse" }];


// The screws of the hardware have their pilot holse bored in the workshop (pilots.ts) : only what is glued, with
// nothing drilled, is measured on site, a catch plate by its centre off the 2 nearest edges of its door
const GLUED = /^956A?\.?1004 Contreplaque TIP-ON à coller/;

function globOf(pattern: string): RegExp
{
    const text = pattern.replace(/\[([*?[\]])\]|([.+^${}()|\\])|(\*)|(\?)/g, (_, kept: string | undefined,
        special: string | undefined,
                                                                            star: string | undefined) =>
    {
        return kept !== undefined ? `\\${kept}` : special !== undefined ? `\\${special}` : star !== undefined ? ".*" : ".";
    });
    return new RegExp(`^${text}$`);
}


// Which way an edge of a board lokos in the room, by its outward nrmal : height along y, the front towards +z
function sideOf(normal: Vec3): string
{
    const k = [0, 1, 2].reduce((best, i) => { return Math.abs(normal[i]!) > Math.abs(normal[best]!) ? i : best; }, 0);
    const plus = normal[k]! > 0;
    return k === 1 ? (plus ? "haut" : "bas") : k === 2 ? (plus ? "avant" : "arrière") : (plus ? "droit" : "gauche");
}


function markedOn(rows: GammeRow[], boards: Board[], placed: Placed[], labelOf: (i: Placed) => string): GammeRow[]
{
    const local = (q: Board, p: Vec3): [number, number] =>
    {
        const f = q.frame!;
        const d: Vec3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
        return [dot(d, f.u), dot(d, f.v)];
    };
    const round = (x: number): string => { return String(Math.round(x * 10) / 10).replace(".", ","); };
    return rows.map((row) =>
    {
        const res = row.pbs.map(globOf);
        if (row.pbs.some((p) => { return GLUED.test(p); }))
        {
            const marks: string[] = [];
            for (const i of placed.filter((x) => { return res.some((re) => { return re.test(labelOf(x)); }); }))
            {
                const door = boards.find((q) => { return `${q.code} ${q.label}` === i.part && q.frame !== null; });
                if (door === undefined)
                {
                    continue;
                }
                const [u, v] = local(door, i.o);
                const f = door.frame!;
                const across = u < door.length - u ? { d: u, side: sideOf([-f.u[0], -f.u[1], -f.u[2]]) }
                    : { d: door.length - u, side: sideOf(f.u) };
                const along = v < door.width - v ? { d: v, side: sideOf([-f.v[0], -f.v[1], -f.v[2]]) }
                    : { d: door.width - v, side: sideOf(f.v) };
                marks.push(`centre à ${round(across.d)} mm du chant ${across.side} et ${round(along.d)} mm du chant ${along.side}`);
            }
            return marks.length === 0 ? row : { ...row,
                                               comment: `Pas d'avant-trou, repère : ${[...new Set(marks)].join(" ; ")}` };
        }
        return row;
    });
} 


// The item a screw between items goes into : the board of another item its shank runs through, read off where it is
// and the way it's driven, never off its label
function linkedItem(s: Screwed, boards: Board[]): string | undefined
{
    if (s.point === undefined) 
    {
        return undefined;
    }
    for (let d = 5; d <= 60; d += 5)
    {
        const tip: Vec3 = [s.point[0] - s.out[0] * d, s.point[1] - s.out[1] * d, s.point[2] - s.out[2] * d];
        const hit = boards.find((q) => { return q.item !== s.item && q.frame !== null && inBoard(q, tip); });
        if (hit !== undefined)
        {
            return hit.item;
        }
    }
    return undefined;
}


// The other item a connecting bolt goes into, found along its axis either way from where it's placed
function boltedItem(i: Placed, boards: Board[]): string | undefined
{
    for (let reach = 5; reach <= 60; reach += 5)
    {
        for (const way of [1, -1])
        {
            const spot: Vec3 = [i.o[0] + i.z[0] * reach * way, i.o[1] + i.z[1] * reach * way, i.o[2] + i.z[2] *
                                reach * way];
            const hit = boards.find((q) => { return q.item !== i.item && q.frame !== null && inBoard(q, spot); });
            if (hit !== undefined)
            {
                return hit.item;
            }
        }
    }
    return undefined;
}


// The board a pattern names, after its first ", #" : "#130-002 Tiroir 1, côté gauche"
function tagOf(pattern: string): string  
{
    return /, (#[0-9A-Z]{3}\b.*)$/.exec(pattern)?.[1] ?? pattern;
}


// Each article held the moment it can be, as its catalogue entry says : its screws right fater it, what's tightened in
// it as soon as it's set, or as soon as the board of its bolt is in. Set and left loose, it fell at the next step
export function fixedInTurn(rows: GammeRow[], ties: Map<string, Map<string, number>>, tighten: string): GammeRow[]
{
    const held = Object.values(CAD_MODELS).filter((m) => { return m.fixing !== undefined; }).map((m) =>
    {
        return { head: literal(`${m.ref} ${m.label}`), fixing: m.fixing! };
    });
    // A tightening row names the article it turns : read as the article again, it asked for one more without end
    const heldBy = (r: GammeRow): (typeof held)[number] | undefined =>
    {
        return r.type === "Serrage" ? undefined
            : held.find((h) => { return r.pbs.some((p) => { return p.startsWith(h.head); }); });
    };
    const phaseOf = (r: GammeRow): string => { return r.operation.slice(0, r.operation.indexOf(" : ") + 3); };
    const out = [...rows];
    for (let k = 0; k < out.length; k++)
    {
        const row = out[k]!;
        const article = heldBy(row);
        if (article === undefined)
        {
            continue;
        }
        const screws = article.fixing.screws;
        let next = k + 1;
        if (screws !== undefined)
        {
            // Placed by the export from the file, they may sit on another board than the article : by their label alone
            const tags = new Set(row.pbs.map(tagOf));
            const anywhere = screws.at !== undefined || screws.elsewhere === true;
            // Wherever they stood : screws before their article are the very fault, the clip screws of a plinth
            const theirs = out.filter((r) =>
            {
                return r !== row && r.pbs.some((p) =>
                {
                    return p.startsWith(literal(screws.label)) && (anywhere || tags.has(tagOf(p)));
                });
            });
            for (const screwRow of theirs)
            {
                out.splice(out.indexOf(screwRow), 1);
            }
            k = out.indexOf(row);
            next = k + 1;
            for (const screwRow of theirs)
            {
                out.splice(next++, 0, screwRow);
            }
        }
        const turn = article.fixing.tighten;
        if (turn?.once === "set")
        {
            out.splice(next, 0, { pbs: row.pbs, count: row.count, type: "Serrage",
                                  operation: `${phaseOf(row)}${turn.operation} sur ${tagOf(row.pbs[0]!)}`, tool: tighten,
                                  direction: NA, comment: NA });
        }
    }
    // A board screwed on holds by the screws its catalogue has no entry for : the front of a drawer by those driven
    // from inside its box, 5 steps after it was set in the film of a TV
    for (const { board, screws } of BOARD_SCREWS)
    {
        const k = out.findIndex((r) => { return r.pbs.some((p) => { return board.test(p); }) && r.type === "Vissage"; });
        if (k < 0)
        {
            continue;
        }
        const theirs = out.filter((r, j) => { return j > k && r.pbs.some((p) => { return p.startsWith(screws); }); });
        for (const [shift, screwRow] of theirs.entries())
        {
            out.splice(out.indexOf(screwRow), 1);
            out.splice(k + 1 + shift, 0, screwRow);
        }
    }
    // A Minifix cam is turned once the bolt of the other board sits in it : after the later of its own row and the
    // row of
    // that board, never before both are there
    const late: { at: number; row: GammeRow }[] = [];
    const turned = new Set<string>();
    for (const [k, row] of out.entries())
    {
        const turn = heldBy(row)?.fixing.tighten;
        if (turn?.once !== "mate")
        {
            continue;
        }
        const housed = tagOf(row.pbs[0]!);
        for (const [bolted, count] of ties.get(housed) ?? new Map<string, number>())
        {
            if (turned.has(`${housed}|${bolted}`))
            {
                continue;
            }
            turned.add(`${housed}|${bolted}`);
            // The board of the bolt built in another table : the turn is said here all the same, after its housing
            // to be done once that board is in. Skipped, the cam was never turned and nothing said so
            const placed = out.findIndex((r) => { return r.pbs.includes(literal(bolted)); });
            const at = placed < 0 ? k : Math.max(k, placed);
            late.push({ at, row: { pbs: row.pbs, count, type: "Serrage",
                                   operation: `${phaseOf(out[at]!)}Serrer les boîtiers Minifix de ${housed}, ils tirent `
                                       + bolted,
                                   tool: tighten, direction: NA,
                                   comment: placed < 0 ? `Goujon sur ${bolted}, monté dans une autre table : serrer une `
                                       + "fois ce panneau en place" : NA } });
        }
    }
    for (const { at, row } of late.sort((a, b) => { return b.at - a.at; }))
    {
        out.splice(at + 1, 0, row);
    }
    return out;
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
    // stadn, is only seen by going on. Bounded, the greedy order kept past it
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
                      models: Record<string, { ref: string; label: string }>, assemblies: Assembly[],
                      stops: Map<string, { amount: number; by: string }> = new Map()): GammeTable[]
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
    // Titled by what the bench builds and not by the phase : the pull of a door read "Monter le tiroir"
    const drawerTables = new Set(boards.filter((q) =>
    {
        return ["boxSide", "boxEnd", "boxBottom", "drawerFront"].includes(q.role);
    }).map(tableOf));
    // A front plinth gets its clips in hand on the bench, whatever the phase its parts have in a caracss
    const plinthTables = new Set(boards.filter((q) => { return q.role === "plinth"; }).map((q) => { return tableOf(q); })
        .filter((t) => { return isBench(t); }));
    const benchTitle = (table: string, phase: Phase): string | undefined =>
    {
        if (plinthTables.has(table))
        {
            return "Garnir la plinthe avant";
        }
        if (!isBench(table) || (phase !== PHASE.drawers && phase !== PHASE.doors && phase !== PHASE.lining))
        {
            return undefined;
        }
        if (phase === PHASE.lining)
        {
            return "Monter l'habillage";
        }
        return drawerTables.has(table) ? "Monter le tiroir" : "Monter la façade";
    };
    // One entry for each solid : its table, its phase or what it waits for in the roo, the key it's grouped by
    interface Entry { table: string; phase: Phase | Room; rank: number; key: string; pattern: string; direction: string;  
                      type: string; tool: string; what: string; comment: string; host?: string; waits?: string;
                      also?: { pattern: string; count: number }; mate?: string; kind?: "dowel" | "bolt" | "set" }
    const entries: Entry[] = [];
    const boardKey = new Map(boards.map((q) => { return [`${q.item}|${q.code} ${q.label}`, `b|${q.id}`]; }));
    const boardName = new Map(boards.map((q) => { return [`b|${q.id}`, `${q.code} ${q.label}`]; }));
    const order = connectorOrder(boards, placed, models, (q) => { return boardStep(q).phase; });
    // The ceiling filler and its cleat are set once the carcass stands (ceiling.ts) : screwed on the bench, the cleat
    // went up with the carcass and left 6 mm under the ceiling
    // TODO the filler screws from the back edge of its cleat, against the wall : its fixing is still to choose
    const up = new Map(boards.filter((q) => { return /\/filler(-cleat)?$/.test(q.id); }).map((q) =>
    {
        return [`${q.code} ${q.label}`, q.item];
    }));
    const closed = new Set(up.values());
    for (const q of boards)
    {
        const table = tableOf(q);
        // On the bench a door is laid flat, what goes onto it comes to it : nothing to clip yet
        const laid = isBench(table) && ["door", "flap", "leaf", "plinth"].includes(q.role);
        // The lining of a niche is screwed together on the bench, slid into its cell whole afterwards
        const lined = isBench(table) && q.role === "lining";
        // A plinth first of its table, its clips onto it
        const s = laid ? { phase: q.role === "plinth" ? PHASE.pre : PHASE.doors, direction: NA,
                          type: "Pose sur l'établi" }
            : lined ? { phase: PHASE.lining, direction: NA, type: "Pose" } : boardStep(q);
        const o = order.get(q.id);
        const ceiling = up.get(`${q.code} ${q.label}`);
        // A side filler and its plinth are cut to what was measured once the carcass is presented : its cleat early
        const scribed = ceiling === undefined && (q.role === "filler" || (q.role === "plinth" &&
            q.id.includes("/side-filler/")));
        // A filler is glued on its cleat once the carass stands, up to the ceiling or against a side wall (fillers.ts)
        const upCleat = ceiling !== undefined && /\/filler-cleat$/.test(q.id);
        const glued = (ceiling !== undefined && !upCleat) || (scribed && q.role === "filler");
        // An adjustable shelf goes in once its carcass stands fixed : carried or stood up loose, it slid off its pins
        const loose = q.role === "shelf" && !isBench(table);
        entries.push({ table, phase: ceiling !== undefined ? "ceiling" : scribed ? "scribe" : loose ? "fronts" : s.phase,
                      rank: ceiling !== undefined ? (upCleat ? CEILING_RANK.cleat : CEILING_RANK.filler)
                          : loose ? FRONT_RANK.shelf : endBack(q) ? LOOSE : lined ? looseRank(table) + liningRank(q.label)
                          : o?.rank ?? (s.phase === PHASE.runners ? SPACER_RANK : looseRank(table)),
                      key: `b|${q.id}`,
                       pattern: literal(`${q.code} ${q.label}`), direction: o?.direction ?? s.direction,
                       type: glued ? "Collage" : upCleat ? "Pose" : s.type,
                       tool: glued ? TOOL.maskingTape : ON_DOWELS.test(s.type) ? TOOL.mallet : "Aucun",
                       what: `${q.code} ${q.label}`, waits: ceiling ?? (scribed || loose ? q.item : undefined),
                       // Its edge bands, glued on in the workshop, come with it (freecad_build.py, "<board>, chant L1")
                       also: bandsOf(q) > 0 ? { pattern: `${literal(`${q.code} ${q.label}`)}, chant *`,
                                               count: bandsOf(q) }
                           : undefined,
                       // How it hold, said : the step only read "posé" (ceiling.ts glues it with the PU of the list)
                       comment: upCleat ? "Posé à plat sur le dessus, le meuble en place : vissé par-dessous depuis la case haute"
                           : ceiling !== undefined
                           ? "Encollé à la colle polyuréthane sur son tasseau et contre le dessus, maintenu le temps de la prise"
                           : glued ? "Encollé à la colle polyuréthane sur le chant avant de son tasseau, maintenu le temps de la prise"
                           : s.type === "Pose sur cale" ? "Posée sur une cale de la hauteur qui la sépare du sol, jusqu'à "
                               + "ce que ce qui s'y visse la tienne" + (q.toFloor === true ? `. ${FLOOR_NOTE}` : "")
                           : q.toFloor === true ? FLOOR_NOTE
                           : o?.crossed === true ? "Goujons ou tourillons dans deux sens : ordre et mouvement à juger" : NA });
    }
    // A light in the way of a loose carcass goes in once the last of them stands (loose.ts)
    const rank = new Map(assemblyOrder(p).map((it, k) => { return [it.id, k]; }));
    const nameOf = new Map(p.items.map((it) => { return [it.id, it.name]; }));
    // Stood up from its back, a carcass sweeps the diagonal of its heght and depth : too close to the ceiling with
    // its feet on, clear without them, the feet go on once it stands (2356 with feet under 2440 left 27 mm, 124 without)
    const feetAfterStanding = (item: string): boolean =>
    {
        const c = p.items.find((it) => { return it.id === item; });
        if (c === undefined || c.kind !== "carcass")
        {
            return false;
        }
        const room = p.room.height;
        return room - Math.hypot(c.y + c.height, c.depth) < STAND_UP_MARGIN
            && room - Math.hypot(c.height, c.depth) >= STAND_UP_MARGIN;
    };
    const isCarcass = (item: string): boolean =>
    {
        return p.items.some((it) => { return it.id === item && it.kind === "carcass"; });
    };
    // The drill for the wall it's set in, the bit of the plug's diameter, the gun for the resin it goes into
    const plugTools = (label: string, resin: boolean): string =>
    {
        // In resin the hole takes the sieve, wider and deeper than the plug : its sheet says how (data/hardware.ts)
        const bit = resin ? String(SIEVE_BORE.diameter) : /(\d+) x \d+/.exec(label)?.[1];
        const deep = resin ? String(SIEVE_BORE.depth) : undefined;
        const drill = p.settings.wallType === "hollow" ? TOOL.drillHollow : TOOL.drillSolid;
        const named = `${bit === undefined ? "" : `, foret Ø${bit}`}${deep === undefined ? "" : ` sur ${deep} mm au moins`}`;
        return [`${drill}${named}`, ...(resin ? [TOOL.resinGun] : [])].join(", ");
    };
    // The plugs of a wall shelf in a hollow wall go into resin (hung_items.ts, RESIN_CHEM)
    const resined = (ref: string, item: string): boolean =>
    {
        return ref.startsWith("PLUG") && p.settings.wallType === "hollow"
            && p.items.some((it) => { return it.id === item && it.kind === "wallShelf"; });
    };
    for (const [index, i] of placed.entries())
    {
        // An article with no model in the catalogue, a runner of a length never drawn : left out here, the checks of
        // the analysis name it, rather than the whole set of drawings falling on it
        const m = models[i.model];
        if (m === undefined)
        {
            continue;
        }
        const liaison = m.ref.startsWith("267.07");
        const sleeve = liaison && i.model.endsWith(".sleeve");
        if (i.after !== undefined && i.after.length > 0)
        {
            const last = i.after.reduce((a, q) => { return (rank.get(q) ?? 0) >= (rank.get(a) ?? 0) ? q : a; });
            // The profile screwed under its panel, the strip already stuck in it. In through the open frotn, then up
            // under the panel : straight up it went throgh the bottom of the niche
            const profile = m.ref.startsWith("LED_PROFILE");
            entries.push({ table: "#000", phase: "loose", rank: 0, key: `a|${i.model}|${i.item}|${i.part}`,
                           pattern: `${literal(`${m.ref} ${m.label}`)} *, ${literal(i.part)}`, direction: "+y puis +z",
                           type: profile ? "Vissage" : "Collage", tool: profile ? TOOL.pozidriv1 : "Aucun",
                           what: `${m.label} sur ${i.part}`, waits: last,
                           comment: profile ? `À dévisser avant de sortir ${i.after.map((x) => { return nameOf.get(x) ?? x; }).join(", ")}`
                               : "Collé dans le profilé, il en sort avec lui" });
            continue;
        }
        // A screw cap, once the screw it covers is in : last of its table, or of the whole for a screw of the room
        if (m.ref === "EDGE_CAP")
        {
            const room = ROOM_SCREWS.has(i.covers ?? "");
            const own = room ? "#000" : tableOf(i);
            entries.push({ table: own, phase: room ? "finish" : PHASE.other, rank: isBench(own) ? LOOSE + 1 : 0,
                           // One row for the caps of a board laid the same way : their pattern
                           // tells the screws not apart
                           key: `a|${i.model}|${i.item}|${i.part}|${room ? "room" : "own"}`,
                           pattern: `${literal(`${m.ref} ${m.label}`)} *, ${literal(i.part)}`, direction: NA,
                           type: TAPED.has(i.covers ?? "") ? "Double face" : "Collage", tool: "Aucun",
                           what: `cache-vis sur ${i.part}`,
                           // Its mark is the head it hides : nothing to measure, unike a catch plate
                           comment: "Sur la tête de vis qu'il cache, taillé dans le chant du décor, fil orienté comme "
                               + "le panneau" });
            continue;
        }
        const table = tableOf(i);
        // The arm of a hinge is pressed into its cup on the bench : it clips onto its plate when the door is hung
        const s = isBench(table) && /^(70T|71B)/.test(m.ref) ? { phase: PHASE.doors, direction: NA, type: "Insertion" }
            : articleStep(m.ref, m.label); 
        // The half of a flap hinge on the floor of the cell comes with its hinge, screwed thee when the flap is set
        const away = isBench(table) && !i.part.startsWith(`${table}-`);
        // A dowel or a Minifix bolt ties its board to the one its tip goes into : that board decides when it goes in
        const host = s.phase === PHASE.pre ? boardKey.get(`${i.item}|${i.part}`) : undefined;
        const tie = CONNECTORS[m.ref];
        let mate: string | undefined;
        if (host !== undefined && tie !== undefined)
        {
            const way = tie.axis === "x" ? i.x : i.z;
            const tip: Vec3 = [i.o[0] + way[0] * tie.reach, i.o[1] + way[1] * tie.reach, i.o[2] + way[2] * tie.reach];
            const other = boards.find((q) =>
            {
                return q.item === i.item && q.frame !== null && `b|${q.id}` !== host && inBoard(q, tip);
            });
            mate = other === undefined ? undefined : `b|${other.id}`;
        } 
        const kind = m.ref === "DOWEL_8x35" ? "dowel" as const : m.ref === "262.28.020" ? "bolt" as const : "set" as const;
        // Set in a board : each solid by its own label (freecad_build.py numbers them in this order), the dowels of one
        // board going into 2 others make 2 steps and a pattern of the board would name both
        const set = host !== undefined;
        // The TIP-ON itself once the screws of its adapter are in. Without an adapter on its board it's pushed into a
        // hole drilled for it (doors.ts, fitTipOnHole)
        const clipped = /^956A?\.?1004$/.test(m.ref) && !/^Contreplaque/.test(m.label);
        const drilled = clipped && !placed.some((x) =>
        {
            return x.item === i.item && x.part === i.part && models[x.model]?.ref === "956.1201";
        });
        // Its catch plate glued once the hinges are screwed : before, they only sat in their bores
        const glued = /^Contreplaque/.test(m.label);
        // The housing of a TIP-ON adapter clips onto its plate once the plate is screwed : its screws go through
        // the plate, the housing over them
        const housing = i.model === "956.1201.box";
        // Under a carcass : the return and its screws, the bases, the clips of the return, the feet
        // clipping into them as
        // they go on. Those of the front plinth are screwed on at the bench
        // The bases before the clips of the return : one went up through the clip next to its foot
        const underneath = m.ref === "637.76.333" ? 1 : m.ref === "637.38.054" ? (/retour/.test(i.part) ? 2 : 3)
            : m.ref === "637.76.353" ? 4 : 0;
        // The strut of a stay clips between its 2 brackets once they're screwed : first, it hung in the air
        const strut = m.ref === "365.01.901" && /vérin/.test(m.label) ? 1 : 0;
        // The feet of a carcass too tall to be stood up with them clip into their bases once it stands
        const later = m.ref === AXILO_FOOT && feetAfterStanding(i.item);
        // A connecting bolt ties 2 items as soon as the later of them stands levelled, before either goes to the wall
        const bolted = liaison ? boltedItem(i, boards) : undefined;
        const tiedTo = bolted === undefined ? undefined
            : (rank.get(bolted) ?? -1) > (rank.get(i.item) ?? -1) ? bolted : i.item;
        // The pins of a loose shelf and the halves of a stay riding on its flap come on site with them, the bracket
        // on the side of the cell screwed in the workshop
        const pin = m.ref === "282.24.727" && !isBench(table);
        const onFlap = m.ref === "365.01.901" && /vérin|équerre d'abattant/.test(i.part);
        const onSite = pin || onFlap;
        // The pins first : a shelf is laid on them, set before them it stood on nothing
        entries.push({ table: later ? "#000" : table, phase: later ? "feet" : onSite ? "fronts" : s.phase,
                       waits: later || onSite ? i.item : tiedTo,
                       rank: pin ? FRONT_RANK.pin : onFlap ? (strut > 0 ? FRONT_RANK.strut : FRONT_RANK.flapBracket)
                           : m.ref === "282.24.727" ? PIN_RANK
                           : looseRank(table) + (clipped ? 2 : glued || housing ? 1 : 0) + underneath + strut,
                       key: `a|${i.model}|${i.item}|${i.part}${set ? `|${mate ?? ""}` : ""}`,
                       pattern: set ? literal(`${m.ref} ${m.label} ${index + 1}, ${i.part}`)
                           : `${literal(`${m.ref} ${m.label}`)} *, ${literal(i.part)}`, direction: s.direction,
                       // The sleeve of a connecting bolt pushed in by hand, its screw driven into it from the other side
                       type: away ? "Pose" : drilled || sleeve ? "Insertion" : housing ? "Clipsage" : s.type,
                       tool: liaison && !sleeve ? TOOL.pozidriv2 : kind === "dowel" ? TOOL.mallet
                           : m.ref.startsWith("PLUG") ? plugTools(m.label, resined(m.ref, i.item)) : "Aucun",
                       what: away ? `${m.label}, venue avec l'autre moitié, vissée sur ${i.part} à la pose` : `${m.label} sur ${i.part}`,
                       comment: resined(m.ref, i.item) ? RESIN_NOTE
                           : m.ref.startsWith("PLUG") && isCarcass(i.item) ? THROUGH_NOTE : NA,
                       host, mate, kind: host === undefined ? undefined : kind });
    }
    for (const s of screws)
    {
        // Those holding the filler on its cleat go with the filler
        const into = /dans le fileur/.test(s.label);
        // Up through the top into the cleat of the ceiling filler, once the carcass stands (ceiling.ts)
        const cleatUp = /^Tasseau du fileur de plafond/.test(s.label);
        const ceiling = up.get(s.tag) ?? (cleatUp || (into && closed.has(s.item)) ? s.item : undefined);
        // Through the cleat into a side filler : once the filler is cut and offered up
        const scribed = ceiling === undefined && into;
        // Those of the back of a rounded end follow it, after the shaped boards they go into
        const onEndBack = boards.some((q) => { return `${q.code} ${q.label}` === s.tag && endBack(q); });
        const phase = ceiling !== undefined ? "ceiling" as const : scribed ? "scribe" as const
            : onEndBack ? PHASE.end : screwPhase(s.label);
        // A screw tying 2 items goes in as soon as the later of them stands : the bookcase column tipped under 0.2 kg
        // for 11 steps while it waited for the end of the whole
        const tied = phase === "link" ? linkedItem(s, boards) : undefined;
        const later = tied === undefined ? undefined
            : (rank.get(tied) ?? -1) > (rank.get(s.item) ?? -1) ? tied : s.item;
        const waits = ceiling ?? (scribed ? s.item : later);
        const direction = axis([-s.out[0], -s.out[1], -s.out[2]]);
        const table = tableOf(s);
        const spot = ceiling !== undefined ? (cleatUp ? CEILING_RANK.cleatScrew : CEILING_RANK.intoFiller)
            : onEndBack ? LOOSE : LINING_SCREW.test(s.label) ? looseRank(table) + liningRank(s.tag, true)
            : SPACER.test(s.label) ? SPACER_RANK : looseRank(table);
        // The washer goes on before its scerw
        if (s.washer === true)
        {
            entries.push({ table, phase, rank: spot, key: `w|${s.tag}`, pattern: `Rondelle *, ${literal(s.tag)}`,
                          direction,
                           type: "Pose", tool: "Aucun", what: `rondelles sur ${s.tag}`, comment: NA, waits });
        }
        // Cut at the comma before the next words, not at the one of "Ø3,5"
        entries.push({ table, phase, rank: spot, key: `s|${s.label}|${s.tag}`, pattern: literal(`${s.label}, ${s.tag}`),
                      direction,
                       type: "Vissage", tool: toolOf(s.kind, s.diameter,
                                                     s.label), what: `${s.label.replace(/, .*$/, "")} sur ${s.tag}`,
                       comment: COUPLING_SCREW.test(s.label) ? COUPLING_SCREW_NOTE : NA, waits });
    }
    // Screws of one label on one board make one step : those into 2 wall shelves wat for the later one
    const lastOf = new Map<string, string>();
    for (const e of entries.filter((x) => { return x.phase === "link" && x.waits !== undefined; }))
    {
        const was = lastOf.get(e.key);
        lastOf.set(e.key, was === undefined || (rank.get(e.waits!) ?? -1) > (rank.get(was) ?? -1) ? e.waits! : was);
    }
    for (const e of entries.filter((x) => { return x.phase === "link" && lastOf.has(x.key); }))
    {
        e.waits = lastOf.get(e.key);
    }
    // What is set in a board follows it when it goes on in the room : the dowels of the plinth of a side filler
    const boardEntry = new Map(entries.filter((e) => { return e.key.startsWith("b|"); }).map((e) => { return [e.key,
        e]; }));
    for (const e of entries)
    {
        const board = e.host === undefined ? undefined : boardEntry.get(e.host);
        if (board !== undefined && typeof board.phase !== "number")
        {
            e.phase = board.phase;
            e.table = board.table;
            e.waits = board.waits;
        }
    }
    // Each sub-assembly fitted whole into its item, once what holds it's there : last of its phase, after the runners
    // and the plates. Its kind read off its own boards
    for (const sub of assemblies.filter((a) => { return Boolean(a.parent); }))
    {
        const code = sub.code.slice(0, 4);
        const own = boards.filter((q) => { return q.assembly === code; });
        const front = own.find((q) => { return ["door", "drawerFront", "flap", "leaf"].includes(q.role); });
        // A drawer of its own behind a flap slides on its runners once the stays of the flap are on : set first, the
        // strut of a stay met its dowels on its way in
        const pullOut = own.some((q) => { return q.id.includes("/pull-out/"); });
        const pose = pullOut ? { phase: PHASE.inside, type: "Clipsage", direction: "+y" }   
            : own.some((q) => { return q.role === "lining"; })
            ? { phase: PHASE.lining, type: "Glissé dans la case", direction: "+y" }
            // Its clips screwed on in hand, it clips onto the feet once they stand
            : own.some((q) => { return q.role === "plinth"; }) ? { phase: PHASE.plinth, type: "Clipsage",
                                                                  direction: SPECIAL }
            : front === undefined || front.role === "drawerFront"
            ? { phase: PHASE.drawers, type: "Clipsage", direction: "+y" }
            : front.role === "leaf" ? { phase: PHASE.doors, type: "Emboîtement", direction: SPECIAL }
            : front.role === "flap" && /^Abattant tombant/.test(front.label) ? { phase: PHASE.doors,
                type: "Vissage", direction: SPECIAL }
            : { phase: PHASE.doors, type: "Clipsage", direction: SPECIAL };
        const drawer = pullOut || front?.role === "drawerFront";
        // The plinth clips onto feet levelled in the room : clipped in the workshop, it hid feet set later and was
        // on before they were levelled
        const onSite = own.some((q) => { return q.role === "plinth"; });
        // A front hangs on a carcass standing fixed : carried on it, it was in the way of every hand and weighed on
        // feet levelled under load only up to 80 kg
        const hung = !drawer && !onSite && front !== undefined && pose.phase === PHASE.doors;
        const flapFirst = front?.role === "flap" && /^Abattant tombant/.test(front.label);
        // A wall stopping the door short of its hinges is a choice, said to the fitter : no stop bought
        const stop = front === undefined ? undefined : stops.get(front.id);
        entries.push({ table: drawer || onSite || hung ? "#000" : sub.parent!.slice(0, 4),
                       phase: drawer ? "drawers" : onSite ? "plinth" : hung ? "fronts" : pose.phase,
                       waits: onSite || hung ? sub.item : undefined,
                       rank: hung ? (flapFirst ? FRONT_RANK.flap : FRONT_RANK.door) : Number.MAX_SAFE_INTEGER,
                       key: `u|${code}`, pattern: `${code}-000`, direction: pose.direction, type: pose.type, tool: "Aucun",
                       what: `${code}-000 ${sub.name}, monté à l'établi`,
                       comment: stop === undefined ? NA
                           : `Ouverte au-delà de ${stop.amount}°, elle touche ${stop.by} : pas de limiteur d'ouverture, `
                               + "choix volontaire, modifiable sur demande" });
    }
    // Rows : one per key, by phase, then by tied boards, then as met. The dowels and bolts set in a board com with it
    // in its step : alone they would hang in the air
    // Which board's Minifix bolts go into which board's housings, and how many : the cams turn once both are in
    const tagOfKey = new Map(boards.map((q) => { return [`b|${q.id}`, `${q.code} ${q.label}`]; }));
    const ties = new Map<string, Map<string, number>>();
    for (const e of entries)
    {
        const housed = e.mate === undefined ? undefined : tagOfKey.get(e.mate);
        const bolted = e.host === undefined ? undefined : tagOfKey.get(e.host);
        if (e.kind !== "bolt" || housed === undefined || bolted === undefined)
        {
            continue;
        }
        const into = ties.get(housed) ?? new Map<string, number>(); 
        into.set(bolted, (into.get(bolted) ?? 0) + 1); 
        ties.set(housed, into);
    }
    const rowsOf = (mine: Entry[]): GammeRow[] =>
    {
        const keys = [...new Set(mine.map((e) => { return e.key; }))];
        const own = new Set(keys);
        const entriesOf = (k: string): Entry[] => { return mine.filter((e) => { return e.key === k; }); };
        const riding = new Set(mine.filter((e) => { return e.host !== undefined &&
                                                   own.has(e.host); }).map((e) => { return e.key; }));
        const main = keys.filter((k) => { return !riding.has(k); }).map((k, n) =>
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
        });
        // What is set in a board gets its own step right after it, or after the board its tip goes into when that one
        // stands first : a dowel is glued into whichever board is there. A bolt whose board comes second is screwed in
        // before, that board brings it along
        const at = new Map(main.map((r, k) => { return [r.e.key, k]; }));
        const carried = new Map<string, Entry[][]>();
        const after = new Map<string, Entry[][]>();
        // A board set in the room goes onto a piece standing built : its dowels tie it to that piece, glued in it before
        // it slides on. The plinth of a side filler set first met the dowels it was given after
        const before = new Map<string, Entry[][]>();
        for (const k of riding)
        {
            const group = entriesOf(k);
            const first = group[0]!;
            const host = first.host!;
            if (typeof first.phase !== "number" && first.kind === "dowel")
            {
                before.set(host, [...(before.get(host) ?? []), group]);
                continue;
            }   
            const mate = first.mate !== undefined && at.has(first.mate) ? first.mate : undefined;
            const mateFirst = mate !== undefined && at.get(mate)! < at.get(host)!;
            const target = first.kind === "bolt" && mateFirst ? carried : after;
            const anchor = first.kind === "dowel" && mateFirst ? mate! : host;
            target.set(anchor, [...(target.get(anchor) ?? []), group]);
        }
        return main.flatMap(({ e, n, way }) =>
        {
            const title = typeof e.phase !== "number" ? ROOM_TITLE[e.phase]
                : benchTitle(e.table, e.phase) ?? PHASE_TITLE[e.phase];
            const withIt = carried.get(e.key) ?? [];
            // Bolts of one board going into 3 others are one gesture on that board : counted together
            const named = new Map<string, number>();
            for (const g of withIt)
            {
                const name = g[0]!.what.replace(/ sur .*$/, "");
                named.set(name, (named.get(name) ?? 0) + g.length);
            }
            const garnish = withIt.length === 0 ? "" : `, garni : ${[...named].map(([name, count]) =>
            {
                return `${count} x ${name}`;
            }).join(", ")}`;
            const bands = e.also?.count ?? 0;
            // Each solid of the group : one pattern for all of them, or the own label of each set in a board
            const patterns = [...new Set(mine.filter((x) => { return x.key === e.key; }).map((x) => { return x.pattern; }))];
            const row: GammeRow = { pbs: [...patterns, ...(e.also === undefined ? [] : [e.also.pattern]),
                                          ...withIt.flatMap((g) => { return g.map((x) => { return x.pattern; }); })],
                                    count: n + bands + withIt.reduce((s, g) => { return s + g.length; },
                                                                     0), type: e.type,
                                    operation: `${title} : ${e.what}${garnish}`, tool: e.tool, direction: way,
                                    comment: way !== SPECIAL ? e.comment : e.comment === NA ? specialMove(e.type,
                                        e.phase)
                                        : `${specialMove(e.type, e.phase)}. ${e.comment}`,
                                    phase: e.phase };
            // One step for what says the same on this board, whichever board each tip gose into
            const said = new Map<string, Entry[]>();
            for (const g of after.get(e.key) ?? [])
            {
                const r = g[0]!;
                // Glued first into the board standing before its own
                const what = r.host === e.key ? r.what : `${r.what.replace(/ sur .*$/, "")} dans ${boardName.get(e.key)}`;
                said.set(what, [...(said.get(what) ?? []), ...g]);
            }
            const set = [...said].map(([what, g]): GammeRow =>
            {
                const r = g[0]!;
                return { pbs: g.map((x) => { return x.pattern; }), count: g.length, type: r.type,
                         operation: `${title} : ${g.length} x ${what}`, tool: r.tool, direction: r.direction,
                         comment: r.comment, phase: r.phase };
            });
            const first = (before.get(e.key) ?? []).map((g): GammeRow =>
            {
                const r = g[0]!;
                return { pbs: g.map((x) => { return x.pattern; }), count: g.length, type: r.type,
                         operation: `${title} : ${g.length} x ${r.what}`, tool: r.tool, direction: r.direction,
                         comment: r.comment, phase: r.phase };
            });
            return [...first, row, ...set];
        });
    };
    const inRoom = (e: Entry): boolean => { return typeof e.phase !== "number"; };
    const tables: GammeTable[] = [];
    const items = assemblyOrder(p).filter((it) => { return codeOf.has(it.id); });
    // A wall shelf is one board set on its plates : no table of its own, its step comes in the whole once the plats
    // are on the wall. Played on its own first, it was set on plates not yet there
    const onPlates = new Map<string, GammeRow[]>();
    // The rows of a table, each article held in turn and measured where nohing is drilled
    const labelOf = (i: Placed): string => { return `${models[i.model]?.ref} ${models[i.model]?.label} 1, ${i.part}`; };
    const made = (rows: GammeRow[]): GammeRow[] =>
    {
        return markedOn(fixedInTurn(rows, ties, TOOL.pozidriv2), boards, placed, labelOf);
    };
    // Glued on dowels with no Minifix to pull it together : clamped once its last board is on, checked square while
    // the glue is wet, left to set
    const clamped = (rows: GammeRow[], code: string): GammeRow[] =>
    {
        const last = rows.map((r) => { return ON_DOWELS.test(r.type); }).lastIndexOf(true);
        if (last < 0 || rows.some((r) => { return r.type === "Serrage" && /Minifix/.test(r.operation); }))
        {
            return rows;
        }
        const title = rows[last]!.operation.slice(0, rows[last]!.operation.indexOf(" : "));
        return [...rows.slice(0, last + 1),
                { pbs: [`${code}-000`], count: 1, type: "Serrage", tool: TOOL.clamps, direction: NA,
                 phase: rows[last]!.phase,
                  operation: `${title} : Serrer l'assemblage collé aux serre-joints`,
                  comment: "Équerrage contrôlé aux diagonales avant la prise, laissé serré le temps de prise de la colle" },
                ...rows.slice(last + 1)];
    };
    // Each item after what is built on the bench for it, a drawer ready befoe the carcass it goes into
    for (const it of items)
    {
        const code = codeOf.get(it.id)!;
        for (const sub of subsOf(code))
        {
            const own = sub.code.slice(0, 4);
            // A door or a plinth lies flat, a lining is a box built on its back, a drawer box stands
            const roles = new Set(boards.filter((q) => { return q.assembly === own; }).map((q) => { return q.role; }));
            const kind = ["door", "flap", "leaf", "plinth"].some((r) => { return roles.has(r); }) ? "flat" as const
                : roles.has("lining") ? "box" as const : "standing" as const;
            tables.push({ code: own, name: sub.name, rows: positioned(clamped(made(rowsOf(entries.filter((e) =>
            {
                return e.table === own && !inRoom(e);
            }))), own), own, kind) });
        }
        const rows = made(rowsOf(entries.filter((e) => { return e.table === code && !inRoom(e); })));
        if (it.kind === "wallShelf")
        {
            onPlates.set(code, rows);
            continue;
        }
        // The rounded end may go on in the workshop or in the room, the fitter's choice : the item passes whole or not
        const first = rows.findIndex((r) => { return r.phase === PHASE.end; });
        const told = first < 0 ? rows : rows.map((r, k) =>
        {
            return k !== first ? r : { ...r, comment: [END_CHOICE,
                                                       r.comment].filter((x) => { return x !== NA; }).join(". ") };
        });
        tables.push({ code, name: it.name, rows: positioned(clamped(told, code), code, null) });
    }
    // The whole : each itm in turn, its plugs in the wall first, what it hangs on, the item on the floor towards the
    // wall or down onto the one under it, its screws into the wall, then waht ties the items to each other
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
                             + "posé et réglé", tool: TOOL.tapeAndLevel, direction: NA,
                         comment: "Avant de percer le mur : platines percées à cette cote, au centre de leurs oblongs de "
                             + "réglage en hauteur" });
        }
        // A carcass is drilled through its back once it stands levelled (wall_fixing.ts) : only what hangs on plates
        // has its plugs set first, the plates marked off the measured top
        const throughBack = it.kind === "carcass";
        whole.push(...(throughBack ? [] : room(code, "plug")), ...room(code, "before"));
        // A loose carcass slides in towards the wall, the others go down onto what stands under them. Too near the
        // ceiling to be stood up there, set on the front of the one under it and slid back : the column of the TV wall
        // has 6 mm over the cleat of its fliler, screwed on its top before it goes up
        const loose = it.kind === "carcass" && it.freeStanding === true;
        // On another when a carcass stands right under it : the base unit stands on its feet, 100 off the floor
        const onAnother = it.kind === "carcass" && !loose && p.items.some((q) =>
        {
            return q.kind === "carcass" && q !== it && q.wall === it.wall && Math.abs(q.y + q.height - it.y) < 0.5
                && q.x < it.x + it.width && q.x + q.width > it.x;
        });
        const gap = it.kind === "carcass" ? p.room.height - (it.y + it.height) : Infinity;
        // The cleat of a ceiling filler is screwed on once the carcass stands (ceiling.ts) : the whole gap to clear
        const over = gap;
        const stand = it.kind === "carcass" ? Math.hypot(it.height, it.depth) - it.height : 0;
        const slid = onAnother && over < stand + STAND_UP_MARGIN;
        const shelfRows = onPlates.get(code);
        if (shelfRows !== undefined)
        {
            whole.push(...shelfRows.map((r) =>
            {
                return { ...r, operation: r.operation.replace(/^[^:]*: /, "Poser l'étagère : ") };
            }));
        }
        else
        {
            // Too tall to be stood up with its feet : stood up in front of its place, its feet clipped in there, then
            // slid in. Against the wall it could not tip back to free its front feet
            whole.push(...rowsOf(entries.filter((e) => { return e.phase === "feet" && e.waits === it.id; }))
                .map((r) => { return { ...r, comment: "Relevé devant son emplacement, sans ses pieds, trop haut pour le "
                    + "plafond avec eux : clipser chaque pied dans son embase, puis glisser le meuble en place" }; }));
            whole.push({ pbs: [`${code}-000`], count: 1, type: "Mise en place",
                         operation: `Mettre en place ${code}-000 ${it.name}`,
                         tool: "Aucun", direction: slid ? "-z puis +y" : onAnother ? "-z" : "+y",
                         comment: loose ? "Glissée à la main, sans fixation"
                             : slid ? `Posée sur l'avant du meuble du dessous puis glissée vers le mur : `
                                 + `${Math.round(over)} mm sous le plafond`
                             : NA });
            // Its feet set level before anything is measured off it or set on it : adjustable under load only up to
            // an 80 kg cabinet (Häfele p. 11.43A), the bare carcass under it, its fronts and drawers over it
            if (placed.some((i) => { return i.item === it.id && models[i.model]?.ref === AXILO_FOOT; }))
            {
                whole.push({ pbs: [`${code}-000`], count: 1, type: "Réglage", tool: TOOL.level, direction: NA,
                             operation: `Régler à niveau les pieds AXILO de ${code}-000 ${it.name}`,
                             comment: "Caisson vide, avant de poser ce qui va dessus : réglage sous charge limité à 80 kg "
                                 + "de meuble (Häfele), étagères, façades et tiroirs posés une fois le meuble fixé" });
            }
            // Before the filler is measured : the plinth of a side filler is dowelled onto this one
            whole.push(...rowsOf(entries.filter((e) => { return e.phase === "plinth" && e.waits === it.id; })));
        }
        // Tied to what stands already as soon as it stands levelled : bolted once both are on the wall, the holes
        // drilled in the workshop no longer met
        whole.push(...rowsOf(entries.filter((e) => { return e.phase === "link" && e.waits === it.id; })));
        // Presented and not yet fixed : a filler is measured against the wall or the ceiling it closes on and cut, the
        // carcass screwed to the wall, then only the filler glued, its glue left to set on a carcass that moves no more
        const fillers = rowsOf(entries.filter((e) =>
        {
            return (e.phase === "ceiling" || e.phase === "scribe") && e.waits === it.id;
        }));
        if (fillers.length > 0)
        {
            whole.push({ pbs: [`${code}-000`], count: 1, type: "Mesure sur place", tool: TOOL.tape, direction: NA,
                         operation: `Mesurer l'écart entre ${code}-000 ${it.name} présenté et le mur ou le plafond`,
                         comment: "Meuble présenté, pas encore fixé : le fileur se découpe à cette cote" },
                       { pbs: [`${code}-000`], count: 1, type: "Découpe", tool: TOOL.saw, direction: NA,
                         operation: `Découper le fileur de ${code}-000 ${it.name} à la cote relevée`,
                         comment: "Chant tracé contre le mur, scie hors du meuble" });
        }
        whole.push(...(throughBack ? room(code, "plug") : []));
        whole.push(...room(code, "wall"));
        whole.push(...fillers);
        whole.push(...rowsOf(entries.filter((e) => { return e.phase === "loose" && e.waits === it.id; })));
    }
    whole.push(...rowsOf(entries.filter((e) => { return e.phase === "link" && e.waits === undefined; })));
    for (const it of items)
    {
        whole.push(...rowsOf(entries.filter((e) => { return e.phase === "fronts" && e.waits === it.id; })));
    }
    whole.push(...rowsOf(entries.filter((e) => { return e.phase === "drawers"; })));
    whole.push(...rowsOf(entries.filter((e) => { return e.phase === "finish"; })));
    // Anything of an item left out of the PBS : still one step of the whole
    whole.push(...rowsOf(entries.filter((e) => { return e.table === "#000" && !inRoom(e); })));
    tables.push({ code: "#000", name: p.name, rows: positioned(made(whole), "#000", null) });  
    return tables;
}
