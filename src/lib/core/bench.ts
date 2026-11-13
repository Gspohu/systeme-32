// What is built on the bench and fitted whole : a moving front with what goes onto it there, a drawer box behind
// its front, an inner drawer. The carcass keeps what is screwed to it, runners, plates, stays

import type { FrontPanel } from "./fronts";
import type { HardwareLine, Part } from "./part_types";

export interface Bench
{
    // Id of the front part, or the tag of an inner drawer : what the parts, lines and articles are matched on
    key: string;
    item: string;
    name: string;
}

const FRONT_ROLES = new Set(["door", "drawerFront", "leaf", "flap"]);
const BOX_ROLES = new Set(["boxSide", "boxEnd", "boxBottom"]);
const BOX_ID = /^(.+)\/(drawer|pull-out)\/([^/]+)\//;

// Screwed onto the front at the bench, the rest of a frnot's hardware goes into the carcass : the plate of a hinge
// the runenr and its screws, a push latch, the mechanism of a lift and the stay of a drop-down flap
const ON_THE_FRONT = new Set(["hinge", "cup-screw", "handle", "front-screw", "runner-coupling", "flap-hinge",
                              "flap-screw", "sliding"]);
// The front brackets of an AVENTOS HK top, listed with the mechanism under its purpose (Blum p. 46)
const FRONT_BRACKETS = new Set(["20S4200"]);
// The top and bottom tracks of a sliding door share its purpose but are screwed to the carcass (fittings.ts)
const TRACKS = new Set(["9209167", "9209218"]);


export function benchOfPart(p: Part): string | null
{
    if (FRONT_ROLES.has(p.role) && p.id.startsWith(`${p.item}/front/`))
    {
        return p.id;
    }
    // By its role : the spacers udner the runners of an inner drawer share its tag and are screwed to the carcass
    const m = BOX_ROLES.has(p.role) ? BOX_ID.exec(p.id) : null;
    if (m === null)
    {
        return null;
    }
    return m[2] === "drawer" ? `${m[1]}/front/${m[3]}` : `${m[1]}/pull-out/${m[3]}`;
}


export function benchOfHardware(h: HardwareLine, fronts: FrontPanel[]): string | null
{
    if (TRACKS.has(h.ref))
    {
        return null;
    }
    // Most lines name the front panel, those of a drop-down flap name its part (drop_flaps.ts)
    const own = `${h.item}/front/`;
    const target = h.target !== null && h.target.startsWith(own) ? h.target.slice(own.length) : h.target;
    const fp = fronts.find((f) => { return f.id === target; });
    if (fp === undefined || fp.role === "panel")
    {
        return null;
    }
    if (!ON_THE_FRONT.has(h.purpose) && !(h.purpose === "flap" && FRONT_BRACKETS.has(h.ref)))
    {
        return null;
    }
    // The couplings of the drawer behind a drop-down flap go with that drawer, not with the flap
    if (fp.role === "drop" && h.purpose === "runner-coupling")
    {
        return `${h.item}/pull-out/${fp.id}`;
    }
    return `${h.item}/front/${fp.id}`;
}


// The name a front part give its sub-assembly : the drawer, not its front
function nameOf(label: string): string
{
    return label.replace(/^Façade de tiroir\b/, "Tiroir");
}


// Each sub-assembly of the build in the order its parts were made, a front before the drawer box behind it
export function benches(parts: Part[]): Bench[]
{
    const found = new Map<string, Bench>();
    for (const p of parts)
    {
        const key = benchOfPart(p);
        if (key === null || found.has(key))
        {
            continue;
        }
        const own = key === p.id;
        // A drawer box met before its front names itself after the front all the same
        const front = own ? p : parts.find((q) => { return q.id === key; });
        const name = front !== undefined ? nameOf(front.label) : p.label.split(",")[0]!.trim();
        found.set(key, { key, item: p.item, name });
    }
    // Numbered as named, Porte 1 before Porte 2 : the order of the build gave #120 to Tiroir 3. The items in the
    // order met, a 0 between two of them made the sort depend on how the engine walks the array
    const items = [...new Set(parts.map((p) => { return p.item; }))];
    return [...found.values()].sort((a, b) =>
    {
        return items.indexOf(a.item) - items.indexOf(b.item) || a.name.localeCompare(b.name, "fr", { numeric: true });
    });
}
