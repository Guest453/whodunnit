// env.js — the map-driven mansion shell for the Whodunnit 3D scene.
//
// Everything here is procedural: box / plane / cylinder primitives plus textures
// painted onto <canvas> elements. No external assets, no network, no timers.
// Grid: XZ plane, Y is up, the floor sits at y = 0.
//
// The layout comes from maps.js. Each room is an axis-aligned rectangle; env.js
// builds the boundary of their union as walls and cuts a doorway wherever two
// rooms share an edge, so the whole house is walkable. Palette, fog and lighting
// all come from `map.palette`.

import { MAPS, ROOMS } from "./maps.js";
export { ROOMS };

// ---------------------------------------------------------------------------
// canvas texture helpers (module scope so they are not re-created per call).
// The surface textures are greyscale: the per-map palette colour multiplies
// them, so one set of textures serves all three houses.
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

/** Greyscale floorboards. */
function texPlanks(THREE) {
    const c = cvs(512, 512);
    const g = c.getContext("2d");
    g.fillStyle = "#b9b3ab";
    g.fillRect(0, 0, 512, 512);
    const ph = 64;
    for (let row = 0; row < 8; row++) {
        const y = row * ph;
        const off = (row % 2) * 128;
        for (let x = -256 + off; x < 512; x += 256) {
            const s = 0.86 + Math.random() * 0.26;
            const v = Math.round(192 * s);
            g.fillStyle = `rgb(${v},${v},${v})`;
            g.fillRect(x + 2, y + 2, 252, ph - 4);
            g.strokeStyle = "rgba(66,60,54,0.30)";
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

/** Greyscale flagstones. */
function texFlag(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#8f8b84";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
        const off = (Math.floor(y / 32) % 2) * 32;
        for (let x = -64; x < 256; x += 64) {
            const s = 0.8 + Math.random() * 0.4;
            const v = Math.round(180 * s);
            g.fillStyle = `rgb(${v},${v},${v})`;
            g.fillRect(x + off + 1, y + 1, 62, 30);
        }
    }
    return finish(THREE, c, 4, 4);
}

/** Greyscale marble checker. */
function texChecker(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    const n = 4;
    const s = 256 / n;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            g.fillStyle = (x + y) % 2 === 0 ? "#6f6f6f" : "#d8d8d8";
            g.fillRect(x * s, y * s, s, s);
        }
    }
    g.strokeStyle = "rgba(30,30,30,0.25)";
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

/** Greyscale period wallpaper: stripes plus faint damask dots. */
function texWallpaper(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#c9c3b8";
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
        g.fillStyle = (x / 16) % 2 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
        g.fillRect(x, 0, 8, 256);
    }
    g.fillStyle = "rgba(255,255,255,0.16)";
    for (let y = 16; y < 256; y += 48) {
        for (let x = 16; x < 256; x += 48) {
            g.beginPath();
            g.arc(x, y, 4, 0, Math.PI * 2);
            g.fill();
        }
    }
    return finish(THREE, c, 4, 2);
}

/** Greyscale plaster for ceilings. */
function texPlaster(THREE) {
    const c = cvs(128, 128);
    const g = c.getContext("2d");
    g.fillStyle = "#c4c4c4";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
        const v = Math.random() < 0.5 ? 255 : 0;
        g.fillStyle = `rgba(${v},${v},${v},0.04)`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    return finish(THREE, c, 2, 2);
}

/** Greyscale timber grain for furniture and trim. */
function texGrain(THREE) {
    const c = cvs(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#b6ac9e";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(60,44,28,0.45)";
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

/** Night sky for the dome outside the windows. */
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
 * Build a house into `scene` and return the frozen interface described in
 * cutscene-contract.md. `map` is a layout from maps.js; it defaults to the first
 * map so existing callers keep working.
 * @param {import("three").Scene} scene
 * @param {typeof import("three")} THREE
 * @param {typeof MAPS[number]} [map]
 */
export function buildEnvironment(scene, THREE, map = MAPS[0]) {
    const layout = map || MAPS[0];
    const P = Object.assign(
        { floor: 0x3a2c22, wall: 0x241b15, ceiling: 0x140f0b, accent: 0x6b4a2f, fog: 0x0b0907, light: 0xffd9a0, lamp: 0xffb060 },
        layout.palette || {},
    );

    // ---- tuning constants -------------------------------------------------
    const T = 0.3;          // wall thickness
    const WALL_H = 3.6;     // wall height
    const DOOR_W = 2.4;     // doorway width (player is ~0.35 radius)
    const DOOR_H = 2.35;    // doorway height
    const FLOOR_Y = 0.01;   // floors sit just above y = 0
    const EPS = 0.001;

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

    // ---- room rectangles --------------------------------------------------
    const rooms = {};
    const rects = {};
    for (const name of ROOMS) {
        const src = layout.rooms[name];
        const [cx, cz] = src.center;
        const [w, d] = src.size;
        rooms[name] = { center: [cx, cz], size: [w, d] };
        rects[name] = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
    }

    // Overall bounds (used for fog, the key light, the sky dome and the dust).
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const name of ROOMS) {
        const r = rects[name];
        minX = Math.min(minX, r.x0); maxX = Math.max(maxX, r.x1);
        minZ = Math.min(minZ, r.z0); maxZ = Math.max(maxZ, r.z1);
    }
    const centreX = (minX + maxX) / 2;
    const centreZ = (minZ + maxZ) / 2;
    const extent = Math.max(maxX - minX, maxZ - minZ);

    // ---- materials (palette-coloured, greyscale-textured) -----------------
    const matFloorWood = new THREE.MeshStandardMaterial({ map: texPlanks(THREE), color: P.floor, roughness: 0.85 });
    const matFloorStone = new THREE.MeshStandardMaterial({ map: texFlag(THREE), color: P.floor, roughness: 0.95 });
    const matFloorTile = new THREE.MeshStandardMaterial({ map: texChecker(THREE), color: P.floor, roughness: 0.6, metalness: 0.05 });
    const matWall = new THREE.MeshStandardMaterial({ map: texWallpaper(THREE), color: P.wall, roughness: 0.95 });
    const matStone = new THREE.MeshStandardMaterial({ map: texFlag(THREE), color: P.wall, roughness: 0.98 });
    const matCeiling = new THREE.MeshStandardMaterial({ map: texPlaster(THREE), color: P.ceiling, roughness: 1.0 });
    const matWood = new THREE.MeshStandardMaterial({ map: texGrain(THREE), color: P.accent, roughness: 0.7 });
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

    // ---- floors and ceilings (one quad per room; they abut exactly) --------
    const floorFor = (name) => (name === "cellar" ? matFloorStone : name === "foyer" ? matFloorTile : matFloorWood);
    for (const name of ROOMS) {
        const r = rects[name];
        const w = r.x1 - r.x0;
        const d = r.z1 - r.z0;
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        plane(cx, cz, w, d, FLOOR_Y, floorFor(name));
        plane(cx, cz, w, d, WALL_H, matCeiling, false);
    }

    // ---- walls: the boundary of the union of the room rectangles ----------
    // For every unique edge line, split it at all room corners and classify
    // each span: one covering room = an exposed wall; two = a shared wall that
    // gets a doorway. This yields doorways between exactly the adjacent rooms.
    const round = (v) => Math.round(v * 1000) / 1000;
    function addEdge(table, key, span) {
        const k = round(key);
        if (!table.has(k)) table.set(k, []);
        table.get(k).push(span);
    }
    const horiz = new Map(); // z -> [x0, x1]
    const vert = new Map();  // x -> [z0, z1]
    for (const name of ROOMS) {
        const r = rects[name];
        addEdge(horiz, r.z0, [r.x0, r.x1]);
        addEdge(horiz, r.z1, [r.x0, r.x1]);
        addEdge(vert, r.x0, [r.z0, r.z1]);
        addEdge(vert, r.x1, [r.z0, r.z1]);
    }

    function uniqueSorted(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const out = [];
        for (const v of sorted) {
            if (!out.length || Math.abs(out[out.length - 1] - v) > EPS) out.push(v);
        }
        return out;
    }

    const wallSegs = [];
    const sharedSegs = [];
    function scan(table, axis) {
        for (const [at, spans] of table) {
            const cuts = uniqueSorted(spans.flat());
            const seen = new Set();
            for (const [lo, hi] of spans) {
                for (let i = 0; i < cuts.length - 1; i++) {
                    const a = cuts[i];
                    const b = cuts[i + 1];
                    if (a < lo - EPS || b > hi + EPS) continue;
                    const key = `${a}:${b}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const mid = (a + b) / 2;
                    const covering = ROOMS.filter((n) => {
                        const r = rects[n];
                        const onEdge = axis === "x"
                            ? (Math.abs(r.z0 - at) < EPS || Math.abs(r.z1 - at) < EPS)
                            : (Math.abs(r.x0 - at) < EPS || Math.abs(r.x1 - at) < EPS);
                        const within = axis === "x" ? (r.x0 <= mid + EPS && r.x1 >= mid - EPS) : (r.z0 <= mid + EPS && r.z1 >= mid - EPS);
                        return onEdge && within;
                    });
                    if (!covering.length) continue;
                    wallSegs.push({ axis, at, a, b });
                    if (covering.length >= 2) sharedSegs.push({ axis, at, a, b, pair: covering.slice(0, 2) });
                }
            }
        }
    }
    scan(horiz, "x");
    scan(vert, "z");

    // Merge contiguous shared spans per room pair and drop a doorway in each.
    const doors = [];
    const byPair = new Map();
    for (const s of sharedSegs) {
        const key = `${s.axis}|${s.at}|${[...s.pair].sort().join("+")}`;
        if (!byPair.has(key)) byPair.set(key, []);
        byPair.get(key).push(s);
    }
    for (const [key, segs] of byPair) {
        segs.sort((p, q) => p.a - q.a);
        const runs = [];
        for (const s of segs) {
            const last = runs[runs.length - 1];
            if (last && Math.abs(last.b - s.a) < EPS) last.b = s.b;
            else runs.push({ a: s.a, b: s.b });
        }
        const [axis, at] = key.split("|");
        for (const run of runs) {
            const len = run.b - run.a;
            if (len < 1.6) continue; // too narrow to walk through
            doors.push({ axis, at: Number(at), center: (run.a + run.b) / 2, width: Math.min(DOOR_W, len - 0.6) });
        }
    }

    // Emit wall pieces, punching the doorways out of them.
    function piecesOf(seg) {
        let pieces = [[seg.a, seg.b]];
        for (const d of doors) {
            if (d.axis !== seg.axis || Math.abs(d.at - seg.at) > EPS) continue;
            const da = d.center - d.width / 2;
            const db = d.center + d.width / 2;
            const next = [];
            for (const [a, b] of pieces) {
                if (db <= a + EPS || da >= b - EPS) { next.push([a, b]); continue; }
                if (da > a + EPS) next.push([a, da]);
                if (db < b - EPS) next.push([db, b]);
            }
            pieces = next;
        }
        return pieces;
    }
    for (const seg of wallSegs) {
        for (const [a, b] of piecesOf(seg)) {
            if (b - a < 0.02) continue;
            if (seg.axis === "x") solid((a + b) / 2, seg.at, b - a, T, WALL_H, WALL_H / 2, matWall);
            else solid(seg.at, (a + b) / 2, T, b - a, WALL_H, WALL_H / 2, matWall);
        }
    }
    // Lintels above each doorway.
    for (const d of doors) {
        const h = WALL_H - DOOR_H;
        if (d.axis === "x") solid(d.center, d.at, d.width, T, h, DOOR_H + h / 2, matWall, false);
        else solid(d.at, d.center, T, d.width, h, DOOR_H + h / 2, matWall, false);
    }

    // ---- windows on the outer extreme walls -------------------------------
    function addWindow(axis, at, centre, dir) {
        const w = 1.8;
        const h = 1.9;
        const y = 1.05 + h / 2;
        if (axis === "x") {
            solid(centre, at, w, 0.12, h, y, matWood, false);
            solid(centre, at + dir * 0.04, w - 0.24, 0.06, h - 0.24, y, matNightPane, false, false);
            solid(centre, at + dir * 0.05, 0.09, 0.06, h - 0.24, y, matWood, false, false);
            solid(centre, at + dir * 0.05, w - 0.24, 0.06, 0.09, y, matWood, false, false);
        } else {
            solid(at, centre, 0.12, w, h, y, matWood, false);
            solid(at + dir * 0.04, centre, 0.06, w - 0.24, h - 0.24, y, matNightPane, false, false);
            solid(at + dir * 0.05, centre, 0.06, 0.09, h - 0.24, y, matWood, false, false);
            solid(at + dir * 0.05, centre, 0.06, w - 0.24, 0.09, y, matWood, false, false);
        }
    }
    for (const seg of wallSegs) {
        if (seg.b - seg.a < 3.2) continue;
        const mid = (seg.a + seg.b) / 2;
        if (seg.axis === "x") {
            if (Math.abs(seg.at - minZ) < EPS) addWindow("x", seg.at, mid, 1);
            else if (Math.abs(seg.at - maxZ) < EPS) addWindow("x", seg.at, mid, -1);
        } else {
            if (Math.abs(seg.at - minX) < EPS) addWindow("z", seg.at, mid, 1);
            else if (Math.abs(seg.at - maxX) < EPS) addWindow("z", seg.at, mid, -1);
        }
    }

    // ---- furniture (a table + cabinet per room, tucked into the corners so
    //      doorways and standing spots stay clear) --------------------------
    function table(cx, cz, w, d, h, mat) {
        solid(cx, cz, w, d, 0.1, h - 0.05, mat, false);
        const lx = w / 2 - 0.14;
        const lz = d / 2 - 0.14;
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                solid(cx + sx * lx, cz + sz * lz, 0.12, 0.12, h - 0.1, (h - 0.1) / 2, mat, false);
            }
        }
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }

    function candle(x, y, z, scale = 1) {
        const w = 0.06 * scale;
        const h = 0.3 * scale;
        const cGeo = new THREE.CylinderGeometry(w, w, h, 8);
        register(cGeo, matWax);
        const cm = new THREE.Mesh(cGeo, matWax);
        cm.position.set(x, y + h / 2, z);
        cm.castShadow = true;
        group.add(cm);
        const fGeo = new THREE.SphereGeometry(0.06 * scale, 8, 6);
        register(fGeo, matFlame);
        const fm = new THREE.Mesh(fGeo, matFlame);
        fm.position.set(x, y + h + 0.05 * scale, z);
        fm.scale.set(1, 1.5, 1);
        group.add(fm);
        flames.push(fm);
        return fm;
    }

    for (const name of ROOMS) {
        const r = rects[name];
        const hw = (r.x1 - r.x0) / 2;
        const hd = (r.z1 - r.z0) / 2;
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const put = (fx, fz) => [cx + fx * hw, cz + fz * hd];

        const [tx, tz] = put(0.5, 0.52);
        table(tx, tz, Math.min(3.0, hw * 0.8), Math.min(1.4, hd * 0.5), 0.78, matWood);

        const [sx, sz] = put(-0.55, -0.5);
        solid(sx, sz, 1.0, 1.0, 1.9, 0.95, matWood); // cabinet
        candle(sx, 1.9, sz, 1.05);
    }

    // Conservatory greenery and cellar crates for a little local flavour.
    if (rooms.conservatory) {
        const r = rects.conservatory;
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const potGeo = new THREE.CylinderGeometry(0.3, 0.24, 0.5, 10);
        register(potGeo, matWood);
        const pot = new THREE.Mesh(potGeo, matWood);
        pot.position.set(cx, 0.25, cz);
        pot.castShadow = true;
        group.add(pot);
        const leafGeo = new THREE.SphereGeometry(0.34, 10, 8);
        register(leafGeo, matLeaf);
        for (let i = 0; i < 4; i++) {
            const leaf = new THREE.Mesh(leafGeo, matLeaf);
            leaf.position.set(cx + (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.5, cz + (Math.random() - 0.5) * 0.4);
            leaf.scale.set(1, 1.25, 1);
            leaf.castShadow = true;
            group.add(leaf);
        }
    }

    // ---- lighting ---------------------------------------------------------
    const hemi = new THREE.HemisphereLight(P.light, P.floor, 0.5);
    group.add(hemi);

    // Warm key light from above, the only directional shadow caster.
    const key = new THREE.DirectionalLight(P.light, 0.5);
    key.position.set(centreX + extent * 0.5, Math.max(30, extent), centreZ - extent * 0.45);
    key.target.position.set(centreX, 0, centreZ);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const shadowR = extent * 0.75 + 6;
    key.shadow.camera.left = -shadowR;
    key.shadow.camera.right = shadowR;
    key.shadow.camera.top = shadowR;
    key.shadow.camera.bottom = -shadowR;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = extent * 3 + 80;
    key.shadow.bias = -0.0015;
    group.add(key);
    group.add(key.target);
    lights.push(key);

    function point(color, intensity, distance, pos, { shadow = false, decay = 1.0 } = {}) {
        const l = new THREE.PointLight(color, intensity, distance, decay);
        l.position.set(pos[0], pos[1], pos[2]);
        if (shadow) {
            l.castShadow = true;
            l.shadow.mapSize.set(512, 512);
            l.shadow.bias = -0.002;
            l.shadow.radius = 4;
            l.shadow.camera.near = 0.2;
            l.shadow.camera.far = distance || 20;
        }
        group.add(l);
        lights.push(l);
        return l;
    }

    // One warm lamp per room; only the foyer's casts a shadow (a few casters,
    // never dozens).
    for (const name of ROOMS) {
        const r = rects[name];
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const span = Math.max(r.x1 - r.x0, r.z1 - r.z0);
        const isHub = name === "foyer";
        const base = isHub ? 13 : 9;
        const l = point(P.light, base, span * 1.6 + 6, [cx, isHub ? 3.1 : 2.7, cz], { shadow: isHub });
        flickers.push({ light: l, base, phase: Math.random() * 6.28, speed: 2 + Math.random() * 1.6, flame: null });
    }

    // ---- chandelier in the foyer -----------------------------------------
    const foyer = rooms.foyer;
    const chandelier = new THREE.Group();
    chandelier.position.set(foyer.center[0], 3.25, foyer.center[1]);
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
        const cGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.28, 8);
        register(cGeo, matWax);
        const cm = new THREE.Mesh(cGeo, matWax);
        cm.position.set(Math.cos(a), 0.14, Math.sin(a));
        chandelier.add(cm);
        const fGeo = new THREE.SphereGeometry(0.06, 8, 6);
        register(fGeo, matFlame);
        const fm = new THREE.Mesh(fGeo, matFlame);
        fm.position.set(Math.cos(a), 0.34, Math.sin(a));
        fm.scale.set(1, 1.5, 1);
        chandelier.add(fm);
        flames.push(fm);
    }
    group.add(chandelier);

    // ---- sky dome + dust --------------------------------------------------
    const skyRadius = Math.max(60, extent * 1.6);
    const skyGeo = new THREE.SphereGeometry(skyRadius, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: texSky(THREE), side: THREE.BackSide, fog: false });
    register(skyGeo, skyMat);
    texSet.add(skyMat.map);
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(centreX, 0, centreZ);
    group.add(sky);

    const dustCount = 220;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
        dustPos[i * 3] = centreX + (Math.random() - 0.5) * extent * 0.9;
        dustPos[i * 3 + 1] = 0.3 + Math.random() * 3.0;
        dustPos[i * 3 + 2] = centreZ + (Math.random() - 0.5) * extent * 0.9;
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

    // ---- fog from the palette ---------------------------------------------
    const fog = new THREE.Fog(P.fog, Math.max(6, extent * 0.35), extent * 1.8 + 20);
    scene.fog = fog;

    // ---- anchors, spawn ---------------------------------------------------
    // People face the foyer (the hub); the foyer faces the rest of the house.
    const hub = foyer.center;
    const rest = ROOMS.filter((n) => n !== "foyer").map((n) => rooms[n].center);
    let restX = 0;
    let restZ = 0;
    for (const c of rest) { restX += c[0]; restZ += c[1]; }
    restX /= rest.length || 1;
    restZ /= rest.length || 1;

    const yawToward = (ax, az, bx, bz) => {
        const dx = bx - ax;
        const dz = bz - az;
        if (Math.hypot(dx, dz) < 1e-4) return 0;
        return Math.atan2(-dx, -dz); // forward is -Z at yaw 0
    };

    const anchors = {};
    for (const name of ROOMS) {
        const r = rooms[name];
        const [cx, cz] = r.center;
        let px = cx;
        let pz = cz;
        let target = hub;
        if (name === "foyer") {
            target = [restX, restZ];
        } else {
            // Shift the standing spot a little toward the hub, toward the door.
            const dx = hub[0] - cx;
            const dz = hub[1] - cz;
            const len = Math.hypot(dx, dz) || 1;
            const shift = 0.15 * Math.min(r.size[0], r.size[1]) / 2;
            px = cx + (dx / len) * shift;
            pz = cz + (dz / len) * shift;
        }
        anchors[name] = { position: [round(px), 0, round(pz)], facing: yawToward(px, pz, target[0], target[1]) };
    }

    // Spawn near the foyer's outer edge, looking into the house.
    let ox = foyer.center[0] - restX;
    let oz = foyer.center[1] - restZ;
    if (Math.hypot(ox, oz) < 1e-4) {
        const first = rooms[ROOMS.find((n) => n !== "foyer")];
        ox = first.center[0] - foyer.center[0];
        oz = first.center[1] - foyer.center[1];
    }
    const olen = Math.hypot(ox, oz) || 1;
    const reach = 0.3 * Math.min(foyer.size[0], foyer.size[1]) / 2;
    const spawn = {
        position: [round(foyer.center[0] + (ox / olen) * reach), 0, round(foyer.center[1] + (oz / olen) * reach)],
        yaw: yawToward(foyer.center[0] + (ox / olen) * reach, foyer.center[1] + (oz / olen) * reach, restX, restZ),
    };

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
        // A barely-there sway on the chandelier.
        chandelier.rotation.z = Math.sin(time * 0.6) * 0.012;
        chandelier.rotation.x = Math.cos(time * 0.43) * 0.008;
        // Candles breathe.
        for (const fm of flames) {
            const n = Math.sin(time * 8 + fm.position.x * 3 + fm.position.z * 2);
            fm.scale.set(1 + n * 0.1, 1.5 + n * 0.18, 1 + n * 0.1);
        }
        // Dust drifts slowly through the house.
        dust.rotation.y = time * 0.015;
        dust.position.y = Math.sin(time * 0.2) * 0.15;
    }

    // ---- teardown ---------------------------------------------------------
    function dispose() {
        scene.remove(group);
        if (scene.fog === fog) scene.fog = null;
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

    return { rooms, anchors, colliders, spawn, palette: P, update, dispose };
}
