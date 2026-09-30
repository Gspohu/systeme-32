// Masses, shelf deflection with creep, and tipping of standing carcasses

import type { Carcass } from "./model";
import type { Build, Part } from "./parts";
import { at } from "./geometry";
import { MATERIALS } from "../data/materials";
import { GRAVITY, SHELF_DEFLECTION_LIMIT } from "../data/rules";
import { partMass } from "./fittings";

export interface Deflection
{
    part: string;
    span: number;
    // instantaneous deflection under the test load plus self weight, mm
    instant: number;
    // long term deflection with creep, instant x (1 + kdef)
    final: number;
    limit: number;
}


// Simply supported span under a uniform load : w = 5 q L^4 / (384 E I)
export function shelfDeflection(p: Part, loadKgPerDm2: number, midN = 0): Deflection | null
{
    const m = MATERIALS[p.material];
    if (m === undefined)
    {
        return null;
    }
    const L = p.length;
    const b = p.width;
    const t = p.thickness;
    // line load in N/mm : kg/dm2 x width in dm gives kg per dm of span, 1 dm = 100 mm
    const qLoad = loadKgPerDm2 * (b / 100) * GRAVITY / 100;
    const qSelf = m.density * 1e-9 * b * t * GRAVITY;
    // a groove along the span comes off the whole thickness : the grooved section contains what is left
    // its stiffness can only be higher
    let stiff = b;
    for (const g of p.grooves)
    {
        if (g.weakens === true && g.along === "u")
        {
            stiff -= g.width;
        }
    }
    const I = stiff * t ** 3 / 12;
    // P L^3 / 48 E I for the point load at mid span
    const instant = 5 * (qLoad + qSelf) * L ** 4 / (384 * m.modulus * I) + midN * L ** 3 / (48 * m.modulus * I);
    return { part: p.id, span: L, instant, final: instant * (1 + m.kdef), limit: SHELF_DEFLECTION_LIMIT * L };
}


export function itemMass(b: Build, itemId: string): number
{
    let kg = 0;
    for (const p of b.parts)
    {
        if (p.item === itemId)
        {
            kg += partMass(p, false);
        }
    }
    return kg;
}


// the front feet stand this far behind the front of the box
export const FRONT_FOOT_INSET = 50;


export interface Tipping
{
    item: string;
    massKg: number;
    // vertical force at the lever point that tips the carcass over its front feet, in kg
    criticalKg: number;
    leverFrom: "tiroir ouvert" | "chant avant";
    // horizontal pull at the top edge that tips it, in kg force
    pullKg: number;
}


// Centre of mass from part centres, tipping edge on the front feet line, loda at the fully open top drawer
export function tipping(c: Carcass, b: Build, frontFootInset: number, drawerExtension: number): Tipping | null
{
    if (c.base.type === "wall")
    {
        return null;
    }
    let m = 0;
    let mz = 0;
    for (const p of b.parts)
    {
        if (p.item !== c.id || p.frame === null)
        {
            continue;
        }
        const mass = partMass(p, false);
        const centre = at(p.frame!, p.length / 2, p.width / 2, p.thickness / 2);
        m += mass;
        mz += mass * centre[2];
    }
    if (m <= 0)
    {
        return null;
    }
    const zCg = mz / m;
    const zEdge = c.z + c.depth - frontFootInset;
    const zLoad = drawerExtension > 0 ? c.z + c.depth + drawerExtension : c.z + c.depth;
    const lever = zLoad - zEdge;
    const resist = Math.max(0, zEdge - zCg);
    if (lever <= 0)
    {
        return null;
    }
    // pull applied at the top edge, tipping about the front feet which stand on the floor
    const arm = c.height + baseHeightOf(c);
    return {
        item: c.id,
        massKg: m,
        criticalKg: m * resist / lever,
        leverFrom: drawerExtension > 0 ? "tiroir ouvert" : "chant avant",
        pullKg: m * resist / arm,
    };
}


function baseHeightOf(c: Carcass): number
{
    return c.base.type === "plinth" || c.base.type === "feet" ? c.base.height : 0;
}
