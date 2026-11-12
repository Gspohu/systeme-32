// The guided tour as the interface holds it : its rpogress, the actions reported to it, whether it was seen

import { untrack } from "svelte";
import { TOUR_KEY, TOUR_OFF, nextStep, observe, seenFrom, startTour, stepFrom, stepKey, stopTour, type Mark,
         type Snapshot, type TourState } from "./tour";


function readStored(): unknown
{
    try
    {
        return localStorage.getItem(TOUR_KEY);
    }
    catch
    {
        // Private window or blocked storage : offered again from its start on the next visit, nothing worse
        return null;
    }
}


function writeStored(value: string): void
{
    try
    {
        localStorage.setItem(TOUR_KEY, value);
    }
    catch
    {
        // Not kept, the tour stay closed until the page is reloaded
    }
}


class Tour
{
    state = $state.raw<TourState>(TOUR_OFF);
    marks = $state<Record<Mark, number>>({ checks: 0, sheet: 0, saved: 0 });
    private stored = readStored();
    private seen = seenFrom(this.stored);


    mark(m: Mark): void
    {
        if (untrack(() => { return this.state.status; }) === "running")
        {
            this.marks[m]++;
        }
    }


    // First visit only, back at the step a reload left : a tour once closed or finished never comes back by itself
    offer(now: Snapshot): void
    {
        if (!this.seen && untrack(() => { return this.state.status; }) === "off")
        {
            this.set(observe(startTour(now, stepFrom(this.stored)), now));
        }
    }


    // What the app already shows done is passed at once : nothing else would look again until the user acts
    start(now: Snapshot): void
    {
        this.set(observe(startTour(now), now));
    }


    // Set by the card, the one place that reads the app : the projects dialogue starts it on a narrow screen
    starter: (() => void) | null = null;

    begin(): void
    {
        this.starter?.();
    }


    observe(now: Snapshot): void
    {
        const cur = untrack(() => { return this.state; });
        const next = observe(cur, now);
        if (next !== cur)
        {
            this.set(next);
        }
    }


    next(now: Snapshot): void
    {
        this.set(nextStep(untrack(() => { return this.state; }), now));
    }


    stop(): void
    {
        this.set(stopTour());
    }


    // Every change goes through here : the step kept while it runs, seen once it ends either way
    private set(s: TourState): void
    {
        this.state = s;
        const key = stepKey(s);
        this.seen = key === null;
        this.stored = key ?? "seen";
        writeStored(this.stored as string);
    }
}


export const tour = new Tour();
