<script lang="ts">
    import { strToU8 } from "fflate";
    import { app } from "./app_state.svelte";
    import { checked, num, str } from "./events";
    import { drawingSet, workshopArchive } from "../core/io/workshop";
    import { slug } from "../core/text";
    import { pagesToPdf } from "../core/drawing/pdf";
    import { pageToDataUri } from "../core/drawing/svg";
    import { cutListCsv, edgeNotation, hardwareCsv, pbsJson, type PbsNode } from "../core/bom";
    import { setPrice, setRoom, setScreen, setSettings, rename } from "../core/commands";
    import { shareOrDownload } from "../storage/files";
    import { FAMILY_LABELS } from "../data/hardware";
    import { HANDLING_LIMITS, SHELF_TEST_LOADS } from "../data/rules";
    import type { Joinery, Screen, Settings, WallType } from "../core/model";


    const TABS = ["Plans", "Débit", "Quincaillerie", "Calepinage", "PBS", "Chiffrage", "Réglages"];
    let tab = $state(0);
    let zoomed = $state<number | null>(null);


    const project = $derived(app.project);
    const out = $derived(app.outputs);
    // the drawing set is only bilt while one of its tabs is open
    const pages = $derived(tab === 0 || tab === 3 ? drawingSet(project, out) : []);
    const nestPages = $derived.by(() =>
    {
        const found: typeof pages = [];
        for (const p of pages)
        {
            if (p.title === "Calepinage")
            {
                found.push(p);
            }
        }
        return found;
    });
    const pieces = $derived.by(() =>
    {
        let onSheets = 0;
        let offSheet = 0;
        for (const r of out.bom.cut)
        {
            onSheets += r.quantity;
        }
        for (const r of out.bom.offSheet)
        {
            offSheet += r.quantity;
        }  
        return { onSheets, offSheet };
    });
    const base = $derived(slug(project.name) || "projet");


    async function send(bytes: Uint8Array, name: string, mime: string): Promise<void>
    {
        const how = await shareOrDownload(bytes, name, mime);
        app.notify(how === "shared" ? `${name} partagé` : `${name} téléchargé`, "success");
    }

    function settings(p: Partial<Settings>): void
    {
        app.apply(setSettings, p);
    }


    function screen(p: Partial<Screen> | null): void
    {
        const cur = project.screen;
        if (p === null)
        {
            app.apply(setScreen, null);
            return;
        }
        const baseScreen: Screen = cur ?? { diagonalInch: 65, aspectW: 16, aspectH: 9, cx: 1000, bottom: 600,
                                           z: 100, wallMounted: false };
        app.apply(setScreen, { ...baseScreen, ...p });
    }


    function flatPbs(n: PbsNode, depth: number, acc: { n: PbsNode; depth: number }[]): { n: PbsNode; depth: number }[]
    {
        acc.push({ n, depth });
        for (const c of n.children)
        {
            flatPbs(c, depth + 1, acc);
        }
        return acc;
    }

    function eur(v: number): string
    {
        return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
    }
</script>

<div class="outputs">
    <div class="tabs">
        {#each TABS as label, i}
            <button class="tab" class:active={i === tab} onclick={() => { tab = i; zoomed = null; }}>{label}</button>
        {/each}
    </div>

    <div class="tab-content active">
        <!-- rebuilt from the store after a refused command, like the inspector -->
        {#key app.refusals}
        {#if tab === 0}
            <div class="row">
                <button class="btn btn-primary"
                    onclick={() => send(workshopArchive(project, out), `${base}_atelier.zip`,
                                        "application/zip")}>Dossier atelier</button>
                <button class="btn btn-secondary"
                    onclick={() => send(pagesToPdf(pages, project.name), `${base}_plans.pdf`,
                                        "application/pdf")}>PDF</button>
                <span class="muted">{pages.length} planches A3, un DXF par pièce dans le dossier</span>
            </div>
            {#if zoomed !== null && pages[zoomed] !== undefined}
                <div class="row"><button class="btn btn-ghost" onclick={() => (zoomed = null)}>Retour aux planches</button></div>
                <div class="sheet big"><img src={pageToDataUri(pages[zoomed]!)} alt={pages[zoomed]!.title} /></div>
            {:else}
                <div class="grid-sheets">
                    {#each pages as pg, i}
                        <button class="sheet" title={pg.title} onclick={() => (zoomed = i)}>
                            <img src={pageToDataUri(pg)} alt="" /><span>{i + 1}. {pg.title}</span>
                        </button>
                    {/each}
                </div>
            {/if}
        {:else if tab === 1}
            <div class="row">
                <button class="btn btn-secondary"
                    onclick={() => send(strToU8(cutListCsv(out.bom)), `${base}_fiche_de_debit.csv`,
                                        "text/csv")}>Exporter en CSV</button>
                <span class="muted">{pieces.onSheets} pièces sur panneaux, {pieces.offSheet} hors calepinage</span>
            </div>
            <div class="table-container">
                <table class="table table-striped table-compact"> 
                    <thead>
                        <tr><th>Code</th><th>Pièce</th><th>Qté</th><th>Long. (fil)</th><th>Larg.</th><th>Ép.</th>
                            <th>Décor</th><th>Chants</th><th>kg</th></tr>
                    </thead>
                    <tbody>
                        {#each [...out.bom.cut, ...out.bom.offSheet] as r}
                            <tr>
                                <td>{r.code}</td>
                                <td>{r.label}<br /><span class="muted">{r.items.join(", ")}</span></td>
                                <td>{r.quantity}</td> 
                                <td>{Math.round(r.length * 10) / 10}</td>
                                <td>{Math.round(r.width * 10) / 10}</td>
                                <td>{r.thickness}</td>
                                <td>{r.decorLabel}</td>
                                <td>{edgeNotation(r.edges)}</td>
                                <td>{r.massKg.toFixed(1)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>   
        {:else if tab === 2}
            <div class="row"><button class="btn btn-secondary" onclick={() => send(strToU8(hardwareCsv(out.bom)),
                `${base}_quincaillerie.csv`, "text/csv")}>Exporter en CSV</button></div>
            <div class="table-container">
                <table class="table table-striped table-compact">
                    <thead>
                        <tr><th>Famille</th><th>Marque</th><th>Référence</th><th>Désignation</th><th>Qté</th>
                            <th>Remarques</th><th>Source</th></tr>
                    </thead>  
                    <tbody>
                        {#each out.bom.hardware as h}
                            <tr>
                                <td>{FAMILY_LABELS[h.family]}</td>
                                <td>{h.brand}</td>
                                <td><strong>{h.ref}</strong></td>
                                <td>{h.label}</td>
                                <td>{h.qty}</td>
                                <td>{h.notes.join(" | ")}</td>
                                <td>
                                    {#if h.url !== null}<a href={h.url} target="_blank" rel="noopener">{h.source}</a>
                                    {:else}{h.source}{/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <div class="section-title">Chants</div>
            <div class="table-container">
                <table class="table table-compact">
                    <tbody>
                        {#each out.bom.edges as e}<tr><td>{e.label}</td><td>{e.metres.toFixed(1)} m</td></tr>{/each}
                    </tbody>
                </table>
            </div>
        {:else if tab === 3}
            <p class="muted">{out.nesting.sheets.length} panneaux 2800 x 2070, trait de scie {project.settings.kerf} mm,
                délignage {project.settings.trim} mm.</p>
            {#each out.nesting.unplaced as u}
                <div class="alert alert-danger">Non placé : {u.code} {u.label}, {u.reason}</div>
            {/each}
            {#each nestPages as pg}
                <div class="sheet big"><img src={pageToDataUri(pg)} alt={pg.title} /></div>
            {/each}  
        {:else if tab === 4}
            <div class="row">
                <button class="btn btn-secondary" onclick={() => send(strToU8(pbsJson(project, out.bom)),
                    `${base}_pbs_free-pbs.json`, "application/json")}>Exporter pour Free-pbs</button>
            </div>
            <div class="pbs">
                {#each flatPbs(out.bom.pbs, 0, []) as { n, depth }}
                    <div class="pbs-line" style:padding-left={`calc(${depth} * var(--spacing-md))`}>
                        <code>{n.code}</code> {n.label}{n.quantity > 1 ? ` (x${n.quantity})` : ""}
                        {#if n.manufacturer_ref !== ""}
                            <span class="muted"> {n.manufacturer} {n.manufacturer_ref}</span>
                        {/if}
                    </div>
                {/each}
            </div>
        {:else if tab === 5}
            <p class="muted">Prix hors taxes saisis par vous : les lignes sans prix restent listées, jamais comptées à zéro.</p>
            <div class="table-container">
                <table class="table table-compact">
                    <thead><tr><th>Poste</th><th>Quantité</th><th>Prix unitaire HT</th><th>Source</th><th>Total</th></tr></thead>
                    <tbody>
                        {#each out.cost.lines as l (l.key)}
                            <tr>
                                <td>{l.label}</td>
                                <td>{l.qty.toFixed(l.unit === "u" ? 0 : 2)} {l.unit === "m2" ? "m²" : l.unit === "m" ? "m" : "u"}</td>
                                <td><input class="input price" type="number" min="0" step="0.01" value={l.price?.value ?? ""}
                                    onchange={(e) =>
                                    {
                                        const v = str(e);
                                        const today = new Date().toISOString().slice(0, 10);
                                        app.apply(setPrice, l.key, v === "" ? null : { value: Number(v), unit: l.unit,
                                                                                        source: l.price?.source ?? null, date: today });
                                    }} /></td>
                                <td><input class="input" type="text" maxlength="80" value={l.price?.source ?? ""}  
                                    placeholder="Fournisseur, date"
                                    onchange={(e) =>
                                    {
                                        if (l.price !== null)
                                        {
                                            app.apply(setPrice, l.key, { ...l.price, source: str(e) || null });
                                        }
                                    }} /></td>
                                <td>{l.total === null ? "-" : eur(l.total)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            <p>
                <strong>Total HT : {eur(out.cost.total)}</strong>
                {#if out.cost.missing.length > 0}
                    <span class="badge badge-warning">{out.cost.missing.length} ligne(s) sans prix</span>
                {/if}
            </p>
        {:else}
            {@const s = project.settings}
            <div class="section-title">Projet</div>
            <label class="field"><span class="label">Nom</span>
                <input class="input" maxlength="80" value={project.name} onchange={(e) => app.apply(rename, str(e))} />
            </label>
            <div class="section-title">Atelier</div>
            <label class="field"><span class="label">Pas de la grille</span>
                <input class="input" type="number" value={s.grid} onchange={(e) => settings({ grid: num(e) })} />
            </label>
            <label class="field"><span class="label">Jeu entre façades</span>
                <input class="input" type="number" step="0.5" value={s.frontGap}
                    onchange={(e) => settings({ frontGap: num(e) })} />
            </label>
            <label class="field"><span class="label">Jeu extérieur</span>
                <input class="input" type="number" step="0.5" value={s.edgeReveal}
                    onchange={(e) => settings({ edgeReveal: num(e) })} />
            </label>
            <label class="field"><span class="label">TB encastré</span>
                <input class="input" type="number" min="3" max="7" step="0.5" value={s.hingeTb}
                    onchange={(e) => settings({ hingeTb: num(e) })} />
            </label>
            <label class="field"><span class="label">Assemblage</span>
                <select class="select" value={s.joinery} onchange={(e) => settings({ joinery: str(e) as Joinery })}>
                    <option value="minifix">Minifix + tourillons</option>
                    <option value="dowel">Tourillons collés</option>
                    <option value="clamex">Lamello Clamex P-14</option>
                </select>
            </label>
            <label class="field" title="Cotes intérieures, pour les murs latéraux et les meubles jusqu'au plafond">
                <span class="label">Pièce L x P x H</span>
                <span class="row">
                    <input class="input" type="number" min="1" aria-label="Largeur de la pièce" value={app.project.room.width}
                        onchange={(e) => app.apply(setRoom, { width: num(e) })} />
                    <input class="input" type="number" min="1" aria-label="Profondeur de la pièce"
                        value={app.project.room.depth} onchange={(e) => app.apply(setRoom, { depth: num(e) })} />
                    <input class="input" type="number" min="1" aria-label="Hauteur de la pièce" value={app.project.room.height}
                        onchange={(e) => app.apply(setRoom, { height: num(e) })} />
                </span>
            </label>
            <label class="field"><span class="label">Type de mur</span>
                <select class="select" value={s.wallType} onchange={(e) => settings({ wallType: str(e) as WallType })}>
                    <option value="solid">Béton, brique pleine</option>
                    <option value="aerated">Béton cellulaire</option>
                    <option value="plasterboard">Plaque de plâtre</option>
                </select>
            </label>
            <label class="field" title="Puissance du ruban 24 V acheté"><span class="label">Ruban LED (W/m)</span>
                <input class="input" type="number" min="1" step="0.1" value={s.ledWattPerMetre}
                    onchange={(e) => settings({ ledWattPerMetre: num(e) })} />
            </label>
            <label class="field" title="Longueur entre deux repères de coupe du ruban"><span class="label">Pas de coupe LED</span>
                <input class="input" type="number" min="1" value={s.ledCutPitch}
                    onchange={(e) => settings({ ledCutPitch: num(e) })} />
            </label>
            <label class="field" title="Puissance d'un spot 24 V acheté"><span class="label">Spot LED (W)</span>
                <input class="input" type="number" min="0.1" step="0.1" value={s.spotWatt}
                    onchange={(e) => settings({ spotWatt: num(e) })} />
            </label>
            <label class="field"><span class="label">Trait de scie</span>
                <input class="input" type="number" step="0.1" value={s.kerf} onchange={(e) => settings({ kerf: num(e) })} />  
            </label>
            <label class="field"><span class="label">Délignage</span>
                <input class="input" type="number" value={s.trim} onchange={(e) => settings({ trim: num(e) })} />
            </label>
            <label class="field"><span class="label">Charge d'étagère</span>
                <select class="select" value={String(s.shelfLoad)}
                    onchange={(e) => settings({ shelfLoad: Number(str(e)) })}>
                    {#each SHELF_TEST_LOADS as l}<option value={String(l.kgPerDm2)}>{l.kgPerDm2} kg/dm², {l.label}</option>{/each}
                </select>
            </label>
            <label class="field"><span class="label">Port de charge</span>
                <select class="select" value={String(s.handlingKg)}
                    onchange={(e) => settings({ handlingKg: Number(str(e)) })}>
                    {#each HANDLING_LIMITS as l}<option value={String(l.kg)}>{l.label}</option>{/each}
                </select>
            </label>

            <div class="section-title">Conventions d'atelier</div>
            <label class="field"><span class="label">Connecteurs du chant</span>
                <input class="input" type="number" value={s.connectorInset}
                    onchange={(e) => settings({ connectorInset: num(e) })} />
            </label>
            <label class="field"><span class="label">Charnières du chant</span>
                <input class="input" type="number" value={s.hingeEdgeDistance}
                    onchange={(e) => settings({ hingeEdgeDistance: num(e) })} />
            </label>
            <label class="field"><span class="label">Taquets, profondeur</span>
                <input class="input" type="number" value={s.pinDepth} onchange={(e) => settings({ pinDepth: num(e) })} />
            </label>

            <div class="section-title">Écran TV</div>
            <label class="form-check"><input type="checkbox" checked={project.screen !== null}
                onchange={(e) => screen(checked(e) ? {} : null)} /> Écran dans la composition</label>
            {#if project.screen !== null}
                {@const sc = project.screen}
                <label class="field"><span class="label">Diagonale (")</span>
                    <input class="input" type="number" min="20" max="120" value={sc.diagonalInch}
                        onchange={(e) => screen({ diagonalInch: num(e) })} />
                </label>
                <label class="field"><span class="label">Centre X</span>
                    <input class="input" type="number" value={sc.cx} onchange={(e) => screen({ cx: num(e) })} />
                </label>
                <label class="field"><span class="label">Bas de l'écran</span>
                    <input class="input" type="number" value={sc.bottom} onchange={(e) => screen({ bottom: num(e) })} />
                </label>
                <label class="form-check"><input type="checkbox" checked={sc.wallMounted}
                    onchange={(e) => screen({ wallMounted: checked(e) })} /> Fixé au mur</label>
            {/if}
        {/if}
        {/key}
    </div>
</div>

<style>
    .outputs
    {
        display: grid;
        gap: var(--spacing-sm);
    }


    .grid-sheets
    {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
        gap: var(--spacing-sm);
    }

    .sheet
    {
        display: grid;
        gap: var(--spacing-2xs);
        padding: var(--spacing-2xs);
        background: var(--colour-bg-surface-raised);
        border: var(--border-width) solid var(--colour-border);
        border-radius: var(--radius-md);
        color: var(--colour-text-secondary);
        font: inherit;
        font-size: var(--font-size-xs);
        text-align: left;
        cursor: zoom-in;
    }

    .sheet.big
    {
        cursor: default;
        margin-bottom: var(--spacing-sm);
    }


    .sheet img
    {
        display: block;
        width: 100%;
        height: auto;
    }


    .price
    {
        width: 7rem;
    }


    .pbs-line
    {
        font-size: var(--font-size-xs);
        padding: var(--spacing-2xs) 0;
    }

    .pbs-line code
    {
        font-family: var(--font-mono);
        color: var(--colour-accent);
    }
</style>
