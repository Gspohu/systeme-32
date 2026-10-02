// The colour a white LED of a given colour temperature gives, for the light it casts in the 3D view

// Tanner Helland's fit of the black body colours (2012), good from 1000 to 40000 K : red stays full up to
// 6600 K, green and blue climb with the temperature. Returns 0 to 1 per channel
export function kelvinColour(kelvin: number): [number, number, number]
{
    const t = kelvin / 100;
    const clamp = (x: number): number =>
    {
        return Math.min(255, Math.max(0, x)) / 255;
    };
    const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
    const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
    let blue = 255;
    if (t < 66)
    {
        blue = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    }
    return [clamp(red), clamp(green), clamp(blue)];
}
