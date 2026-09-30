// Palette tools and what dropping each one des at a hit point, expressed as project commands

import type { Project, Wall } from "../core/model";
import type { Hit } from "./hit";
import { addItem, setEnd, setFront, setLight, setLining, setRail, setShoeRack, splitCell } from "../core/commands";
import { newBox, newCarcass, newCorner, newLadder, newSlats, newWallShelf, DEFAULT_BATTENS } from "../core/factory";
import { CommandError } from "../core/commands";
import { snap } from "../core/layout";
import { itemContains } from "./hit";
import { DESK_HEIGHT } from "../core/desk";
import { PANEL_MARGIN } from "../core/cutouts";


// dropped and moved items land on this step, in mm
export const PLACE_STEP = 10;


export interface Tool
{
    id: string;
    label: string;
    hint: string;
    // svg path data drawn in a 24 x 24 box with the current colour
    icon: string;
}

export const TOOLS: Tool[] = [
    { id: "carcass", label: "Caisson", hint: "Déposer à côté ou au-dessus d'un meuble", icon: "M4 3h16v18H4z" },
    { id: "shelf-fixed", label: "Tablette fixe", hint: "Déposer dans une case, à la hauteur voulue",
     icon: "M4 3h16v18H4zM4 12h16" },
    { id: "shelf", label: "Étagère", hint: "Étagère réglable sur taquets",
     icon: "M4 3h16v18H4zM6 12h12M6 13h1M17 13h1" },
    { id: "upright", label: "Montant", hint: "Déposer dans une case pour la couper en deux",
     icon: "M4 3h16v18H4zM12 3v18" },
    { id: "door", label: "Porte", hint: "Charnières du côté le plus proche du doigt",
     icon: "M5 3h14v18H5zM19 3L5 12l14 9" },
    { id: "double", label: "Double porte", hint: "Deux vantaux sur la zone",
     icon: "M4 3h16v18H4zM12 3v18M4 3l8 9-8 9M20 3l-8 9 8 9" },
    { id: "drawers", label: "Tiroirs", hint: "Trois tiroirs par défaut, dans une case sans séparation",
     icon: "M4 3h16v18H4zM4 9h16M4 15h16M10 6h4M10 12h4M10 18h4" },
    { id: "sliding", label: "Coulissant", hint: "Vantail SlideLine M sur une voie",
     icon: "M3 5h18v14H3zM7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3" },
    { id: "lift", label: "Abattant", hint: "Relevant AVENTOS HK top, zone de 205 à 600 mm de haut",
     icon: "M3 6h18v12H3zM3 18l9-12 9 12" },
    { id: "arch", label: "Arcade", hint: "Façade fixe percée d'un arc, l'intérieur de la case se voit",
     icon: "M4 3h16v18H4zM8 18v-7a4 4 0 0 1 8 0v7z" },
    { id: "porthole", label: "Hublot", hint: "Façade fixe percée d'un rond",
     icon: "M4 3h16v18H4zM12 7a5 5 0 1 0 0.01 0z" },
    { id: "lining", label: "Habillage", hint: "Intérieur de niche en Halifax 8 mm", icon: "M4 3h16v18H4zM7 6h10v12H7z" },
    { id: "rail", label: "Penderie", hint: "Tringle sous le panneau au-dessus de la case",
     icon: "M4 3h16v18H4zM4 7h16M12 7v2l-6 5h12l-6-5" },
    { id: "lift-rail", label: "Ascenseur", hint: "Penderie escamotable Häfele, largeur intérieure 440 à 1200 mm",
     icon: "M4 3h16v18H4zM6 7h12M8 7l-2 8M16 7l2 8M6 15h12" },
    { id: "shoes", label: "Chaussures", hint: "Deux range-chaussures Häfele vissés au fond de la case",
     icon: "M4 3h16v18H4zM6 17l12-3M6 11l12-3" },
    { id: "light", label: "Éclairage", hint: "Profilé LED sous le panneau au-dessus de la case",
     icon: "M4 3h16v18H4zM7 6h10M9 9l-2 3M12 9v4M15 9l2 3" },
    { id: "spots", label: "Spots", hint: "Spot rond encastré sous le panneau au-dessus de la case",
     icon: "M4 3h16v18H4zM4 6h16M14 6a2 2 0 0 1-4 0" },
    { id: "round-end", label: "Bout arrondi", hint: "Côté du caisson le plus proche",
     icon: "M4 4h10a8 8 0 0 1 0 16H4z" },
    { id: "corner", label: "Angle arrondi", hint: "Quart de rond, à placer entre deux caissons",
     icon: "M4 20V10a6 6 0 0 1 6-6h10v6H10v10z" },
    { id: "wall-shelf", label: "Étagère murale", hint: "Fixation invisible à choisir avec l'ébéniste",
     icon: "M3 11h18v3H3z" },
    { id: "desk", label: "Plan de bureau", hint: "Dessus à 740 mm, 850 mm libres pour les jambes (EN 527-1)",
     icon: "M3 9h14a4 4 0 0 1 4 4H3zM5 13v8M19 13v8" },
    { id: "box", label: "Caisson suspendu", hint: "Caisson ouvert sur ferrures de suspension",
     icon: "M5 5h14v14H5zM8 8h8v8H8z" },
    { id: "ladder", label: "Échelle", hint: "Rail et échelle de bibliothèque, cotes à reprendre de la notice achetée",
     icon: "M3 5h18M8 5v16M16 5v16M8 9h8M8 13h8M8 17h8" },
    { id: "slats-wall", label: "Tasseaux", hint: "Lattes verticales sur liteaux, contre un mur",
     icon: "M4 3v18M8 3v18M12 3v18M16 3v18M20 3v18M3 8h18M3 16h18" },
    { id: "slats-divider", label: "Claustra", hint: "Séparation ajourée entre sol et plafond, vue des deux côtés",
     icon: "M3 3h18M3 21h18M6 3v18M10 3v18M14 3v18M18 3v18" },
];


function need(cond: boolean, message: string): void
{
    if (!cond)
    {
        throw new CommandError(message);
    }
}


// Top of whatever stands under x at the given heigt, to set new carcasses on it, and whether it is a seat
function supportTop(p: Project, x: number, y: number, wall: Wall): { top: number; seat: boolean } | null
{
    let best: { top: number; seat: boolean } | null = null;
    for (const it of p.items)
    {
        if ((it.kind !== "carcass" && it.kind !== "box") || it.wall !== wall)
        {
            continue;
        }
        const top = it.y + it.height;
        if (x >= it.x && x <= it.x + it.width && top <= y + 1 && (best === null || top > best.top))
        {
            best = { top, seat: it.kind === "carcass" && it.seat !== null };
        }
    }
    return best;
}


export function dropTool(p: Project, tool: string, hit: Hit, wall: Wall = "back"): Project
{
    const [lx, ly] = hit.local;
    switch (tool)
    {
        case "carcass":
        {
            need(hit.item === null, "Déposer le caisson sur une zone libre, à côté ou au-dessus d'un meuble.");
            const width = 600;
            const support = supportTop(p, hit.x, hit.y, wall);
            need(support === null || !support.seat, "On ne pose rien sur une assise. Déposer le caisson ailleurs.");
            const base = support === null ? { type: "plinth" as const, height: 100, setback: 50 }
                : { type: "floor" as const };
            const standY = support === null ? 100 : support.top;
            const c = newCarcass({ name: `Caisson ${p.items.length + 1}`, width, height: 800, depth: 500,
                                  x: snap(hit.x - width / 2, PLACE_STEP), y: standY, base, wall });
            let free = true;
            for (const it of p.items)
            {
                free = free && (it.wall !== wall || (!itemContains(it, c.x + 1, c.y + 1)
                    && !itemContains(it, c.x + c.width - 1, c.y + 1)));
            }
            need(free, "Pas assez de place ici : le caisson de 600 mm chevaucherait un meuble.");
            return addItem(p, c);
        }
        case "shelf-fixed":
        case "shelf":
        case "upright":
        {
            need(hit.carcass !== null && hit.cell !== null, "Déposer dans une case d'un caisson.");
            const axis = tool === "upright" ? "v" : "h";
            const pos = axis === "v" ? lx - hit.carcass!.thickness / 2 : ly - hit.carcass!.thickness / 2;
            return splitCell(p, hit.carcass!.id, hit.cell!.id, axis, pos, tool === "shelf" ? "adjustable" : "fixed");
        }
        case "door":
        case "double":
        case "drawers":
        case "sliding":
        case "lift":
        case "arch":
        case "porthole":
        case "lining":
        case "rail":
        case "lift-rail":
        case "shoes":
        case "light":
        case "spots":
        {
            need(hit.carcass !== null && hit.cell !== null, "Déposer dans une case d'un caisson.");
            const c = hit.carcass!;
            const cell = hit.cell!;
            if (tool === "shoes")
            {
                return setShoeRack(p, c.id, cell.id, 2);
            }
            if (tool === "rail" || tool === "lift-rail")
            {
                return setRail(p, c.id, cell.id, true, tool === "rail" ? "fixed" : "lift");
            }
            if (tool === "light")
            {
                return setLight(p, c.id, cell.id, { kind: "strip", spots: 0, setback: 40, kelvin: 3000 });
            }
            if (tool === "spots")
            {
                return setLight(p, c.id, cell.id, { kind: "spots", spots: 1, setback: 40, kelvin: 3000 });
            }
            if (tool === "lining")
            {
                return setLining(p, c.id, cell.id, { decor: "H1180_ST37", colour: null, thickness: 8,
                                                     faces: { back: true, left: true, right: true,
                                                             top: true, bottom: true } });
            }
            if (tool === "door")
            {
                return setFront(p, c.id, cell.id, { type: "door", hinge: lx < cell.x + cell.w / 2 ? "left" : "right" });
            }
            if (tool === "double")
            {
                return setFront(p, c.id, cell.id, { type: "doubleDoor" });
            }
            if (tool === "drawers")
            {
                return setFront(p, c.id, cell.id, { type: "drawers", count: 3, loadKg: 10 });
            }
            if (tool === "lift")
            {
                return setFront(p, c.id, cell.id, { type: "lift", handleKg: 0 });
            }
            if (tool === "arch" || tool === "porthole")
            {
                return setFront(p, c.id, cell.id, { type: "panel", cutout: tool === "arch" ? "arch" : "round",
                                                    margin: PANEL_MARGIN });
            }
            return setFront(p, c.id, cell.id, { type: "sliding", leaves: 1,
                                                leafWidth: Math.round((cell.w + 2 * c.thickness) / 2), damped: true });
        }
        case "round-end":
        {
            need(hit.carcass !== null, "Déposer sur un caisson, du côté à arrondir.");
            const c = hit.carcass!;
            const side = lx < c.width / 2 ? "left" : "right";
            return setEnd(p, c.id, side, { type: "rounded", radius: Math.min(300, c.depth), sweep: 90,
                                          technique: "battens", flexThickness: 9, battens: DEFAULT_BATTENS, decor: c.decor });
        }
        case "corner":
            return addItem(p, newCorner({ cx: snap(hit.x, PLACE_STEP), cy: snap(hit.y, PLACE_STEP), wall }));
        case "wall-shelf":
            return addItem(p, newWallShelf({ x: snap(hit.x - 400, PLACE_STEP), y: snap(hit.y, PLACE_STEP), wall }));
        case "desk":
            // the top at the EN 527-1 height whatever the drop height, 1200 x 600 x 38 to start with (convention)
            return addItem(p, newWallShelf({ name: "Plan de bureau", purpose: "desk", x: snap(hit.x - 600, PLACE_STEP),
                                            y: DESK_HEIGHT - 38, width: 1200, depth: 600, thickness: 38, wall }));
        case "box":
            return addItem(p, newBox({ x: snap(hit.x - 200, PLACE_STEP), y: snap(hit.y - 300, PLACE_STEP), wall }));
        case "ladder":
            // the rail at the drop height, starting where the finger is
            return addItem(p, newLadder({ x: snap(hit.x, PLACE_STEP), y: snap(hit.y, PLACE_STEP), wall }));
        case "slats-wall":
            need(hit.item === null, "Déposer les tasseaux sur une partie libre du mur.");
            return addItem(p, newSlats({ x: snap(hit.x - 600, PLACE_STEP), y: Math.max(0, snap(hit.y - 1200,
                PLACE_STEP)), wall }));
        case "slats-divider":
            need(hit.item === null, "Déposer le claustra sur une zone libre, il va du sol au plafond.");
            // a divider stands in the room, away from the wall the front view looks at
            return addItem(p, newSlats({ name: "Claustra", mode: "divider", x: snap(hit.x - 500, PLACE_STEP), y: 0,
                                        z: 600, width: 1000, height: 2500, slatDepth: 60, gap: 40, wall }));
        default:
            throw new CommandError(`Outil inconnu : ${tool}`);
    }
}
