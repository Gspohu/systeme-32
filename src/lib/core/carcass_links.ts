// Carcasses standing on or beside one another, joined through the two panels that touch with Häfele M6 connecting
// screws (catalogue 2017 p. 11.138)

import type { Project } from "./model";
import type { Build, Part, PartRole } from "./parts";
import { at, type Vec3 } from "./geometry";
import { fittedExtent } from "./fitted";
import { spread } from "./fittings";
import { meets } from "./drilling";
import { CONNECTING_SCREW_HEAD, CONNECTING_SCREW_HOLE, CONNECTING_SCREWS } from "../data/rules";
import { DIAM } from "./text";
import { LED_GROOVE_LABEL } from "./lights";

const LINKED: PartRole[] = ["top", "bottom", "side"];
// Workshop convention : 50 in from the edges of the shared area, no more than 800 apart
const LINK_INSET = 50;
// The groove of the dresser's strip stands 30 to 48 off the front and 8.5 deep, a 5 x 50 tip 7 under that face :
// 12 clear
const DEEP_FRONT_INSET = 60;
const LINK_MAX = 800;
const BLIND_SCREW_HOLE = 5;
const BLIND_SCREW_HOLE_SHORT = 4;


function dot(a: Vec3, b: Vec3): number
{
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}


function from(o: Vec3, p: Vec3): Vec3
{
    return [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
}


// The screw whose clamping range holds both boards with the most margin either side
function pickScrew(total: number): (typeof CONNECTING_SCREWS)[number] | undefined
{
    let best: (typeof CONNECTING_SCREWS)[number] | undefined;
    let margin = -1;
    for (const s of CONNECTING_SCREWS)
    {
        const m = Math.min(total - s.min, s.max - total);
        if (m >= 0 && m > margin)
        {
            best = s;
            margin = m;
        }
    }
    return best;
}


// The cross of a hinge plate on its face, read off Blum's file of the 174H7100E : 28.6 either side of its middle along
// its 2 dowels 32 apart, 21 across. A plate is no fitted volume, only its 2 holes : a link screw went under one
const PLATE_ALONG = 28.6;
const PLATE_ACROSS = 21;
const PLATE_PITCH = 32;

export function underPlate(panel: Part, face: string, u: number, v: number): boolean
{
    const r = CONNECTING_SCREW_HEAD / 2;
    const mine = panel.holes.filter((h) => { return h.face === face && (h.purpose === "plate-dowel" ||
                                                                        h.purpose === "plate-screw"); });
    return mine.some((h) =>
    {
        // Its mate on the line of the system, the middle of the plate between them
        const mate = mine.find((o) => { return o !== h && Math.abs(Math.hypot(o.u - h.u, o.v - h.v) -
                                                                   PLATE_PITCH) < 0.5; });
        if (mate === undefined)
        {
            return false;
        }
        const [cu, cv] = [(h.u + mate.u) / 2, (h.v + mate.v) / 2];
        const [au, av] = [(mate.u - h.u) / PLATE_PITCH, (mate.v - h.v) / PLATE_PITCH];
        const along = (u - cu) * au + (v - cv) * av;
        const across = -(u - cu) * av + (v - cv) * au;
        return Math.abs(along) < PLATE_ALONG + r && Math.abs(across) < PLATE_ACROSS + r;
    });
}


// A screw head standing on the inner face of the panel at that point would sit under some hardware of the item
function underHardware(b: Build, item: string, p: Vec3): boolean
{
    const r = CONNECTING_SCREW_HEAD / 2;
    return b.fitted.some((f) =>
    {
        if (f.item !== item)
        {
            return false;
        }
        const e = fittedExtent(f);
        return [0, 1, 2].every((k) =>
        {
            return p[k]! > e.min[k]! - r && p[k]! < e.max[k]! + r;
        });
    });
}


export function fitCarcassLinks(p: Project, b: Build): { item: string; message: string }[]
{
    const out: { item: string; message: string }[] = [];
    const walls = new Map<string, string>();
    const open = new Set<string>();
    const loose = new Set<string>();
    for (const it of p.items)
    {
        // A loose carcass lifts out : nothing may screw it to what it stands on
        if (it.kind === "carcass" && it.freeStanding !== true)
        {
            for (const other of it.unlinkedFrom ?? [])
            {
                loose.add(`${it.id}/${other}`);
            }
            walls.set(it.id, it.wall);
            if (it.hiddenLinks === true)
            {
                open.add(it.id);
            }
        }
    }
    const panels = b.parts.filter((q) =>
    {
        return q.frame !== null && walls.has(q.item) && LINKED.includes(q.role);
    });
    // TODO two carcasses meeting across the corner of two walls stay unjoined, only one wall's pairs are looked at
    panels.forEach((a, i) =>
    {
        for (const c of panels.slice(i + 1))
        {
            if (a.item !== c.item && walls.get(a.item) === walls.get(c.item) && !loose.has(`${a.item}/${c.item}`)
                && !loose.has(`${c.item}/${a.item}`))
            {
                link(a, c, b, out, open, p);
            }
        }
    });
    return out;
}


// Two sides face to face, the one drilled on the system 32 of its carcass : the screws on
// holes of its line, every 32 from the axis of its bottom, and on its rows, 37 off the front edge or off the back and
// 32 apart from those. Null when the 2 panels aren't sides of carcasses
function systemLine(a: Part, c: Part, drilled: Part, p: Project, alongU: boolean, [w0, w1]: [number, number]):
    { rows: number[]; snap: (x: number, w: number) => number } | null
{
    const car = p.items.find((it) => { return it.id === drilled.item; });
    const grid = p.settings.grid;
    if (grid <= 0 || car?.kind !== "carcass" || a.role !== "side" || c.role !== "side" || !alongU)
    {
        return null;
    }
    const fa = a.frame!;
    const fd = drilled.frame!;
    const inA = (vd: number): number =>
    {
        return dot(from(fa.o, at(fd, 0, vd, 0)), fa.v);
    };
    // The rows of the drilled side, read in the frame of a, kept where both sides are
    const inset = p.settings.connectorInset;
    const candidates: number[] = [];
    for (let k = 0; inset + k * grid <= drilled.width - inset; k++)
    {
        candidates.push(inA(inset + k * grid), inA(drilled.width - inset - k * grid));
    }
    const inside = [...new Set(candidates.map((x) => { return Math.round(x * 10) / 10; }))].filter((x) =>
    {
        return x >= w0 + ROW_MARGIN && x <= w1 - ROW_MARGIN;
    }).sort((x, y) => { return x - y; });
    if (inside.length === 0)
    {
        return null;
    }
    const rows = inside.length === 1 ? inside : [inside[0]!, inside[inside.length - 1]!];
    // A point of a along its length brought to the nearest hole of the line of the drilled carcass
    const snap = (x: number, w: number): number =>
    {
        const y = at(fa, x, w, 0)[1];
        const n = Math.round((y - car.y - car.thickness / 2) / grid);
        return x + (car.y + car.thickness / 2 + n * grid - y) / fa.u[1];
    };
    return { rows, snap };
}
// A row of the system kept this far inside the area the 2 sides share
const ROW_MARGIN = 10;


// Two panels of two carcasses, parallel and face to face : screws over the area they share
function link(panelA: Part, panelC: Part, b: Build, out: { item: string; message: string }[], open: Set<string>,
              p: Project): void
{
    const frameA = panelA.frame!;
    const frameC = panelC.frame!;
    const align = dot(frameA.n, frameC.n);
    if (Math.abs(Math.abs(align) - 1) > 1e-6)
    {
        return;
    }
    // Along the normal of A : A spans its tickness from its face A, C its own the way its normal runs
    const levelA = dot(frameA.o, frameA.n);
    const levelC = dot(frameC.o, frameA.n);  
    const [lowSideC, highSideC] = [Math.min(levelC, levelC + align * panelC.thickness),
                                   Math.max(levelC, levelC + align * panelC.thickness)];
    let aTouch: "A" | "B";
    if (Math.abs(lowSideC - (levelA + panelA.thickness)) < 0.5)
    {
        aTouch = "B";
    }
    else if (Math.abs(highSideC - levelA) < 0.5)
    {
        aTouch = "A";
    }
    else
    {
        return;
    }
    const contact = aTouch === "B" ? lowSideC : highSideC;
    const cTouch = Math.abs(levelC - contact) < 0.5 ? "A" : "B";
    const local = (panel: Part, point: Vec3): [number, number] =>
    {
        return [dot(from(panel.frame!.o, point), panel.frame!.u), dot(from(panel.frame!.o, point), panel.frame!.v)];   
    };
    // The corners of C in the frame of A, the shared area clipped to A
    const cornerUs: number[] = [];
    const cornerVs: number[] = [];
    for (const [u, v] of [[0, 0], [panelC.length, 0], [0, panelC.width], [panelC.length, panelC.width]] as const)
    {
        const [x, y] = local(panelA, at(frameC, u, v, 0));
        cornerUs.push(x);
        cornerVs.push(y);
    }
    const u0 = Math.max(0, Math.min(...cornerUs));
    const u1 = Math.min(panelA.length, Math.max(...cornerUs));
    const v0 = Math.max(0, Math.min(...cornerVs));
    const v1 = Math.min(panelA.width, Math.max(...cornerVs));
    if (u1 - u0 < 2 * LINK_INSET || v1 - v0 < 2 * LINK_INSET)
    {
        return;
    }
    const screw = pickScrew(panelA.thickness + panelC.thickness);
    if (screw === undefined)
    {
        out.push({ item: panelA.item, message: `${panelA.itemName} et ${panelC.itemName} : `
            + `${panelA.thickness + panelC.thickness} mm à serrer, hors des vis de liaison Häfele 267.07.9 (32 à 46 mm). `
            + "Relier les deux caissons autrement." }); 
        return;
    }
    const aInner = aTouch === "A" ? "B" : "A";
    const cInner = cTouch === "A" ? "B" : "A";
    // A top glued to its doubler has no inner face left for a head, a carcass open to the eye shows none : screwed
    // blind from the other carcass. 5 x 50 only goes into 3 boards, in two it would come out the far side
    const doubled = (panel: Part): boolean =>
    {
        return panel.role === "top" && b.parts.some((other) =>
        {
            return other.id === `${panel.item}/top-doubler`;
        });
    };
    const blindA = doubled(panelA) || open.has(panelA.item);
    const blindC = doubled(panelC) || open.has(panelC.item);
    if (blindA && blindC)
    {
        return;
    }
    const blind = blindA || blindC;
    const deep = doubled(panelA) || doubled(panelC);
    const grooved = [panelA, panelC].some((panel) =>  
    {
        return panel.grooves.some((groove) => { return groove.label === LED_GROOVE_LABEL; });
    });
    const blindHole = deep ? BLIND_SCREW_HOLE : BLIND_SCREW_HOLE_SHORT;
    // How far the screw goes into the board it doesn't pass through : 30 less the 19 it crosses
    const biteA = (deep ? 50 : 30) - panelC.thickness;
    const biteC = (deep ? 50 : 30) - panelA.thickness;
    // A head on the inner face, 2 mm into each carcass
    const free = (u: number, v: number): boolean =>
    {
        const [uc, vc] = local(panelC, at(frameA, u, v, 0));
        const headA = at(frameA, u, v, aInner === "A" ? -2 : panelA.thickness + 2);
        const headC = at(frameC, uc, vc, cInner === "A" ? -2 : panelC.thickness + 2);
        if (blind)
        {
            // Its head on the inner face of the closed carcass, its point in the touching face of the other
            return blindA
                ? !meets(panelC, cInner, uc, vc, CONNECTING_SCREW_HEAD, panelC.thickness)
                    && !underHardware(b, panelC.item, headC) && !underPlate(panelC, cInner, uc, vc)
                    && !meets(panelA, aTouch, u, v, blindHole, biteA)
                : !meets(panelA, aInner, u, v, CONNECTING_SCREW_HEAD, panelA.thickness)
                    && !underHardware(b, panelA.item, headA) && !underPlate(panelA, aInner, u, v)
                    && !meets(panelC, cTouch, uc, vc, blindHole, biteC);
        }
        return !meets(panelA, aInner, u, v, CONNECTING_SCREW_HEAD, panelA.thickness)
            && !underHardware(b, panelA.item, headA) && !underPlate(panelA, aInner, u, v)
            && !meets(panelC, cInner, uc, vc, CONNECTING_SCREW_HEAD, panelC.thickness)
            && !underHardware(b, panelC.item, headC) && !underPlate(panelC, cInner, uc, vc);
    };
    // The screws in rows along the longer side of the shared area, l along it and w across
    const alongU = u1 - u0 >= v1 - v0;
    const [l0, l1, w0, w1] = alongU ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
    const systemRow = systemLine(panelA, panelC, blind ? (blindA ? panelC : panelA) : panelA, p, alongU, [w0, w1]);
    let placed = 0;
    for (const station of spread(l1 - l0, LINK_INSET, LINK_MAX))
    {
        // A board counts its width from the front : the screws clear the LED groove there, in a doubled top or not
        const rows = systemRow?.rows ?? [w0 + (deep || grooved ? DEEP_FRONT_INSET : LINK_INSET), w1 - LINK_INSET];
        for (const across of rows)
        {
            const start = systemRow === null ? l0 + station : systemRow.snap(l0 + station, across);
            const tries = [0, 32, -32, 64, -64].map((step) =>
            {
                return start + step;
            }).filter((x) =>
            {
                return x >= l0 + CONNECTING_SCREW_HEAD && x <= l1 - CONNECTING_SCREW_HEAD;
            });
            const at0 = tries.find((x) =>
            {
                return alongU ? free(x, across) : free(across, x);
            });
            if (at0 === undefined)
            {
                out.push({ item: panelA.item, message: `${panelA.itemName} et ${panelC.itemName} : pas de place libre `
                    + `pour une vis de liaison près de ${Math.round(station)} mm sur ${panelA.label.toLowerCase()}. `
                    + "Déplacer la quincaillerie." });
                continue;
            }
            const [u, v] = alongU ? [at0, across] : [across, at0];
            const [uc, vc] = local(panelC, at(frameA, u, v, 0));
            if (blind)
            {
                const through = blindA ? panelC : panelA;
                through.holes.push({ u: blindA ? uc : u, v: blindA ? vc : v, diameter: blindHole,
                                     depth: through.thickness, face: blindA ? cInner : aInner,
                                     label: `Vis ${deep ? "5 x 50" : "4 x 30"} vers ${(blindA ? panelA : panelC).itemName}, `
                                         + `${DIAM}${blindHole} traversant, tête fraisée`, purpose: "link-screw" });
                placed++;
                continue;
            }
            const label = `Vis de liaison ${screw.ref} vers ${panelC.itemName}, ${DIAM}${CONNECTING_SCREW_HOLE} traversant`;
            panelA.holes.push({ u, v, diameter: CONNECTING_SCREW_HOLE, depth: panelA.thickness, face: aInner, label,
                                purpose: "link-screw" });
            panelC.holes.push({ u: uc, v: vc, diameter: CONNECTING_SCREW_HOLE, depth: panelC.thickness, face: cInner,
                                label: `Vis de liaison ${screw.ref} vers ${panelA.itemName}, `
                                    + `${DIAM}${CONNECTING_SCREW_HOLE} traversant`,
                                purpose: "link-screw" });
            placed++;
        }
    }
    if (placed > 0)
    {
        b.hardware.push({ ref: !blind ? screw.ref : deep ? "WALL_SCREW_5x50" : "SCREW_4x30", qty: placed,
                          item: panelA.item, itemName: panelA.itemName, target: null,
                          note: `${panelA.itemName} et ${panelC.itemName}${blind ? ""
                              : `, ${panelA.thickness + panelC.thickness} mm serrés`}`,
                          partner: panelC.item,
                          purpose: "link-screw" });
    }
}
