<script lang="ts">
    import { app } from "./app_state.svelte";
    import { groupOrder } from "../core/group_order";
    import { ProjectFileError, unpackProject } from "../core/io/project_file";
    import { eur } from "../core/text";
    import { pickFile, readFile } from "../storage/files";
    import { listLocal, loadLocal } from "../storage/idb";
    import type { Project } from "../core/model";


    // the other saved projects ordered with the open one, for this session only : they stay where they are saved
    let partners = $state.raw<Project[]>([]);
    const order = $derived(partners.length === 0 ? null : groupOrder([app.project, ...partners]));
    // the projetcs of this browser, read once when the tab opens
    let saved = $state.raw<{ id: string; name: string }[]>([]);
    listLocal().then((all) =>
    {
        saved = all;
    }, () =>
    {
        saved = [];
    });
    const offered = $derived(saved.filter((s) =>
    {
        return s.id !== app.project.id && !partners.some((p) =>
        {
            return p.id === s.id;
        });
    }));


    function drop(k: number): void
    {
        partners = partners.filter((_, j) =>
        {
            return j !== k;
        });
    }
    const FROM_FILE = "file";


    async function add(choice: string): Promise<void>
    {
        try
        {
            let project: Project | null = null;
            if (choice === FROM_FILE)
            {
                const f = await pickFile(".zip,.json,application/zip,application/json");
                project = f === null ? null : unpackProject(await readFile(f)).project;
            }
            else
            {
                project = (await loadLocal(choice))?.project ?? null;
            }
            if (project !== null)
            {
                partners = [...partners, project];
            }
        }
        catch (e)
        {
            app.notify(e instanceof ProjectFileError ? e.message : `Ouverture impossible : ${(e as Error).message}`,
                       "danger");
        }
    }
</script>

<div class="section-title">Commande groupée</div>
<p class="muted">Un calepinage et un achat pour plusieurs projets, réglages et prix du projet ouvert.</p>
<div class="row">
    <select class="select" aria-label="Ajouter un projet à la commande" value=""
        onchange={(e) =>
        {
            const v = e.currentTarget.value;
            e.currentTarget.value = "";
            add(v);
        }}>
        <option value="" disabled>Ajouter un projet...</option>
        {#each offered as s (s.id)}
            <option value={s.id}>{s.name}</option>
        {/each}
        <option value={FROM_FILE}>Depuis un fichier...</option>
    </select>  
</div>
{#if order !== null}
    <div class="table-container">
        <table class="table table-compact">
            <thead><tr><th>Repère</th><th>Projet</th><th>Panneaux seul</th><th>Total seul HT</th><th></th></tr></thead>
            <tbody>
                {#each order.tags as t, i (t.tag)}
                    <tr>
                        <td>{t.tag}</td>
                        <td>{t.name}</td>
                        <td>{order.apart[i]!.sheets}</td>
                        <td>{eur(order.apart[i]!.total)}</td>
                        <td>
                            {#if i > 0}
                                <button class="btn btn-ghost" onclick={() => drop(i - 1)}>
                                    Retirer</button>
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <p>
        <strong>Ensemble : {order.nesting.sheets.length} panneaux au lieu de {order.separate.sheets},
            {eur(order.cost.total)} HT au lieu de {eur(order.separate.total)}.</strong>
        {#if order.partial}
            <span class="badge badge-warning">Lignes sans prix : comparaison partielle</span>
        {/if}
    </p>
    <div class="table-container">
        <table class="table table-compact">
            <thead><tr><th>Poste</th><th>Quantité</th><th>Total</th></tr></thead>
            <tbody>
                {#each order.cost.lines as l (l.key)}
                    <tr>
                        <td>{l.label}</td>  
                        <td>{l.qty.toFixed(l.unit === "u" ? 0 : 2)} {l.unit === "m2" ? "m²" : l.unit}
                            {#if l.bought !== null}<span class="muted">, achat {l.bought}</span>{/if}</td>
                        <td>{l.total === null ? "sans prix" : eur(l.total)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
