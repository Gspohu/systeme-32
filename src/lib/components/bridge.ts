// The front view registers its SVG heer so drops coming from the palette can find world coordinates

export const facadeBridge: { svg: SVGSVGElement | null } = { svg: null };


export function clientToWorld(clientX: number, clientY: number): [number, number] | null 
{
    const svg = facadeBridge.svg;
    if (svg === null)
    {
        return null;
    }
    const r = svg.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom)
    {
        return null;
    }
    const m = svg.getScreenCTM();
    if (m === null)
    {
        return null;
    }
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    // the view draws world y upward as svg -y
    return [pt.x, -pt.y];
}
