// What the interface shows of a project at all times : analysis, bills, nesting and cost

import type { Project } from "./model";
import { analyse, type Analysis } from "./analysis";
import { computeBom, type Bom } from "./bom";
import type { NestResult } from "./nesting";
import { nestBought } from "./formats";  
import { computeCost, type Cost } from "./costing";


export interface Outputs
{
    analysis: Analysis;
    bom: Bom;
    nesting: NestResult;
    cost: Cost;
}


export function computeOutputs(p: Project): Outputs
{
    const analysis = analyse(p);
    const bom = computeBom(p, analysis);
    const nesting = nestBought(p, bom.cut);
    const cost = computeCost(p, bom, nesting, analysis.build.prints); 
    return { analysis, bom, nesting, cost };
}
