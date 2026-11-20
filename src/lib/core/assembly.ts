// Assembly sequence of each item, read off what the analysis built : parts, joints, hardware, fronts, base, links

import type { End, Item, Project } from "./model";
import type { Analysis } from "./analysis";
import type { Bom, SubAssembly } from "./bom";
import { benchOfHardware, benchOfPart } from "./bench";
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

// Workshop convention : a square carcass shows equal diagonals within a millimetre
const SQUARE_TOLERANCE = 1;
const CARCASS = new Set(["side", "top", "bottom", "vdivider", "hdivider", "stiffener"]);
const BOX = new Set(["boxSide", "boxEnd", "boxBottom"]);


// Items in the order they go up : what stands lower first, left to right allong each wall
// TODO an L of two walls goes up wall after wall by name, nothing yet weighs which corner carcass must stand first
export function assemblyOrder(p: Project): Item[]
{
    // An appliance is set in place by its owner, nothing to assemble
    const order = p.items.filter((it) =>
    {
        return it.kind !== "device";
    }).sort((a, b) =>
    {
        const ea = itemExtent(a);
        const eb = itemExtent(b);
        // A loose carcass goes into its place once what surrounds it stands
        const loose = Number(a.kind === "carcass" && a.freeStanding === true)
            - Number(b.kind === "carcass" && b.freeStanding === true);
        return loose || ea.y0 - eb.y0 || a.wall.localeCompare(b.wall) || ea.x0 - eb.x0;
    });
    // A tall carcass waits for what stacks up on its left, or that would have to slide in with no play between it
    // and the one further left, already on the wall
    const tall = order.filter((it) =>
    {
        return it.kind === "carcass" && it.freeStanding !== true && order.some((q) =>
        {
            const [eq, ei] = [itemExtent(q), itemExtent(it)];
            return q.kind === "carcass" && q.freeStanding !== true && q.wall === it.wall && eq.y0 > ei.y0 + 0.5
                && eq.y0 < ei.y1 && eq.x1 <= ei.x0 + 0.5;
        });
    });
    const rest = order.filter((it) =>
    {
        return !tall.includes(it);
    });
    const firstLoose = rest.findIndex((it) =>
    {
        return it.kind === "carcass" && it.freeStanding === true;
    });
    const at = firstLoose < 0 ? rest.length : firstLoose;
    return [...rest.slice(0, at), ...tall, ...rest.slice(at)];
}


export function assemblySequences(p: Project, a: Analysis, bom: Bom): Sequence[]
{
    const order = assemblyOrder(p);
    const rank = new Map(order.map((it, i) =>
    {
        return [it.id, i];
    }));
    // What joins two items is set when the second of them goes up
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


function carcassSteps(project: Project, analysis: Analysis, bom: Bom, id: string, parts: Part[],
                      lines: HardwareLine[]): Step[]
{
    const carcass = project.items.find((item) =>
    {
        return item.id === id;
    })!;
    if (carcass.kind !== "carcass")
    {
        return [];
    }
    // Every part a step names is marked too, the rest listed at the end
    const named = new Set<Part>();
    const partsWhere = (wanted: (part: Part) => boolean): Part[] =>
    {
        const found = parts.filter(wanted);
        for (const part of found)
        {
            named.add(part);
        }
        return found;
    };
    const onEnd = (part: Part): boolean =>
    {
        return part.id.startsWith(`${id}/end/`);
    };
    // Every line a step takes is marked, what none took is listed at the end : nothing left out. A line taken once is
    // never taken again : the hinges of a door built on the bench were listed a second time when it was hung
    const used = new Set<HardwareLine>();
    const pick = (wanted: (line: HardwareLine) => boolean): HardwareLine[] =>
    {
        const taken = lines.filter((line) => { return !used.has(line) && wanted(line); });
        for (const line of taken)
        {
            used.add(line);
        }
        return taken;
    };
    const serving = (...purposes: Purpose[]): ((line: HardwareLine) => boolean) =>
    {
        return (line) =>
        {
            return purposes.includes(line.purpose);
        };
    };
    // The reference the sentences quote, read off the line itself
    const refOf = (purpose: Purpose): string =>
    {
        return lines.find(serving(purpose))?.ref ?? "?";
    };
    const shell = partsWhere((part) =>
    {
        return CARCASS.has(part.role) && !onEnd(part);
    });
    const boxes = partsWhere((part) =>
    {
        return BOX.has(part.role);
    });
    const steps: Step[] = [partsStep(bom, parts)];

    // Flat on the bench, before anything stands : what goes into the panels
    const prep: string[] = [];
    // Counted from the holes they go in, their lines mix the box and the drawers
    pick(serving("minifix-housing", "minifix-bolt", "dowel", "system-plate"));
    const housings = holes(shell, "minifix-housing");
    if (housings > 0)
    {
        prep.push(`${holes(shell, "minifix-bolt")} goujons Minifix ${refOf("minifix-bolt")} vissés dans les faces, `
            + `${housings} boîtiers ${refOf("minifix-housing")} posés dans les faces, flèche vers le chant`); 
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
    const doubler = shell.find((part) =>
    {
        return part.id === `${id}/top-doubler`;
    });
    pick(serving("doubler-glue", "doubler-screw"));
    if (doubler !== undefined)
    {
        prep.push(...doubler.notes);
    }
    steps.push({ title: "Préparer les panneaux", lines: prep });

    // Standing the shell : bottom, sides, the inside panels, then the top
    const shellDowels = holes(shell, "dowel");
    const uprights = shell.filter((part) =>
    {
        return part.role === "vdivider";
    });
    const fixed = shell.filter((part) =>
    {
        return part.role === "hdivider";
    });
    const grooved = carcass.back.type === "groove";
    const bearing = carcass.back.type === "panel";
    const build: string[] = [];
    if (shellDowels > 0)
    {
        build.push(`${shellDowels} tourillons hêtre 8 x 35 collés dans les chants`);
    }
    build.push(`Dessous sur la joue gauche, ${uprights.length > 0 ? `montants (${codes(bom, uprights)}), ` : ""}`
        + `${fixed.length > 0 ? `tablettes fixes (${codes(bom, fixed)}), ` : ""}joue droite`
        + `${grooved ? ", fond glissé dans ses rainures" : ""}${bearing ? ", fond porteur entre les joues" : ""}, `
        + "dessus en dernier");
    if (housings > 0)
    {
        build.push("Serrer les boîtiers Minifix d'un quart de tour, sans forcer");
    }
    if (clamex.length > 0)
    {
        build.push(`Serrer les Clamex à la clé six pans de 4 par leurs trous d'accès ${DIAM}6`);
    }
    build.push(`Équerrage : diagonales de la face avant égales à ${SQUARE_TOLERANCE} mm près, `
        + `${Math.round(Math.hypot(carcass.width, carcass.height))} mm chacune`);
    steps.push({ title: "Assembler le caisson", lines: build });

    const back = partsWhere((part) =>
    {
        return part.role === "back" && !onEnd(part);
    });
    if (carcass.back.type === "applied" && back.length > 0)
    {
        steps.push({ title: "Fond", lines: [`${codes(bom, back)} posé d'équerre sur le chant arrière, caisson couché sur `
            + "la face avant", ...back.flatMap((part) =>
        {
            return part.notes;
        }), ...listed(pick(serving("back-screw")))] });
    }

    // A rounded end comes on its side once the box is square, its boards joined to the side
    const end = partsWhere(onEnd);
    if (end.length > 0)
    {
        // Their bolts are in the face of the isde, counted with the panels. An open end has no bent skin
        const isOpen = (side: End): boolean =>
        {
            return side.type !== "square" && side.open === true;
        };
        const open = isOpen(carcass.ends.left) || isOpen(carcass.ends.right);
        steps.push({ title: "Bout arrondi", lines: [
            `${codes(bom, end)} : ${open ? "flasques et tablettes découpées" : "planches galbées"} assemblées sur la `
                + `face extérieure de la joue, ${holes(end, "minifix-housing")} boîtiers Minifix dans leurs faces`,
            ...new Set(end.flatMap((part) =>
            {
                return part.notes;
            })),
        ] });
    }
    // What is built on the bench, each one fitted whole once its carcass is ready : a drawer is its box and its front, a
    // door its front with the hinge arms and the pull, a niche its lining screwed together
    const panels = analysis.build.fronts.get(id) ?? [];
    const benchStep = (sub: SubAssembly): { step: Step; drawer: boolean; lining: boolean } =>
    {
        const own = partsWhere((part) => { return benchOfPart(part) === sub.key; });
        const bought = pick((line) => { return benchOfHardware(line, panels) === sub.key; });
        const box = own.filter((part) => { return BOX.has(part.role); });
        const front = own.some((part) => { return part.role === "drawerFront"; });
        const lining = own.some((part) => { return part.role === "lining"; });
        const how = box.length > 0
            ? `${holes(box, "dowel")} tourillons collés, fond glissé entre les côtés`
                + (front ? ", façade vissée depuis l'intérieur du caisson" : "")
            : lining ? "Panneaux vissés ensemble, têtes dehors, hors du caisson"
            : "Façade posée à plat, sa quincaillerie vissée dessus avant de l'accrocher";
        return { drawer: box.length > 0, lining,
                 step: { title: `Établi : ${sub.code}-000 ${sub.name}`, lines: [`Pièces : ${codes(bom, own)}`, how,
                                                                             ...listed(bought)] } };
    };
    const built = bom.subs.filter((s) => { return s.item === id; }).map((s) => { return { sub: s, ...benchStep(s) }; });
    const fittedList = (subs: typeof built): string =>
    {
        return subs.map((x) => { return `${x.sub.code}-000 ${x.sub.name}`; }).join(", ");
    };

    // A niche : its lining built on the bench, then slid whole into its cell
    const linings = partsWhere((part) =>
    {
        return part.role === "lining";
    });
    const niches = built.filter((x) => { return x.lining; });
    steps.push(...niches.map((x) => { return x.step; }));
    if (linings.length > 0)
    {
        steps.push({ title: "Habillage", lines: [`Habillage monté, glissé dans sa case : ${fittedList(niches)}`,
                                                 ...new Set(linings.flatMap(
            (part) =>
            {
                return part.notes;
            }))] });
    }

    // The base goes under while the carcass still lies down
    steps.push({ title: "Socle", lines: listed(pick(serving("foot", "foot-mount", "foot-mount-screw"))).map((t) =>
    {
        return `${t}, sous le dessous`;
    }) });

    // set in place : levelled, held to the wall, joined to its neighbours, closed to the walls
    const place: string[] = [];
    if (carcass.freeStanding === true)
    {
        place.push("Glisser à la main dans son logement, sans vis ni équerre : il se retire de la même façon");
    }
    if (carcass.base.type === "plinth" || carcass.base.type === "feet")
    {
        place.push("Mettre en place et régler les pieds avant de charger le meuble");
    }
    place.push(...listed(pick(serving("plinth-clip", "vent-grill", "wall-hanger", "anti-tip", "anti-tip-screw",
                                      "wall-fixing"))));
    place.push(...pick(serving("link-screw")).map((line) =>
    {
        if (line.ref === "WALL_SCREW_5x50" || line.ref === "SCREW_4x30")
        {
            const [size, hole] = line.ref === "SCREW_4x30" ? ["4 x 30", 4] : ["5 x 50", 5];
            return `${line.qty} vis ${size} depuis l'intérieur du caisson fermé : ${line.note ?? ""}, dans les trous `
                + `${DIAM}${hole} déjà percés`;
        }
        return `${line.qty} vis de liaison ${line.ref} : ${line.note ?? ""}, dans les trous ${DIAM}8 déjà percés`;
    }));
    // The spacers under the runners of a pull-out go with the drawers, not with the fillers
    const spacer = (partId: string): boolean => { return partId.includes("/pull-out/"); };
    const spacers = partsWhere((part) => { return part.role === "cleat" && spacer(part.id); });
    const fillers = partsWhere((part) =>
    {
        return (part.role === "filler" || part.role === "cleat") && !spacer(part.id);
    });
    if (fillers.length > 0)
    {
        // Each fixing as it is : a side filler screwed from the back of its cleat, the one up to the ceiling glued on
        // its cleat once the carcass stands. One sentence for all mixed their screws and said them all glued
        place.push(`${codes(bom, fillers)} : tasseaux et fileurs, ajustés au mur ou au plafond sur place`,
                   ...listed(pick(serving("cleat-screw"))));
    }
    const plinths = partsWhere((part) =>
    {
        return part.role === "plinth";
    });
    if (plinths.length > 0)
    {
        place.push(`${codes(bom, plinths)} : ${plinths.length > 1 ? "clipsées" : "clipsée"} en dernier, une fois le `
            + "meuble réglé", ...listed(pick(serving("plinth-screw"))));
    }
    // Last of all, every screw driven : the caps cut out of the banding over the heads seen
    place.push(...listed(pick(serving("screw-cap"))));
    steps.push({ title: "Mise en place", lines: place });

    // Drawers : built on the bench, clipped whole on their runners
    const drawers = built.filter((x) => { return x.drawer; });
    steps.push(...drawers.map((x) => { return x.step; }));
    if (boxes.length > 0)
    {
        const under = pick(serving("spacer-screw")).reduce((n, line) => { return n + line.qty; }, 0);
        steps.push({ title: "Tiroirs", lines: [
            ...(spacers.length > 0 ? [`${codes(bom, spacers)} : cales vissées sur les montants (${under} vis 4 x 30), `
                + "avant les coulisses du tiroir intérieur"] : []),
            ...(drawers.length > 0 ? [`Tiroirs montés, clipsés sur leurs coulisses : ${fittedList(drawers)}`] : []),
        ] });
    }

    // Doors and flaps : built on the bench, then hung on what the carcass holds for them, plates, mechanisms, stays
    const doors = built.filter((x) => { return !x.drawer && !x.lining; });
    steps.push(...doors.map((x) => { return x.step; }));
    const fixedFronts = partsWhere((part) => { return part.role === "panel"; });
    const doorStep = hardwareStep("Portes et façades", pick(serving("hinge", "flap", "flap-hinge", "sliding",
                                                                    "push-latch",
                                                                    "push-adapter", "adapter-screw", "handle", "cup-screw",
                                                                    "flap-screw", "screwed-plate", "plate-screw")));
    if (fixedFronts.length > 0)
    {
        doorStep.lines.unshift(`Façades fixes : ${codes(bom, fixedFronts)}`);
    }
    if (doors.length > 0)
    {
        doorStep.lines.unshift(`Façades montées, accrochées : ${fittedList(doors)}`);
    }
    steps.push(doorStep);

    // The inside last : pins and shelves, rails, light
    const loose = partsWhere((part) =>
    {
        return part.role === "shelf";
    });
    const inside = listed(pick(serving("shelf-support", "rail", "rail-screw", "shoe-rack", "light")));
    if (loose.length > 0)
    {
        inside.push(`Étagères réglables posées sur leurs taquets : ${codes(bom, loose)}`);
    }
    steps.push({ title: "Intérieur", lines: inside });
    steps.push(hardwareStep("Autres quincailleries", lines.filter((line) =>
    {
        return !used.has(line);
    })));
    const rest = parts.filter((part) =>
    {
        return !named.has(part);
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
