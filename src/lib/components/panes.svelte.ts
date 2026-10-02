// Sizes of the workspace panes the user dragged, px, null for the stylesheet default : kept in this browser only

export type PaneSize = "palette" | "side" | "checks" | "viewer";

const KEY = "systeme-32.panes";
const SIZES: PaneSize[] = ["palette", "side", "checks", "viewer"];


function load(): Record<PaneSize, number | null>
{
    const sizes: Record<PaneSize, number | null> = { palette: null, side: null, checks: null, viewer: null };
    try
    {
        // whatever the browser kept is read as unknown, only a positive finite number is taken
        const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
        for (const k of SIZES)
        {
            const v: unknown = typeof raw === "object" && raw !== null ? Reflect.get(raw, k) : undefined;
            sizes[k] = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
        }
    }
    catch
    {
        // private window or blocked storage : the stylesheet sizes stay
    }
    return sizes;
}


export const panes = $state(load());


export function savePanes(): void
{
    try
    {
        localStorage.setItem(KEY, JSON.stringify(panes));
    }
    catch
    {
        // nothing kept, the sizes still hold until the page is closed
    }
}
