<script lang="ts">
    import { onMount } from "svelte";
    import { MediaQuery } from "svelte/reactivity";
    import { app } from "$lib/components/app_state.svelte";
    import { drag } from "$lib/components/drag.svelte";
    import Palette from "$lib/components/Palette.svelte";
    import Facade from "$lib/components/Facade.svelte";
    import Inspector from "$lib/components/Inspector.svelte";
    import ChecksPanel from "$lib/components/ChecksPanel.svelte";
    import { TEMPLATES } from "$lib/core/templates";
    import { newProject } from "$lib/core/factory";
    import { rename } from "$lib/core/commands";
    import { byId } from "$lib/core/edit";
    import { packProject, unpackProject, ProjectFileError } from "$lib/core/io/project_file";
    import { slug } from "$lib/core/text";
    import { pickFile, readFile, shareOrDownload } from "$lib/storage/files";
    import { deleteLocal, listLocal, loadLast, loadLocal, saveLocal, storageAvailable } from "$lib/storage/idb";


    const narrow = new MediaQuery("max-width: 1100px");
    let mode = $state<"design" | "outputs">("design");
    let narrowTab = $state(0);
    const NARROW_TABS = ["Conception", "3D", "Détails", "Contrôles"];
    let projectsOpen = $state(false);
    let localProjects = $state<{ id: string; name: string; saved: string }[]>([]);
    let ready = $state(false);

    // three.js and the drawing generators load on first use : the front view paints without waiting for them
    let viewerModule: Promise<typeof import("$lib/components/Viewer3D.svelte")> | null = null;
    let outputsModule: Promise<typeof import("$lib/components/Outputs.svelte")> | null = null;
    const loadViewer = () => { return viewerModule ??= import("$lib/components/Viewer3D.svelte"); };
    const loadOutputs = () => { return outputsModule ??= import("$lib/components/Outputs.svelte"); };


    onMount(async () =>
    {
        app.storageOk = await storageAvailable();
        if (!app.storageOk)
        {
            app.notify("Stockage du navigateur indisponible (navigation privée ?) : enregistrer le projet en fichier.",
                       "warning");
        }
        else
        {
            const last = await loadLast().catch(() =>
            {
                return null;
            });
            if (last !== null)
            {
                app.load(last.project, last.textures);
            }
        }
        ready = true;
    });


    // autosave one second after the last chaneg
    $effect(() =>
    {
        const p = app.project;
        const tex = app.textures;
        if (!ready || !app.storageOk)
        {
            return;
        }
        const t = setTimeout(() =>
        {
            saveLocal(p, tex).catch((e: Error) =>
            {
                app.notify(`Sauvegarde locale impossible : ${e.message}. Enregistrer en fichier.`, "danger");
            });
        }, 1000);
        return () =>   
        {
            clearTimeout(t);
        };
    });


    function newFrom(id: string): void
    {
        const tpl = byId(TEMPLATES, id);
        app.load(tpl === undefined ? newProject("Nouveau projet") : tpl.make(), new Map());
        mode = "design";
    }

    async function open(): Promise<void>
    {
        const f = await pickFile(".zip,.json,application/zip,application/json");
        if (f === null)
        {
            return;
        }
        try
        {
            const { project, textures } = unpackProject(await readFile(f));
            app.load(project, textures);
            app.notify(`${project.name} ouvert`, "success");
        }
        catch (e)
        {
            app.notify(e instanceof ProjectFileError ? e.message : `Ouverture impossible : ${(e as Error).message}`,
                       "danger");
        }
    }

    async function save(): Promise<void>
    {
        const name = `${slug(app.project.name) || "projet"}.systeme-32.zip`;
        const how = await shareOrDownload(packProject(app.project, app.textures), name, "application/zip");
        app.notify(how === "shared" ? "Projet partagé" : `Projet enregistré : ${name}`, "success");
    }

    async function showProjects(): Promise<void>
    {
        localProjects = await listLocal().catch(() =>
        {
            return [];
        });
        projectsOpen = true;
    }


    async function openLocal(id: string): Promise<void>
    {
        const rec = await loadLocal(id);
        if (rec !== null)
        {
            app.load(rec.project, rec.textures);
        }
        projectsOpen = false;
    }

    async function removeLocal(id: string): Promise<void>
    {
        await deleteLocal(id);
        localProjects = await listLocal();
    }

    function onKey(e: KeyboardEvent): void
    {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") 
        {
            return; 
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")
        {
            e.preventDefault();
            if (e.shiftKey)
            {
                app.redo();
            }
            else
            {
                app.undo();
            }
        }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")
        {
            e.preventDefault();
            app.redo();
        }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")
        {
            e.preventDefault();
            save();
        }
        else if (e.key === "Escape")
        {
            app.selection = null;
        }
    }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
    <header class="toolbar bar">
        <strong>systeme-32</strong>
        <input class="input name" aria-label="Nom du projet" maxlength="80" value={app.project.name}
            onchange={(e) => app.apply(rename, (e.currentTarget as HTMLInputElement).value)} />
        <select class="select" aria-label="Nouveau projet" value=""
            onchange={(e) =>
            {
                const picker = e.currentTarget as HTMLSelectElement;
                newFrom(picker.value);
                picker.value = "";
            }}>
            <option value="" disabled>Nouveau...</option>
            {#each TEMPLATES as t}<option value={t.id}>{t.label}</option>{/each}
            <option value="blank">Projet vide</option>
        </select>
        <button class="btn btn-secondary" onclick={open}>Ouvrir</button>
        <button class="btn btn-secondary" onclick={save} title="Archive .zip du projet et de ses textures">Enregistrer</button>
        {#if app.storageOk}
            <button class="btn btn-ghost" onclick={showProjects}>Mes projets</button>
        {/if}
        <button class="btn btn-ghost btn-icon" title="Annuler (Ctrl+Z)" disabled={!app.canUndo}
            onclick={() => app.undo()}>&#8630;</button>
        <button class="btn btn-ghost btn-icon" title="Rétablir (Ctrl+Y)" disabled={!app.canRedo}
            onclick={() => app.redo()}>&#8631;</button>
        <span class="spacer"></span>
        <div class="segmented">
            <button class="segmented-item" class:active={mode === "design"}
                onclick={() => (mode = "design")}>Conception</button>
            <button class="segmented-item" class:active={mode === "outputs"}
                onclick={() => (mode = "outputs")}>Plans et listes</button>
        </div>
    </header>

    {#if mode === "outputs"}
        <main class="workspace"><section class="pane pane-full">
            {#await loadOutputs() then { default: OutputsView }}<OutputsView />{:catch}
                <p class="alert alert-danger">Plans non chargés. Recharger la page une fois connecté.</p>{/await}
        </section></main>
    {:else if narrow.current}
        <main class="narrow">
            <div class="tabs">
                {#each NARROW_TABS as label, i}
                    <button class="tab" class:active={narrowTab === i} onclick={() => (narrowTab = i)}>{label}</button>
                {/each}
            </div>
            <div class="narrow-body" class:single={narrowTab !== 0}>
                {#if narrowTab === 0}
                    <Palette strip />
                    <section class="pane pane-facade"><Facade /></section>
                {:else if narrowTab === 1}
                    <section class="pane viewer-host">
                        {#await loadViewer() then { default: Viewer3D }}<Viewer3D />{:catch}
                            <p class="alert alert-danger">Vue 3D non chargée. Recharger la page une fois connecté.</p>{/await}
                    </section>
                {:else if narrowTab === 2}
                    <section class="pane inspector-host"><Inspector /></section>
                {:else}
                    <section class="pane"><ChecksPanel /></section>  
                {/if}
            </div>
        </main>
    {:else}
        <main class="workspace">
            <aside class="pane pane-palette"><Palette /></aside>
            <section class="pane pane-facade"><Facade /></section>
            <section class="pane pane-checks"><ChecksPanel /></section>
            <aside class="pane pane-side">
                <div class="viewer">{#await loadViewer() then { default: Viewer3D }}<Viewer3D />{:catch}
                    <p class="alert alert-danger">Vue 3D non chargée. Recharger la page une fois connecté.</p>{/await}</div>
                <div class="inspector"><Inspector /></div>
            </aside>
        </main>
    {/if}
</div>

{#if drag.payload !== null && drag.moved}
    <div class="drag-ghost" style:left={`${drag.x}px`} style:top={`${drag.y}px`}>{drag.label}</div>
{/if}


{#if projectsOpen}
    <!-- the design system overlay stays transparent and deaf to clicks without .active -->
    <div class="modal-overlay active" role="presentation" onclick={() => (projectsOpen = false)}>
        <div class="modal" role="dialog" aria-modal="true" aria-label="Mes projets" tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.key === "Escape" && (projectsOpen = false)}>
            <div class="modal-title">Projets de ce navigateur</div>
            {#if localProjects.length === 0}
                <p class="muted">Aucun projet enregistré ici.</p>
            {:else}
                <ul class="projects">
                    {#each localProjects as lp (lp.id)}
                        <li>  
                            <button class="btn btn-ghost" onclick={() => openLocal(lp.id)}>{lp.name}</button>
                            <span class="muted">{new Date(lp.saved).toLocaleString("fr-FR")}</span>
                            <button class="btn btn-ghost btn-icon" title="Supprimer"
                                onclick={() => removeLocal(lp.id)}>&#10005;</button>
                        </li>
                    {/each}
                </ul>
            {/if}
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick={() => (projectsOpen = false)}>Fermer</button>
            </div>
        </div>
    </div>
{/if}


<div class="toast-container">
    {#each app.toasts as t (t.id)}
        <div class="alert alert-{t.variant}">
            {t.message}
            <button class="alert-dismiss" aria-label="Fermer" onclick={() => app.dismiss(t.id)}>&times;</button>
        </div>
    {/each}
</div> 

<style>
    .viewer-host
    {
        position: relative;
        min-height: 60dvh;
    }

    .inspector-host
    {
        padding: var(--spacing-sm);
        overflow: auto;
    }


    .projects
    {
        display: grid;
        gap: var(--spacing-2xs);
    }

    .projects li
    {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        justify-content: space-between;
    }
</style>
