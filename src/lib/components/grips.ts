// Where each item's grip sits over the front view : above its item, or moved aside onto the nearest free spot when
// it would cover another one, the big items keeping theirs

// a grip is 28 px high, a row 32 apart, set 6 px over the top of its item
export const GRIP_H = 28;
export const GRIP_ROW = 32;
export const GRIP_GAP = 6;
// spots tried around the natural one : half a grip aside, a whole one at most, then rows up
const STEPS = 2;
const ROWS = 5;


export interface GripSpot
{
    text: string;
    px: number;
    // pixels aside and rows up from right over its item
    dx: number;
    lift: number;
    // off its item's top : a dotted line leads down to it
    leader: boolean;
}


// cut past 28 characters : at 18, Placards et tiroirs lost its last letter, the grips are moved aside anyway
const GRIP_CHARS = 28;


export function gripLabel(name: string): { text: string; px: number }
{
    const px = Math.max(90, Math.min(name.length, GRIP_CHARS) * 8 + 20);
    const fits = Math.min(GRIP_CHARS, Math.floor((px - 20) / 8)); 
    // the three dots counted in hwat the grip holds
    return { text: name.length > fits ? `${name.slice(0, Math.max(1, fits - 3))}...` : name, px };
}


// The narrowest items are placed first, over themselves. A wider one slides its grip along its own top, no leader
// needed, then takes the nearest free spot inside the `view`, or stays over its item. `u` is mm per screen pixel
export function layoutGrips(items: { id: string; name: string; mid: number; top: number; width: number }[],
                            u: number, view?: { x0: number; x1: number; y0: number; y1: number }): Map<string, GripSpot>
{
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const out = new Map<string, GripSpot>();
    const order = [...items].sort((a, b) =>
    {
        return a.width - b.width || a.top - b.top;
    });
    for (const g of order)
    {
        const label = gripLabel(g.name);
        const step = (label.px + 8) / 2;
        const along = (g.width / 2) / u;
        const spots: [number, number][] = [];
        // first along its own top, a quarter grip at a time, the middle first
        for (let k = 0; k * step / 2 <= along; k++)
        {
            spots.push([k * step / 2, 0]);
            if (k > 0)
            {
                spots.push([-k * step / 2, 0]);
            }
        }
        const aside: [number, number][] = [];
        for (let lift = 0; lift <= ROWS; lift++)
        {
            for (let k = -STEPS; k <= STEPS; k++)
            {
                if (lift > 0 || Math.abs(k * step) > along)
                {
                    aside.push([k * step, lift]);
                }
            }
        }
        // then the nearest first : a row up weighs like half a grip aside
        aside.sort((a, b) =>
        {
            return Math.hypot(a[0] / step, a[1]) - Math.hypot(b[0] / step, b[1]) || b[0] - a[0];
        });
        spots.push(...aside);
        let chosen: [number, number] = [0, 0];
        let box = { x0: 0, x1: 0, y0: 0, y1: 0 };
        let found = false;
        for (const [dx, lift] of spots)
        {
            const x = g.mid + dx * u;
            const y0 = g.top + (GRIP_GAP + GRIP_ROW * lift) * u;
            const b = { x0: x - label.px * u / 2, x1: x + label.px * u / 2, y0, y1: y0 + GRIP_H * u };
            // 4 px of air between two grips, a moved one kept whole inside the view
            const shown = view === undefined || (dx === 0 && lift === 0) || (b.x0 >= view.x0 && b.x1 <= view.x1
                && b.y0 >= view.y0 && b.y1 <= view.y1);
            const clear = placed.every((o) =>
            {
                return b.x1 + 4 * u <= o.x0 || b.x0 >= o.x1 + 4 * u || b.y1 + 4 * u <= o.y0 || b.y0 >= o.y1 + 4 * u;
            });
            if (clear && shown)
            {
                chosen = [dx, lift];
                box = b;
                found = true;
                break;
            }
        }
        // no free spot left : it stay right over its item
        if (!found)
        {
            const y0 = g.top + GRIP_GAP * u;
            box = { x0: g.mid - label.px * u / 2, x1: g.mid + label.px * u / 2, y0, y1: y0 + GRIP_H * u };
        }
        placed.push(box);
        out.set(g.id, { ...label, dx: chosen[0], lift: chosen[1],
                        leader: chosen[1] > 0 || Math.abs(chosen[0]) > along });
    }
    return out;
}
