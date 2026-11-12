// The guided tour as the interface holds it : its rpogress, the actions reported to it, whether it was seen

import { untrack } from "svelte";
import { TOUR_KEY, TOUR_OFF, nextStep, observe, seenFrom, startTour, stopTour, type Mark, type Snapshot,
         type TourState } from "./tour";


function readSeen(): boolean
{
    try
    {
        return seenFrom(localStorage.getItem(TOUR_KEY));
    }
    catch
    {
        // Private window or blocked storage : offered again on the next visit, nothing worse
        return false;
    }
}


function writeSeen(): void
{
    try
    {
        localStorage.setItem(TOUR_KEY, "seen");
    }
    catch
    {
        // Not kept, the tour stay closed until the page is reloaded
    }
    return;
}


class Tour
{
    state = $state.raw<TourState>(TOUR_OFF);
    marks = $state<Record<Mark, number>>({ checks: 0, sheet: 0, saved: 0 });
    private seen = readSeen();


    mark(m: Mark): void
    {
        if (untrack(() => { return this.state.status; }) === "running")
        {
            this.marks[m]++;
        }
        return;
    }


    // First visit only : a tour once closed or finished never comes back by itself
    offer(now: Snapshot): void
    {
        if (!this.seen && untrack(() => { return this.state.status; }) === "off")
        {
            this.state = startTour(now);
        }
        return;
    }


    start(now: Snapshot): void
    {
        this.state = startTour(now);
        return;
    }


    observe(now: Snapshot): void
    {
        const cur = untrack(() => { return this.state; });
        const next = observe(cur, now);
        if (next !== cur)
        {
            this.state = next;
            if (next.status === "finished")
            {
                this.remember();
            }
        }
        return;
    }


    next(now: Snapshot): void
    {
        this.state = nextStep(this.state, now);
        if (this.state.status === "finished")
        {
            this.remember();
        }
        return;
    }


    stop(): void
    {
        this.state = stopTour();
        this.remember();
        return;
    }


    private remember(): void
    {
        this.seen = true;
        writeSeen();
        return;
    }
}


export const tour = new Tour();
