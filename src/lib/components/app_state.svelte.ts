// Application state : history of plain projects, selection, derived outputs, notifications

import type { Project, Wall } from "../core/model";
import { historyOf, push, redo, undo, CommandError, type History } from "../core/commands";
import { computeOutputs, type Outputs } from "../core/outputs";
import { tvWall } from "../core/templates";


export type Selection =
    | { kind: "item"; item: string }
    | { kind: "node"; item: string; node: string }
    | { kind: "front"; item: string; front: string }
    | { kind: "divider"; item: string; split: string; index: number };

export interface Toast
{
    id: number;
    message: string;
    variant: "info" | "success" | "warning" | "danger";
}

class AppState
{
    // raw : commands clone projects with structuredClone, which rejects reactive proies
    history = $state.raw<History>(historyOf(tvWall()));
    textures = $state.raw<Map<string, Uint8Array>>(new Map());
    selection = $state<Selection | null>(null);
    // the wall the façade shows, where dropped items land
    wall = $state<Wall>("back");
    toasts = $state<Toast[]>([]);
    storageOk = $state(true);
    // bumped on every refused command : the inspector puts the stored value back in the field
    refusals = $state(0);
    // the 3D view shows the hardware hidden inside the carcasses, the boards seen through
    showHardware = $state(false);
    private nextToast = 0;

    project: Project = $derived(this.history.present);
    outputs: Outputs = $derived(computeOutputs(this.history.present));
    canUndo = $derived(this.history.past.length > 0);
    canRedo = $derived(this.history.future.length > 0);

    // runs a comand on the present project, keeps it in the history, turns its refusal into a message
    apply<A extends unknown[]>(command: (p: Project, ...args: A) => Project, ...args: NoInfer<A>): boolean
    {
        try
        {
            this.history = push(this.history, command(this.history.present, ...args));
            return true;
        }
        catch (e)
        {
            this.refusals++;
            this.notify(e instanceof CommandError ? e.message : `Opération impossible : ${(e as Error).message}`,
                        e instanceof CommandError ? "warning" : "danger");
            return false;
        }
    } 


    load(p: Project, textures: Map<string, Uint8Array>): void
    {
        this.history = historyOf(p);
        this.textures = textures;
        this.selection = null;
        this.wall = "back";
    }


    undo(): void
    {
        this.history = undo(this.history);
    }


    redo(): void
    {
        this.history = redo(this.history);
    }

    notify(message: string, variant: Toast["variant"] = "info"): void
    {
        const id = this.nextToast++;
        this.toasts = [...this.toasts, { id, message, variant }];
        setTimeout(() =>
        {
            this.dismiss(id);
        }, variant === "danger" ? 8000 : 4000);
    }


    dismiss(id: number): void
    {
        const kept: Toast[] = [];
        for (const t of this.toasts)
        {
            if (t.id !== id)
            {
                kept.push(t);
            }
        }
        this.toasts = kept;
    }
}

export const app = new AppState();
