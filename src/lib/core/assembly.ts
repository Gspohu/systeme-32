// Assembly sequence of each item, read off what the analysis built : parts, joints, hardware, fronts, base, links

import type { Item, Project } from "./model";
import type { Analysis } from "./analysis";
import type { Bom } from "./bom";
import type { HardwareLine, Part, Purpose } from "./part_types";
import { itemExtent } from "./extent";
import { hardware } from "../data/hardware";
import { DIAM } from "./text";

export interface Step
{
    title: string;
    lines: string[];
}

export interface Sequence
{
    item: string;
    name: string;
    steps: Step[];
}

// workshop convention : a square carcass shows equal diagonals within a millimetre
const SQUARE_TOLERANCE = 1;
const CARCASS = new Set(["side", "top", "bottom", "vdivider", "hdivider"]);
const BOX = new Set(["boxSide", "boxEnd", "boxBottom"]);


// Items in the order they go up : what stands lower first, left to right along each wall
// TODO an L of two walls goes up wall after wall by name, nothing yet weighs which corner carcass must stand first
export function assemblyOrder(p: Project): Item[]
{
    return [...p.items].sort((a, b) =>
    {
        const ea = itemExtent(a);
        const eb = itemExtent(b);
        return ea.y0 - eb.y0 || a.wall.localeCompare(b.wall) || ea.x0 - eb.x0;
    });
}


export function assemblySequences(p: Project, a: Analysis, bom: Bom): Sequence[]
{
    const order = assemblyOrder(p);
    const rank = new Map(order.map((it, i) =>
    {
        return [it.id, i];
    }));
    // what joins two items is set when the second of them goes up
    const later = (h: HardwareLine): string =>
    {
        const other = h.partner ?? h.item;
        return (rank.get(other) ?? 0) > (rank.get(h.item) ?? 0) ? other : h.item;
    };
    return order.map((it, i) =>
    {
        const parts = a.build.parts.filter((q) =>
        {
            return q.item === it.id;
        });
        const lines = a.build.hardware.filter((h) =>
        {
            return h.partner === undefined ? h.item === it.id : later(h) === it.id;
        });
        const steps = it.kind === "carcass" ? carcassSteps(p, a, bom, it.id, parts, lines)
            : [partsStep(bom, parts), hardwareStep("Poser", lines)];
        steps.push(...checksStep(a, it.id));
        if (i > 0)
        {
            steps.unshift({ title: "Après", lines: [`${order.slice(0, i).map((x) =>
            {
                return x.name;
            }).join(", ")} en place`] });
        }
        return { item: it.id, name: it.name, steps: steps.filter((s) =>
        {
            return s.lines.length > 0;
        }) };
    });
}


function codes(bom: Bom, parts: Part[]): string
{
    return parts.map((q) =>
    {
        return `${bom.codeOfPart.get(q.id) ?? "?"} ${q.label}`;
    }).sort((p, q) =>
    {
        return p.localeCompare(q, "fr", { numeric: true });
    }).join(", ");
}


function partsStep(bom: Bom, parts: Part[]): Step
{
    return { title: "Pièces", lines: parts.length > 0 ? [codes(bom, parts)] : [] };
}


// Hardware lines as "qty x ref label", the same reference summed
function listed(lines: HardwareLine[]): string[]
{
    const qty = new Map<string, number>();
    for (const h of lines)
    {
        qty.set(h.ref, (qty.get(h.ref) ?? 0) + h.qty);
    }
    return [...qty].map(([ref, n]) =>
    {
        const h = hardware(ref);
        return `${n} x ${`${h.brand} ${h.ref}`.trim()} ${h.label}`;
    });
}


function hardwareStep(title: string, lines: HardwareLine[]): Step
{
    return { title, lines: listed(lines) };
}


// How many face holes of these parts serve that purpose : the hardware actually drilled for
function holes(parts: Part[], purpose: Purpose): number
{
    return parts.reduce((n, q) =>
    {
        return n + q.holes.filter((h) =>
        {
            return h.purpose === purpose && (h.face === "A" || h.face === "B");
        }).length;
    }, 0);
}


function carcassSteps(p: Project, a: Analysis, bom: Bom, id: string, parts: Part[], lines: HardwareLine[]): Step[]
{
    const c = p.items.find((x) =>
    {
        return x.id === id;
    })!;
    if (c.kind !== "carcass")
    {
        return [];
    }
    // every part a step names is marked too, the rest listed at the end
    const named = new Set<Part>();
    const of = (pred: (q: Part) => boolean): Part[] =>
    {
        const out = parts.filter(pred);
        for (const q of out)
        {
            named.add(q);
        }
        return out;
    };
    const onEnd = (q: Part): boolean =>
    {
        return q.id.startsWith(`${id}/end/`);
    };
    // every line a step takes is marked, what none took is listed at the end : nothing left out
    const used = new Set<HardwareLine>();
    const pick = (pred: (h: HardwareLine) => boolean): HardwareLine[] =>
    {
        const out = lines.filter(pred);
        for (const h of out)
        {
            used.add(h);
        }
        return out;
    };
    const serving = (...purposes: Purpose[]): ((h: HardwareLine) => boolean) =>
    {
        return (h) =>
        {
            return purposes.includes(h.purpose);
        };
    };
    // the reference the sentences quote, read off the line itself
    const refOf = (purpose: Purpose): string =>
    {
        return lines.find(serving(purpose))?.ref ?? "?";
    };
    const shell = of((q) =>
    {
        return CARCASS.has(q.role) && !onEnd(q);
    });
    const boxes = of((q) =>
    {
        return BOX.has(q.role);
    });
    const steps: Step[] = [partsStep(bom, parts)];

    // flat on the bench, before anything stands : what goes into the panels
    const prep: string[] = [];
    // counted from the holes they go in, their lines mix the box and the drawers
    pick(serving("minifix-housing", "minifix-bolt", "dowel", "system-plate"));
    const housings = holes(shell, "minifix-housing");
    if (housings > 0)
    {
        prep.push(`${holes(shell, "minifix-bolt")} goujons Minifix ${refOf("minifix-bolt")} vissés dans les faces, `
            + `${housings} boîtiers ${refOf("minifix-housing")} posés dans les chants, flèche vers le chant`);
    }
    const plates = holes(shell, "plate-dowel") / 2;
    if (plates > 0)
    {
        prep.push(`${plates} embases ${refOf("system-plate")} enfoncées dans les trous de la série (chevilles EXPANDO)`);
    }
    // Lamello Clamex P-14 notice, steps 3 and 4 : each half turned into its P groove, tightened once joined
    const clamex = pick(serving("clamex"));
    prep.push(...listed(clamex).map((t) =>
    {
        return `${t}, chaque moitié pivotée dans sa rainure P`;
    }));
    prep.push(...listed(pick(serving("runner", "runner-screw"))).map((t) =>
    {
        return `${t}, coulisses vissées sur les joues et montants avant assemblage`;
    }));
    steps.push({ title: "Préparer les panneaux", lines: prep });

    // standing the shell : bottom, sides, the inside panels, then the top
    const shellDowels = holes(shell, "dowel");
    const uprights = shell.filter((q) =>
    {
        return q.role === "vdivider";
    });
    const fixed = shell.filter((q) =>
    {
        return q.role === "hdivider";
    });
    const grooved = c.back.type === "groove";
    const build: string[] = [];
    if (shellDowels > 0)
    {
        build.push(`${shellDowels} tourillons hêtre 8 x 35 collés dans les chants`);
    }
    build.push(`Dessous sur la joue gauche, ${uprights.length > 0 ? `montants (${codes(bom, uprights)}), ` : ""}`
        + `${fixed.length > 0 ? `tablettes fixes (${codes(bom, fixed)}), ` : ""}joue droite`
        + `${grooved ? ", fond glissé dans ses rainures" : ""}, dessus en dernier`);
    if (housings > 0)
    {
        build.push("Serrer les boîtiers Minifix d'un quart de tour, sans forcer");
    }
    if (clamex.length > 0)
    {
        build.push(`Serrer les Clamex à la clé six pans de 4 par leurs trous d'accès ${DIAM}6`);
    }
    build.push(`Équerrage : diagonales de la face avant égales à ${SQUARE_TOLERANCE} mm près, `
        + `${Math.round(Math.hypot(c.width, c.height))} mm chacune`);
    steps.push({ title: "Assembler le caisson", lines: build });

    const back = of((q) =>
    {
        return q.role === "back" && !onEnd(q);
    });
    if (c.back.type === "applied" && back.length > 0)
    {
        steps.push({ title: "Fond", lines: [`${codes(bom, back)} posé d'équerre sur le chant arrière, caisson couché sur `
            + "la face avant", ...back.flatMap((q) =>
        {
            return q.notes;
        })] });
    }

    // a rounded end comes on its side once the box is square, its boards joined to the side
    const end = of(onEnd);
    if (end.length > 0)
    {
        // their bolts are in the face of the side, counted with the panels
        steps.push({ title: "Bout arrondi", lines: [
            `${codes(bom, end)} : planches galbées assemblées sur la face extérieure de la joue, `
                + `${holes(end, "minifix-housing")} boîtiers Minifix dans leurs chants`,
            ...new Set(end.flatMap((q) =>
            {
                return q.notes;
            })),
        ] });
    }
    const linings = of((q) =>
    {
        return q.role === "lining";
    });
    if (linings.length > 0)
    {
        steps.push({ title: "Habillage", lines: [`${codes(bom, linings)} posés dans leur case`,
                                                 ...new Set(linings.flatMap(
            (q) =>
            {
                return q.notes;
            }))] });
    }

    // the base goes under while the carcass still lies down
    steps.push({ title: "Socle", lines: listed(pick(serving("foot", "foot-mount"))).map((t) =>
    {
        return `${t}, sous le dessous`;
    }) });

    // set in place : levelled, held to the wall, joined to its neighbours, closed to the walls
    const place: string[] = [];
    if (c.base.type === "plinth" || c.base.type === "feet")
    {
        place.push("Mettre en place et régler les pieds avant de charger le meuble");
    }
    place.push(...listed(pick(serving("plinth-clip", "vent-grill", "wall-hanger", "anti-tip", "anti-tip-screw",
                                      "wall-fixing"))));
    place.push(...pick(serving("link-screw")).map((h) =>
    {
        return `${h.qty} vis de liaison ${h.ref} : ${h.note ?? ""}, dans les trous ${DIAM}8 déjà percés`;
    }));
    const fillers = of((q) =>
    {
        return q.role === "filler" || q.role === "cleat";
    });
    if (fillers.length > 0)
    {
        const screws = pick(serving("cleat-screw")).reduce((n, h) =>
        {
            return n + h.qty;
        }, 0);
        place.push(`${codes(bom, fillers)} : tasseaux vissés sur les joues (${screws} vis 4 x 30), fileurs ajustés au mur `
            + "puis collés sur leur tasseau");
    }
    const plinths = of((q) =>
    {
        return q.role === "plinth";
    });
    if (plinths.length > 0)
    {
        place.push(`${codes(bom, plinths)} : ${plinths.length > 1 ? "clipsées" : "clipsée"} en dernier, une fois le `
            + "meuble réglé");
    }
    steps.push({ title: "Mise en place", lines: place });

    // drawers : box, runners, then the front set and screwed from inside
    if (boxes.length > 0)
    {
        steps.push({ title: "Tiroirs", lines: [
            `Caissons (${codes(bom, boxes)}) : ${holes(boxes, "dowel")} tourillons collés, fond entre les côtés`,
            ...listed(pick(serving("runner-coupling"))),
            ...listed(pick(serving("front-screw"))),
        ] });
    }

    // doors and flaps : hinges clipped on, set, opened by hand or by pressure
    // the plates screwed on inset doors and the cup screws belong to the doors, the EXPANDO plates went in earlier
    const fronts = of((q) =>
    {
        return ["door", "drawerFront", "leaf", "flap", "panel"].includes(q.role);
    });
    const doorStep = hardwareStep("Portes et façades", pick(serving("hinge", "flap", "sliding", "push-latch",
                                                                    "push-adapter", "handle", "cup-screw",
                                                                    "flap-screw", "screwed-plate")));
    if (fronts.length > 0)
    {
        doorStep.lines.unshift(`Façades : ${codes(bom, fronts)}`);
    }
    steps.push(doorStep);

    // the inside last : pins and shelves, rails, light
    const loose = of((q) =>
    {
        return q.role === "shelf";
    });
    const inside = listed(pick(serving("shelf-support", "rail", "rail-screw", "shoe-rack", "light")));
    if (loose.length > 0)
    {
        inside.push(`Étagères réglables posées sur leurs taquets : ${codes(bom, loose)}`);
    }
    steps.push({ title: "Intérieur", lines: inside });
    steps.push(hardwareStep("Autres quincailleries", lines.filter((h) =>
    {
        return !used.has(h);
    })));
    const rest = parts.filter((q) =>
    {
        return !named.has(q);
    });
    steps.push({ title: "Autres pièces", lines: rest.length > 0 ? [codes(bom, rest)] : [] });
    return steps;
}


// What the checks still say about the item, to look at once it stands
function checksStep(a: Analysis, id: string): Step[]
{
    const said = a.checks.filter((k) =>
    {
        return k.item === id && k.level !== "info";
    }).map((k) =>
    {
        return `${k.level === "error" ? "Erreur" : "Attention"} : ${k.message}`;
    });
    return [{ title: "Vérifier", lines: said }];
}
