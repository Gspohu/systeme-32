// Values red off the form control that fired an event

export function num(e: Event): number
{
    return Number((e.currentTarget as HTMLInputElement).value);
}


export function str(e: Event): string
{
    return (e.currentTarget as HTMLInputElement | HTMLSelectElement).value;
}


export function checked(e: Event): boolean
{
    return (e.currentTarget as HTMLInputElement).checked;
}
