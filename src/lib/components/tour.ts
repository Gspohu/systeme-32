// Guided first use : the steps, what the app must show for each to be done, and the porgress through them

// Actions the app reports itself, nothing in its state keeping a trace of them
export type Mark = "checks" | "sheet" | "saved";

export interface Snapshot
{
    projectId: string;
    carcasses: number;
    // Every front of the project by id and type : a front replaced by another one changes it too
    fronts: string[];
    selection: "none" | "carcass" | "item" | "cell" | "front" | "divider";
    // Commands kept in the history of the open project
    edits: number;
    mode: "design" | "outputs";
    marks: Record<Mark, number>;
}

export interface Step
{
    id: string;
    title: string;
    text: string;
    // Said instead of text on the tabbed layout of a narrow screen
    narrow?: string;
    // Css selector of what the step points at, outlined while it runs
    target: string;
    // The card sits bottom right on a wide screen, bottom left when the step need the panel under it
    side?: "start";
    done: (now: Snapshot, from: Snapshot) => boolean;
}


function marked(now: Snapshot, from: Snapshot, m: Mark): boolean
{
    return now.marks[m] > from.marks[m];
}


export const STEPS: Step[] = [
    {
        id: "template", title: "Ouvrir un modèle", text: "Choisir un modèle dans la liste Nouveau..., en haut.",
        target: "[data-tour='new']",
        // Whatever put them there, the page opens on a model already
        done: (now) =>
        {
            return now.carcasses > 0;
        },
    },
    {
        id: "select", title: "Sélectionner un caisson", text: "Toucher l'étiquette d'un caisson sur la vue de face.",
        target: ".pane-facade",
        done: (now) =>
        {
            return now.selection === "carcass";
        },
    },
    {
        id: "edit", title: "Le modifier", text: "Changer une valeur dans le panneau sous la 3D, la largeur par exemple.",
        narrow: "Onglet Détails : changer une valeur, la largeur par exemple.",
        target: ".inspector-body", side: "start",
        done: (now, from) =>
        {
            return now.edits > from.edits && now.projectId === from.projectId;
        },
    },
    {
        id: "front", title: "Ajouter une façade", text: "Glisser Porte ou Tiroirs de la palette sur une case.",
        narrow: "Onglet Conception : glisser Porte ou Tiroirs du bandeau sur une case.",
        target: ".palette",
        done: (now, from) =>
        {
            const before = new Set(from.fronts);
            return now.fronts.length >= from.fronts.length && now.fronts.some((f) =>
            {
                return !before.has(f);
            });
        },
    },
    {
        id: "checks", title: "Lire les contrôles", text: "Toucher une ligne des contrôles, sous la vue de face, ou cocher Infos.",
        narrow: "Ouvrir l'onglet Contrôles.",
        target: ".checks",
        done: (now, from) =>
        {
            return marked(now, from, "checks");
        },
    },
    {
        id: "outputs", title: "Ouvrir les plans", text: "Passer sur Plans et listes, en haut.",
        target: "[data-tour='outputs']",
        done: (now) =>
        {
            return now.mode === "outputs";
        },
    },
    {
        id: "sheet", title: "Voir une planche", text: "Toucher une planche pour l'agrandir.",
        target: ".grid-sheets",
        done: (now, from) =>
        {
            return marked(now, from, "sheet");
        },
    },
    {
        id: "save", title: "Enregistrer", text: "Enregistrer le projet, ou télécharger le dossier atelier ou le PDF.",
        target: "[data-tour='save']",
        done: (now, from) =>
        {
            return marked(now, from, "saved");
        },
    },
];


export interface TourState
{
    status: "off" | "running" | "finished";
    step: number;
    // The app as it stood when the current step began
    from: Snapshot | null;
}

export const TOUR_OFF: TourState = { status: "off", step: 0, from: null };


export function startTour(now: Snapshot, step = 0): TourState
{
    return { status: "running", step, from: now };
}


// The step aftre the current one, begun from what the app shows now, or the end past the last one
export function nextStep(s: TourState, now: Snapshot, steps: Step[] = STEPS): TourState
{
    if (s.status !== "running")
    {
        return s;
    }
    if (s.step + 1 >= steps.length)
    {
        return { status: "finished", step: steps.length, from: null };
    }
    return { status: "running", step: s.step + 1, from: now };
}


// Every step the app now shows done is passed, the same state back when nothing changed
export function observe(s: TourState, now: Snapshot, steps: Step[] = STEPS): TourState
{
    let cur = s;
    while (cur.status === "running" && cur.from !== null && steps[cur.step]!.done(now, cur.from))
    {
        cur = nextStep(cur, now, steps);
    }
    return cur;
}


export function stopTour(): TourState
{
    return TOUR_OFF;
}


// What the card shows for the running step on this layout, null when there's none
export function stepView(s: TourState, narrow: boolean, steps: Step[] = STEPS):
    { title: string; text: string; target: string; end: boolean; index: number; count: number } | null
{
    const step = s.status === "running" ? steps[s.step] : undefined;
    if (step === undefined)
    {
        return null;
    }
    return { title: step.title, text: narrow && step.narrow !== undefined ? step.narrow : step.text,
             target: step.target, end: step.side !== "start" && !narrow, index: s.step + 1, count: steps.length };
}


export const TOUR_KEY = "systeme-32.tour";


// The stored flag read as unknown : only the exact word counts, anything else means never seen
export function seenFrom(raw: unknown): boolean
{
    return raw === "seen";
}


// What is stored while it runs, the step a reload takes it back to
export function stepKey(s: TourState): string | null
{
    return s.status === "running" ? `step:${s.step}` : null;
}


export function stepFrom(raw: unknown, steps: Step[] = STEPS): number
{
    const m = typeof raw === "string" ? /^step:(\d+)$/.exec(raw) : null;
    const n = m === null ? 0 : Number(m[1]);
    return n < steps.length ? n : 0;
}
