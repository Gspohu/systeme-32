// Project level editing commands, and the single entry point that re-exports the layout and front ones

import type { Item, LayoutNode, PriceEntry, Project, Room, Screen, Settings, UserTexture } from "./model";
import { newId } from "./factory";
import { PHOTO_FILE_RE } from "./photos";
import { CommandError, byId, edit, withoutId } from "./edit";


export { CommandError } from "./edit";
export { splitCell, removeDivider, moveDivider, setDividerKind, setDividerFinish, setDividerThickness, distributeEvenly,
         setCellSize }
    from "./layout_commands";
export { setFront, removeFront, updateFront, moveFront, mergeFronts, splitFront, toSliding, toDoor, setLining, setRail,
         setLight, setPrint, setEnd, setShoeRack, setModularCell, addOutlet, updateOutlet, removeOutlet } 
    from "./front_commands";
export { historyOf, push, undo, redo, type History } from "./history";


export function addItem(p: Project, it: Item): Project
{
    return edit(p, (q) =>
    {
        q.items.push(structuredClone(it));
    });
}


export function removeItem(p: Project, id: string): Project
{
    return edit(p, (q) =>
    {
        q.items = withoutId(q.items, id);
    });
}


export function updateItem<T extends Item>(p: Project, id: string, patch: Partial<T>): Project
{
    return edit(p, (q) =>
    {
        const i = q.items.indexOf(byId(q.items, id) as Item);
        if (i < 0)
        {
            throw new CommandError("Meuble introuvable.");
        }
        const it = { ...q.items[i]!, ...patch } as Item;
        if (it.kind === "device" && !([it.width, it.height, it.depth].every((v) =>
        {
            return Number.isFinite(v) && v > 0;
        }) && Number.isFinite(it.massKg) && it.massKg >= 0))
        {
            throw new CommandError("Un appareil a des cotes positives et une masse positive ou nulle : corriger la valeur.");
        }
        q.items[i] = it;
    });
}


export function duplicateItem(p: Project, id: string, dx: number): Project
{
    return edit(p, (q) =>
    {
        const src = byId(q.items, id);
        if (src === undefined)
        {
            throw new CommandError("Meuble introuvable.");
        }
        const copy = structuredClone(src);
        copy.id = newId(copy.kind[0] ?? "i");
        copy.name = `${src.name} (copie)`;
        if (copy.kind === "corner")
        {
            copy.cx += dx;
        }
        else 
        {
            copy.x += dx;
        }
        if (copy.kind === "carcass")
        {
            // fresh ids in the tree, the fronts and linings follow thir nodes
            const renamed = new Map<string, string>();
            const renew = (n: LayoutNode): void =>
            {
                const fresh = newId(n.kind === "cell" ? "c" : "s");
                renamed.set(n.id, fresh);
                n.id = fresh;
                if (n.kind === "split")
                {
                    n.children.forEach(renew);
                }
            };
            renew(copy.root);
            for (const f of copy.fronts)
            {
                f.id = newId("f");
                f.node = renamed.get(f.node) ?? f.node;
            }
            for (const l of copy.linings)
            {
                l.id = newId("l");
                l.cell = renamed.get(l.cell) ?? l.cell;
            }
            for (const r of copy.rails)
            {
                r.id = newId("r");
                r.cell = renamed.get(r.cell) ?? r.cell;
            }
            for (const e of copy.lights)
            {
                e.id = newId("e");
                e.cell = renamed.get(e.cell) ?? e.cell;
            }
            for (const s of copy.shoeRacks)
            {
                s.id = newId("h");
                s.cell = renamed.get(s.cell) ?? s.cell;
            }
        }
        q.items.push(copy);
    });
}


export function setSettings(p: Project, patch: Partial<Settings>): Project
{
    for (const [key, value] of Object.entries(patch))
    {
        // a pitch or a power of zero would divide by zero further on
        const strict = key === "grid" || key === "ledCutPitch" || key === "ledWattPerMetre" || key === "spotWatt";
        if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || (strict && value === 0)))
        {
            const names: Record<string, string> = { grid: "Pas de la grille", ledCutPitch: "Pas de coupe LED",
                                                    ledWattPerMetre: "Ruban LED", spotWatt: "Spot LED" };
            throw new CommandError(`Réglage ${names[key] ?? key} invalide (${value}). Saisir un nombre positif.`);
        }
    }
    return edit(p, (q) =>
    {
        q.settings = { ...q.settings, ...patch };
    });
}


export function setRoom(p: Project, patch: Partial<Room>): Project
{
    const names: Record<string, string> = { width: "Largeur", depth: "Profondeur", height: "Hauteur" };
    for (const [key, value] of Object.entries(patch))
    {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        {
            throw new CommandError(`${names[key] ?? key} de la pièce invalide (${value}). Saisir une cote positive en mm.`);
        }
    }
    return edit(p, (q) =>
    {
        q.room = { ...q.room, ...patch };
    });
}


// The return of one side wall of an alcove, null for a wall running the whole depth : once neither is shorter than
// the room, there is no alcove left
export function setReturn(p: Project, side: "left" | "right", value: number | null): Project
{
    if (value !== null && (!Number.isFinite(value) || value <= 0))
    {
        throw new CommandError(`Retour ${side === "left" ? "gauche" : "droit"} invalide (${value}). Saisir une cote `
            + "positive en mm, ou vider le champ pour un mur pleine profondeur.");
    }
    return edit(p, (q) =>
    {
        const { width, depth, height } = q.room;
        const next = { ...q.room.returns ?? { left: depth, right: depth }, [side]: value ?? depth };
        q.room = next.left < depth || next.right < depth ? { width, depth, height, returns: next }
            : { width, depth, height };
    });
}


export function setScreen(p: Project, screen: Screen | null): Project
{
    return edit(p, (q) =>
    {
        q.screen = screen === null ? null : { ...screen };
    });
}


export function setPrice(p: Project, key: string, price: PriceEntry | null): Project
{
    return edit(p, (q) =>
    {
        if (price === null)
        {
            delete q.prices[key];
        }
        else
        {
            q.prices[key] = { ...price };
        }
    });
}


// A photo replces the look of a decor on every panel using it, a null photo give the decor its own look back
export function setTexture(p: Project, decor: string, texture: UserTexture | null): Project
{
    return edit(p, (q) =>
    {
        if (texture === null)
        {
            delete q.textures[decor];
            return;
        }
        if (!Number.isFinite(texture.tileMm) || texture.tileMm < 10 || texture.tileMm > 5000)
        {
            throw new CommandError("Largeur de la photo : entre 10 et 5000 mm, ce que montre la photo sur le panneau.");
        }
        if (!PHOTO_FILE_RE.test(texture.file))
        {
            throw new CommandError("Nom de photo invalide. Réimporter la photo.");
        }
        q.textures[decor] = { ...texture };
    });
}


export function rename(p: Project, name: string): Project
{
    return edit(p, (q) =>
    {
        q.name = name;
    });
}
