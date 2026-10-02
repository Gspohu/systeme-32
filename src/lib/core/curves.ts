// Rounded ends (plan view), quarter round corners (front view) and cell linings

import type { Battens, Carcass, CurveTechnique, End, RoundCorner } from "./model";
import type { ResolvedLayout } from "./layout";
import { type Build, type Part, newPart } from "./parts";
import { type Outline, type Vec3, X, Y, Z, neg } from "./geometry";
import { endReach, usableDepth } from "./extent";
import { FLEX_MIN_RADIUS } from "../data/materials";


// Workshop conventions : one former every 400 mm of height, solid profiles only for small radii
const FORMER_SPACING = 400;
const SOLID_MAX_RADIUS = 100;


function skinThickness(tech: CurveTechnique, flex: 6 | 9, battens: Battens): number
{
    if (tech === "flex")
    {
        return flex;
    }
    if (tech === "battens")
    {
        return battens.thickness;
    }
    return 0;
}


// Skin or battens covering a developed lenght, returned as parts ready for the cut list
function skinParts(
    base: { item: string; itemName: string }, id: string, label: string, tech: CurveTechnique, flex: 6 | 9, battens: Battens,
    developed: number, height: number, radius: number, curve: Part["curve"], b: Build,
): void
{
    if (tech === "flex")
    {
        // TODO : these minimum radii come from resellers, no manufacturer datasheet found for them yet
        const min = FLEX_MIN_RADIUS[flex] ?? 200;
        if (radius < min)
        {
            b.errors.push(`${base.itemName}, ${label.toLowerCase()} : rayon ${Math.round(radius)} mm, ${min} mm mini `
                + `pour du MDF cintrable de ${flex} mm (donnée revendeur). Passer aux tasseaux ou au massif.`);
        }
        const p = newPart({
            ...base, id, label: `${label}, peau cintrée`, role: "skin", length: developed, width: height,
            thickness: flex, decor: "MDF_FLEX", edges: [], frame: null,
        });
        p.curve = curve;
        p.notes.push(`Cintrée au rayon ${Math.round(radius)} mm, collée sur les gabarits. Essai sur chute conseillé`);
        b.parts.push(p);
        return;
    }
    if (tech === "battens")
    {
        const pitch = battens.width + battens.gap;
        const count = Math.max(1, Math.floor((developed + battens.gap) / pitch));
        const p = newPart({
            ...base, id, label: `${label}, tasseaux`, role: "batten", length: height, width: battens.width,
            thickness: battens.thickness, decor: battens.decor, edges: [], frame: null,
        });
        p.quantity = count;
        p.curve = curve;
        p.notes.push(`${count} tasseaux au pas de ${pitch} mm sur ${Math.round(developed)} mm développés`);
        b.parts.push(p);
        return;
    }
    if (radius > SOLID_MAX_RADIUS)
    {
        b.errors.push(`${base.itemName} : profil massif usiné réservé aux rayons de ${SOLID_MAX_RADIUS} mm maxi `
            + `(${Math.round(radius)} demandés).`);
    }
    const p = newPart({
        ...base, id, label: `${label}, profil massif usiné`, role: "skin", length: height, width: radius,
        thickness: radius, decor: "CHENE_MASSIF", edges: [], frame: null,
    });
    p.curve = curve;
    p.notes.push("Profil massif en quart de rond, usinage CN ou toupie");
    b.parts.push(p);
}


export function buildEnds(c: Carcass, b: Build): void
{
    for (const side of ["left", "right"] as const)
    {
        const end: End = c.ends[side];
        if (end.type !== "rounded")
        {
            continue;
        }
        const board = c.thickness;
        const depth = c.depth;
        const usable = usableDepth(c);
        const outer = endReach(c, side);
        if (end.sweep === 90 && end.radius > usable)
        {
            b.errors.push(`${c.name} : rayon de ${end.radius} mm supérieur à la profondeur ${usable} mm, ramené à ${usable}.`);
        }
        const skin = skinThickness(end.technique, end.flexThickness, end.battens);
        const inner = outer - skin;
        const outline: Outline = end.sweep === 180
            ? {
                start: [0, outer - inner],
                segments: [
                    { kind: "arc", x: 0, y: outer + inner, cx: 0, cy: outer, ccw: true },
                    { kind: "line", x: 0, y: outer - inner },
                ],
            }
            : {
                start: [0, 0],
                segments: [
                    { kind: "line", x: 0, y: usable },
                    { kind: "line", x: inner, y: usable },
                    { kind: "line", x: inner, y: outer },
                    { kind: "arc", x: 0, y: outer - inner, cx: 0, cy: outer, ccw: false },
                    { kind: "line", x: 0, y: 0 },
                ],
            };
        const xFace = side === "right" ? c.x + c.width : c.x;
        const uDir: Vec3 = side === "right" ? X : neg(X);
        const base = { item: c.id, itemName: c.name };
        const title = `Bout arrondi ${side === "right" ? "droit" : "gauche"}`;
        const formers = Math.max(0, Math.ceil(c.height / FORMER_SPACING) - 1);
        const levels: { y: number; label: string; role: Part["role"] }[] = [
            { y: c.y, label: "Flasque basse", role: "endPanel" },
            { y: c.y + c.height - board, label: "Flasque haute", role: "endPanel" },
        ];
        let k = 1;
        while (k <= formers)
        {
            levels.push({ y: c.y + (c.height - board) * k / (formers + 1), label: `Gabarit ${k}`, role: "former" });
            k++;
        }
        for (const lv of levels)
        {
            const p = newPart({
                ...base, id: `${c.id}/end/${side}/${lv.label}`, label: `${title}, ${lv.label.toLowerCase()}`,
                role: lv.role, length: inner, width: usable, thickness: board, decor: c.decor, edges: [],
                frame: { o: [xFace, lv.y + board, c.z + depth], u: uDir, v: neg(Z), n: neg(Y) },
            });
            p.outline = outline;
            p.notes.push("Contour cintré : découpe CN d'après le DXF");
            b.parts.push(p);
            // shaped panels butt the outer face of the side with their straight edge
            b.joints.push({ edgePart: p.id, edge: "u0", facePart: `${c.id}/side/${side === "right" ? "R" : "L"}`,
                           face: "B", lineAxis: "u", line: lv.y + (board / 2) - c.y, from: 0, to: usable, edgeFrom: 0,
                           reversed: false });
        }
        if (end.back === true && end.sweep === 90)
        {
            if (c.back.type !== "applied")
            {
                b.errors.push(`${c.name}, ${title.toLowerCase()} : son fond se visse en applique comme celui du caisson, `
                    + "qui n'est pas rapporté. Passer le fond du caisson en rapporté ou retirer le fond de l'arrondi.");
            }
            else
            {
                // behind the shaped panels, in the plane of the carcass back, from the side out to the skin
                const back = newPart({
                    ...base, id: `${c.id}/end/${side}/back`, label: `${title}, fond`, role: "back", length: c.height,
                    width: outer, thickness: c.back.thickness, decor: c.backDecor, edges: [],
                    frame: { o: [side === "right" ? xFace : xFace - outer, c.y, c.z + c.back.thickness], u: Y, v: X,
                             n: neg(Z) },
                });
                back.notes.push("Vissé en applique sur les chants arrière des flasques et des gabarits");
                b.parts.push(back);
            }
        }
        const straight = end.sweep === 180 ? 0 : usable - outer;
        const developed = end.sweep === 180
            ? Math.PI * (outer - skin / 2)
            : Math.PI / 2 * (outer - skin / 2) + straight;
        const centre: Vec3 = [xFace, c.y, c.z + depth - outer];
        // right end sweeps from +x to +z (quarter) or -z to +z (half), the left end mirrors it
        const q = Math.PI / 2;
        let a0 = q;
        let a1 = 2 * q;
        if (side === "right")
        {
            a0 = end.sweep === 180 ? -q : 0;
            a1 = q;
        }
        else if (end.sweep === 180)
        {
            a1 = 3 * q;
        }
        const straightAt = side === "right" ? 0 : Math.PI;
        skinParts(base, `${c.id}/end/${side}/skin`, title, end.technique, end.flexThickness, end.battens,
                  developed, c.height, outer, { centre, axis: "y", rOuter: outer, thickness: skin, a0, a1, from: 0,
                                                to: c.height, straight, straightAt }, b);
    }
}


export function buildCorner(k: RoundCorner, b: Build): void
{
    const skin = skinThickness(k.technique, k.flexThickness, k.battens);
    // inner radius 0 : square inside corner closed by the neighbouring boxes, no inner skin
    const solidInside = k.innerRadius <= 0;
    const ro = k.outerRadius - skin;
    const ri = solidInside ? 0 : k.innerRadius + skin;
    if (!solidInside && ri >= ro - 32)
    {
        b.errors.push(`${k.name} : couronne trop étroite (${Math.round(ro - ri)} mm entre peaux).`);
        return;
    }
    const sx = k.quadrant === "topRight" || k.quadrant === "bottomRight" ? 1 : -1;
    const sy = k.quadrant === "topRight" || k.quadrant === "topLeft" ? 1 : -1;
    const outline: Outline = solidInside
        ? {
            start: [0, 0],
            segments: [
                { kind: "line", x: ro, y: 0 },
                { kind: "arc", x: 0, y: ro, cx: 0, cy: 0, ccw: true },
                { kind: "line", x: 0, y: 0 },
            ],
        }
        : {
            start: [ri, 0],
            segments: [
                { kind: "line", x: ro, y: 0 },
                { kind: "arc", x: 0, y: ro, cx: 0, cy: 0, ccw: true },
                { kind: "line", x: 0, y: ri },
                { kind: "arc", x: ri, y: 0, cx: 0, cy: 0, ccw: false },
            ],
        };
    const base = { item: k.id, itemName: k.name };
    const u: Vec3 = sx > 0 ? X : neg(X);
    const v: Vec3 = sy > 0 ? Y : neg(Y);
    const flanges = [
        { id: "front", label: "Flasque avant", o: [k.cx, k.cy, k.z + k.depth - k.thickness] as Vec3, n: Z },
        { id: "back", label: "Flasque arrière", o: [k.cx, k.cy, k.z + k.thickness] as Vec3, n: neg(Z) },
    ];
    for (const f of flanges)
    {
        const p = newPart({
            ...base, id: `${k.id}/${f.id}`, label: f.label, role: "flange", length: ro, width: ro,
            thickness: k.thickness, decor: k.decor, edges: [], frame: { o: f.o, u, v, n: f.n },
        });
        p.outline = outline;
        p.notes.push("Couronne en quart de cercle : découpe CN d'après le DXF");
        b.parts.push(p);
    }
    const a0 = sx > 0 ? (sy > 0 ? 0 : -Math.PI / 2) : (sy > 0 ? Math.PI / 2 : Math.PI); 
    const a1 = a0 + Math.PI / 2;
    const centre: Vec3 = [k.cx, k.cy, k.z];
    skinParts(base, `${k.id}/outer`, "Angle arrondi, face extérieure", k.technique, k.flexThickness, k.battens,
        Math.PI / 2 * (k.outerRadius - skin / 2), k.depth, k.outerRadius,
        { centre, axis: "z", rOuter: k.outerRadius, thickness: skin, a0, a1, from: 0, to: k.depth, straight: 0,
         straightAt: 0 }, b);
    if (solidInside)
    {
        return;
    }
    skinParts(base, `${k.id}/inner`, "Angle arrondi, face intérieure", k.technique, k.flexThickness, k.battens,
        Math.PI / 2 * (k.innerRadius + skin / 2), k.depth, k.innerRadius,
        { centre, axis: "z", rOuter: k.innerRadius + skin, thickness: skin, a0, a1, from: 0, to: k.depth, straight: 0,
         straightAt: 0 }, b);
}


export function buildLinings(c: Carcass, lay: ResolvedLayout, b: Build): void
{
    for (const lining of c.linings)
    {
        const nb = lay.nodes.get(lining.cell);
        if (nb === undefined)
        {
            continue;
        }
        const lt = lining.thickness;
        const faces = lining.faces;
        const x0 = c.x + nb.x;
        const y0 = c.y + nb.y;
        const front = c.z + c.depth;
        const depthAll = c.depth - lay.zBack - (faces.back ? lt : 0);
        const base = { item: c.id, itemName: c.name, thickness: lt, decor: lining.decor, colour: lining.colour,
                       role: "lining" as const };
        const first = b.parts.length;
        const tag = `${c.id}/lining/${lining.id}`;
        if (faces.back)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/back`, label: "Habillage, fond", length: nb.h, width: nb.w, edges: [],
                frame: { o: [x0, y0, c.z + lay.zBack + lt], u: Y, v: X, n: neg(Z) },
            }));
        }
        const hTop = faces.top ? lt : 0;
        const hBottom = faces.bottom ? lt : 0;
        if (faces.bottom)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/bottom`, label: "Habillage, dessous", length: nb.w, width: depthAll, edges: ["v0"],  
                frame: { o: [x0, y0 + lt, front], u: X, v: neg(Z), n: neg(Y) },
            }));
        }
        if (faces.top)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/top`, label: "Habillage, dessus", length: nb.w, width: depthAll, edges: ["v0"],
                frame: { o: [x0, y0 + nb.h - lt, front], u: X, v: neg(Z), n: Y },
            }));
        }
        const hSide = nb.h - hTop - hBottom;
        if (faces.left)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/left`, label: "Habillage, gauche", length: hSide, width: depthAll, edges: ["v0"],
                frame: { o: [x0 + lt, y0 + hBottom, front], u: Y, v: neg(Z), n: neg(X) },
            }));
        }
        if (faces.right)
        {
            b.parts.push(newPart({
                ...base, id: `${tag}/right`, label: "Habillage, droite", length: hSide, width: depthAll, edges: ["v0"],
                frame: { o: [x0 + nb.w - lt, y0 + hBottom, front], u: Y, v: neg(Z), n: X },
            }));
        }
        let k = first;
        while (k < b.parts.length)
        {
            const q = b.parts[k]!;
            if (q.colour !== null)
            {
                q.notes.push(`Teinte ${q.colour}`);
            }
            k++;
        }
    }
}
