// Appliances set in a cell or on the furniture : what carries each one, whether it fits where it stnads

import type { Carcass, Device, Item, Project } from "./model";
import type { Build } from "./part_types";
import type { Check } from "./check";
import { boxesMeet, roomBox, wallBox, type Box3 } from "./room";

// an appliance set by hand sits within a millimetre of where it is drawn
const TOL = 1;


function deviceBox(d: Device): Box3
{
    return { min: [d.x, d.y, d.z], max: [d.x + d.width, d.y + d.height, d.z + d.depth] };
}


function carcassBox(c: Carcass): Box3
{
    return { min: [c.x, c.y, c.z], max: [c.x + c.width, c.y + c.height, c.z + c.depth] };
}


function within(a: Box3, b: Box3): boolean
{
    let k = 0;
    while (k < 3)
    {
        if (a.min[k]! < b.min[k]! - TOL || a.max[k]! > b.max[k]! + TOL)
        {
            return false;
        }
        k++;
    }
    return true;
}


// a box of the same wall right under the appliance, its top at the appliance's foot, across it in x and z
function under(d: Device, b: Box3): boolean
{
    return Math.abs(b.max[1] - d.y) <= TOL && b.min[0] < d.x + d.width && b.max[0] > d.x && b.min[2] < d.z + d.depth
        && b.max[2] > d.z;
}


// The carcass an appliance stands in or on, or none
export function carrierOf(p: Project, d: Device): Carcass | null
{
    for (const it of p.items)
    {
        if (it.kind === "carcass" && it.wall === d.wall && (within(deviceBox(d), carcassBox(it))
            || under(d, carcassBox(it))))
        {
            return it;
        }
    }
    return null;
}


// What the appliances in and on a carcass weigh on its feet
export function devicesOn(p: Project, c: Carcass): number
{
    let kg = 0;
    for (const it of p.items)
    {
        if (it.kind === "device" && carrierOf(p, it)?.id === c.id)
        {
            kg += it.massKg;
        }
    }
    return kg;
}


export function deviceChecks(p: Project, b: Build): Check[]
{
    const checks: Check[] = [];
    for (const d of p.items)
    {
        if (d.kind !== "device")
        {
            continue;
        }
        checks.push({ level: "info", item: d.id, target: null, message: `${d.name} : ${d.width} x ${d.height} x `
            + `${d.depth} mm, ${d.massKg} kg (${d.source}).` });
        const host = p.items.find((it): it is Carcass =>
        {
            return it.kind === "carcass" && it.wall === d.wall && within(deviceBox(d), carcassBox(it));
        });
        if (host !== undefined)
        {
            checks.push(...inCell(d, host, b));
            continue;
        }
        for (const o of p.items)
        {
            if (o.id !== d.id && o.kind !== "corner" && boxesMeet(roomBox(d, p.room), roomBox(o, p.room)))
            {
                checks.push({ level: "error", item: d.id, target: null,
                              message: `${d.name} et ${o.name} se chevauchent. Déplacer l'appareil.` });
            }
        }
        const carried = d.y <= TOL || p.items.some((o: Item) =>
        {
            return o.id !== d.id && o.wall === d.wall && o.kind !== "corner" && o.kind !== "ladder"
                && under(d, wallBox(o));
        });
        if (!carried)
        {
            checks.push({ level: "warning", item: d.id, target: null,
                          message: `${d.name} ne repose sur rien : le poser sur un meuble, une étagère ou au sol.` });
        }
    }
    return checks;
}


// Inside a carcass, an appliance fit one cell and rests on its floor
function inCell(d: Device, c: Carcass, b: Build): Check[]
{
    const lay = b.layouts.get(c.id);
    if (lay === undefined)
    {
        return [];
    }
    const [x0, y0] = [d.x - c.x, d.y - c.y];
    const cell = [...lay.nodes.values()].find((n) =>
    {
        return n.kind === "cell" && x0 >= n.x - TOL && x0 + d.width <= n.x + n.w + TOL && y0 >= n.y - TOL
            && y0 + d.height <= n.y + n.h + TOL && d.z - c.z >= lay.zBack - TOL && d.z + d.depth - c.z <= lay.zFront + TOL;
    });
    if (cell === undefined)
    {
        return [{ level: "error", item: d.id, target: null,
                  message: `${d.name} ne tient dans aucune case de ${c.name} (${d.width} x ${d.height} x ${d.depth} mm). `
                      + "Le déplacer ou agrandir la case." }];
    }
    if (Math.abs(y0 - cell.y) > TOL)
    {
        return [{ level: "warning", item: d.id, target: null,
                  message: `${d.name} flotte à ${Math.round(y0 - cell.y)} mm au-dessus du fond de sa case dans ${c.name}. `
                      + "Le poser sur le fond." }];
    }
    return [];
}
