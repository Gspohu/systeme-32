import { describe, expect, it } from "vitest";
import { addItem, updateItem } from "./commands";
import { newLadder, newProject } from "./factory";
import { analyse } from "./analysis";
import { roomBox } from "./room";
import type { Item, Project } from "./model";

// a library in Riquewihr : a 2400 rail at 2000, the ladder bought with it
function library(o: Partial<Item> = {}): Project
{
    const p = addItem(newProject("bibliothèque"), newLadder({ name: "Échelle", x: 200 }));
    return updateItem<Item>(p, p.items[0]!.id, o);
}


describe("library ladder", () =>
{
    it("orders the rail cut to length and says what stays with the maker", () =>
    {
        const a = analyse(library());
        const notes: string[] = [];
        for (const h of a.build.hardware)
        {
            notes.push(`${h.ref} ${h.note ?? ""}`);
        }
        expect(notes).toContain("LADDER_RAIL coupé à 2400 mm, axe à 2000 mm du sol");
        const warn = a.checks.find((k) =>
        {
            return k.level === "warning" && k.message.includes("non vérifiés");
        });
        expect(warn!.message).toContain("charge admise, inclinaison et entraxe des supports du rail");
        expect(roomBox(library().items[0]!, newProject("x").room)).toEqual({ min: [200, 1985, 400], max: [2600,
            2015, 430] });
    });

    it("refuses a ladder placed beyond the end of its rail", () =>
    {
        const errors = analyse(library({ ladderAt: 2000 } as Partial<Item>)).checks.filter((k) =>
        {
            return k.level === "error";
        });
        expect(errors[0]!.message).toContain("l'échelle sort du rail de 2400 mm. La placer entre 0 et 1950 mm");
    });
});
