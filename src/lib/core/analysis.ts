// Full analysis of a project : parts, hardware, masses and every manufacturing check

import type { Carcass, Item, Project } from "./model";
import { type Build, buildCarcass, emptyBuild } from "./parts";
import type { PlateHold } from "./part_types";
import { buildStiffeners } from "./dividers";
import { buildBox, buildWallShelf, shelfSupportSpan } from "./hung_items";
import { buildCorner, buildEnds, buildLinings } from "./curves";
import { buildDrawers } from "./drawers";
import { fitBackScrews, fitBase, fitModularRows, fitShelfPins, fitSliding, lineSymmetry, partMass } from "./fittings";
import { fitJoints } from "./joints";
import { antiTipKept, fitBackWallScrews, fitWallFixing } from "./wall_fixing";
import { fitDoors } from "./doors";
import { fitHandles } from "./handles";
import { fitPrints } from "./prints"; 
import { fitLifts, liftChecks } from "./lifts";
import { fitDropFlaps, settleSpacerScrews } from "./drop_flaps";
import { bandVisibleEdges } from "./edge_visibility";
import { cornerChecks } from "./corner";
import { fitPanels } from "./cutouts";
import { buildShoeRacks } from "./shoes";
import { fitVentGrills } from "./vents";
import { buildLadder, ladderChecks } from "./ladder";
import { buildCeilingFiller, ceilingChecks } from "./ceiling";
import { buildSideFillers } from "./fillers";
import { deskChecks } from "./desk";
import { itemMass, shelfDeflection, simulatedDeflection, tipping, topDrawerExtension, topSpan, type Deflection,
        type Tipping } from "./mechanics";
import type { CalcNote } from "./calc_notes";
import { plateDeflection } from "./plate";
import { frontFootInset } from "./feet";
import { solidChecks } from "./solid_checks";
import { fitCarcassLinks } from "./carcass_links";
import { fitShelfTies } from "./shelf_ties";
import { letInFittings } from "./fitted";
import { findNode, subtreeIds } from "./layout";
import { screenSize } from "./extent";
import { itemsMeet, roomBox, wallGap } from "./room"; 
import { buildSlats } from "./slats";
import { SEAT_LOAD_N, seatChecks } from "./seat";
import { deviceChecks, devicesOn } from "./devices";
import { footLoadChecks } from "./foot_loads";
import { cutoutChecks } from "./cutout_checks";
import { stockChecks } from "./solid_stock";
import { obstacleChecks } from "./obstacles"; 
import { titleBlockChecks } from "./revisions";
import { armChecks, screenSpots, spotClashes } from "./tv_arm";
import { stopAtWalls, swingChecks } from "./swing";
import { slopeErrors } from "./slope";
import { buildRails, packRailBars, wardrobeChecks } from "./wardrobe";
import { buildLights, fitLightLeads, lightChecks } from "./lights";
import { blockedOutlets, fitOutlets } from "./outlets";
import { sinkHeads } from "./screw_heads";
import { drillPilots } from "./pilots";
import { fitScrewCaps } from "./screw_caps";
import { at, bounds, tessellate } from "./geometry";
import { lightsInTheWay, lowest } from "./loose";
import { MATERIALS, SHEET_LENGTH, SHEET_WIDTH } from "../data/materials";
import { GRAVITY, SHELF_DEFLECTION_LIMIT } from "../data/rules";
import { MAX_RUN_CELL, SIMULATED_TOPS, type SimulatedTop } from "../data/fem_results";
import { CAD_MODELS } from "../data/cad_models";
import { femFingerprint, femInput } from "./fem_input";


import type { Check } from "./check";
export type { Check, Level } from "./check";

export interface Analysis
{
    build: Build;
    checks: Check[];
    masses: Map<string, number>;
    deflections: Deflection[];
    calcNotes: CalcNote[];
    tippings: Tipping[];
}


function buildItem(it: Item, p: Project, b: Build, loads: Map<string, number>, own: Map<string, number>): void
{
    const s = p.settings;
    if (it.kind === "carcass")
    {
        const before = b.joints.length;
        const against = (side: "left" | "right"): boolean => 
        {
            const gap = wallGap(it, p.room, side);
            return gap !== null && gap <= 0.5; 
        };
        buildCarcass(it, s, b, { left: against("left"), right: against("right") });
        fitVentGrills(it, b);
        const lay = b.layouts.get(it.id)!;
        b.errors.push(...slopeErrors(it, lay, b.fronts.get(it.id) ?? []));
        buildLinings(it, lay, b);
        buildEnds(it, b);
        buildDrawers(it, lay, s, b);
        fitDoors(it, lay, s, b);
        fitLifts(it, lay, b);
        fitDropFlaps(it, lay, s, b);
        fitPanels(it, b);
        fitSliding(it, lay, s, b);
        fitHandles(it, b);
        fitPrints(it, lay, b); 
        fitShelfPins(it, lay, s, b);
        fitModularRows(it, lay, s, b);
        lineSymmetry(it, lay, s, b);
        fitOutlets(it, lay, b);
        buildStiffeners(it, lay, b);
        const clothes = buildRails(it, lay, b);
        buildLights(it, lay, s, b);
        buildShoeRacks(it, lay, b);
        fitJoints(b.joints.slice(before), { ...s, joinery: it.joinery ?? s.joinery }, b, it.id, it.name);
        settleSpacerScrews(it, b);
        noteHousingsUnderRunners(it.id, b);
        let content = 0;
        for (const f of it.fronts)
        {
            if (f.spec.type === "drawers")
            {
                content += f.spec.loadKg * f.spec.count;
            }
        }
        let shelves = 0;
        for (const q of b.parts)
        {
            if (q.item === it.id && (q.role === "shelf" || q.role === "hdivider" || q.role === "bottom"))
            {
                shelves += q.length * q.width * 1e-4 * s.shelfLoad;
            }
        }
        // A person sat on it weighs on the feet like any load
        const person = it.seat === null ? 0 : SEAT_LOAD_N / GRAVITY;
        loads.set(it.id, content + shelves + person + clothes + devicesOn(p, it));
        // The fillers weigh on the feet with the rest, the appliances and what stands on top are put where they are
        buildSideFillers(it, b);
        own.set(it.id, itemMass(b, it.id) + content + shelves + person + clothes);
        fitBase(it, b);
        fitWallFixing(it, s, b, p.items);
        fitBackWallScrews(it, s, b);
        buildCeilingFiller(it, p.room, b);
        // Last of the carcass : its screws keep clear of the others
        fitBackScrews(it, lay, b);
        markFloorBoards(it, b);
    }
    else if (it.kind === "corner")
    {
        buildCorner(it, b);
    }
    else if (it.kind === "wallShelf")
    {
        buildWallShelf(it, s, b);
    }
    else if (it.kind === "slats")
    {
        buildSlats(it, s, b);
    }
    else if (it.kind === "ladder")
    {
        buildLadder(it, b);
    }
    else if (it.kind === "box")
    {
        const before = b.joints.length;
        buildBox(it, b);
        fitJoints(b.joints.slice(before), s, b, it.id, it.name);
        b.hardware.push({ ref: "48N0510.02", qty: 1, item: it.id, itemName: it.name, target: null, note: null,
                          purpose: "wall-hanger" });
        b.hardware.push({ ref: "48N0510.03", qty: 1, item: it.id, itemName: it.name, target: null, note: null,
                          purpose: "wall-hanger" });
    }
}


// A rigid board down to the floor under a carcass whose feet are levelled on site keeps the height of the drawing : a
// floor out of level asks for it to be recut or packed there
function markFloorBoards(c: Carcass, b: Build): void
{
    if (c.base.type !== "plinth" && c.base.type !== "feet")
    {
        return;
    }
    for (const q of b.parts.filter((x) => { return x.item === c.id && x.frame !== null && x.role !== "plinth"; }))
    {
        const low = Math.min(at(q.frame!, 0, 0, 0)[1], at(q.frame!, q.length, q.width, q.thickness)[1]);
        if (low < 1)
        {
            q.toFloor = true;
            q.notes.push("Descend au sol sous un meuble sur pieds réglables : cotée pour des pieds à leur hauteur "
                + "nominale, un ajustement sur place peut être possible ou nécessaire après leur réglage");
        }
    }
}


// A Minifix housing a runner covers, its cam out of reach once the runner is on : said on the board, the carcass then
// comes apart only with the runner off
export function noteHousingsUnderRunners(item: string, b: Build): void
{
    const runners = b.fitted.filter((f) => { return f.item === item && f.purpose === "runner"; });
    for (const q of b.parts.filter((x) => { return x.item === item && x.frame !== null; }))
    {
        const covered = q.holes.filter((h) =>
        {
            if (h.purpose !== "minifix-housing" || (h.face !== "A" && h.face !== "B"))
            {
                return false;
            }
            // Just off the face it's bored in, where a runner screwed on that face stands
            const off = h.face === "A" ? -2 : q.thickness + 2;
            const p = at(q.frame!, h.u, h.v, off);
            return runners.some((r) =>
            {
                const d = [p[0] - r.centre[0], p[1] - r.centre[1], p[2] - r.centre[2]];
                return r.axes.every((a, k) => { return Math.abs(d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2]) <=
                                               r.half[k]!; });
            });
        });
        if (covered.length > 0)
        {
            q.notes.push(`${covered.length} boîtier(s) Minifix sous la coulisse : déposer la coulisse pour les desserrer `
                + "au démontage");
        }
    }
}


export function analyse(p: Project): Analysis
{
    const b = emptyBuild();
    const loads = new Map<string, number>();
    // Each carcass with its own contents, what stands on it counted only once all is built
    const own = new Map<string, number>();
    const checks: Check[] = [];
    for (const it of p.items)
    {
        let k = b.errors.length;
        let warned = b.warnings.length;
        let told = b.infos.length;
        try
        {
            buildItem(it, p, b, loads, own);
        }
        catch (e)
        {
            b.errors.push(`${it.name} : ${(e as Error).message}`);
        }
        while (k < b.errors.length)
        {
            checks.push({ level: "error", item: it.id, target: null, message: b.errors[k]! });
            k++;
        }
        while (warned < b.warnings.length)
        {
            checks.push({ level: "warning", item: it.id, target: null, message: b.warnings[warned]! });
            warned++;
        }
        while (told < b.infos.length)
        {
            checks.push({ level: "info", item: it.id, target: null, message: b.infos[told]! });
            told++;
        }
    }
    for (const x of fitCarcassLinks(p, b))
    {
        checks.push({ level: "error", item: x.item, target: null, message: x.message });
    }
    // What these steps across the items report would otherwise never reach the checks : the lead of the niche strip
    // gave way to a Minifix bolt in silence
    const told = { errors: b.errors.length, warnings: b.warnings.length, infos: b.infos.length };
    fitShelfTies(p, b);
    fitLightLeads(p, b);
    blockedOutlets(p.items, b);
    bandVisibleEdges(p, b);
    sinkHeads(b);
    drillPilots(b);
    fitScrewCaps(p, b);
    packRailBars(b);
    b.fitted.push(...letInFittings(b.parts));
    // Once every part and handle stands where it goes, the walls of the room stop the doors that would go through
    stopAtWalls(p, b);
    noteLooseItems(p, b);
    checks.push(...b.errors.slice(told.errors).map((message) => { return { level: "error" as const,
        item: null, target: null, message }; }),
                ...b.warnings.slice(told.warnings).map((message) => { return { level: "warning" as const, item: null,
                    target: null, message }; }),
                ...b.infos.slice(told.infos).map((message) => { return { level: "info" as const,
                                                                        item: null, target: null, message }; }));
    const masses = new Map<string, number>();
    for (const it of p.items)
    {
        masses.set(it.id, itemMass(b, it.id));
    }
    const partReport = partChecks(p, b);
    checks.push(...partReport.checks, ...frontChecks(p), ...itemChecks(p, masses, loads, b), ...deviceChecks(p, b),
                ...footLoadChecks(p, b, own), ...cutoutChecks(b), ...stockChecks(b, p.settings), ...obstacleChecks(p, b),
                ...titleBlockChecks(p), ...modelChecks(b));
    const tippings: Tipping[] = [];
    for (const it of p.items)
    {
        if (it.kind !== "carcass")
        {
            continue;
        }
        const tp = tipping(it, b, frontFootInset(it), topDrawerExtension(it));
        if (tp !== null)
        {
            tippings.push(tp);
            const fixed = it.fixToWall && it.base.type !== "wall";
            const brackets = antiTipKept(it, p.items).filter((k) =>
            {
                return k.under === null;
            }).length;
            const verdict = it.freeStanding === true ? "Posé libre, sans fixation : il se retire à la main."
                : (it.backWallScrews ?? []).length > 0
                    ? `Retenu par ${it.backWallScrews!.length} vis au mur à travers son fond.`
                : !fixed ? "Aucune fixation murale : cocher Fixation murale anti-basculement sur le caisson."
                : brackets > 0 ? `Retenu par ${brackets} équerre(s) anti-basculement fixées au mur.`
                    : "Retenu par ce qui est posé dessus, une fois les deux reliés.";
            checks.push({
                level: "info", item: it.id, target: null,
                message: `${it.name} : basculement sous ${tp.pullKg.toFixed(1)} kg tirés horizontalement en haut, `
                    + `ou ${tp.criticalKg.toFixed(0)} kg posés sur le ${tp.leverFrom} (calcul statique à vide, `
                    + `pas un essai EN 14749:2016+A1:2022 des rangements domestiques). ${verdict}`,
            });
        }
    }
    // Read on one fischer table, the column read by its layout : 0.12 kN recommended for the 8 x 40, resellers 25 kg max
    if (p.settings.wallType === "hollow")
    {
        checks.push({ level: "warning", item: null, target: null,
                      message: "Mur en brique creuse : tenue des chevilles faible et non vérifiée (de l'ordre de 12 à "
                          + "25 kg par cheville fischer DuoPower 8 x 40, à confirmer sur sa fiche). Sonder le mur, et "
                          + "prévoir un scellement chimique pour ce qui porte une charge : étagères murales, bras d'écran." });
    }
    if (p.settings.wallType === "plasterboard" && anchored(p))
    {
        checks.push({ level: "warning", item: null, target: null,
                      message: "Équerres anti-basculement sur plaque de plâtre : la tenue dépend de la cheville et "
                          + "de la plaque. Vérifier la charge admise par la cheville choisie." });
    }
    checks.push(...seatChecks(p, b), ...screenChecks(p), ...wardrobeChecks(p, b), ...lightChecks(p), ...liftChecks(p, b),
                ...cornerChecks(p, b), ...ceilingChecks(p), ...deskChecks(p), ...ladderChecks(p), ...solidChecks(p, b),
                ...swingChecks(p, b));
    // Numbered in the order of the checks : the printed notes, the FreeCAD sheet and a drawing refer to N1, N2...
    const calcNotes = partReport.deflections.flatMap((d) => { return d.note === undefined ? [] : [d.note]; })
        .map((note, k) => { return { ...note, number: `N${k + 1}` }; });
    return { build: b, checks, masses, deflections: partReport.deflections, tippings, calcNotes };
}




// A carcass meant to stand loose reads as forgotten on its plans : its bottom says so, with the room left under
// the board over it to slide it in
function noteLooseItems(p: Project, b: Build): void
{
    const blocking = lightsInTheWay(p, b);
    for (const c of p.items)
    {
        if (c.kind !== "carcass" || c.freeStanding !== true)
        {
            continue;
        }
        const bottom = b.parts.find((part) => { return part.id === `${c.id}/bottom`; }); 
        if (bottom === undefined)
        {
            continue;
        }
        const top = c.y + c.height;
        let gap = Infinity;
        let over = "";
        // The lwoest board lying flat over its footprint
        for (const board of b.parts)  
        {
            if (board.item === c.id || board.frame === null || Math.abs(board.frame.n[1]) < 0.9) 
            {
                continue;
            }
            const frame = board.frame;   
            const corners = [at(frame, 0, 0, 0), at(frame, board.length, 0, 0), at(frame, 0, board.width, 0),  
                             at(frame, board.length, board.width, 0)];
            const cornerXs = corners.map((k) => { return k[0]; }); 
            const cornerZs = corners.map((k) => { return k[2]; });
            const under = Math.min(frame.o[1], frame.o[1] + frame.n[1] * board.thickness);  
            const across = Math.min(...cornerXs) < c.x + c.width && Math.max(...cornerXs) > c.x   
                && Math.min(...cornerZs) < c.z + c.depth && Math.max(...cornerZs) > c.z; 
            if (across && under >= top - 0.5 && under - top < gap)
            {
                gap = under - top;
                over = `${board.label.toLowerCase()} de ${board.itemName}`;  
            }
        }
        const mm = (x: number): string => { return String(Math.round(x * 10) / 10).replace(".", ","); };
        const room = Number.isFinite(gap) ? `, ${mm(gap)} mm de jeu sous le ${over}` : "";
        // A light screwed in front of it lower than its top stops the way : set after it, unscrewed to take it out
        // (no clips for so little)
        const light = b.fitted.find((fitting) =>  
        {
            return fitting.host === null && (blocking.get(fitting.key) ?? []).includes(c);   
        });  
        const what = light === undefined ? "" : `${light.label.replace(/^.* : /, "")} de ${light.label.replace(/ : .*$/, "")}`;
        const way = light === undefined ? ", elle se retire de la même façon"
            : `, avant la pose du ${what} qui passe ${mm(top - lowest(light))} mm sous son dessus. Pour la sortir, le `
                + "dévisser d'abord";
        bottom.notes.push(`${c.name} posée libre, sans fixation ni perçage pour la tenir : glissée à la main dans son `
            + `logement${room}${way}`);
    }
}


function anchored(p: Project): boolean
{
    for (const it of p.items)
    {
        if (it.kind === "carcass" && it.fixToWall && it.base.type !== "wall")
        {
            return true;
        }
    }
    return false;
}


// What can still be done for a shelf of a rounded end : what isn't ticked yet, then its size, a half round having no
// radius of its own but the depth of the carcass
function endRemedy(hold: PlateHold): string
{
    // A box already ticked but refused is said by its own error, not offered again
    const ticks = [...(hold.backable === true && hold.ticked?.back !== true
                       && !hold.lines.some((line) => { return line.axis === "v"; }) ? ["Fond"] : []),
                   ...(hold.posts.length === 0 && hold.ticked?.seat !== true ? ["Assise"] : [])];
    const size = hold.backable === true ? "réduire le rayon du bout arrondi" : "réduire la profondeur du caisson";
    return ticks.length > 0 ? `Cocher ${ticks.join(" ou ")}, ou ${size}.` : `${size[0]!.toUpperCase()}${size.slice(1)}.`;
}


// The carcasses standing on the top of one : against the same wall, over its width and its depth
function standingOn(p: Project, under: Carcass): Carcass[]
{
    return p.items.filter((it): it is Carcass =>
    {
        return it.kind === "carcass" && it !== under && it.wall === under.wall
            && Math.abs(it.y - (under.y + under.height)) < 1
            && it.x < under.x + under.width && it.x + it.width > under.x
            && it.z < under.z + under.depth && it.z + it.depth > under.z;
    });
}


// The run that simulated this very piece : same carcass, same ones on it and the whole piece as it was fed to it
function simulatedTop(fingerprint: string, item: string, over: string[]): SimulatedTop | undefined
{
    const names = [...over].sort().join("|");
    return SIMULATED_TOPS.find((run) =>
    {
        // A coarser cell reads the sag low : such a run is never cited
        return run.item === item && [...run.over].sort().join("|") === names && run.input === fingerprint
            && run.mesh <= MAX_RUN_CELL;
    });
}


// A runner sized to its carcass, a Blum length the CAD catalogue holds no model of : the CAD file and the work
// sequence go without it, said once for each reference
function modelChecks(b: Build): Check[]
{
    const missing = new Map<string, string>();
    for (const q of b.parts)
    {
        for (const h of q.holes)
        {
            if (h.purpose === "runner-screw" && h.fixes !== undefined && CAD_MODELS[`${h.fixes}.left`] === undefined)
            {
                missing.set(h.fixes, q.item);
            }
        }
    }
    return [...missing].map(([ref, item]) =>
    {
        return { level: "warning" as const, item, target: null,
                 message: `Coulisse ${ref} : aucun modèle 3D au catalogue (data/cad_models.ts), elle manque au fichier `
                     + "CAO et à la gamme de montage. Ajouter ses deux fichiers STEP Blum, gauche et droite." };
    });
}


function partChecks(p: Project, b: Build): { checks: Check[]; deflections: Deflection[] }
{
    const checks: Check[] = [];
    const deflections: Deflection[] = [];
    const s = p.settings;
    const maxL = SHEET_LENGTH - 2 * s.trim;
    const maxW = SHEET_WIDTH - 2 * s.trim;
    // One warning per item and unverified thickness, not one per part
    const unverified = new Map<string, { item: string; itemName: string; label: string; thickness: number; count: number }>();
    // What the piece would feed a simulation, worked out once and only if a top carries a carcass
    let fingerprint: string | undefined;
    const items = new Map(p.items.map((it) =>
    {
        return [it.id, it];
    }));
    for (const part of b.parts)
    {
        if (part.role === "batten" || part.role === "skin")
        {
            continue;
        }
        const name = `${part.itemName}, ${part.label.toLowerCase()}`;
        const bb = bounds(tessellate(part.outline));
        const L = bb.maxX - bb.minX;
        const W = bb.maxY - bb.minY;
        const fits = part.grain ? L <= maxL && W <= maxW : (L <= maxL && W <= maxW) || (W <= maxL && L <= maxW);
        // A plate of glass gets no figure at all, said below
        if (part.material === "glass" && !b.plates.has(part.id))
        {
            checks.push({ level: "warning", item: part.item, target: part.id,
                          message: `${name} : flèche calculée, mais pas la résistance du verre (norme de calcul non consultée). `
                              + "Faire valider l'épaisseur et la charge par le miroitier." });
        }
        else if (!fits)
        {
            checks.push({ level: "error", item: part.item, target: part.id,
                          message: `${name} : ${Math.round(L)} x ${Math.round(W)} mm ne tient pas dans un panneau `
                              + `${SHEET_LENGTH} x ${SHEET_WIDTH} délignés (sens du fil respecté). Scinder la pièce.` });
        }
        const mat = MATERIALS[part.material];
        if (mat !== undefined && !mat.thicknesses.includes(part.thickness))
        {
            const key = `${part.item}|${mat.id}|${part.thickness}`;
            const u = unverified.get(key) ?? { item: part.item, itemName: part.itemName, label: mat.label,
                                              thickness: part.thickness, count: 0 };
            u.count += part.quantity;
            unverified.set(key, u);
        }
        const kg = partMass(part, false) / part.quantity;
        if (kg > s.handlingKg)
        {
            const people = Math.ceil(kg / s.handlingKg);
            checks.push({ level: "warning", item: part.item, target: part.id,
                          message: `${name} : ${kg.toFixed(1)} kg, à manutentionner à ${people} personnes `
                              + `(limite ${s.handlingKg} kg, R4541-9).` });
        }
        const hung = b.midLoads.get(part.id) ?? 0;
        // A top is only checked for what a rail hangs from it, never for the shelf load. A wall shelf spans
        // between its concealed supports, the widest gap taken as a span on two supports
        const top = part.role === "top";
        const hungShelf = part.role === "wallShelf" ? items.get(part.item) : undefined;
        const onSupports = hungShelf?.kind === "wallShelf" && hungShelf.purpose === "shelf";
        // The shelves of an open rounded end are plates held on 2 sides, worked out as such (plate.ts)
        const hold = b.plates.get(part.id);
        // A top with a carcass standing on it, screwed under it : carried by it, its deflection out of the simulation
        // of the whole piece when the geometry is still the one simulated, never a beam on its own sides
        const under = items.get(part.item);
        const standing = top && hung === 0 && under?.kind === "carcass" ? standingOn(p, under) : [];
        if (standing.length > 0)
        {
            const names = standing.map((c) => { return c.name; });
            fingerprint ??= femFingerprint(femInput(p, b));
            const run = simulatedTop(fingerprint, under!.name, names);
            if (run === undefined)
            {
                checks.push({ level: "warning", item: part.item, target: part.id,
                              message: `${name} : porte ${names.join(" et ")}, flèche non calculée. Ce dessus est porté `
                                  + "par le caisson vissé dessus, un calcul de poutre ne le dit pas : refaire la "
                                  + "simulation du meuble entier (scripts/fem_meuble.py) depuis cette modification." });
                continue;
            }
            const d = simulatedDeflection(part, run.ownSag, run.source, topSpan(b, part));
            if (d === null)
            {
                continue;
            }
            deflections.push(d);
            const over = d.instant > d.limit;
            checks.push({ level: over ? "error" : "warning", item: part.item, target: part.id,
                          message: `${name} : porte ${names.join(" et ")}, vissé dessous. Flèche ${d.instant.toFixed(2)} mm `
                              + `d'après la ${run.source}, ${d.limit.toFixed(1)} mm maxi (${SHELF_DEFLECTION_LIMIT * 100} % `
                              + "de la portée, limite UNI 11663 des tablettes reprise par convention). "
                              + (over ? "Non conforme même avec des fixations rigides."
                                  : "Indicatif : fixations supposées rigides, conformité non établie.") });
            continue;
        }
        if (part.role !== "shelf" && part.role !== "hdivider" && !(top && hung > 0) && !onSupports && hold === undefined)
        {
            continue;
        }
        const span = onSupports ? shelfSupportSpan(part.length, hungShelf.supports) : part.length;
        const d = hold !== undefined ? plateDeflection(part, hold, s.shelfLoad)
            : shelfDeflection(part, top ? 0 : s.shelfLoad, hung, span);
        if (d === null)
        {
            if (hold !== undefined)
            {
                checks.push({ level: "error", item: part.item, target: part.id,
                              message: `${name} : flèche non calculée (matériau autre qu'un panneau, contour sans `
                                  + "surface, ou montant hors de la tablette). Revoir le rayon, le décor ou l'assise du "
                                  + "bout arrondi." });
            }
            continue;
        }
        deflections.push(d);
        // Shelves of a rounded end : what the user can change is the end itself
        const remedy = hold === undefined ? "Réduire la portée ou ajouter un montant." : endRemedy(hold);
        if (d.instant > d.limit)
        {
            const rail = hung > 0 ? `${Math.round(hung)} N du support de tringle` : "";
            const load = top ? `${rail} et son poids` : `${s.shelfLoad} kg/dm²${rail === "" ? "" : ` et ${rail}`}`;
            // The standard sets no limit for a top, the one of the selves is borrwoed. UNI 11663 holds 0.5 % in every
            // room, under 1.5 kg/dm² in kitchens and bathrooms and 1.0 elsewhere : the load is the one chosen
            const origin = top ? "limite UNI 11663 des tablettes reprise par convention, essai EN 16122:2012"
                : hold !== undefined ? "UNI 11663 sur deux fois la distance à l'appui le plus proche, convention des "
                    + "consoles de l'IBC, calcul de plaque"
                : "UNI 11663, essai EN 16122:2012";
            checks.push({ level: "error", item: part.item, target: part.id,
                          message: `${name} : flèche ${d.instant.toFixed(1)} mm sous ${load}, `
                              + `${d.limit.toFixed(1)} mm maxi (${SHELF_DEFLECTION_LIMIT * 100} % de la portée, ${origin}). `
                              + remedy });
        }
        else if (d.lowerBound === true)
        {
            // Never called conforming on a fixity the dowels don't prove. Why and what to do is said once, on its end
            checks.push({ level: "warning", item: part.item, target: part.id,
                          message: `${name} : flèche d'au moins ${d.instant.toFixed(1)} mm pour ${d.limit.toFixed(1)} mm `
                              + "admis, conformité non établie (voir l'avertissement du bout arrondi)." });  
        }
        else if (d.final > d.limit)
        {
            // The 0.5 % limit applies to the test deflection, the creep figure is information only
            checks.push({ level: "info", item: part.item, target: part.id,
                          message: `${name} : flèche ${d.instant.toFixed(1)} mm à l'essai (conforme), environ `
                              + `${d.final.toFixed(1)} mm à long terme avec le fluage (kdef `
                              + `${MATERIALS[part.material]!.kdef} en classe de service 1, EN 1995-1-1:2004). `
                              + "Aucune limite normative sur ce chiffre." });
        }
    }
    for (const u of unverified.values())
    {
        checks.push({ level: "warning", item: u.item, target: null,
                      message: `${u.itemName} : ${u.count} pièce(s) en ${u.thickness} mm, épaisseur non vérifiée pour `
                          + `${u.label}. Confirmer la disponibilité chez le fournisseur.` });
    }
    return { checks, deflections };
}


function frontChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    for (const it of p.items)
    {
        if (it.kind !== "carcass")
        {
            continue;
        }
        const seen = new Set<string>();
        for (const f of it.fronts)
        {
            if (seen.has(f.node))
            {
                checks.push({ level: "error", item: it.id, target: f.id,
                              message: `${it.name} : deux façades sur la même zone. En retirer une.` });
            }
            seen.add(f.node);
        }
        for (const f of it.fronts)
        {
            const node = findNode(it.root, f.node);
            if (node === null)
            {
                checks.push({ level: "error", item: it.id, target: f.id,   
                              message: `${it.name} : façade rattachée à une zone supprimée. La déplacer ou la retirer.` });
                continue;
            }
            const inside = new Set(subtreeIds(node));
            inside.delete(f.node);
            for (const g of it.fronts)
            {
                if (g.id !== f.id && inside.has(g.node))
                {
                    checks.push({ level: "error", item: it.id, target: g.id,
                                  message: `${it.name} : une façade en recouvre une autre. Retirer celle de la zone `
                                      + "intérieure ou celle qui l'englobe." });
                }
            }
        }
    }
    return checks;
}



// What a carcass goes into the room without : its fronts, loose shelves, drawers, front plinth and fillers are set
// on site, once it stands fixed (gamme.ts)
const SET_ON_SITE = new Set(["door", "flap", "leaf", "drawerFront", "boxSide", "boxEnd", "boxBottom", "shelf",
                             "filler"]);


function carriedMass(b: Build, item: string): number
{
    return b.parts.filter((q) =>
    {
        return q.item === item && !SET_ON_SITE.has(q.role) && !(q.role === "plinth" && !/retour/.test(q.label))
            && !/\/filler-cleat$/.test(q.id);
    }).reduce((kg, q) => { return kg + partMass(q, false); }, 0);
}


function itemChecks(p: Project, masses: Map<string, number>, loads: Map<string, number>, b: Build): Check[]
{
    const checks: Check[] = [];
    const boxes = p.items.map((it) =>
    {
        return { it };
    });
    let i = 0;
    while (i < boxes.length)
    {
        let j = i + 1;
        while (j < boxes.length)
        {
            const a = boxes[i]!;
            const c = boxes[j]!;
            if (itemsMeet(a.it, c.it, p.room))
            {
                checks.push({ level: "error", item: c.it.id, target: null,
                              message: `${a.it.name} et ${c.it.name} se chevauchent. Déplacer l'un des deux.` });
            }
            j++;
        }
        i++;
    }
    for (const { it } of boxes)
    {
        if (it.kind === "device")
        {
            continue;
        }
        const m = masses.get(it.id) ?? 0;
        const load = loads.get(it.id) ?? 0;
        const loaded = load > 0 ? `, ${(m + load).toFixed(0)} kg chargé (charges d'essai)` : "";
        checks.push({ level: "info", item: it.id, target: null,
                     message: `${it.name} : ${m.toFixed(1)} kg à vide${loaded}.` });
        // A carcass goes in whole, its boards already together : the part check alone missed a 93 kg one
        const limit = p.settings.handlingKg;
        const carried = it.kind === "carcass" ? carriedMass(b, it.id) : 0;
        if (it.kind === "carcass" && carried > limit)
        {
            checks.push({ level: "warning", item: it.id, target: null,
                          message: `${it.name} : ${carried.toFixed(1)} kg monté, à manutentionner à `
                              + `${Math.ceil(carried / limit)} personnes (limite ${limit} kg par personne, R4541-9), `
                              + "façades, étagères réglables, tiroirs et plinthe posés sur place." });
        }
        if (it.kind === "wallShelf" && it.purpose === "desk")
        {
            checks.push({ level: "warning", item: it.id, target: null,
                          message: `${it.name} : appuis non vérifiés, le poser sur des caissons ou choisir une fixation `
                              + "avec l'ébéniste. Sa flèche se vérifiera avec ces appuis." });
        }
    }
    return checks;
}


function screenChecks(p: Project): Check[]
{
    const checks: Check[] = [];
    const sc = p.screen;
    if (sc === null)
    {
        return checks;
    }
    const { w, h } = screenSize(sc);
    // The whole thickness of the set counts, turned as it is, and on an arm both the place it's put away in and the
    // one it swings to
    for (const spot of screenSpots(sc))
    {
        const where = spot.label === "" ? "" : ` ${spot.label}`;
        for (const hit of spotClashes(p, spot))
        {
            checks.push({ level: "error", item: hit.id, target: null,
                          message: `L'écran ${sc.diagonalInch}"${where} (${Math.round(w)} x ${Math.round(h)} mm) touche `
                              + `${hit.name}. Réduire la diagonale, élargir la niche ou déplacer l'écran.` });
        }
    }
    const support = p.items.some((it) =>
    {
        const bx = roomBox(it, p.room);
        return Math.abs(bx.max[1] - sc.bottom) < 1 && bx.min[0] <= sc.cx && bx.max[0] >= sc.cx;
    });
    checks.push(...armChecks(p));
    if (!sc.wallMounted && sc.arm === null && !support && sc.bottom > 0.5)
    {
        checks.push({ level: "warning", item: null, target: null,
                      message: "L'écran n'est posé sur aucun meuble. Le poser sur le meuble bas ou le déclarer fixé au mur." });
    }
    return checks;
}
