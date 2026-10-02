// Commands on fronts, cell linings, rails, lights, socket holes and rounded ends

import type { CellLight, End, Front, FrontSpec, HangingRail, Lining, Outlet, Project } from "./model";
import { newFront, newId } from "./factory";
import { findNode, findParent, resolveLayout, subtreeIds } from "./layout";
import { CommandError, byId, carcassOf, edit, withoutId } from "./edit";
import { OUTLET_DEFAULT } from "./outlets";


function frontOfNode(fronts: Front[], node: string): Front | undefined
{
    for (const f of fronts)
    {
        if (f.node === node)
        {
            return f;
        }
    }
    return undefined;
}


export function setFront(p: Project, carcassId: string, nodeId: string, spec: FrontSpec, opts?: Partial<Front>): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const node = findNode(c.root, nodeId);
        if (node === null)
        {
            throw new CommandError("Zone introuvable.");
        }
        if (spec.type === "drawers" && node.kind !== "cell")
        {
            throw new CommandError("Des tiroirs se posent dans une case sans séparation intérieure.");
        }
        // a new front replces those on the node, inside it and around it
        const covered = new Set(subtreeIds(node));
        let up = findParent(c.root, nodeId);
        while (up !== null)
        {
            covered.add(up.id);
            up = findParent(c.root, up.id);
        }
        const kept: Front[] = [];
        for (const f of c.fronts)
        {
            if (!covered.has(f.node))
            {
                kept.push(f);
            }
        }
        kept.push(newFront(nodeId, spec, opts));
        c.fronts = kept;
    });
}


export function removeFront(p: Project, carcassId: string, frontId: string): Project 
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        c.fronts = withoutId(c.fronts, frontId);
    });
}


export function updateFront(p: Project, carcassId: string, frontId: string, patch: Partial<Front>): Project
{
    return edit(p, (q) =>
    {
        const f = byId(carcassOf(q, carcassId).fronts, frontId);
        if (f === undefined)
        {
            throw new CommandError("Façade introuvable.");
        }
        const spec = patch.spec;
        if (spec?.type === "drawers" && spec.ratios !== undefined && (spec.ratios.length !== spec.count
            || spec.ratios.some((r) => { return !(r > 0); })))
        {
            throw new CommandError(`Proportions : ${spec.count} nombres positifs, un par tiroir, séparés par des virgules.`);
        }
        Object.assign(f, patch);
    });
}


// Moves a front onto another node, swapping with the front already there, across carcasses too
export function moveFront(p: Project, fromCarcass: string, frontId: string, toCarcass: string, toNode: string): Project
{
    return edit(p, (q) =>
    {
        const source = carcassOf(q, fromCarcass);
        const target = carcassOf(q, toCarcass);
        const f = byId(source.fronts, frontId);
        const node = findNode(target.root, toNode);
        if (f === undefined || node === null)
        {
            throw new CommandError("Façade ou zone introuvable.");
        }
        if (f.spec.type === "drawers" && node.kind !== "cell")
        {
            throw new CommandError("Des tiroirs se posent dans une case sans séparation intérieure.");
        }
        const other = frontOfNode(target.fronts, toNode);
        const fromNode = f.node;
        if (other !== undefined && other.id !== f.id)
        {
            if (other.spec.type === "drawers" && findNode(source.root, fromNode)?.kind !== "cell")
            {
                throw new CommandError("Échange impossible : les tiroirs de la cible n'iraient pas dans une zone recoupée.");
            }
            target.fronts = withoutId(target.fronts, other.id);
            source.fronts.push({ ...other, node: fromNode });
        }
        source.fronts = withoutId(source.fronts, f.id);
        target.fronts.push({ ...f, node: toNode });
    });
}


// One front over the whole zone around its cell : the fronts of the neighbouring cells give way to it
export function mergeFronts(p: Project, carcassId: string, frontId: string): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const f = byId(c.fronts, frontId);
        const parent = f === undefined ? null : findParent(c.root, f.node);
        if (f === undefined || parent === null)
        {
            throw new CommandError("Cette façade couvre déjà tout le caisson.");
        }
        if (f.spec.type === "drawers")
        {
            throw new CommandError("Des tiroirs se posent dans une case sans séparation intérieure.");
        }
        const zone = new Set(subtreeIds(parent));
        c.fronts = c.fronts.filter((o) =>
        {
            return o.id === f.id || !zone.has(o.node);
        });
        f.node = parent.id;
    });
}


// The front of a split zone becomes one front per part of the zone, alike
export function splitFront(p: Project, carcassId: string, frontId: string): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const f = byId(c.fronts, frontId);
        const node = f === undefined ? null : findNode(c.root, f.node);
        if (f === undefined || node === null || node.kind !== "split")
        {
            throw new CommandError("Cette façade ne couvre qu'une case.");
        }
        c.fronts = withoutId(c.fronts, f.id);
        for (const child of node.children)
        {
            c.fronts.push({ ...structuredClone(f), id: newId("f"), node: child.id });
        }
    });
}


// Door to one track sliding leaf covering half the opening : the SlideLine M overlay case
export function toSliding(p: Project, carcassId: string, frontId: string): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const f = byId(c.fronts, frontId);
        const nb = f === undefined ? undefined : resolveLayout(c).nodes.get(f.node);
        if (f === undefined || nb === undefined)
        {
            throw new CommandError("Façade introuvable.");
        }
        f.spec = { type: "sliding", leaves: 1, leafWidth: Math.round((nb.w + 2 * c.thickness) / 2), damped: true };
    });
}


export function toDoor(p: Project, carcassId: string, frontId: string, hinge: "left" | "right" = "left"): Project
{
    return updateFront(p, carcassId, frontId, { spec: { type: "door", hinge } });
}


export function setLining(p: Project, carcassId: string, cellId: string, lining: Omit<Lining, "id" |
                          "cell"> | null): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const kept: Lining[] = [];
        for (const l of c.linings)
        {
            if (l.cell !== cellId)
            {
                kept.push(l);
            }
        }
        if (lining !== null)
        {
            kept.push({ ...lining, id: newId("l"), cell: cellId });
        }
        c.linings = kept;
    });
}


// A clothes rail in a cell, or none : one rail at most per cell
export function setRail(p: Project, carcassId: string, cellId: string, on: boolean,
    kind: HangingRail["kind"] = "fixed"): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        if (findNode(c.root, cellId)?.kind !== "cell")
        {
            throw new CommandError("Une penderie se pose dans une case. Choisir une case sans séparation.");
        }
        c.rails = c.rails.filter((r) => { return r.cell !== cellId; });
        if (on)
        {
            c.rails.push({ id: newId("r"), cell: cellId, kind });
        }
    });
}


export function setLight(p: Project, carcassId: string, cellId: string, light: Omit<CellLight, "id" | "cell"> |
                         null): Project 
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        if (findNode(c.root, cellId)?.kind !== "cell")
        {
            throw new CommandError("Un éclairage se pose dans une case. Choisir une case sans séparation.");
        }
        if (light !== null && (!Number.isFinite(light.setback) || light.setback < 0))
        {
            throw new CommandError("Retrait du profilé LED négatif ou illisible. Saisir une distance en mm depuis le chant avant.");
        }
        if (light !== null && light.kind === "spots" && (!Number.isInteger(light.spots) || light.spots < 1))
        {
            throw new CommandError("Nombre de spots illisible. Saisir un entier, 1 au moins.");
        }
        c.lights = c.lights.filter((l) => { return l.cell !== cellId; });
        if (light !== null)
        {
            c.lights.push({ ...light, id: newId("e"), cell: cellId });
        }
    });
}


// Shoe racks on the floor of a cell, levels of them, or none with 0
export function setShoeRack(p: Project, carcassId: string, cellId: string, levels: number): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        if (findNode(c.root, cellId)?.kind !== "cell")
        {
            throw new CommandError("Un range-chaussures se pose dans une case. Choisir une case sans séparation.");
        }
        if (!Number.isInteger(levels) || levels < 0)
        {
            throw new CommandError("Nombre de niveaux illisible. Saisir un entier, 0 pour retirer.");
        }
        c.shoeRacks = c.shoeRacks.filter((s) => { return s.cell !== cellId; });
        if (levels > 0)
        {
            c.shoeRacks.push({ id: newId("h"), cell: cellId, levels });
        }
    });
}


// A socket or cable hole for a cell, at the starting size, on the back behind it
export function addOutlet(p: Project, carcassId: string, cellId: string): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        if (findNode(c.root, cellId)?.kind !== "cell")
        {
            throw new CommandError("Un trou de prise se rattache à une case. Choisir une case sans séparation.");
        }
        c.outlets.push({ id: newId("o"), cell: cellId, ...OUTLET_DEFAULT });
    });
}


export function updateOutlet(p: Project, carcassId: string, outletId: string,
    patch: Partial<Omit<Outlet, "id" | "cell">>): Project
{
    return edit(p, (q) =>
    {
        const o = byId(carcassOf(q, carcassId).outlets, outletId);
        if (o === undefined)
        {
            throw new CommandError("Trou de prise introuvable.");
        }
        const next = { ...o, ...patch };
        if (!(next.w > 0) || !(next.h > 0) || !Number.isFinite(next.dx) || !Number.isFinite(next.dy))
        {
            throw new CommandError("Taille ou décalage illisible. Saisir des mm, une taille plus grande que 0.");
        }
        Object.assign(o, next);
    });
}


export function removeOutlet(p: Project, carcassId: string, outletId: string): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        c.outlets = withoutId(c.outlets, outletId);
    });
}


// A modular cell is drilled over its whole height, shelves are added or moved later without a drill
export function setModularCell(p: Project, carcassId: string, cellId: string, on: boolean): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        if (findNode(c.root, cellId)?.kind !== "cell")
        {
            throw new CommandError("Seule une case se perce en série. Choisir une case sans séparation.");
        }
        c.modularCells = c.modularCells.filter((id) => { return id !== cellId; });
        if (on)
        {
            c.modularCells.push(cellId);
        }
    });
}


export function setEnd(p: Project, carcassId: string, side: "left" | "right", end: End): Project
{
    return edit(p, (q) =>
    {
        carcassOf(q, carcassId).ends[side] = structuredClone(end);
    });
}
