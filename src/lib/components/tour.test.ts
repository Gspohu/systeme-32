import { describe, expect, it } from "vitest";
import { STEPS, TOUR_OFF, nextStep, observe, seenFrom, startTour, stepFrom, stepKey, stepView, stopTour,
         type Snapshot } from "./tour";


function snap(over: Partial<Snapshot> = {}): Snapshot
{
    return { projectId: "p1", carcasses: 3, fronts: ["a:door"], selection: "none", edits: 0, mode: "design",
             marks: { checks: 0, sheet: 0, saved: 0 }, ...over };
}


function at(id: string): number
{
    return STEPS.findIndex((s) =>
    {
        return s.id === id;
    });
}


describe("guided tour", () =>
{
    it("starts on its first step from what the app shows", () =>
    {
        const s = startTour(snap());
        expect(s).toEqual({ status: "running", step: 0, from: snap() });
        expect(stepView(s, false)).toMatchObject({ title: "Ouvrir un modèle", index: 1, count: STEPS.length });
    });


    it("stays put and gives the same state back while nothing is done", () =>
    {
        const s = startTour(snap({ carcasses: 0 }));
        expect(observe(s, snap({ carcasses: 0, selection: "carcass" }))).toBe(s);
    });


    it("waits for a template with carcasses, a blank project isn't enough", () =>
    {
        const s = startTour(snap({ carcasses: 0 }));
        expect(observe(s, snap({ projectId: "p2", carcasses: 0 })).step).toBe(0);
        expect(observe(s, snap({ projectId: "p2" })).step).toBe(at("select"));
    });


    // The page opens on the TV wall : asking for a model already there sent the user looking for nothing
    it("passes the template step at once on a project that has its carcasses", () =>
    {
        expect(observe(startTour(snap()), snap()).step).toBe(at("select"));
    });


    it("walks every step on the actions the user really makes", () =>
    {
        let now = snap({ carcasses: 0 });
        let s = startTour(now);
        const act = (over: Partial<Snapshot>): void =>
        {
            now = { ...now, ...over, marks: { ...now.marks, ...over.marks } };
            s = observe(s, now);
            return;
        };
        act({ projectId: "p2", carcasses: 3 });
        act({ selection: "carcass" });
        expect(s.step).toBe(at("edit"));
        act({ edits: 1 });
        expect(s.step).toBe(at("front"));
        act({ fronts: ["a:door", "b:drawers"], edits: 2 });
        expect(s.step).toBe(at("checks"));
        act({ marks: { checks: 1, sheet: 0, saved: 0 } });
        act({ mode: "outputs" });
        expect(s.step).toBe(at("sheet"));
        act({ marks: { checks: 1, sheet: 1, saved: 0 } });
        expect(s.step).toBe(at("save"));
        act({ marks: { checks: 1, sheet: 1, saved: 1 } });
        expect(s).toEqual({ status: "finished", step: STEPS.length, from: null });
        expect(stepView(s, false)).toBeNull();
    });


    it("takes a front swapped for another one, never a front removed", () =>
    {
        const front = { status: "running" as const, step: at("front"), from: snap() };
        expect(observe(front, snap({ fronts: ["c:drawers"] })).step).toBe(at("checks"));
        expect(observe(front, snap({ fronts: [] })).step).toBe(at("front"));
    });


    it("counts an edit of the project the step began on only", () =>
    {
        const edit = { status: "running" as const, step: at("edit"), from: snap({ edits: 4 }) };
        expect(observe(edit, snap({ edits: 5 })).step).toBe(at("front"));
        expect(observe(edit, snap({ projectId: "p9", edits: 5 })).step).toBe(at("edit"));
    });


    it("passes several steps at once when the app already shows them done", () =>
    {
        const s = startTour(snap({ selection: "carcass" }));
        expect(observe(s, snap({ projectId: "p2", selection: "carcass" })).step).toBe(at("edit"));
    });


    it("goes on by hand, ends past the last step, and stops at once", () =>
    {
        let s = startTour(snap());
        s = nextStep(s, snap({ edits: 3 }));
        expect(s).toEqual({ status: "running", step: 1, from: snap({ edits: 3 }) });
        const last = { status: "running" as const, step: STEPS.length - 1, from: snap() };
        expect(nextStep(last, snap()).status).toBe("finished");
        expect(stopTour()).toEqual(TOUR_OFF);
        expect(nextStep(TOUR_OFF, snap())).toBe(TOUR_OFF);
        expect(observe(TOUR_OFF, snap({ projectId: "p2" }))).toBe(TOUR_OFF);
    });


    it("says the tabbed layout's own words on a narrow screen", () =>
    {
        const s = { status: "running" as const, step: at("checks"), from: snap() };
        expect(stepView(s, true)).toMatchObject({ text: "Ouvrir l'onglet Contrôles.", end: false });
        // On a wide screen the card keeps off the controls, and off the inspector the edit step need
        expect(stepView(s, false)).toMatchObject({ text: expect.stringMatching(/^Toucher une ligne/), end: true });
        expect(stepView({ ...s, step: at("edit") }, false)?.end).toBe(false);
    });


    it("reads the stored flag, anything but the exact word as never seen", () =>
    {
        expect(seenFrom("seen")).toBe(true);
        expect(seenFrom(null)).toBe(false);
        expect(seenFrom("1")).toBe(false);
        expect(seenFrom(undefined)).toBe(false);
        expect(seenFrom("step:3")).toBe(false);
    });


    it("keeps the running step for a reload, and takes back only a step that exists", () =>
    {
        const s = startTour(snap(), at("checks"));
        expect(stepKey(s)).toBe(`step:${at("checks")}`);
        expect(stepFrom(stepKey(s))).toBe(at("checks"));
        expect(stepKey(stopTour())).toBeNull();
        expect(stepKey({ status: "finished", step: STEPS.length, from: null })).toBeNull();
        expect(stepFrom("seen")).toBe(0);
        expect(stepFrom(`step:${STEPS.length}`)).toBe(0);
        expect(stepFrom("step:-1")).toBe(0);
        expect(stepFrom(null)).toBe(0);
    });


    it("points every step at something and keeps its texts short", () =>
    {
        for (const s of STEPS)
        {
            expect(s.target).not.toBe("");
            expect(s.title.length).toBeLessThanOrEqual(30);
            expect(s.text.length).toBeLessThanOrEqual(80);
            // Only what a French keyboard types : no dash, ellipsis or guillemet character
            const off = [0x2013, 0x2014, 0x2026, 0xab, 0xbb].map((c) =>
            {
                return String.fromCharCode(c);
            });
            for (const c of off)
            {
                expect(s.text + (s.narrow ?? "")).not.toContain(c);
            }
        }
    });
});
