// Own deflection of tops a carcass stands on, out of the simulation of the whole piece : screwed under it, a top is
// carried by it, which no beam on its sides tells. Each holds the fingerprint of it's run (fem_input.ts)

export interface SimulatedTop
{
    // The carcass of the top and the ones standing on it, by name
    item: string;
    over: string[];
    // femFingerprint of the piece as exported for the run, written by scripts/fem_charges.ts
    input: string;
    // Cell of the run in mm : 60 read a sag 17 % low on a plain shelf against 1 % at 35, never past MAX_RUN_CELL
    mesh: number;
    // Each point against the straight line between its 2 ends, under the loads of the run, mm
    ownSag: number;
    source: string;
}


const DRESSER_RUN = "simulation CalculiX 2.23 du vaisselier entier (scripts/fem_meuble.py, fixations soudées au point "
    + "exact, contacts à jeu posés des deux panneaux et réglés à 0,1 N, appuis sur ancrages, maille 35 mm, 50 passes, "
    + "0,12 N à tort, 1 kg/dm² hors placards hauts, 0,5 kg/dm² dedans)";
const TV_RUN = "simulation CalculiX 2.23 de la composition TV entière (scripts/fem_meuble.py, fixations soudées au "
    + "point exact, contacts à jeu posés des deux panneaux et réglés à 0,1 N, appuis sur ancrages, maille 35 mm, 53 passes, "
    + "0,02 N à tort, 1 kg/dm² sur planchers et tablettes)";

export const SIMULATED_TOPS: SimulatedTop[] = [
    { item: "Niche", over: ["Placards hauts"], input: "75e34a28498e2e3f", mesh: 35, ownSag: 0.498388677173913,
      source: DRESSER_RUN },
    { item: "Placards et tiroirs", over: ["Niche"], input: "75e34a28498e2e3f", mesh: 35, ownSag: 0.6753345,
      source: DRESSER_RUN },
    { item: "Meuble bas", over: ["Colonne gauche", "Colonne à livres"], input: "844b39779e35f7e4", mesh: 35,
      ownSag: 0.22561601756756755, source: TV_RUN },
];

// The coarsest cell in mm a run is cited on
export const MAX_RUN_CELL = 35;
