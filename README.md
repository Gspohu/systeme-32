# systeme-32

Design made-to-measure furniture in the browser, see it in 3D as you build it, and hand the cabinetmaker a complete workshop package : dimensioned drawings, cut list, hardware list, sheet nesting, a PBS and one DXF per workpiece. Everything runs on the client, offline once installed.

The name comes from the 32 mm boring system that the whole layout snaps to, so hinges, runners and shelf supports land on standard hole rows.

## What it does

- **Drag and drop, finger or mouse** : carcasses, fixed shelves, adjustable shelves, uprights, doors, double doors, drawers, sliding leaves, niche linings, rounded ends, quarter-round corners, wall shelves and hanging boxes.
- **Move anything** : drag a drawer front onto a door and the two swap. Turn a door into a sliding leaf from the inspector. Put one door over several cells by selecting their parent zone.
- **Real decors** : Egger H1180 ST37 Halifax oak, U604 ST9 eucalyptus green, W1000 ST9 premium white, free lacquer colours with their RAL or NCS name.
- **Manufacturing checks while you draw** : hinge count from the Blum chart, cup distance TB, mniimum front gaps, MOVENTO runner lenght and load, TIP-ON sets, SlideLine M limits, panel siez against a 2800 x 2070 sheet, shelf deflection, weight of every part against the carrying limit, foot and suspension loads, tipping, overlaps, TV fit.
- **Workshop package** : A3 PDF drawings (cover with legend and sources, composition, item views, one sheet per workpiece with every hole coordinate), CSV cut list and hardware list, nesting sheets, PBS JSON that loads in Free-pbs, DXF R12 per workpiece with machining sorted in layers.
- **Saving** : automatic in the browser (IndexedDB), and as a `.zip` project file on the computer or tablet, shared through the system sheet on Android.

## Sources

Every hardware reference and limit comes from the manufacturer document named next to it in `src/lib/data/` :

- Blum, catalogue et manuel de mise en oeuvre 2022/2023 (KA-150) : CLIP top BLUMOTION hinges, plates, hinge chart, MOVENTO, TIP-ON, TIP-ON BLUMOTION, suspension fittings
- Hettich, SlideLine M brochure (2017) : sliding kits, profiles, door weight tables
- Häfele U.K., Furniture Fittings Technology (2018) : Minifix 15, AXILO 78 feet and plinth clips, 5 mm shelf supports
- Lamello, Clamex P-14 and P-System documents
- Egger Eurospan E1 P2 technical data sheet (2023) and Isoroy MEDIUM data sheet (2014) for board properties
- EN 1995-1-1:2004 table 3.2 thruogh the COFORD Eurocode 5 handbook for creep, UNI 11663 with the EN 16122:2012 method (CATAS table) for the 0.5 % shelf deflection limit
- Code du travail R4541-9 for the carrying limits

## Honest limits

- A few workshop conventions are not from any manufacturer : connector spacing, dowel hole depths, shelf pin depth, shelf clearance, hinge distance from the door edge, drawer box sides in 16 mm. They are listed on the cover sheet and editable in the settings.
- The flexible MDF minimum radii (150 mm for 6 mm, 200 mm for 9 mm) come from distributors, the manufacturer data sheet was not found : test on an offcut.
- The screw positions of screw-on hinge cups, one rear runner screw on long MOVENTO runners, the cross position of the TIP-ON hole and the Clamex lever access are not dimensioned in the catalogues : the drawings refer to the manufacturer instructions instead of guessing.
- The concealed fixing of wal shelves and an anti-tip wall bracket are not sourced yet.  
- Tipping is a static calculation, not the EN 14749:2016+A1:2022 test.
- Only two panel prices are prefilled, read on a French retailer on 29 September 2026. Every other line of the estimate stays empty until you enter a price.
- The layout is a guillotine split tree : a pinwheel arrangement where no cut runs across can't be drawn.

## Hosting

The build is a static site. The GitHub workflow and the GitLab CI file both run the tests, build with the right base path and publish the pages.

```sh
npm install
npm test
BASE_PATH=/my-repository npm run build   # output in build/
```

## Development

```sh
npm run dev      # local server
npm run check    # svelte-check and TypeScript
npm test         # vitest : layout, commands, Blum and Hettich rules, mechanics, nesting, PDF and DXF packages
```

- `src/lib/core` : the domain, it never imports the interface
- `src/lib/data` : the souced reference data
- `src/lib/components` and `src/routes` : the SvelteKit interface
- `src/lib/storage` : the browser storage
- `src/lib/view3d` : the three.js geometry

## Licence

GPL-3.0-or-later, see `LICENCE`.
