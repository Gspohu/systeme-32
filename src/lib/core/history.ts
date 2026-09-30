// Undo and redo over whole projects, which commands never mutate

import type { Project } from "./model";

export interface History
{
    past: Project[];
    present: Project;
    future: Project[];
}


const HISTORY_DEPTH = 100;


export function historyOf(p: Project): History
{
    return { past: [], present: p, future: [] };
}


// Everything but the stamp : a command that changed nothing must not laeve an undo step doing nothing
function sameContent(a: Project, b: Project): boolean
{
    return JSON.stringify({ ...a, updated: "" }) === JSON.stringify({ ...b, updated: "" });
}


export function push(h: History, next: Project): History
{
    if (sameContent(h.present, next))
    {
        return h;
    }
    return { past: [...h.past, h.present].slice(-HISTORY_DEPTH), present: next, future: [] };
}


export function undo(h: History): History
{
    const previous = h.past[h.past.length - 1];
    if (previous === undefined)
    {
        return h;
    } 
    return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}


export function redo(h: History): History
{
    const next = h.future[0];
    if (next === undefined)
    {
        return h;
    }
    return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
