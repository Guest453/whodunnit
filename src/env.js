// env.js — the mansion shell for the Whodunnit 3D scene.
//
// Everything here is procedural: box / plane / cylinder primitives plus textures
// painted onto <canvas> elements. No external assets, no network, no timers.
// Grid: XZ plane, Y is up, the floor sits at y = 0.
//
// Footprint is x ∈ [-14, 14], z ∈ [-14, 14] (wall thickness 0.3):
//
//   z = -14  +-----------+--------+-----------+
//            |  library  | conser |   study   |
//            |           | vatory |           |
//   z =  -2  +-----+-----+---+----+-----+-----+
//            |      cellar       |    foyer    |
//            |                   |             |
//   z =  14  +-------------------+-------------+
//          x = -14            x = -4        x = 14
//
// Doorways connect foyer↔conservatory, foyer↔study, foyer↔cellar,
// conservatory↔library and conservatory↔study, so every room is reachable.

export const ROOMS = ["foyer", "library", "study", "conservatory", "cellar"];

// ---------------------------------------------------------------------------
// canvas texture helpers (module scope so they are not re-created per call)
// ---------------------------------------------------------------------------

function cvs(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}

/** Wrap a canvas as an sRGB repeating THREE texture. */
function finish(THREE, canvas, rx, ry) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
}

/** Warm oak floorboards. */
function texFloorWood(THREE) {
    const c = cvs(512, 512);
    const g = c.getContext("2d");
    g.fillStyle = "#4a3220";
    g.fillRect(0, 0, 512, 512);
    const ph = 64;
    for (let row = 0; row < 8; row++) {
        const y = row * ph;
        const off = (row % 2) * 128;
        for (let x = -256 + off; x < 512; x += 256) {
            const s = 0.88 + Math.random() * 0.24;
            g.fillStyle = `rgb(${Math.round(96 * s)},${Math.round(66 * s)},${Math.round(42 * s)})`;
            g.fillRect(x + 2, y + 2, 252, ph - 4);
            g.strokeStyle = "rgba(38,24,14,0.28)";
            g.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                const gy = y + 8 + Math.random() * (ph - 16);
                g.beginPath();
                g.moveTo(x + 4, gy);
                g.bezierCurveTo(x + 90, gy + 3, x + 170, gy - 3, x + 250, gy);
                g.stroke();
            }
        }
    }
    return finish(THREE, c, 3, 3);
}

/** Cool cellar flagstones. */
function texStone(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#3c3a36";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
        const off = (Math.floor(y / 32) % 2) * 32;
        for (let x = -64; x < 256; x += 64) {
            const s = 0.8 + Math.random() * 0.4;
            g.fillStyle = `rgb(${Math.round(104 * s)},${Math.round(98 * s)},${Math.round(88 * s)})`;
            g.fillRect(x + off + 1, y + 1, 62, 30);
        }
    }
    return finish(THREE, c, 4, 4);
}

/** Muted marble checker for the entrance hall. */
function texTile(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    const n = 4;
    const s = 256 / n;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            g.fillStyle = (x + y) % 2 === 0 ? "#2f2b26" : "#c3b79e";
            g.fillRect(x * s, y * s, s, s);
        }
    }
    g.strokeStyle = "rgba(0,0,0,0.22)";
    for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, 256);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * s);
        g.lineTo(256, i * s);
        g.stroke();
    }
    return finish(THREE, c, 6, 5);
}

/** Period wallpaper: soft ochre with faint stripes and damask dots. */
function texWallpaper(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#655439";
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
        g.fillStyle = (x / 16) % 2 ? "rgba(255,238,205,0.06)" : "rgba(0,0,0,0.06)";
        g.fillRect(x, 0, 8, 256);
    }
    g.fillStyle = "rgba(214,184,132,0.12)";
    for (let y = 16; y < 256; y += 48) {
        for (let x = 16; x < 256; x += 48) {
            g.beginPath();
            g.arc(x, y, 4, 0, Math.PI * 2);
            g.fill();
        }
    }
    return finish(THREE, c, 4, 2);
}

/** Warm plaster for ceilings. */
function texPlaster(THREE) {
    const c = cvs(128, 128);
    const g = c.getContext("2d");
    g.fillStyle = "#b7ac93";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
        const v = Math.random() < 0.5 ? 255 : 0;
        g.fillStyle = `rgba(${v},${v},${v},0.03)`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    return finish(THREE, c, 2, 2);
}

/** Dark furniture timber. */
function texWood(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#3f2a18";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(26,15,8,0.5)";
    g.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
        const y = Math.random() * 256;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(85, y + 4, 170, y - 4, 256, y);
        g.stroke();
    }
    return finish(THREE, c, 2, 2);
}

/** A single soft golden dot — dust motes and flame glows. */
function texDot(THREE) {
    const c = cvs(64, 64);
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,242,214,0.95)");
    grd.addColorStop(0.4, "rgba(255,220,160,0.35)");
    grd.addColorStop(1, "rgba(255,220,160,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** Night sky for the dome above the open-roofed conservatory. */
function texSky(THREE) {
    const c = cvs(1024, 512);
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#05060f");
    grd.addColorStop(0.55, "#0b1430");
    grd.addColorStop(1, "#1b2440");
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 420; i++) {
        g.fillStyle = `rgba(255,255,235,${0.35 + Math.random() * 0.6})`;
        g.beginPath();
        g.arc(Math.random() * 1024, Math.random() * 300, Math.random() * 1.3 + 0.2, 0, Math.PI * 2);
        g.fill();
    }
    const mg = g.createRadialGradient(760, 120, 4, 760, 120, 92);
    mg.addColorStop(0, "rgba(240,242,255,0.95)");
    mg.addColorStop(0.2, "rgba(200,215,255,0.45)");
    mg.addColorStop(1, "rgba(120,150,220,0)");
    g.fillStyle = mg;
    g.beginPath();
    g.arc(760, 120, 92, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#eef2ff";
    g.beginPath();
    g.arc(760, 120, 26, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// ---------------------------------------------------------------------------

/**
 * Build the mansion into `scene` and return the frozen interface described in
 * contract.md.
 * @param {import("three").Scene} scene
 * @param {typeof import("three")} THREE
 */
export function buildEnvironment(scene, THREE) {
    // ---- tuning constants -------------------------------------------------
    const T = 0.3;          // wall thickness
    const WALL_H = 3.6;     // wall height
    const DOOR_W = 2.4;     // doorway width (player is ~0.35 radius)
    const DOOR_H = 2.35;    // doorway height
    const FLOOR_Y = 0.01;   // floors sit just above y = 0

    const group = new THREE.Group();
    group.name = "environment";
    scene.add(group);

    const colliders = [];
    const geoSet = new Set();
    const matSet = new Set();
    const texSet = new Set();
    const lights = [];
    const flames = [];
    const flickers = [];

    // Track GPU resources so dispose() can free everything exactly once.
    function register(geo, mat) {
        if (geo) geoSet.add(geo);
        if (mat) {
            matSet.add(mat);
            for (const key of ["map", "emissiveMap", "alphaMap", "roughnessMap", "normalMap"]) {
                if (mat[key]) texSet.add(mat[key]);
            }
        }
    }

    // ---- materials --------------------------------------------------------
    const matFloorWood = new THREE.MeshStandardMaterial({ map: texFloorWood(THREE), roughness: 0.85 });
    const matFloorStone = new THREE.MeshStandardMaterial({ map: texStone(THREE), roughness: 0.95 });
    const matFloorTile = new THREE.MeshStandardMaterial({ map: texTile(THREE), roughness: 0.6, metalness: 0.05 });
    const matWall = new THREE.MeshStandardMaterial({ map: texWallpaper(THREE), roughness: 0.95 });
    const matStone = new THREE.MeshStandardMaterial({ map: texStone(THREE), roughness: 0.98, color: 0xbfb6a8 });
    const matPlaster = new THREE.MeshStandardMaterial({ map: texPlaster(THREE), roughness: 1.0 });
    const matWood = new THREE.MeshStandardMaterial({ map: texWood(THREE), roughness: 0.7 });
    const matWoodLight = new THREE.MeshStandardMaterial({ map: texWood(THREE), color: 0xd8b483, roughness: 0.7 });
    const matBrass = new THREE.MeshStandardMaterial({ color: 0xb08d4a, metalness: 0.85, roughness: 0.35 });
    const matWax = new THREE.MeshStandardMaterial({ color: 0xf0e6c8, roughness: 0.8 });
    const matShade = new THREE.MeshStandardMaterial({
        color: 0xe8d9b0, emissive: 0xffcf8a, emissiveIntensity: 0.4,
        side: THREE.DoubleSide, roughness: 0.9,
    });
    const matFlame = new THREE.MeshStandardMaterial({
        color: 0xffcf7a, emissive: 0xff9a2e, emissiveIntensity: 1.8, roughness: 0.6,
    });
    const matLeaf = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.9 });
    const matSoil = new THREE.MeshStandardMaterial({ color: 0x2e2419, roughness: 1.0 });
    const matGlass = new THREE.MeshStandardMaterial({
        color: 0x9fc4d8, transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.0,
    });
    const matNightPane = new THREE.MeshStandardMaterial({
        color: 0x0b1430, emissive: 0x2a3f6e, emissiveIntensity: 0.7, roughness: 0.4,
    });

    // ---- primitive helpers ------------------------------------------------
    /** A collidable (by default) box centred at (cx, cz) with its base at y - h/2. */
    function solid(cx, cz, w, d, h, y, mat, collide = true, cast = true) {
        const geo = new THREE.BoxGeometry(w, h, d);
        register(geo, mat);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(cx, y, cz);
        m.castShadow = cast;
        m.receiveShadow = true;
        group.add(m);
        if (collide) colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        return m;
    }

    /** A horizontal plane; up=true for floors, up=false for ceilings. */
    function plane(cx, cz, w, d, y, mat, up = true) {
        const geo = new THREE.PlaneGeometry(w, d);
        register(geo, mat);
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
        m.position.set(cx, y, cz);
        m.receiveShadow = true;
        group.add(m);
        return m;
    }

    // Split an axis range [a,b] into the spans left between doorway gaps.
    function carve(a, b, doors) {
        const cuts = doors.map(([c, w]) => [c - w / 2, c + w / 2]).sort((p, q) => p[0] - q[0]);
        const spans = [];
        let cur = a;
        for (const [s, e] of cuts) {
            const cs = Math.max(s, a);
            const ce = Math.min(e, b);
            if (ce <= cur) continue;
            if (cs > cur) spans.push([cur, cs]);
            cur = Math.max(cur, ce);
        }
        if (cur < b) spans.push([cur, b]);
        return spans;
    }

    // A wall running along X at fixed z, with doorways and lintels.
    function wallX(z, x0, x1, doors, mat, h = WALL_H) {
        for (const [a, b] of carve(x0, x1, doors)) {
            if (b - a > 0.02) solid((a + b) / 2, z, b - a, T, h, h / 2, mat);
        }
        for (const [c, w] of doors) {
            solid(c, z, w, T, WALL_H - DOOR_H, DOOR_H + (WALL_H - DOOR_H) / 2, mat, false);
        }
    }

    // A wall running along Z at fixed x, with doorways and lintels.
    function wallZ(x, z0, z1, doors, mat, h = WALL_H) {
        for (const [a, b] of carve(z0, z1, doors)) {
            if (b - a > 0.02) solid(x, (a + b) / 2, T, b - a, h, h / 2, mat);
        }
        for (const [c, w] of doors) {
            solid(x, c, T, w, WALL_H - DOOR_H, DOOR_H + (WALL_H - DOOR_H) / 2, mat, false);
        }
    }

    // ---- floors -----------------------------------------------------------
    plane(5, 6, 18, 16, FLOOR_Y, matFloorTile);        // foyer (checker)
    plane(-9, -8, 10, 12, FLOOR_Y, matFloorWood);      // library
    plane(9, -8, 10, 12, FLOOR_Y, matFloorWood);       // study
    plane(0, -8, 8, 12, FLOOR_Y, matFloorTile);        // conservatory
    plane(-9, 6, 10, 16, FLOOR_Y, matFloorStone);      // cellar

    // ---- ceilings (conservatory stays open to the sky) --------------------
    plane(5, 6, 18, 16, WALL_H, matPlaster, false);
    plane(-9, -8, 10, 12, 3.2, matPlaster, false);
    plane(9, -8, 10, 12, 3.2, matPlaster, false);
    plane(-9, 6, 10, 16, 2.6, matPlaster, false);      // low cellar ceiling

    // ---- outer walls ------------------------------------------------------
    wallX(14, -14, -4, [], matStone);                  // cellar south
    wallX(14, -4, 14, [], matWall);                    // foyer south
    wallZ(-14, -14, -2, [], matWall);                  // library west
    wallZ(-14, -2, 14, [], matStone);                  // cellar west
    wallZ(14, -14, -2, [], matWall);                   // study east
    wallZ(14, -2, 14, [], matWall);                    // foyer east
    wallX(-14, -14, -4, [], matWall);                  // library north
    wallX(-14, -4, 4, [], matGlass);                   // conservatory north (glass)
    wallX(-14, 4, 14, [], matWall);                    // study north

    // ---- interior walls + doorways ---------------------------------------
    wallX(-2, -14, 14, [[-9, DOOR_W], [0, DOOR_W], [9, DOOR_W]], matWall);
    wallZ(-4, -14, -2, [[-8, DOOR_W]], matWall);       // library | conservatory
    wallZ(4, -14, -2, [[-8, DOOR_W]], matWall);        // conservatory | study
    wallZ(-4, -2, 14, [[6, DOOR_W]], matStone);        // cellar | foyer

    // ---- windows (decorative; the wall already collides) ------------------
    function windowOnWall(x, z, axis, dir) {
        const w = 1.8;
        const h = 1.9;
        const y = 1.0 + h / 2;
        if (axis === "x") {
            solid(x, z, w, 0.1, h, y, matWood, false);
            solid(x, z + dir * 0.04, w - 0.24, 0.06, h - 0.24, y, matNightPane, false, false);
            solid(x, z + dir * 0.05, 0.09, 0.06, h - 0.24, y, matWood, false);
            solid(x, z + dir * 0.05, w - 0.24, 0.06, 0.09, y, matWood, false);
        } else {
            solid(x, z, 0.1, w, h, y, matWood, false);
            solid(x + dir * 0.04, z, 0.06, w - 0.24, h - 0.24, y, matNightPane, false, false);
            solid(x + dir * 0.05, z, 0.06, 0.09, h - 0.24, y, matWood, false);
            solid(x + dir * 0.05, z, 0.06, w - 0.24, 0.09, y, matWood, false);
        }
    }
    windowOnWall(-9, 14, "x", -1);   // cellar south
    windowOnWall(2, 14, "x", -1);    // foyer south
    windowOnWall(9, 14, "x", -1);
    windowOnWall(-14, -8, "z", 1);   // library west
    windowOnWall(-14, 2, "z", 1);    // cellar west
    windowOnWall(-14, 9, "z", 1);
    windowOnWall(14, -8, "z", -1);   // study east
    windowOnWall(14, 6, "z", -1);    // foyer east
    windowOnWall(-9, -14, "x", 1);   // library north
    windowOnWall(9, -14, "x", 1);    // study north

    // Front door on the foyer's south wall (visual only).
    solid(2, 13.82, 2.8, 0.12, 2.5, 1.25, matWood, false);

    // ---- furniture (large pieces also become colliders) -------------------
    function table(cx, cz, w, d, h, mat) {
        solid(cx, cz, w, d, 0.1, h - 0.05, mat, false);            // top
        const lx = w / 2 - 0.14;
        const lz = d / 2 - 0.14;
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                solid(cx + sx * lx, cz + sz * lz, 0.12, 0.12, h - 0.1, (h - 0.1) / 2, mat, false);
            }
        }
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }

    function shelf(cx, cz, w, d, h, mat) {
        const m = solid(cx, cz, w, d, h, h / 2, mat);
        // lighter shelf lips so the box reads as a bookcase
        const along = w > d;
        for (let i = 1; i < 4; i++) {
            const y = (h / 4) * i;
            solid(cx, cz, along ? w + 0.04 : w, along ? d + 0.04 : d, 0.05, y, matWoodLight, false, false);
        }
        return m;
    }

    function plant(cx, cz, s = 1) {
        const potGeo = new THREE.CylinderGeometry(0.26 * s, 0.2 * s, 0.42 * s, 10);
        register(potGeo, matWood);
        const pot = new THREE.Mesh(potGeo, matWood);
        pot.position.set(cx, 0.21 * s, cz);
        pot.castShadow = true;
        pot.receiveShadow = true;
        group.add(pot);
        const leafGeo = new THREE.SphereGeometry(0.3 * s, 10, 8);
        register(leafGeo, matLeaf);
        for (let i = 0; i < 4; i++) {
            const leaf = new THREE.Mesh(leafGeo, matLeaf);
            leaf.position.set(
                cx + (Math.random() - 0.5) * 0.4 * s,
                0.5 * s + Math.random() * 0.5 * s,
                cz + (Math.random() - 0.5) * 0.4 * s,
            );
            leaf.scale.set(1, 1.25, 1);
            leaf.castShadow = true;
            group.add(leaf);
        }
    }

    function planter(cx, cz, w, d) {
        solid(cx, cz, w, 0.5, 0.55, 0.275, matWood);      // trough
        solid(cx, cz, w - 0.2, 0.35, 0.12, 0.6, matSoil, false, false);
        plant(cx - w / 3, cz, 0.9);
        plant(cx + w / 3, cz, 1.05);
    }

    // library
    table(-9, -8, 4.2, 1.6, 0.78, matWood);
    shelf(-12.5, -13.4, 3, 0.5, 2.6, matWoodLight);
    shelf(-6.5, -13.4, 3, 0.5, 2.6, matWoodLight);
    // study
    table(9, -9, 3, 1.6, 0.8, matWood);
    shelf(13.4, -8, 0.5, 4, 2.6, matWoodLight);
    // conservatory
    planter(-2.6, -12.6, 2.4, 1.1);
    planter(2.6, -12.6, 2.4, 1.1);
    // foyer
    table(8, 13.4, 3, 0.6, 0.9, matWood);
    // cellar
    shelf(-13.4, 0, 0.5, 5, 2.2, matWood);
    shelf(-13.4, 7, 0.5, 5, 2.2, matWood);
    solid(-6, 10, 1.2, 1.2, 1.2, 0.6, matWood);
    solid(-4.7, 10.6, 0.9, 0.9, 0.9, 0.45, matWood);

    // ---- lighting ---------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0x54688c, 0x2a2118, 0.55);
    group.add(hemi);

    // A cool moon through the conservatory roof, casting a soft directional shadow.
    const moon = new THREE.DirectionalLight(0x9db4e8, 0.55);
    moon.position.set(26, 34, -18);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -22;
    moon.shadow.camera.right = 22;
    moon.shadow.camera.top = 22;
    moon.shadow.camera.bottom = -22;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 120;
    moon.shadow.bias = -0.0015;
    group.add(moon);
    lights.push(moon);

    function point(color, intensity, distance, pos, { shadow = false, decay = 1.0 } = {}) {
        const l = new THREE.PointLight(color, intensity, distance, decay);
        l.position.set(pos[0], pos[1], pos[2]);
        if (shadow) {
            l.castShadow = true;
            l.shadow.mapSize.set(1024, 1024);
            l.shadow.bias = -0.002;
            l.shadow.radius = 4;
            l.shadow.camera.near = 0.2;
            l.shadow.camera.far = distance || 20;
        }
        group.add(l);
        lights.push(l);
        return l;
    }

    // Room lights (four cast soft shadows).
    const chandelierLight = point(0xffd9a0, 14, 26, [5, 3.1, 5], { shadow: true });
    point(0xffc98a, 9, 14, [-9, 1.75, -8], { shadow: true });    // library lamp
    point(0xffc98a, 9, 14, [9, 1.75, -9], { shadow: true });     // study lamp
    point(0xffb060, 7, 12, [-9, 2.2, 6], { shadow: true });      // cellar lantern
    point(0x9fc0ff, 6, 16, [0, 3.0, -8], {});                    // conservatory moonlight

    function candle(x, y, z, scale = 1) {
        const w = 0.06 * scale;
        const h = 0.3 * scale;
        const cGeo = new THREE.CylinderGeometry(w, w, h, 8);
        register(cGeo, matWax);
        const c = new THREE.Mesh(cGeo, matWax);
        c.position.set(x, y + h / 2, z);
        c.castShadow = true;
        group.add(c);
        const fGeo = new THREE.SphereGeometry(0.06 * scale, 8, 6);
        register(fGeo, matFlame);
        const f = new THREE.Mesh(fGeo, matFlame);
        f.position.set(x, y + h + 0.05 * scale, z);
        f.scale.set(1, 1.5, 1);
        group.add(f);
        flames.push(f);
        const l = point(0xffb060, 3.2, 6, [x, y + h + 0.1, z], { decay: 1.2 });
        flickers.push({ light: l, base: 3.2, phase: Math.random() * 6.28, speed: 9 + Math.random() * 4, flame: f });
        return f;
    }
    candle(-9, 0.78, -7.6);      // library table
    candle(9, 0.8, -8.6);        // study desk
    candle(8, 0.9, 13.2);        // foyer console

    // Main room lights also flicker very gently.
    flickers.push({ light: chandelierLight, base: 14, phase: 1.3, speed: 2.2, flame: null });

    // ---- chandelier, lamps and lantern meshes -----------------------------
    const chandelier = new THREE.Group();
    chandelier.position.set(5, 3.25, 5);
    const chainGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6);
    register(chainGeo, matBrass);
    const chain = new THREE.Mesh(chainGeo, matBrass);
    chain.position.y = 0.18;
    chandelier.add(chain);
    const ringGeo = new THREE.TorusGeometry(1.0, 0.05, 8, 32);
    register(ringGeo, matBrass);
    const ring = new THREE.Mesh(ringGeo, matBrass);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    chandelier.add(ring);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const cx = Math.cos(a) * 1.0;
        const cz = Math.sin(a) * 1.0;
        const cGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.28, 8);
        register(cGeo, matWax);
        const cm = new THREE.Mesh(cGeo, matWax);
        cm.position.set(cx, 0.14, cz);
        chandelier.add(cm);
        const fGeo = new THREE.SphereGeometry(0.06, 8, 6);
        register(fGeo, matFlame);
        const fm = new THREE.Mesh(fGeo, matFlame);
        fm.position.set(cx, 0.34, cz);
        fm.scale.set(1, 1.5, 1);
        chandelier.add(fm);
        flames.push(fm);
    }
    group.add(chandelier);

    function floorLamp(x, z, h) {
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, h, 8);
        register(poleGeo, matBrass);
        const pole = new THREE.Mesh(poleGeo, matBrass);
        pole.position.set(x, h / 2, z);
        pole.castShadow = true;
        group.add(pole);
        const shadeGeo = new THREE.CylinderGeometry(0.28, 0.4, 0.42, 14, 1, true);
        register(shadeGeo, matShade);
        const shade = new THREE.Mesh(shadeGeo, matShade);
        shade.position.set(x, h, z);
        group.add(shade);
    }
    floorLamp(-9, -8.9, 1.55);
    floorLamp(9, -9.9, 1.55);

    // Cellar lantern: a small emissive box hanging from the low ceiling.
    const lant = new THREE.Group();
    lant.position.set(-9, 2.2, 6);
    const lantGeo = new THREE.BoxGeometry(0.34, 0.44, 0.34);
    register(lantGeo, matShade);
    lant.add(new THREE.Mesh(lantGeo, matShade));
    const lantTopGeo = new THREE.ConeGeometry(0.26, 0.18, 4);
    register(lantTopGeo, matBrass);
    const lantTop = new THREE.Mesh(lantTopGeo, matBrass);
    lantTop.position.y = 0.3;
    lantTop.rotation.y = Math.PI / 4;
    lant.add(lantTop);
    group.add(lant);

    // ---- sky dome + dust --------------------------------------------------
    const skyGeo = new THREE.SphereGeometry(60, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: texSky(THREE), side: THREE.BackSide, fog: false });
    register(skyGeo, skyMat);
    texSet.add(skyMat.map);
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(0, 0, 0);
    group.add(sky);

    const dustCount = 260;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
        dustPos[i * 3] = -3 + Math.random() * 16;
        dustPos[i * 3 + 1] = 0.3 + Math.random() * 3.0;
        dustPos[i * 3 + 2] = -1 + Math.random() * 14;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
        size: 0.06, map: texDot(THREE), color: 0xffe6b0, transparent: true,
        opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    register(dustGeo, dustMat);
    texSet.add(dustMat.map);
    const dust = new THREE.Points(dustGeo, dustMat);
    group.add(dust);

    // ---- data records -----------------------------------------------------
    const rooms = {
        foyer: { center: [5, 6], size: [18, 16] },
        library: { center: [-9, -8], size: [10, 12] },
        study: { center: [9, -8], size: [10, 12] },
        conservatory: { center: [0, -8], size: [8, 12] },
        cellar: { center: [-9, 6], size: [10, 16] },
    };

    // One clear standing spot per room, facing into the space.
    const anchors = {
        foyer: { position: [2, 0, 4], facing: 0 },
        library: { position: [-9, 0, -4.5], facing: 0 },
        study: { position: [9, 0, -4.5], facing: 0 },
        conservatory: { position: [0, 0, -6], facing: Math.PI },
        cellar: { position: [-9, 0, 8], facing: 0 },
    };

    // Start in the foyer near the front door, looking north into the house.
    const spawn = { position: [2, 0, 11], yaw: 0 };

    // ---- per-frame animation ---------------------------------------------
    let time = 0;
    function update(dt) {
        time += dt;
        for (const f of flickers) {
            const n = Math.sin(time * f.speed + f.phase) * 0.5 +
                Math.sin(time * f.speed * 2.3 + f.phase * 1.7) * 0.5;
            f.light.intensity = f.base * (1 + n * 0.14);
            if (f.flame) f.flame.scale.set(1 + n * 0.14, 1.5 + n * 0.2, 1 + n * 0.14);
        }
        // a barely-there sway on the chandelier
        chandelier.rotation.z = Math.sin(time * 0.6) * 0.012;
        chandelier.rotation.x = Math.cos(time * 0.43) * 0.008;
        // dust drifts slowly through the hall
        dust.rotation.y = time * 0.015;
        dust.position.y = Math.sin(time * 0.2) * 0.15;
    }

    // ---- teardown ---------------------------------------------------------
    function dispose() {
        scene.remove(group);
        for (const l of lights) {
            if (typeof l.dispose === "function") l.dispose();
        }
        geoSet.forEach((g) => g.dispose());
        matSet.forEach((m) => m.dispose());
        texSet.forEach((t) => t.dispose());
        geoSet.clear();
        matSet.clear();
        texSet.clear();
        lights.length = 0;
        flames.length = 0;
        flickers.length = 0;
        colliders.length = 0;
    }

    return { rooms, anchors, colliders, spawn, update, dispose };
}
