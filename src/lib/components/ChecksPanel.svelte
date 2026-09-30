<script lang="ts">
    import { app } from "./app_state.svelte";
    import type { Check } from "../core/analysis";

    let onlySelected = $state(false);
    let showInfo = $state(false);


    const order = { error: 0, warning: 1, info: 2 };
    const board = $derived.by(() =>
    {
        const counts = { error: 0, warning: 0, info: 0 };
        const shown: Check[] = [];
        const picked = app.selection;
        for (const c of app.outputs.analysis.checks)
        {
            counts[c.level]++;
            const levelShown = showInfo || c.level !== "info";
            if (levelShown && (!onlySelected || picked === null || c.item === picked.item))
            {
                shown.push(c);
            }
        }
        shown.sort((a, b) =>
        {
            return order[a.level] - order[b.level];
        });
        return { counts, shown };
    });
    const counts = $derived(board.counts);
    const shown = $derived(board.shown);
</script>

<div class="checks">
    <div class="head bar">
        <span class="badge badge-danger">{counts.error} erreur{counts.error > 1 ? "s" : ""}</span>
        <span class="badge badge-warning">{counts.warning} alerte{counts.warning > 1 ? "s" : ""}</span>
        <label class="form-check"><input type="checkbox" bind:checked={showInfo} /> Infos ({counts.info})</label> 
        <label class="form-check"><input type="checkbox" bind:checked={onlySelected} /> Sélection seule</label>
    </div>
    {#if shown.length === 0}
        <p class="muted">Aucun problème de fabrication détecté.</p>
    {:else}
        <ul>
            {#each shown as c, i (i)}
                <li class={c.level}>
                    <button class="line" onclick={() =>
                    {
                        if (c.item !== null)
                        {
                            app.selection = { kind: "item", item: c.item };
                        }
                    }}>{c.message}</button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .checks
    {
        padding: var(--spacing-xs) var(--spacing-sm);
    }

    .head
    {
        margin-bottom: var(--spacing-xs);
    }


    ul
    {
        display: grid;
        gap: var(--spacing-2xs);
    }


    li
    {
        border-left: var(--border-width-thick) solid var(--colour-border);
        padding-left: var(--spacing-xs);
    }

    li.error
    {
        border-color: var(--colour-danger);
    }


    li.warning
    {
        border-color: var(--colour-warning);
    }

    li.info
    {
        border-color: var(--colour-info);
    }

    .line
    {
        all: unset;
        cursor: pointer;
        font-size: var(--font-size-xs);
        color: var(--colour-text-primary);
    }
</style>
