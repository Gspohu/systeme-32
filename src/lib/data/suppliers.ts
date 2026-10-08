// Merchants the default prices are read from : the name their sources carry and where they hsip from, null when
// not verified. A merchant outside the EU adds import VAT and the carrier's handling fee

export interface Supplier
{
    name: string;
    country: string | null;
    eu: boolean | null;
    // how the country is known
    why: string;
}


export const SUPPLIERS: Supplier[] = [
    { name: "Interfit", country: "Royaume-Uni", eu: false, why: "'Interfit (UK)' dans la source du prix" },
    { name: "Swansea Timber", country: "Royaume-Uni", eu: false, why: "'Swansea Timber (UK)' dans la source du prix" },
    { name: "Home Decor Hardware", country: "États-Unis", eu: false,
      why: "'Home Decor Hardware (US)' dans la source du prix" },
    { name: "Monastil", country: "Espagne", eu: true, why: "'Monastil (Espagne)' dans la source du prix" },
    { name: "Intar", country: "Pologne", eu: true, why: "'Intar (Pologne)' dans la source du prix" },
    { name: "Alternate", country: "Allemagne", eu: true,
      why: "ALTERNATE GmbH, Linden, mentions légales d'alternate.de lues le 8 octobre 2026" },
    { name: "Houdard", country: "France", eu: true, why: "site français, prix TTC en France" },
    { name: "Jean Hue & Socoda", country: "France", eu: true, why: "site français, prix TTC en France" },
    { name: "Barillet", country: "France", eu: true, why: "barillet-distribution.fr, agences en France" },
    { name: "Brico Dépôt", country: "France", eu: true, why: "bricodepot.fr, magasins en France" }, 
    { name: "Ledkia", country: null, eu: null, why: "pays non vérifié : aucune mention légale trouvée" },
    { name: "DimensionShop", country: null, eu: null, why: "pays non vérifié : aucune mention légale trouvée" },
];


// douane.gouv.fr, "Acheter en ligne au Royaume-Uni après le Brexit", page du 19/08/2026 lue par le fabricant
export const IMPORT_NOTE = "TVA à l'import, le plus souvent 20 %, et frais de dossier du transporteur (douane.gouv.fr), "
    + "non comptés";

// Code général des impôts, article 278 : the standard rate
export const VAT_RATE = 0.2;
