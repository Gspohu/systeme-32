// What happens when a drag ends over the front view, hsared by the palette and the view itself

import { app } from "./app_state.svelte";
import { clientToWorld } from "./bridge";
import { hitTest } from "./hit";
import { dropTool, PLACE_STEP, TOOLS } from "./tools";
import { snap } from "../core/layout";
import { moveDivider, moveFront, updateItem } from "../core/commands";
import { byId } from "../core/edit";
import type { DragPayload } from "./drag.svelte";
import type { Item } from "../core/model";

export function handleDrop(payload: DragPayload, clientX: number, clientY: number): void
{
    const w = clientToWorld(clientX, clientY);
    if (w === null)
    {
        return;
    }
    const [x, y] = w;
    const hit = hitTest(app.project, app.outputs.analysis, x, y, app.wall);
    if (payload.kind === "palette")
    {
        const label = byId(TOOLS, payload.tool)?.label ?? payload.tool;
        if (app.apply(dropTool, payload.tool, hit, app.wall))
        {
            app.notify(`Ajouté : ${label}`, "success");
        }
        return; 
    }
    if (payload.kind === "front")
    {
        if (hit.carcass === null || hit.cell === null)   
        {
            app.notify("Déposer la façade dans une case d'un caisson.", "warning");
            return;
        }
        app.apply(moveFront, payload.item, payload.front, hit.carcass.id, hit.cell.id);
        return;
    }
    const it = byId(app.project.items, payload.item);
    if (it === undefined)
    {
        return;
    }
    if (payload.kind === "divider")
    {
        if (it.kind === "carcass")
        {
            const pos = payload.axis === "h" ? y - it.y - it.thickness / 2 : x - it.x - it.thickness / 2;
            app.apply(moveDivider, payload.item, payload.split, payload.index, pos);
        }
        return;
    }
    const [nx, ny] = magnet(it, snap(x - payload.dx, PLACE_STEP), Math.max(0, snap(y - payload.dy, PLACE_STEP)));
    const moved = it.kind === "corner" ? { cx: nx, cy: ny } : { x: nx, y: ny };
    app.apply(updateItem<Item>, it.id, moved as Partial<Item>);
}



const MAGNET = 40;


// Pulls a moved item onto the floor, noto the top of another item and against the sides of its neighbours
function magnet(it: Item, x: number, y: number): [number, number]
{
    if (it.kind === "corner")
    {
        return [x, y];
    }
    const width = it.width;
    const floorY = it.kind === "carcass" && (it.base.type === "plinth" || it.base.type === "feet") ? it.base.height : 0;
    let bx = x;
    let by = y;
    if (Math.abs(y - floorY) <= MAGNET)
    {
        by = floorY;
    }
    for (const o of app.project.items)
    {
        // only what stands against the same wall, and has a top to stand on
        if (o.id === it.id || o.kind === "corner" || o.kind === "ladder" || o.wall !== it.wall)
        {
            continue;
        }
        const top = o.kind === "wallShelf" ? o.y + o.thickness : o.y + o.height;
        const overlapX = x < o.x + o.width && x + width > o.x;
        // a seat never pulls anything onto itself
        const seat = o.kind === "carcass" && o.seat !== null;
        if (overlapX && !seat && Math.abs(y - top) <= MAGNET)
        {
            by = top;
        }
        if (Math.abs(x - (o.x + o.width)) <= MAGNET)
        {
            bx = o.x + o.width;
        }
        if (Math.abs(x + width - o.x) <= MAGNET)
        {
            bx = o.x - width;
        }
    }
    return [bx, by];
}
