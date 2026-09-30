// Pointer driven drag and drop, works with a finger as well as a mouse (HTML5 drag events do not on touch)

export type DragPayload =
    | { kind: "palette"; tool: string }
    | { kind: "front"; item: string; front: string }
    | { kind: "divider"; item: string; split: string; index: number; axis: "h" | "v" }
    | { kind: "item"; item: string; dx: number; dy: number };

type DropHandler = (payload: DragPayload, clientX: number, clientY: number) => void;


const TAP_SLOP = 6;


class Drag
{
    payload = $state<DragPayload | null>(null);
    label = $state("");
    x = $state(0);
    y = $state(0);
    // a tap is a selection, a drpo needs the pointer to travel a few pixels first
    moved = $state(false);
    private x0 = 0;
    private y0 = 0;
    private onDrop: DropHandler | null = null;

    // window listeners live only for the lenght of one drag
    start(e: PointerEvent, payload: DragPayload, label: string, onDrop: DropHandler): void
    {
        e.preventDefault();
        this.payload = payload;
        this.label = label;
        this.x = e.clientX;
        this.y = e.clientY;
        this.x0 = e.clientX;
        this.y0 = e.clientY;
        this.moved = payload.kind === "palette";
        this.onDrop = onDrop;
        window.addEventListener("pointermove", this.move);
        window.addEventListener("pointerup", this.end);
        window.addEventListener("pointercancel", this.cancel);
    }

    private move = (e: PointerEvent): void =>
    {
        this.x = e.clientX; 
        this.y = e.clientY;
        if (Math.hypot(e.clientX - this.x0, e.clientY - this.y0) > TAP_SLOP)
        {
            this.moved = true;
        }
    };

    private end = (e: PointerEvent): void =>
    {
        const p = this.payload;
        const cb = this.onDrop;
        const moved = this.moved;
        this.stop();
        if (p !== null && cb !== null && moved)
        {
            cb(p, e.clientX, e.clientY);
        }
    };


    private cancel = (): void =>
    {
        this.stop();
    };

    private stop(): void
    {
        window.removeEventListener("pointermove", this.move);
        window.removeEventListener("pointerup", this.end);
        window.removeEventListener("pointercancel", this.cancel);
        this.payload = null;
        this.onDrop = null;
        this.moved = false;
    }
}


export const drag = new Drag();
