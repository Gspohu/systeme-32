import { describe, expect, it } from "vitest";
import { addItem, setScreen, setSettings } from "./commands";
import { newCarcass, newProject } from "./factory";
import { analyse } from "./analysis";
import { tvWall } from "./templates";
import { armChecks, armPose, screenSpots } from "./tv_arm";
import { migrate, packProject, unpackProject, validateProject } from "./io/project_file";
import type { Project, Screen, ScreenArm } from "./model";

// the set of Gilles at Haguenau on its wall arm, the figures of the template
function withArm(screen: Partial<Screen> = {}, arm: Partial<ScreenArm> = {}): Project
{
    const p = tvWall();
    return setScreen(p, { ...p.screen!, ...screen, arm: { ...p.screen!.arm!, ...arm } });
}

function said(p: Project): string
{
    return armChecks(p).map((k) =>
    {
        return `${k.level} ${k.message}`;
    }).join("\n");
}


describe("a screen on a wall arm", () =>
{
    it("leaves the TV template without a fabrication error, put away and swung out", () =>
    {
        const p = tvWall();
        expect(screenSpots(p.screen!).map((s) =>
        {
            return [s.label, s.cx];
        })).toEqual([["rangé", 1112], ["sorti", 940]]);
        expect(armChecks(p)).toEqual([]);
        expect(analyse(p).checks.filter((k) =>
        {
            return k.level === "error";
        })).toEqual([]);
    });

    it("refuses a set heavier than the arm, or with holes its plate does not take", () =>
    {
        expect(said(withArm({ massKg: 31 }))).toMatch(/^error .*31 kg pour 30 kg admis/m);
        expect(said(withArm({ vesa: [300, 300] }))).toMatch(/^error .*VESA 300 x 300 .*absent de sa platine/m);
        expect(said(withArm({ massKg: null, vesa: null }))).toMatch(/^info .*poids de l'écran inconnu[\s\S]*^info .*VESA/m);
    });

    it("says when the arm cannot reach where the screen is swung, or fold as close as it is put away", () =>
    {
        expect(said(withArm({}, { out: { cx: 600, z: 400 } }))).toMatch(/^error Écran sorti à \d+ mm de la platine.*393/m);
        expect(said(withArm({ z: 60 }))).toMatch(/^error Écran rangé à 30 mm du mur.*replié en tient 49/m);
    });

    it("warns when the plate is not at the height the arm carries the screen", () =>
    {
        expect(said(withArm({}, { y: 1200 }))).toMatch(/^warning .*centre de l'écran à 896 mm du sol, platine à 1200/m);
    });

    it("asks a reinforcement on a plasterboard partition past the limits of NF DTU 25.41", () =>
    {
        // 32 kg hang 31.4 daN, past the 30 daN a plain board takes
        const heavy = setSettings(withArm({ massKg: 32 }, { maxKg: 45 }), { wallType: "plasterboard" });
        expect(said(heavy)).toMatch(/^error .*plaque de plâtre.*Poser la platine sur un renfort bois/m);
        expect(said(setSettings(tvWall(), { wallType: "plasterboard" }))).toBe("");
    });

    it("slides the screen from where it is put away to where it is swung, and leaves a plain one in place", () =>
    {
        const sc = tvWall().screen!;
        expect(armPose(sc, 0)).toMatchObject({ cx: 1112, z: 80, bottom: 664 });
        expect(armPose(sc, 1)).toMatchObject({ cx: 940, z: 250 });
        expect(armPose(sc, 0.5)).toMatchObject({ cx: 1026, z: 165 });
        expect(armPose(sc, 3)).toMatchObject({ cx: 940, z: 250 });
        expect(armPose({ ...sc, arm: null }, 1)).toMatchObject({ cx: 1112, z: 80 });
    });

    it("checks nothing on an arm whose sheet is still to read", () =>
    {
        const fresh = withArm({}, { maxKg: 0, reachMin: 0, reachMax: 0, vesa: [] });
        expect(armChecks(fresh).map((k) =>
        {
            return k.level;
        })).toEqual(["info"]);
    });

    it("finds a carcass in the way only where the screen is swung out", () =>
    {
        // a 150 deep column of Haguenau right of the left one, the swung screen 220 off the wall cleras it
        const column = newCarcass({ name: "Claustra", width: 250, height: 1260, depth: 150, x: 450, y: 600 });
        const p = addItem(tvWall(), column);
        expect(analyse(p).checks.filter((k) =>
        {
            return k.item === column.id && k.message.includes("écran");
        })).toEqual([]);
        const close = setScreen(p, { ...p.screen!, arm: { ...p.screen!.arm!, out: { cx: 940, z: 120 } } });
        expect(analyse(close).checks.map((k) =>
        {
            return k.message;
        }).join("\n")).toMatch(/L'écran 32" sorti .* touche Claustra/);
    });
});


describe("the screen in the project file", () =>
{
    it("brings a version 9 screen up with an unknown frame, mass and arm", () =>
    {
        const old = { schema: 9, screen: { diagonalInch: 55, aspectW: 16, aspectH: 9, cx: 1000, bottom: 600, z: 100,
                                           wallMounted: false } };
        expect(migrate(old).screen).toMatchObject({ frame: null, massKg: null, vesa: null, source: "", arm: null });
        expect(migrate({ schema: 9 }).screen).toBeNull();
    });

    it("keeps the arm through the file and refuses one that makes no sense", () =>
    {
        const p = tvWall();
        expect(unpackProject(packProject(p, new Map())).project.screen).toEqual(p.screen);
        const broken = structuredClone(p) as unknown as { screen: { arm: { reachMin: number } } };
        broken.screen.arm.reachMin = 500;
        expect(() =>
        {
            return validateProject(broken);
        }).toThrow(/écran mal décrit/);
        expect(() =>
        {
            return setScreen(p, { ...p.screen!, massKg: -7 });
        }).toThrow(/Écran ou bras mal saisi/);
    });
});
