// Palette tools and what dropping each one des at a hit point, expressed as project commands

import type { Project, Wall } from "../core/model";
import type { Hit } from "./hit";
import { addItem, setEnd, setFront, setLight, setLining, setRail, setShoeRack, splitCell } from "../core/commands";
import { newBox, newCorner, newLadder, newSlats, newWallShelf } from "../core/factory";
import { CommandError } from "../core/commands";
import { snap } from "../core/layout";
import { PANEL_MARGIN } from "../core/cutouts";
import { NEW_DRAWERS, NEW_LIFT, NEW_SHOE_RACK_LEVELS, dropCarcass, newDesk, newDivider, newLight, newLining,
    newRoundEnd, newSliding } from "../core/presets";


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


// An item centred on the finger, its corner on the placing step
function centred<T extends { x: number; y: number; width: number }>(it: T, x: number, y: number): T
{
    return { ...it, x: snap(x - it.width / 2, PLACE_STEP), y: snap(y, PLACE_STEP) };
}


export function dropTool(p: Project, tool: string, hit: Hit, wall: Wall = "back"): Project
{
    const [lx, ly] = hit.local;
    switch (tool)
    {
        case "carcass":
            need(hit.item === null, "Déposer le caisson sur une zone libre, à côté ou au-dessus d'un meuble.");
            return dropCarcass(p, hit.x, hit.y, wall, PLACE_STEP);
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
                return setShoeRack(p, c.id, cell.id, NEW_SHOE_RACK_LEVELS);
            }
            if (tool === "rail" || tool === "lift-rail")
            {
                return setRail(p, c.id, cell.id, true, tool === "rail" ? "fixed" : "lift");
            }
            if (tool === "light" || tool === "spots")
            {
                return setLight(p, c.id, cell.id, newLight(tool === "light" ? "strip" : "spots"));
            }
            if (tool === "lining")
            {
                return setLining(p, c.id, cell.id, newLining(c));
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
                return setFront(p, c.id, cell.id, NEW_DRAWERS);
            }
            if (tool === "lift")
            {
                return setFront(p, c.id, cell.id, NEW_LIFT);
            }
            if (tool === "arch" || tool === "porthole")
            {
                return setFront(p, c.id, cell.id, { type: "panel", cutout: tool === "arch" ? "arch" : "round",
                                                    margin: PANEL_MARGIN });
            }
            return setFront(p, c.id, cell.id, newSliding(c, cell.w));
        }
        case "round-end":
        {
            need(hit.carcass !== null, "Déposer sur un caisson, du côté à arrondir.");
            const c = hit.carcass!;
            return setEnd(p, c.id, lx < c.width / 2 ? "left" : "right", newRoundEnd(c));
        }
        case "corner":
            return addItem(p, newCorner({ cx: snap(hit.x, PLACE_STEP), cy: snap(hit.y, PLACE_STEP), wall }));
        case "wall-shelf":
            return addItem(p, centred(newWallShelf({ wall }), hit.x, hit.y));
        case "desk":
        {
            // the desk stay at its height whatever the drop height
            const desk = newDesk(wall);
            return addItem(p, { ...centred(desk, hit.x, 0), y: desk.y });
        }
        case "box":
        {
            const b = newBox({ wall });
            return addItem(p, centred(b, hit.x, hit.y - b.height / 2));
        }
        case "ladder":
            // the rali at the drop height, starting where the finger is
            return addItem(p, newLadder({ x: snap(hit.x, PLACE_STEP), y: snap(hit.y, PLACE_STEP), wall }));
        case "slats-wall":
        {
            need(hit.item === null, "Déposer les tasseaux sur une partie libre du mur.");
            const t = newSlats({ wall });
            const at = centred(t, hit.x, hit.y - t.height / 2);
            return addItem(p, { ...at, y: Math.max(0, at.y) });
        }
        case "slats-divider":
        {
            need(hit.item === null, "Déposer le claustra sur une zone libre, il va du sol au plafond.");
            const d = newDivider(wall);
            return addItem(p, { ...centred(d, hit.x, 0), y: d.y });
        }
        default:
            throw new CommandError(`Outil inconnu : ${tool}`);
    }
}
