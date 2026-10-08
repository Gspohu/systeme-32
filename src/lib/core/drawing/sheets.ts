// Workshop drawing set : the cover, then view, workpieces and lists in the order a cabinetmaker reads them

import type { Item, Project, Wall } from "../model";
import type { Analysis } from "../analysis";
import type { Bom } from "../bom";
import { EDGE_OVERLENGTH } from "../bom";
import type { NestResult } from "../nesting";
import { A3, Canvas, MARGIN, TITLE_BLOCK_H, fit, frameAndTitle, type Page } from "./display";
import { BODY, heading, type Draft } from "./draft";
import { composition } from "./views";
import { roomPlan } from "./plan";
import { itemViews } from "./item_views";
import { partSheets } from "./workpiece";
import { checkSheets, cutListSheets, hardwareSheets, nestingSheets, pbsSheets } from "./lists";
import { assemblySheets } from "./assembly_sheets";
import { assemblySequences } from "../assembly";
import { CUBED, DIAM } from "../text";
import { issueState } from "../revisions";   
import { MATERIALS } from "../../data/materials";
import { SHELF_TEST_LOADS } from "../../data/rules";


export function buildSheets(p: Project, a: Analysis, bom: Bom, nesting: NestResult): Page[] 
{
    const drafts: Draft[] = [cover(p, a, bom), composition(p, a)];
    // side walls add their compositions, the setting out from above comes with every project
    const sides: Wall[] = [];
    for (const wall of ["left", "right"] as const)
    {
        if (p.items.some((it) =>
        {
            return it.wall === wall;
        }))
        {
            sides.push(wall);
        }
    }
    for (const wall of sides)
    {
        drafts.push(composition(p, a, wall));
    }
    drafts.push(roomPlan(p));
    for (const it of p.items)
    {
        if (it.kind === "carcass")
        {
            drafts.push(itemViews(it, a));
        }
    }
    drafts.push(...partSheets(bom, a.build.fitted), ...cutListSheets(bom), ...hardwareSheets(bom));
    drafts.push(...assemblySheets(assemblySequences(p, a, bom)));
    drafts.push(...nestingSheets(nesting), ...pbsSheets(bom.pbs), ...checkSheets(a));
    const issue = issueState(p);
    const { owner, creator, approver } = p.settings; 
    const pages: Page[] = [];
    drafts.forEach((draft, i) =>
    {
        frameAndTitle(draft.canvas, { owner, creator, approver, project: p.name, 
                                     title: draft.supplement ? `${draft.title}, ${draft.supplement}` : draft.title,  
                                     status: issue.status, identification: identificationOf(p),
                                     revision: issue.index, date: issue.date, index: i + 1, count: drafts.length,
                                     scale: draft.scale, content: issue.hash });
        pages.push({ w: A3.w, h: A3.h, title: draft.title, prims: draft.canvas.prims, kind: draft.kind });
    });
    return pages;
}


// unique within the owner's files, ket to the 16 characters ISO 7200:2004 table 1 recommends (5.1.3)
export function identificationOf(p: Project): string
{
    return `S32-${p.id.replace(/^p-/, "").toUpperCase()}`.slice(0, 16);
}


function dims(it: Item): string
{
    if (it.kind === "carcass" || it.kind === "box")
    {
        return `L ${it.width} x H ${it.height} x P ${it.depth}`;
    }
    if (it.kind === "wallShelf")
    {
        return `L ${it.width} x P ${it.depth} x ép. ${it.thickness}`;
    }
    if (it.kind === "slats")
    {
        const mode = it.mode === "wall" ? "sur liteaux" : "claustra";
        return `L ${it.width} x H ${it.height}, lattes ${it.slatWidth} x ${it.slatDepth} ${mode}`;
    }
    if (it.kind === "ladder")
    {
        return `rail L ${it.width} ${DIAM}${it.railDiameter} à ${it.y} du sol, échelle de ${it.ladderWidth}`;
    }
    if (it.kind === "device")
    {
        return `appareil L ${it.width} x H ${it.height} x P ${it.depth}, ${String(it.massKg).replace(".", ",")} kg`;
    }
    return `R ${it.outerRadius} x P ${it.depth}`;
}


// Cover : what is inside the set, the legend, the workshop conventions and every source
function cover(p: Project, a: Analysis, bom: Bom): Draft
{
    const canvas = new Canvas();
    heading(canvas, p.name);
    let cursorY = MARGIN + 20;
    const section = (title: string): void =>
    {
        cursorY += 5;
        canvas.text(MARGIN + 5, cursorY, title, 3.5, "start", true);
        cursorY += 6;
    };
    canvas.text(MARGIN + 5, cursorY,
                "Dossier de fabrication : plans cotés, fiche de débit, quincaillerie, calepinage, PBS, contrôles.", 3);
    cursorY += 5;
    const whom = [p.settings.client === "" ? "" : `Client : ${p.settings.client}`,
                  p.settings.site === "" ? "" : `Chantier : ${p.settings.site}`].filter((t) =>
    {
        return t !== "";
    }).join("   ");
    if (whom !== "")
    {
        canvas.text(MARGIN + 5, cursorY, fit(whom, 3, 390), 3);
        cursorY += 5;
    }
    // the issue history, the creator and approver of ISO 7200:2004 5.3.1 standing in the title block
    if (p.revisions.length > 0)
    {
        section("Révisions");
        const older = p.revisions.length - 8; 
        if (older > 0)
        {
            canvas.text(MARGIN + 8, cursorY, `${older} indice${older > 1 ? "s" : ""} antérieur${older > 1 ? "s" : ""}, `
                + "détaillés dans le fichier du projet", BODY);
            cursorY += 4.5;   
        }
        for (const r of p.revisions.slice(-8))
        {
            canvas.text(MARGIN + 8, cursorY, r.index, BODY, "start", true);
            canvas.text(MARGIN + 18, cursorY, r.date, BODY);
            canvas.text(MARGIN + 42, cursorY, fit(r.reason, BODY, 350), BODY);
            cursorY += 4.5;
        }
    }
    section("Meubles");
    // two columns of half a page : the sources at the foot need the height
    const rows = Math.ceil(p.items.length / 2);
    p.items.forEach((it, k) =>
    {
        const mass = String((a.masses.get(it.id) ?? 0).toFixed(1)).replace(".", ",");
        const line = it.kind === "device" ? `${it.name} : ${dims(it)}` : `${it.name} : ${dims(it)}, ${mass} kg à vide`;
        canvas.text(MARGIN + 8 + (k < rows ? 0 : 195), cursorY + (k % rows) * 4.5, fit(line, BODY, 190), BODY);
    });
    cursorY += rows * 4.5;
    section("Légende");
    const legend: [string, (x: number, yy: number) => void][] = [
        ["Perçage face A (face vue)", (x, yy) =>
        {
            canvas.circle(x, yy, 1.5, "normal");
        }],
        ["Perçage face B (face cachée)", (x, yy) =>
        {
            canvas.circle(x, yy, 1.5, "dashed");
        }],
        ["Position de vis sans avant-trou", (x, yy) =>
        {
            canvas.cross(x, yy, 1.5);
        }],
        ["Chant plaqué", (x, yy) =>
        {
            canvas.line(x - 3, yy, x + 3, yy, "thick");
        }],
        ["Rainure", (x, yy) =>
        {
            canvas.line(x - 3, yy, x + 3, yy, "dashed");
        }],
        ["Sens du fil", (x, yy) =>
        {
            canvas.line(x - 3, yy, x + 3, yy, "thin");
            canvas.arrowHead(x + 3, yy, -1, 0);
            canvas.arrowHead(x - 3, yy, 1, 0);
        }],
        ["Porte : pointe du triangle côté charnières", (x, yy) =>
        {
            canvas.poly([[x - 3, yy - 2], [x + 3, yy], [x - 3, yy + 2]], false, "thin");
        }],
    ];
    for (const [label, draw] of legend)
    {
        draw(MARGIN + 11, cursorY - 1);
        canvas.text(MARGIN + 18, cursorY, label, BODY);
        cursorY += 5;
    }
    section("Conventions d'atelier (non issues d'une notice fabricant, modifiables dans les réglages)");
    const s = p.settings;
    const conventions = [
        `Connecteurs à ${s.connectorInset} mm des chants avant et arrière, intermédiaires tous les 256 mm maxi`,
        `Tourillons ${DIAM}8 x 35 : ${s.dowelFaceDepth} mm dans la face, ${s.dowelEdgeDepth} mm dans le chant`,
        `Taquets : trous ${DIAM}5 de ${s.pinDepth} mm, rangées à 37 mm des chants, `
            + "3 trous de réglage de part et d'autre",
        `Étagères réglables : jeu latéral ${s.shelfSideClearance} mm par côté, retrait avant ${s.shelfFrontSetback} mm`,
        `Charnières à ${s.hingeEdgeDistance} mm des chants de porte, décalées hors des tablettes fixes`,
        `Chants : ${EDGE_OVERLENGTH} mm de surlongueur par bande. Trait de scie ${s.kerf} mm, délignage ${s.trim} mm`,
        "Côtés de tiroir en 16 mm, fond en retrait de 13 mm (Blum : 12 à 15)", 
    ];
    for (const line of conventions)
    {
        canvas.text(MARGIN + 8, cursorY, fit(`- ${line}`, BODY, 390), BODY);
        cursorY += 4.5;
    }
    section("Sources");
    const sources = new Set<string>();
    for (const h of bom.hardware)
    {
        sources.add(h.source);
    }
    // the boards this set really uses, with the values the checks ran on
    const used = new Set<string>();
    for (const r of [...bom.cut, ...bom.offSheet])
    {
        for (const q of r.parts)
        {
            used.add(q.material);
        }
    }
    for (const id of used)
    {
        const m = MATERIALS[id];
        if (m !== undefined)
        {
            sources.add(`${m.label} : ${m.density} kg/m${CUBED} retenus pour les masses, module ${m.modulus} N/mm², `
                + `kdef ${String(m.kdef).replace(".", ",")} (${m.source})`);
        }
    }
    sources.add("EN 1995-1-1:2004 tableau 3.2 (via COFORD, tableaux D.6 et D.7) : kdef en classe de service 1, hors CLT");
    if (p.items.some((it) =>
    {
        return it.kind === "carcass" && it.seat !== null;
    }))
    {
        sources.add("EN 1995-1-1:2004 tableau 3.1 (via COFORD, tableaux D.4 et D.5) : kmod des assises en moyen terme, classe de service 1");
    }
    const load = String(p.settings.shelfLoad).replace(".", ",");
    const use = SHELF_TEST_LOADS.find((l) =>
    {
        return l.kgPerDm2 === p.settings.shelfLoad;
    });
    sources.add("UNI 11663 et EN 16122:2012 §6.1.4 (via tableau CATAS) : flèche d'étagère 0,5 % de la portée "
        + `sous ${load} kg/dm²${use === undefined ? ", charge choisie hors catégorie" : `, ${use.label}`}`);
    sources.add("Code du travail R4541-9 : port de charge 55 kg, 25 kg pour les femmes");
    // every source printed, the lines closing up to 3.2 mm, and said when some still do not fit
    const bottom = A3.h - MARGIN - TITLE_BLOCK_H - 4;
    const pitch = Math.max(3.2, Math.min(4, (bottom - cursorY) / sources.size));
    const fits = Math.max(0, Math.floor((bottom - cursorY) / pitch) + 1);
    const kept = sources.size <= fits ? [...sources] : [...sources].slice(0, Math.max(0, fits - 1));
    for (const line of kept)
    {
        canvas.text(MARGIN + 8, cursorY, fit(`- ${line}`, 2.2, 390), 2.2);
        cursorY += pitch;
    }
    if (kept.length < sources.size)
    {
        canvas.text(MARGIN + 8, cursorY, `- ${sources.size - kept.length} source(s) non imprimée(s) faute de place`,
                    2.2);
    }
    return { title: "Page de garde", scale: "-", canvas };
}
