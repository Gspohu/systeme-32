// What the interface shows of a project at all times : analysis, bills, nesting and cost

import type { Project } from "./model";
import { analyse, type Analysis } from "./analysis";
import { computeBom, type Bom } from "./bom";
import { nest, type NestResult } from "./nesting";
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
    const nesting = nest(bom.cut, p.settings);
    const cost = computeCost(p, bom, nesting);
    return { analysis, bom, nesting, cost };
}
