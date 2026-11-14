// Openings in fixed front panels : an arch or a round hole, for the part, its DXF and the front view

import type { Carcass, PanelFront } from "./model";
import type { FrontPanel } from "./fronts";
import type { Build } from "./parts";
import { tessellate, type Outline } from "./geometry";
import { byId } from "./edit";

// Border kept around a new opening, a starting value to adjust (convention)
export const PANEL_MARGIN = 60;


// In the frame of the panel part : u up from its bottom edge, v across from its left edge
export function openingOutline(spec: PanelFront, w: number, h: number): Outline | null
{
    const margin = spec.margin;
    const across = w - 2 * margin;
    const clearHeight = h - 2 * margin;
    if (spec.cutout === "none" || across <= 0 || clearHeight <= 0)
    {
        return null;
    }
    // u runs up the front, v arcoss it
    const centreU = h / 2;
    const centreV = w / 2;
    if (spec.cutout === "round")
    {
        const radius = Math.min(across, clearHeight) / 2;
        return { start: [centreU, centreV + radius], segments: [ 
            { kind: "arc", x: centreU, y: centreV - radius, cx: centreU, cy: centreV, ccw: true },
            { kind: "arc", x: centreU, y: centreV + radius, cx: centreU, cy: centreV, ccw: true },
        ] };
    }
    // A half circle as wide as the opening ovre straight sides, it needs at least its radius of height
    const radius = across / 2;
    if (clearHeight < radius)
    {
        return null;
    }
    const spring = h - margin - radius;
    return { start: [margin, margin], segments: [
        { kind: "line", x: margin, y: w - margin },
        { kind: "line", x: spring, y: w - margin },
        { kind: "arc", x: spring, y: margin, cx: spring, cy: centreV, ccw: false },
        { kind: "line", x: margin, y: margin },
    ] };
}


// The same opening as points of the front view, in the carcass frame
export function openingPoints(fp: FrontPanel, spec: PanelFront): [number, number][] | null
{
    const o = openingOutline(spec, fp.rect.w, fp.rect.h);
    if (o === null)
    {
        return null;
    }
    return tessellate(o).map(([u, v]): [number, number] =>
    {
        return [fp.rect.x + v, fp.rect.y + u];
    });
}


export function fitPanels(c: Carcass, b: Build): void
{
    for (const fp of b.fronts.get(c.id) ?? [])
    {
        const front = byId(c.fronts, fp.front);
        if (fp.role !== "panel" || front === undefined || front.spec.type !== "panel")
        {
            continue;
        }
        const spec = front.spec;
        const part = byId(b.parts, `${c.id}/front/${fp.id}`)!;
        part.notes.push("Façade fixe : fixation à choisir avec l'ébéniste (équerres ou tasseaux intérieurs)");
        if (spec.cutout === "none")
        {
            continue;
        }
        const o = openingOutline(spec, fp.rect.w, fp.rect.h);
        if (o === null)
        {
            b.errors.push(`${c.name}, façade fixe : découpe impossible avec ${spec.margin} mm de bord sur `
                + `${Math.round(fp.rect.w)} x ${Math.round(fp.rect.h)}${spec.cutout === "arch" ? ", un arc demande une "
                + "hauteur au moins égale à sa demi-largeur" : ""}. Réduire le bord.`);
            continue;
        }
        part.cutouts.push(o);
        part.notes.push(`Découpe ${spec.cutout === "arch" ? "en arc" : "ronde"} d'après le DXF, chant de la découpe posé `
            + "à la main");
    }
}
