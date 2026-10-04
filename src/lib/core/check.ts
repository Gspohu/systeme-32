// What every checker hands back to the analysis : a level, the item and part it is about, a message

export type Level = "error" | "warning" | "info";

export interface Check
{
    level: Level;
    item: string | null;
    target: string | null;
    message: string;
}
