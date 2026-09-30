// Openings in fixed front panels : an arch or a round hole, for the part, its DXF and the front view

import type { Carcass, PanelFront } from "./model";
import type { FrontPanel } from "./fronts";
import type { Build } from "./parts";
import { tessellate, type Outline } from "./geometry";
import { byId } from "./edit";

// border kept around a new opening, a starting value to adjust (convention)
export const PANEL_MARGIN = 60;


// In the frame of the panel part : u up from its bottom edge, v across from its left edge
export function openingOutline(spec: PanelFront, w: number, h: number): Outline | null
{
    const m = spec.margin;
    const across = w - 2 * m;
    const up = h - 2 * m;
    if (spec.cutout === "none" || across <= 0 || up <= 0)
    {
        return null;
    }
    const cu = h / 2;
    const cv = w / 2;
    if (spec.cutout === "round")
    {
        const r = Math.min(across, up) / 2;
        return { start: [cu, cv + r], segments: [
            { kind: "arc", x: cu, y: cv - r, cx: cu, cy: cv, ccw: true },
            { kind: "arc", x: cu, y: cv + r, cx: cu, cy: cv, ccw: true },
        ] };
    }
    // a half circle as wide as the opening ovre straight sides, it needs at least its radius of height
    const r = across / 2;
    if (up < r)
    {
        return null;
    }
    const spring = h - m - r;
    return { start: [m, m], segments: [
        { kind: "line", x: m, y: w - m },
        { kind: "line", x: spring, y: w - m },
        { kind: "arc", x: spring, y: m, cx: spring, cy: cv, ccw: false },
        { kind: "line", x: m, y: m },
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
