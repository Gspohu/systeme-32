// Base of every editing command : clone, apply, stamp, plus the small lookups they all share

import type { Carcass, LayoutNode, Project } from "./model";
import { subtreeIds } from "./layout";


export class CommandError extends Error
{
}


// Commands neve touch the project they recieve : they work on a deep copy
export function edit(p: Project, change: (q: Project) => void): Project
{
    const q = structuredClone(p);
    change(q);
    q.updated = new Date().toISOString();
    return q;
}


export function byId<T extends { id: string }>(list: T[], id: string): T | undefined
{
    for (const x of list)
    {
        if (x.id === id)
        {
            return x;
        }
    }
    return undefined;
}


export function withoutId<T extends { id: string }>(list: T[], id: string): T[]
{
    const kept: T[] = [];
    for (const x of list)
    {
        if (x.id !== id)
        {
            kept.push(x);
        }
    }
    return kept;
}


export function carcassOf(q: Project, id: string): Carcass
{
    const it = byId(q.items, id);
    if (it === undefined || it.kind !== "carcass")
    {
        throw new CommandError("Caisson introuvable. Il a peut-être été supprimé.");
    }
    return it;
}


export function replaceNode(root: LayoutNode, id: string, by: LayoutNode): LayoutNode
{
    if (root.id === id)
    {
        return by;
    }
    if (root.kind === "split")
    {
        let i = 0;
        while (i < root.children.length)
        {
            root.children[i] = replaceNode(root.children[i]!, id, by);
            i++;
        }
    }
    return root;
}


// Drops the fronts, linings, rails and lights whose node left the tree
export function prune(c: Carcass): void
{
    const alive = new Set(subtreeIds(c.root));
    const fronts = [];
    for (const f of c.fronts)
    {
        if (alive.has(f.node))
        {
            fronts.push(f);
        }
    }
    const linings = [];
    for (const l of c.linings)
    {
        if (alive.has(l.cell))
        {
            linings.push(l);
        }
    }
    c.fronts = fronts;
    c.linings = linings;
    c.rails = c.rails.filter((r) => { return alive.has(r.cell); });
    c.lights = c.lights.filter((l) => { return alive.has(l.cell); });
    c.shoeRacks = c.shoeRacks.filter((s) => { return alive.has(s.cell); });
}
