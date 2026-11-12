<script lang="ts">
    // A thin adapter : the app read into a snapshot for the tour module, the running step shown in a card
    import { app } from "./app_state.svelte";
    import { tour } from "./tour_state.svelte";
    import { stepView, type Snapshot } from "./tour";
    import { byId } from "../core/edit";

    // On a narrow screen the button lives in the projects dialogue, a line less in the toolbar
    let { mode, narrow, ready }: { mode: "design" | "outputs"; narrow: boolean; ready: boolean } = $props();


    const now = $derived.by((): Snapshot =>
    {
        const p = app.project;
        const fronts: string[] = [];
        let carcasses = 0;
        for (const it of p.items)
        {
            if (it.kind === "carcass")
            {
                carcasses++;
                for (const f of it.fronts)
                {
                    fronts.push(`${f.id}:${f.spec.type}`);
                }
            }
        }
        const sel = app.selection;
        let selection: Snapshot["selection"] = "none";
        if (sel?.kind === "item")
        {
            selection = byId(p.items, sel.item)?.kind === "carcass" ? "carcass" : "item";
        }
        else if (sel !== null)
        {
            selection = sel.kind === "node" ? "cell" : sel.kind;
        }
        return { projectId: p.id, carcasses, fronts, selection, edits: app.history.past.length, mode,
                 marks: { ...tour.marks } };
    });

    $effect(() =>
    {
        if (ready)
        {
            tour.offer(now);
        }
        return;
    });

    $effect(() =>
    {
        tour.observe(now);
        return;
    });

    tour.starter = () =>
    {
        tour.start(now);
        return;
    };

    const view = $derived(stepView(tour.state, narrow));
    const end = $derived(view !== null ? view.end : tour.state.status === "finished" && !narrow);
    let cardHeight = $state(0);
    // Rules of its own, they hold through every rebuild of the panes : the step's target outlined, and the messages
    // lifted over the card when it shares their corner
    const rules = $derived.by((): string =>
    {
        let css = view === null ? "" : `${view.target} { outline: var(--border-width-thick) solid var(--colour-accent); `
            + "outline-offset: calc(-1 * var(--border-width-thick)); }";
        if (end && cardHeight > 0)
        {
            css += `.toast-container { bottom: calc(2 * var(--spacing-md) + ${cardHeight}px); }`;
        }
        return css === "" ? "" : `<style>${css}</style>`;
    });
</script>

<svelte:head>{@html rules}</svelte:head>

{#if !narrow}
    <button class="btn btn-ghost" title="Visite guidée de la première utilisation" onclick={() => tour.begin()}>
        Visite</button>
{/if}

{#if view !== null}
    <section class="tour" class:end aria-label="Visite guidée" bind:clientHeight={cardHeight}>
        <!-- both buttons on the first line : a line less over the front view a narrow screen barely shows -->
        <div class="tour-head">
            <span class="tour-count">Étape {view.index} sur {view.count}</span>
            <span class="tour-buttons">
                <button class="btn btn-ghost" onclick={() => tour.stop()}>Passer</button>
                <button class="btn btn-secondary" title="Étape suivante sans la faire" onclick={() => tour.next(now)}>
                    Suivant</button>
            </span>
        </div>
        <div aria-live="polite">
            <div class="tour-title">{view.title}</div>
            <p class="tour-text">{view.text}</p>
        </div>
    </section>
{:else if tour.state.status === "finished"}
    <section class="tour" class:end aria-label="Visite guidée" bind:clientHeight={cardHeight}>
        <div aria-live="polite">
            <div class="tour-title">Visite terminée</div>
            <p class="tour-text">Le bouton Visite, en haut, la relance.</p>
        </div>
        <div class="tour-actions">
            <button class="btn btn-secondary" onclick={() => tour.stop()}>Fermer</button>
        </div>
    </section>
{/if}

<style>
    /* Bottom left, or bottom right under the messages it lifts */
    .tour
    {
        position: fixed;
        left: var(--spacing-md);
        bottom: var(--spacing-md);
        z-index: var(--z-overlay);
        display: grid;
        gap: var(--spacing-xs);
        /* As wide as a modal (components.css) */
        width: min(420px, calc(100vw - 2 * var(--spacing-md)));
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--colour-bg-surface-raised);
        color: var(--colour-text-primary);
        border: var(--border-width) solid var(--colour-accent);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-md);
    }

    .tour.end
    {
        left: auto;
        right: var(--spacing-md);
    }

    .tour-head,
    .tour-actions
    {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--spacing-xs);
    }

    .tour-actions
    {
        justify-content: flex-end;
    }

    .tour-buttons
    {
        display: flex;
        gap: var(--spacing-xs);
    }

    .tour-count
    {
        white-space: nowrap;
        font-size: var(--font-size-xs);
        color: var(--colour-text-secondary);
    }

    .tour-title
    {
        font-weight: var(--font-weight-semibold);
    }

    .tour-text
    {
        margin: 0;
        font-size: var(--font-size-xs);
        color: var(--colour-text-secondary);
    }
</style>
