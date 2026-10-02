<script lang="ts">
    // A handle on the edge of a pane : dragged, or moved with the arrow keys, it sets the size of that pane
    // A double click gives the stylesheet size back
    let { axis, size = $bindable(), target, bounds, grows = 1, label, place, onrelease }: {
        axis: "x" | "y";
        // grid area and edge of the pane, the handle being a child of the grid that lays the panes out
        place: string;
        size: number | null;
        target: HTMLElement | undefined;
        bounds: () => [number, number];
        // 1 when dragging right or down widens the pane, -1 for a pane on the other side of its handle
        grows?: 1 | -1;
        label: string;
        onrelease: () => void;
    } = $props();

    const STEP = 16;
    let from = 0;
    let start = 0;
    let dragging = $state(false);


    function current(): number
    {
        if (size !== null)
        {
            return size;
        }
        const box = target?.getBoundingClientRect();
        return box === undefined ? 0 : axis === "x" ? box.width : box.height;
    }


    function set(px: number): void
    {
        const [lo, hi] = bounds();
        size = Math.round(Math.min(Math.max(px, lo), Math.max(lo, hi)));
    }


    function down(e: PointerEvent): void
    {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        from = current();
        start = axis === "x" ? e.clientX : e.clientY;
        dragging = true;
    }


    function move(e: PointerEvent): void
    {
        if (dragging)
        {
            set(from + grows * ((axis === "x" ? e.clientX : e.clientY) - start));
        }
    }


    function up(): void
    {
        if (dragging)
        {
            dragging = false;
            onrelease();
        }
    }


    function key(e: KeyboardEvent): void
    {
        const forward = axis === "x" ? "ArrowRight" : "ArrowDown";
        const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
        if (e.key === forward || e.key === back)
        {
            e.preventDefault();
            set(current() + grows * (e.key === forward ? STEP : -STEP));
            onrelease();
        }
    }
</script>

<div class="splitter {axis}" class:active={dragging} role="slider" tabindex="0" aria-label={label} style={place}
    aria-orientation={axis === "x" ? "horizontal" : "vertical"} aria-valuenow={size ?? 0}
    aria-valuetext={size === null ? "taille d'origine" : `${size} px`}
    title="Glisser pour régler, double-clic pour la taille d'origine"
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}
    ondblclick={() =>
    {
        size = null;
        onrelease();
    }}></div>

<style>
    .splitter
    {
        position: absolute;
        z-index: var(--z-sticky);
        touch-action: none;
        transition: background var(--transition-fast);
    }

    .splitter.x
    {
        top: 0;
        bottom: 0;
        width: var(--spacing-xs);
        cursor: col-resize;
    }

    .splitter.y
    {
        left: 0;
        right: 0;
        height: var(--spacing-xs);
        cursor: row-resize;
    }

    .splitter:hover,
    .splitter:focus-visible,
    .splitter.active
    {
        background: var(--colour-accent);
    }
</style>
