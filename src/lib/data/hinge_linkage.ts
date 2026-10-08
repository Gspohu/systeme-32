// Four-bar linkage of the Blum CLIP top 110° hinge, from Blum's CAD model of the 70T3550.TL (fie 47173013.step of
// 2024-05-15) : hinge closed, x across the side with its inner face at 0, z towards the room. KA-150 p. 75 draws the
// BLUMOTION one the same

export interface HingeLinkage
{
    // pivots of the arm, fixed to the side
    armA: [number, number];
    armB: [number, number];
    // pivots of the cup, fixed to the door : armA links to cupC, armB to cupD
    cupC: [number, number];
    cupD: [number, number];
    // back face of the door, 13 mm above the bottom of the cup
    doorBack: number;
    openDeg: number;
    source: string;
}


export const HINGE_110: HingeLinkage = {
    armA: [-17.99, 42.57],
    armB: [-8.43, 34.29],
    cupC: [2.06, 45.40],
    cupD: [6.86, 40.80],
    doorBack: 38.3,
    openDeg: 110,
    source: "Blum, modèle CAO 70T3550.TL (Product Database, fichier 47173013), contrôlé sur le débord "
        + "publié au catalogue KA-150 p. 75",
};
