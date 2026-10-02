// Commands on the split tree of a carcass : add, move, retype and remove shelves and uprights

import type { CellNode, DividerKind, Finish, Front, Project, SplitNode } from "./model";
import { cell, newId } from "./factory";
import { MIN_CELL, dividerThickness, findNode, findParent, resolveLayout, snap } from "./layout";
import { CommandError, carcassOf, edit, prune, replaceNode } from "./edit";


function frontsOn(fronts: Front[], node: string): Front[]
{
    const found: Front[] = [];
    for (const f of fronts)
    {
        if (f.node === node)
        {
            found.push(f);
        }
    }
    return found;
}


// Splits a cell at `pos`, a coordinate of the carcass front view (local mm from the box origin)
export function splitCell(p: Project, carcassId: string, cellId: string, axis: "h" | "v", pos: number,
    kind: DividerKind = "fixed"): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const lay = resolveLayout(c);
        const nb = lay.nodes.get(cellId);
        if (nb === undefined || nb.kind !== "cell")
        {
            throw new CommandError("Seule une case vide de séparation peut être recoupée.");
        }
        if (axis === "v" && kind === "adjustable")  
        {
            throw new CommandError("Un montant vertical est toujours fixe.");
        }
        const start = axis === "h" ? nb.y : nb.x;
        const length = axis === "h" ? nb.h : nb.w;
        const origin = axis === "h" ? lay.inner.y : lay.inner.x;
        // the lower face of the divider snaps on the grid counted rfom the carcass inner origin
        const local = Math.round(origin + snap(pos - origin, q.settings.grid) - start);
        if (local < MIN_CELL || length - local - dividerThickness(c, axis, null) < MIN_CELL)
        {
            throw new CommandError(`Case trop petite à cet endroit : ${MIN_CELL} mm mini de part et d'autre de la séparation.`);
        }
        const onCell = frontsOn(c.fronts, cellId);
        for (const f of onCell)
        {
            if (f.spec.type === "drawers")
            {
                throw new CommandError("Une case à tiroirs ne se recoupe pas. Retirer les tiroirs d'abord.");
            }
        }
        const parent = findParent(c.root, cellId);
        const fresh = cell();
        for (const l of [...c.linings])
        {
            if (l.cell === cellId)
            {
                c.linings.push({ ...structuredClone(l), id: newId("l"), cell: fresh.id });
            }
        }
        // rails and lights hang under the panel above : an upright give each half its own, a shelf hands
        // htem up to the upper half, which is always the fresh one
        for (const r of [...c.rails])
        {
            if (r.cell === cellId && axis === "h")
            {
                r.cell = fresh.id;
            }
            else if (r.cell === cellId)
            {
                c.rails.push({ ...r, id: newId("r"), cell: fresh.id });
            }
        }
        for (const l of [...c.lights])
        {
            if (l.cell === cellId && axis === "h")
            {
                l.cell = fresh.id;
            }
            else if (l.cell === cellId)
            {
                c.lights.push({ ...l, id: newId("e"), cell: fresh.id });
            }
        }
        // shoe racks stand on the floor of the cell : a shelf leaves them in the lower half, the original one
        for (const s of [...c.shoeRacks])
        {
            if (s.cell === cellId && axis === "v")
            {
                c.shoeRacks.push({ ...s, id: newId("h"), cell: fresh.id });
            }
        }
        if (c.modularCells.includes(cellId))
        {
            c.modularCells.push(fresh.id);
        }
        // a cut in the parent's own direction joins its list, unless a front must keep covering the whole cell
        if (parent !== null && parent.axis === axis && onCell.length === 0)
        {
            const k = parent.children.indexOf(findNode(parent, cellId)!);
            const parentStart = lay.nodes.get(parent.id)![axis === "h" ? "y" : "x"];
            parent.cuts.splice(k, 0, start + local - parentStart);
            parent.dividers.splice(k, 0, kind);
            parent.finishes.splice(k, 0, null);
            parent.thicknesses.splice(k, 0, null);
            parent.children.splice(k + 1, 0, fresh);
        }
        else
        {
            const kept: CellNode = { kind: "cell", id: cellId };
            const sp: SplitNode = { kind: "split", id: newId("s"), axis, cuts: [local],
                                   dividers: [kind], finishes: [null], thicknesses: [null], children: [kept, fresh] };
            // the cell keeps its id and its lining, a front moves up to cover both halves
            c.root = replaceNode(c.root, cellId, sp);
            for (const f of onCell)
            {
                f.node = sp.id;
            }
        }
    });
}


export function removeDivider(p: Project, carcassId: string, splitId: string, index: number): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const sp = findNode(c.root, splitId);
        const before = sp?.kind === "split" ? sp.children[index] : undefined;
        const after = sp?.kind === "split" ? sp.children[index + 1] : undefined;
        if (sp === null || sp.kind !== "split" || before === undefined || after === undefined)
        {
            throw new CommandError("Séparation introuvable.");
        }
        if (before.kind !== "cell" || after.kind !== "cell")
        {
            throw new CommandError("Retirer d'abord les séparations des cases voisines.");
        }
        sp.cuts.splice(index, 1);
        sp.dividers.splice(index, 1);
        sp.finishes.splice(index, 1);
        sp.thicknesses.splice(index, 1);
        sp.children.splice(index + 1, 1);
        if (sp.children.length === 1)
        {
            // a split left with one child collapses into it, and its front follows
            const only = sp.children[0]!;
            c.root = replaceNode(c.root, sp.id, only);
            for (const f of frontsOn(c.fronts, sp.id))
            {
                f.node = only.id;
            }
        }
        prune(c);
    });
}


// A dragged divider snaps on the grid, a position typed in mm is kept as it is
export function moveDivider(p: Project, carcassId: string, splitId: string, index: number, pos: number,
    exact = false): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const lay = resolveLayout(c);
        const sp = findNode(c.root, splitId);
        const nb = lay.nodes.get(splitId);
        if (sp === null || sp.kind !== "split" || nb === undefined)
        {
            throw new CommandError("Séparation introuvable.");
        }
        const thick = (k: number): number =>
        {
            return dividerThickness(c, sp.axis, sp.thicknesses[k] ?? null);
        };
        const start = sp.axis === "h" ? nb.y : nb.x;
        const length = sp.axis === "h" ? nb.h : nb.w;
        const origin = sp.axis === "h" ? lay.inner.y : lay.inner.x;
        const local = Math.round(exact ? pos - start : origin + snap(pos - origin, q.settings.grid) - start);
        const previous = index === 0 ? 0 : sp.cuts[index - 1]! + thick(index - 1);
        const next = index === sp.cuts.length - 1 ? length : sp.cuts[index + 1]!;
        if (local - previous < MIN_CELL || next - (local + thick(index)) < MIN_CELL)
        {
            throw new CommandError(`Déplacement impossible : ${MIN_CELL} mm mini par case.`);
        }
        sp.cuts[index] = local;
        // nested splits inside the neighbours keep their own minimum sizes
        const errors = resolveLayout(c).errors;
        if (errors.length > 0)
        {
            throw new CommandError(`Déplacement impossible : ${errors[0]}`);
        }
    });
}


// Every cell of a split gets the same height or width, the dividers taken off : to the mm, the last cell
// keeping what rounding leaves
export function distributeEvenly(p: Project, carcassId: string, splitId: string): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const sp = findNode(c.root, splitId);
        const nb = resolveLayout(c).nodes.get(splitId);
        if (sp === null || sp.kind !== "split" || nb === undefined)
        {
            throw new CommandError("Choisir une zone recoupée par des tablettes ou des montants.");
        }
        const thick = sp.cuts.map((_, k) =>
        {
            return dividerThickness(c, sp.axis, sp.thicknesses[k] ?? null);
        });
        const length = sp.axis === "h" ? nb.h : nb.w;
        let used = 0;
        for (const t of thick)
        {
            used += t;
        }
        const each = (length - used) / sp.children.length;
        let before = 0;
        let k = 0;
        while (k < sp.cuts.length)
        {
            sp.cuts[k] = Math.round((k + 1) * each + before);
            before += thick[k]!;
            k++;
        }
        const errors = resolveLayout(c).errors;
        if (errors.length > 0)
        {
            throw new CommandError(`Répartition impossible : ${errors[0]}`);
        }
    });
}


// The height of a cell in a horizontal split, its width in a vertical one : the divider after it moves, or the
// one before it for the last cell
export function setCellSize(p: Project, carcassId: string, cellId: string, size: number): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const sp = findParent(c.root, cellId);
        if (sp === null)
        {
            throw new CommandError("Cette case remplit tout le caisson : régler la taille du caisson.");
        }
        if (!Number.isFinite(size) || size < MIN_CELL)
        {
            throw new CommandError(`Taille illisible ou trop petite : ${MIN_CELL} mm au moins.`);
        }
        const thick = (k: number): number =>
        {
            return dividerThickness(c, sp.axis, sp.thicknesses[k] ?? null);
        };
        const nb = resolveLayout(c).nodes.get(sp.id)!;
        const i = sp.children.findIndex((n) =>
        {
            return n.id === cellId;
        });
        if (i < sp.cuts.length)
        {
            sp.cuts[i] = Math.round((i === 0 ? 0 : sp.cuts[i - 1]! + thick(i - 1)) + size);
        }
        else
        {
            sp.cuts[i - 1] = Math.round((sp.axis === "h" ? nb.h : nb.w) - size - thick(i - 1));
        }
        const errors = resolveLayout(c).errors;
        if (errors.length > 0)
        {
            throw new CommandError(`Taille impossible : ${errors[0]}`);
        }
    });
}


export function setDividerKind(p: Project, carcassId: string, splitId: string, index: number, kind: DividerKind): Project
{
    return edit(p, (q) =>
    {
        const sp = findNode(carcassOf(q, carcassId).root, splitId);
        if (sp === null || sp.kind !== "split" || sp.axis !== "h")
        {
            throw new CommandError("Seule une tablette horizontale peut être réglable.");
        }
        sp.dividers[index] = kind;
    });
}


// Own decor and lacquer colour of one shelf or upright, null gives it the carcass decor back
export function setDividerFinish(p: Project, carcassId: string, splitId: string, index: number,
    finish: Finish | null): Project
{
    return edit(p, (q) =>
    {
        const sp = findNode(carcassOf(q, carcassId).root, splitId);
        if (sp === null || sp.kind !== "split" || index < 0 || index >= sp.cuts.length)
        {
            throw new CommandError("Séparation introuvable.");
        }
        sp.finishes[index] = finish === null ? null : { ...finish };
    });
}


// Own thickness of one shelf, null gives it the shelf thickness of the carcass back
export function setDividerThickness(p: Project, carcassId: string, splitId: string, index: number,
    thickness: number | null): Project
{
    return edit(p, (q) =>
    {
        const c = carcassOf(q, carcassId);
        const sp = findNode(c.root, splitId);
        if (sp === null || sp.kind !== "split" || index < 0 || index >= sp.cuts.length)
        {
            throw new CommandError("Séparation introuvable.");
        }
        if (sp.axis !== "h")
        {
            throw new CommandError("Un montant garde l'épaisseur des côtés du caisson.");
        }
        sp.thicknesses[index] = thickness;
        // a thicker shelf eats into the cell above it
        // TODO it is refused when that cell gets too small, pushing the shelves above up could be the beter answer
        const errors = resolveLayout(c).errors;
        if (errors.length > 0)
        {
            throw new CommandError(`Épaisseur impossible : ${errors[0]}`);
        }
    });
}
