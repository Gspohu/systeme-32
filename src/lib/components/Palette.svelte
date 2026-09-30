<script lang="ts">
    import { drag } from "./drag.svelte";
    import { handleDrop } from "./actions";
    import { TOOLS } from "./tools";


    let { strip = false }: { strip?: boolean } = $props();
</script>

<div class="palette" class:strip>
    {#if !strip}
        <div class="section-title">Glisser sur la façade</div>
    {/if}
    {#each TOOLS as t (t.id)}
        <button
            class="tool"
            title={t.hint}
            onpointerdown={(e) => drag.start(e, { kind: "palette", tool: t.id }, t.label, handleDrop)}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
            <span>{t.label}</span>
        </button>
    {/each}
</div>

<style>
    .palette
    {
        display: grid;
        gap: var(--spacing-2xs);
        padding: var(--spacing-xs);
        align-content: start;
    }


    .palette.strip
    {
        display: flex;
        overflow-x: auto;
        border-bottom: var(--border-width) solid var(--colour-border);
        background: var(--colour-bg-surface);
    }


    .tool
    {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        min-height: var(--control-height-sm);
        padding: var(--spacing-2xs) var(--spacing-xs);
        border: var(--border-width) solid var(--colour-border);
        border-radius: var(--radius-md);
        background: var(--colour-bg-surface-raised);
        color: var(--colour-text-primary);
        font: inherit;
        text-align: left;
        cursor: grab;
        touch-action: none;
        user-select: none;
        transition: border-color var(--transition-fast);
    }

    .strip .tool
    {
        flex-direction: column;
        flex: 0 0 auto;
        min-width: 5.5rem;
        text-align: center;
        font-size: var(--font-size-xs);
    }

    .tool:hover  
    {
        border-color: var(--colour-accent);
    }

    .tool svg
    {
        width: 1.5rem;
        height: 1.5rem;
        flex: 0 0 auto;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linejoin: round;
    }
</style>
