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
function link(a: Part, c: Part, b: Build, out: { item: string; message: string }[], open: Set<string>, p: Project): void
{
    const fa = a.frame!;
    const fc = c.frame!;
    const align = dot(fa.n, fc.n);
    if (Math.abs(Math.abs(align) - 1) > 1e-6)
    {
        return;
    }
    // Along the normal of a : a spans its thickness from its face A, c its own the way its normal runs
    const sa = dot(fa.o, fa.n);
    const sc = dot(fc.o, fa.n);
    const [lo, hi] = [Math.min(sc, sc + align * c.thickness), Math.max(sc, sc + align * c.thickness)];
    let aTouch: "A" | "B";
    if (Math.abs(lo - (sa + a.thickness)) < 0.5)
    {
        aTouch = "B";
    }
    else if (Math.abs(hi - sa) < 0.5)
    {
        aTouch = "A";
    }
    else
    {
        return;
    }
    const contact = aTouch === "B" ? lo : hi;
    const cTouch = Math.abs(sc - contact) < 0.5 ? "A" : "B";
    const local = (q: Part, pt: Vec3): [number, number] =>
    {
        return [dot(from(q.frame!.o, pt), q.frame!.u), dot(from(q.frame!.o, pt), q.frame!.v)];
    };
    // The corners of c in the frame of a, the shared area clipped to a
    const us: number[] = [];
    const vs: number[] = [];
    for (const [u, v] of [[0, 0], [c.length, 0], [0, c.width], [c.length, c.width]] as const)
    {
        const [x, y] = local(a, at(fc, u, v, 0));
        us.push(x);
        vs.push(y);
    }
    const u0 = Math.max(0, Math.min(...us));
    const u1 = Math.min(a.length, Math.max(...us));
    const v0 = Math.max(0, Math.min(...vs));
    const v1 = Math.min(a.width, Math.max(...vs));
    if (u1 - u0 < 2 * LINK_INSET || v1 - v0 < 2 * LINK_INSET)
    {
        return;
    }
    const screw = pickScrew(a.thickness + c.thickness);
    if (screw === undefined)
    {
        out.push({ item: a.item, message: `${a.itemName} et ${c.itemName} : ${a.thickness + c.thickness} mm à serrer, `
            + "hors des vis de liaison Häfele 267.07.9 (32 à 46 mm). Relier les deux caissons autrement." });
        return;
    }
    const aInner = aTouch === "A" ? "B" : "A";
    const cInner = cTouch === "A" ? "B" : "A";
    // A top glued to its doubler has no inner face left for a head, a carcass open to the eye shows none : screwed
    // blind from the other carcass. 5 x 50 only goes into 3 boards, in two it would come out the far side
    const doubled = (q: Part): boolean =>
    {
        return q.role === "top" && b.parts.some((x) =>
        {
            return x.id === `${q.item}/top-doubler`;
        });
    };
    const blindA = doubled(a) || open.has(a.item);
    const blindC = doubled(c) || open.has(c.item);
    if (blindA && blindC)
    {
        return;
    }
    const blind = blindA || blindC;
    const deep = doubled(a) || doubled(c);
    const grooved = [a, c].some((q) =>
    {
        return q.grooves.some((g) => { return g.label === LED_GROOVE_LABEL; });
    });
    const blindHole = deep ? BLIND_SCREW_HOLE : BLIND_SCREW_HOLE_SHORT;
    // How far the screw goes into the board it doesn't pass through : 30 less the 19 it crosses
    const biteA = (deep ? 50 : 30) - c.thickness;
    const biteC = (deep ? 50 : 30) - a.thickness;
    // A head on the inner face, 2 mm into each carcass
    const free = (u: number, v: number): boolean =>
    {
        const [uc, vc] = local(c, at(fa, u, v, 0));
        const headA = at(fa, u, v, aInner === "A" ? -2 : a.thickness + 2);
        const headC = at(fc, uc, vc, cInner === "A" ? -2 : c.thickness + 2);
        if (blind)
        {
            // Its head on the inner face of the closed carcass, its point in the touching face of the other
            return blindA
                ? !meets(c, cInner, uc, vc, CONNECTING_SCREW_HEAD, c.thickness) && !underHardware(b, c.item, headC)
                    && !meets(a, aTouch, u, v, blindHole, biteA)
                : !meets(a, aInner, u, v, CONNECTING_SCREW_HEAD, a.thickness) && !underHardware(b, a.item, headA)
                    && !meets(c, cTouch, uc, vc, blindHole, biteC);
        }
        return !meets(a, aInner, u, v, CONNECTING_SCREW_HEAD, a.thickness) && !underHardware(b, a.item, headA)
            && !meets(c, cInner, uc, vc, CONNECTING_SCREW_HEAD, c.thickness) && !underHardware(b, c.item, headC);
    };
    const alongU = u1 - u0 >= v1 - v0;
    const [l0, l1, w0, w1] = alongU ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
    const sys = systemLine(a, c, blind ? (blindA ? c : a) : a, p, alongU, [w0, w1]);
    let placed = 0;
    for (const s of spread(l1 - l0, LINK_INSET, LINK_MAX))
    {
        // A board counts its width from the front : the screws clear the LED groove there, in a doubled top or not
        const rows = sys?.rows ?? [w0 + (deep || grooved ? DEEP_FRONT_INSET : LINK_INSET), w1 - LINK_INSET];
        for (const w of rows)
        {
            const start = sys === null ? l0 + s : sys.snap(l0 + s, w);
            const tries = [0, 32, -32, 64, -64].map((d) =>
            {
                return start + d;
            }).filter((x) =>
            {
                return x >= l0 + CONNECTING_SCREW_HEAD && x <= l1 - CONNECTING_SCREW_HEAD;
            });
            const at0 = tries.find((x) =>
            {
                return alongU ? free(x, w) : free(w, x);
            });
            if (at0 === undefined)
            {
                out.push({ item: a.item, message: `${a.itemName} et ${c.itemName} : pas de place libre pour une vis de `
                    + `liaison près de ${Math.round(s)} mm sur ${a.label.toLowerCase()}. Déplacer la quincaillerie.` });
                continue;
            }
            const [u, v] = alongU ? [at0, w] : [w, at0];
            const [uc, vc] = local(c, at(fa, u, v, 0));
            if (blind)
            {
                const through = blindA ? c : a;
                through.holes.push({ u: blindA ? uc : u, v: blindA ? vc : v, diameter: blindHole,
                                     depth: through.thickness, face: blindA ? cInner : aInner,
                                     label: `Vis ${deep ? "5 x 50" : "4 x 30"} vers ${(blindA ? a : c).itemName}, `
                                         + `${DIAM}${blindHole} traversant, tête fraisée`, purpose: "link-screw" });
                placed++;
                continue;
            }
            const label = `Vis de liaison ${screw.ref} vers ${c.itemName}, ${DIAM}${CONNECTING_SCREW_HOLE} traversant`;
            a.holes.push({ u, v, diameter: CONNECTING_SCREW_HOLE, depth: a.thickness, face: aInner, label,
                           purpose: "link-screw" });
            c.holes.push({ u: uc, v: vc, diameter: CONNECTING_SCREW_HOLE, depth: c.thickness, face: cInner,
                           label: `Vis de liaison ${screw.ref} vers ${a.itemName}, ${DIAM}${CONNECTING_SCREW_HOLE} traversant`,
                           purpose: "link-screw" });
            placed++;
        }
    }
    if (placed > 0)
    {
        b.hardware.push({ ref: !blind ? screw.ref : deep ? "WALL_SCREW_5x50" : "SCREW_4x30", qty: placed, item: a.item,
                         itemName: a.itemName,
                         target: null,
                         note: `${a.itemName} et ${c.itemName}${blind ? "" : `, ${a.thickness +
                             c.thickness} mm serrés`}`,
                         partner: c.item,
                         purpose: "link-screw" });
    }
}
