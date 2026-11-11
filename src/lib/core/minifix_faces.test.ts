import { describe, expect, it } from "vitest";
import { analyse } from "./analysis";
import { at } from "./geometry";
import { dresser, tvWall } from "./templates";
import { EYE_LEVEL } from "../data/rules";

describe("Minifix housings of the fixed shelves", () =>
{
    // A shelf under the eyes shows its top, one above them its underside
    for (const [name, make] of [["TV wall", tvWall], ["dresser", dresser]] as const)
    {
        it(`puts the housings of every fixed shelf of the ${name} on the face not seen from 1.70 m`, () =>
        {
            const wrong: string[] = [];
            for (const q of analyse(make()).build.parts.filter((x) => { return x.role === "hdivider"; }))
            {
                const f = q.frame!;
                const under = Math.min(at(f, 0, 0, 0)[1], at(f, 0, 0, q.thickness)[1]);
                for (const h of q.holes.filter((x) => { return x.purpose === "minifix-housing"; }))
                {
                    const up = (h.face === "A" ? -f.n[1] : f.n[1]) > 0;
                    if (up !== (under >= EYE_LEVEL))
                    {
                        wrong.push(`${q.itemName} ${q.label} à ${under} : boîtier ${up ? "dessus" : "dessous"}`);
                    }
                }
            }
            expect(wrong).toEqual([]);
        });
    }
});
