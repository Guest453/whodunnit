// decor.js — furniture, props and the scene of the crime.
//
// Everything in here is built from THREE primitives plus textures painted onto
// an offscreen <canvas> at load time, so the game ships with no external assets.
// The module exposes exactly two functions (see contract.md):
//
//   makeTextSprite(text, THREE, opts) -> THREE.Sprite   // reusable label
//   buildDecor(scene, THREE, rooms)   -> { update, dispose, evidence }
//
// `rooms` is Record<name, { center:[x,z], size:[w,d] }> for the five mansion
// rooms. Props are pushed against walls and away from room centres so the
// player and the suspects always keep a clear path; nothing here adds a
// wall-sized collider (the environment module owns the walls).

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

/** Deterministic PRNG so the mansion is dressed the same way every run. */
function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Paint a texture on an offscreen canvas (the only DOM this module touches). */
function canvasTexture(THREE, w, h, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(canvas);
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

/** Rounded-rectangle path used by the label sprite. */
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ---------------------------------------------------------------------------
// makeTextSprite — a readable billboard label
// ---------------------------------------------------------------------------

/**
 * Draw `text` (may contain "\n") onto a canvas and return it as a THREE.Sprite
 * that always faces the camera. Works with nothing but a string and THREE.
 *
 * opts: { fontSize, font, color, background, border, padding, lineGap, scale }
 *   scale = world height of one line (default 0.42 per line).
 */
export function makeTextSprite(text, THREE, opts) {
    const o = opts || {};
    const lines = String(text == null ? "" : text).split("\n");
    const fontSize = o.fontSize || 64;
    const font = o.font || "600 " + fontSize + 'px system-ui, "Segoe UI", sans-serif';
    const pad = o.padding != null ? o.padding : 28;
    const lineGap = o.lineGap != null ? o.lineGap : 0.25; // extra line height factor
    const color = o.color || "#f7efe2";
    const background = o.background === undefined ? "rgba(22,16,12,0.82)" : o.background;
    const border = o.border || null;
    const lineH = fontSize * (1 + lineGap);

    // measure the widest line so the panel hugs the text
    const probe = document.createElement("canvas").getContext("2d");
    probe.font = font;
    let textW = 1;
    for (const line of lines) textW = Math.max(textW, probe.measureText(line).width);

    const w = Math.max(8, Math.ceil(textW + pad * 2));
    const h = Math.max(8, Math.ceil(lines.length * lineH + pad * 2));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const radius = Math.min(18, h / 4);
    if (background) {
        ctx.fillStyle = background;
        roundRect(ctx, 1, 1, w - 2, h - 2, radius);
        ctx.fill();
    }
    if (border) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = border;
        roundRect(ctx, 1.5, 1.5, w - 3, h - 3, radius);
        ctx.stroke();
    }
    ctx.fillStyle = color;
    lines.forEach((line, i) => {
        ctx.fillText(line, w / 2, pad + lineH * (i + 0.5));
    });

    const tex = new THREE.CanvasTexture(canvas);
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    const worldH = o.scale != null ? o.scale : 0.42 * lines.length;
    sprite.scale.set((worldH * w) / h, worldH, 1);
    sprite.userData.isLabel = true;
    return sprite;
}

// ---------------------------------------------------------------------------
// buildDecor
// ---------------------------------------------------------------------------

/** Furnish the mansion and mark one room as the scene of the crime. */
export function buildDecor(scene, THREE, rooms) {
    const root = new THREE.Group();
    root.name = "decor";
    scene.add(root);

    const owned = []; // everything we must dispose()
    const flames = []; // flickering candle flames
    const swayers = []; // hanging things that swing
    const rng = makeRng(0xdec0de);
    const keep = (x) => { owned.push(x); return x; };

    // --- shared unit geometries (scaled per part, never cloned) -------------
    const gBox = keep(new THREE.BoxGeometry(1, 1, 1));
    const gCyl = keep(new THREE.CylinderGeometry(0.5, 0.5, 1, 16));
    const gTaper = keep(new THREE.CylinderGeometry(0.34, 0.5, 1, 14));
    const gCone = keep(new THREE.ConeGeometry(0.5, 1, 12));
    const gSphere = keep(new THREE.SphereGeometry(0.5, 16, 12));
    const gIco = keep(new THREE.IcosahedronGeometry(0.5, 1));
    const gOct = keep(new THREE.OctahedronGeometry(0.5, 0));
    const gPlane = keep(new THREE.PlaneGeometry(1, 1));
    const gTorus = keep(new THREE.TorusGeometry(0.5, 0.06, 10, 28));

    // --- shared materials ---------------------------------------------------
    const woodTexture = canvasTexture(THREE, 256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#6b4527";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 110; i++) {
            ctx.strokeStyle = i % 3 ? "rgba(0,0,0,0.07)" : "rgba(255,235,200,0.05)";
            ctx.lineWidth = 1 + (i % 4) * 0.5;
            const y = (i / 110) * h;
            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2);
            ctx.stroke();
        }
        for (let k = 0; k < 3; k++) {
            ctx.strokeStyle = "rgba(0,0,0,0.14)";
            ctx.beginPath();
            ctx.ellipse(40 + k * 80, 60 + k * 70, 14, 8, k, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
    const marbleTexture = canvasTexture(THREE, 256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#cfc7bd";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 22; i++) {
            ctx.strokeStyle = i % 2 ? "rgba(90,88,96,0.22)" : "rgba(255,255,255,0.35)";
            ctx.lineWidth = 1 + (i % 3);
            ctx.beginPath();
            let y = (i / 22) * h;
            ctx.moveTo(0, y);
            for (let x = 0; x <= w; x += 24) {
                y += Math.sin(i * 1.7 + x * 0.02) * 6;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    });
    const paperTexture = canvasTexture(THREE, 128, 128, (ctx, w, h) => {
        ctx.fillStyle = "#efe6cf";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(80,90,120,0.20)";
        ctx.lineWidth = 1;
        for (let y = 18; y < h; y += 14) {
            ctx.beginPath();
            ctx.moveTo(8, y);
            ctx.lineTo(w - 8, y);
            ctx.stroke();
        }
    });
    const glowTexture = canvasTexture(THREE, 64, 64, (ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
        grad.addColorStop(0, "rgba(255,200,120,0.95)");
        grad.addColorStop(0.45, "rgba(255,150,60,0.35)");
        grad.addColorStop(1, "rgba(255,120,40,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    });

    const mat = {
        wood: keep(new THREE.MeshStandardMaterial({ map: woodTexture, roughness: 0.72, metalness: 0.05 })),
        darkWood: keep(new THREE.MeshStandardMaterial({ color: 0x3f2716, roughness: 0.62, metalness: 0.08 })),
        marble: keep(new THREE.MeshStandardMaterial({ map: marbleTexture, roughness: 0.32, metalness: 0.06 })),
        brass: keep(new THREE.MeshStandardMaterial({ color: 0xb98a3c, roughness: 0.34, metalness: 0.9 })),
        iron: keep(new THREE.MeshStandardMaterial({ color: 0x33333a, roughness: 0.5, metalness: 0.8 })),
        fabricRed: keep(new THREE.MeshStandardMaterial({ color: 0x6d2430, roughness: 0.95 })),
        fabricGreen: keep(new THREE.MeshStandardMaterial({ color: 0x2f4a34, roughness: 0.95 })),
        fabricBlue: keep(new THREE.MeshStandardMaterial({ color: 0x2b3a5c, roughness: 0.95 })),
        paper: keep(new THREE.MeshStandardMaterial({ map: paperTexture, roughness: 0.9, side: THREE.DoubleSide })),
        leaf: keep(new THREE.MeshStandardMaterial({ color: 0x2f6b39, roughness: 0.85 })),
        leafDark: keep(new THREE.MeshStandardMaterial({ color: 0x1f4d2b, roughness: 0.85 })),
        terracotta: keep(new THREE.MeshStandardMaterial({ color: 0x9a5236, roughness: 0.9 })),
        soil: keep(new THREE.MeshStandardMaterial({ color: 0x2a1d13, roughness: 1 })),
        wax: keep(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.75 })),
        flame: keep(new THREE.MeshBasicMaterial({ color: 0xffc061 })),
        glassGreen: keep(new THREE.MeshStandardMaterial({ color: 0x2c4a2a, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 })),
        glass: keep(new THREE.MeshStandardMaterial({ color: 0xa8c4cc, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.4 })),
        chalk: keep(new THREE.MeshBasicMaterial({ color: 0xf2f0e6, transparent: true, opacity: 0.85 })),
        marker: keep(new THREE.MeshStandardMaterial({ color: 0xd9c33a, roughness: 0.6 })),
    };
    const bookMats = [0x7d2b2b, 0x2f4f7a, 0x3d6b46, 0x8a6a2f, 0x5b3b73, 0x2d5f63, 0x8f3f2f]
        .map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })));

    // --- tiny mesh helper ---------------------------------------------------
    function part(group, geo, material, sx, sy, sz, x, y, z, ry) {
        const m = new THREE.Mesh(geo, material);
        m.scale.set(sx, sy, sz);
        m.position.set(x, y, z);
        if (ry) m.rotation.y = ry;
        group.add(m);
        return m;
    }

    // --- placement helpers --------------------------------------------------
    /** A point on a room wall; `along` is -1..1 across the wall, `inset` from it. */
    function edge(name, side, along, inset) {
        const r = rooms[name];
        const [cx, cz] = r.center;
        const [w, d] = r.size;
        const ax = Math.max(0.2, w / 2 - 0.9);
        const az = Math.max(0.2, d / 2 - 0.9);
        if (side === "n") return [cx + along * ax, cz - d / 2 + inset];
        if (side === "s") return [cx + along * ax, cz + d / 2 - inset];
        if (side === "w") return [cx - w / 2 + inset, cz + along * az];
        return [cx + w / 2 - inset, cz + along * az];
    }
    /** A point inside a room as a fraction of its half-size (-0.5..0.5). */
    function spot(name, fx, fz) {
        const r = rooms[name];
        return [r.center[0] + fx * r.size[0] / 2, r.center[1] + fz * r.size[1] / 2];
    }
    /** Yaw that turns a prop's open side toward the room centre. */
    function faceIn(side) {
        return side === "n" ? 0 : side === "s" ? Math.PI : side === "w" ? Math.PI / 2 : -Math.PI / 2;
    }
    function place(group, pos, ry) {
        group.position.set(pos[0], 0, pos[1]);
        if (ry) group.rotation.y = ry;
        root.add(group);
        return group;
    }

    // -----------------------------------------------------------------------
    // prop builders
    // -----------------------------------------------------------------------

    function makeTable(w, h, d, material) {
        const g = new THREE.Group();
        part(g, gBox, material || mat.wood, w, 0.09, d, 0, h, 0);
        const lx = w / 2 - 0.13;
        const lz = d / 2 - 0.13;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            part(g, gBox, material || mat.wood, 0.1, h, 0.1, sx * lx, h / 2, sz * lz);
        }
        return g;
    }

    function makeChair(material) {
        const g = new THREE.Group();
        const m = material || mat.wood;
        part(g, gBox, m, 0.5, 0.07, 0.5, 0, 0.46, 0);
        part(g, gBox, m, 0.5, 0.6, 0.07, 0, 0.78, -0.22);
        part(g, gBox, mat.fabricRed, 0.42, 0.07, 0.42, 0, 0.5, 0.02);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            part(g, gBox, m, 0.07, 0.46, 0.07, sx * 0.21, 0.23, sz * 0.21);
        }
        return g;
    }

    /** A candle on a stand; the flame is registered so update() can flicker it. */
    function makeCandlestick(scale) {
        const g = new THREE.Group();
        const s = scale || 1;
        part(g, gCyl, mat.brass, 0.22 * s, 0.05 * s, 0.22 * s, 0, 0.025 * s, 0);
        part(g, gCyl, mat.brass, 0.07 * s, 0.42 * s, 0.07 * s, 0, 0.23 * s, 0);
        part(g, gCyl, mat.brass, 0.13 * s, 0.05 * s, 0.13 * s, 0, 0.46 * s, 0);
        part(g, gCyl, mat.wax, 0.09 * s, 0.3 * s, 0.09 * s, 0, 0.63 * s, 0);
        const flame = part(g, gCone, mat.flame, 0.07 * s, 0.16 * s, 0.07 * s, 0, 0.86 * s, 0);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.set(0.5 * s, 0.5 * s, 1);
        glow.position.set(0, 0.86 * s, 0);
        g.add(glow);
        keep(glow.material);
        flames.push({ mesh: flame, glow, base: s, phase: rng() * Math.PI * 2 });
        return g;
    }

    function makeRug(w, d, material) {
        const m = new THREE.Mesh(gPlane, material);
        m.scale.set(w, d, 1);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.02;
        m.receiveShadow = true;
        return m;
    }

    function rugMaterial(base, accent, border) {
        const tex = canvasTexture(THREE, 256, 256, (ctx, cw, ch) => {
            ctx.fillStyle = base;
            ctx.fillRect(0, 0, cw, ch);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 10;
            ctx.strokeRect(14, 14, cw - 28, ch - 28);
            ctx.lineWidth = 3;
            ctx.strokeRect(30, 30, cw - 60, ch - 60);
            ctx.fillStyle = accent;
            for (let i = 0; i < 5; i++) {
                const t = (i + 0.5) / 5;
                ctx.beginPath();
                ctx.arc(cw * t, ch / 2, 12, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.strokeStyle = border;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(cw / 2, 40);
            ctx.lineTo(cw / 2, ch - 40);
            ctx.stroke();
        });
        return keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    }

    function makeBookshelf(w, h, d) {
        const g = new THREE.Group();
        const side = 0.08;
        part(g, gBox, mat.darkWood, side, h, d, -(w / 2 - side / 2), h / 2, 0);
        part(g, gBox, mat.darkWood, side, h, d, w / 2 - side / 2, h / 2, 0);
        part(g, gBox, mat.darkWood, w, 0.06, d, 0, h, 0);
        part(g, gBox, mat.darkWood, w, 0.06, d, 0, 0.03, 0);
        part(g, gBox, mat.darkWood, w, h, 0.04, 0, h / 2, -(d / 2 - 0.02));
        const shelves = 4;
        // one painted "spines" texture per shelf run keeps the mesh count tiny
        const spines = canvasTexture(THREE, 256, 64, (ctx, cw, ch) => {
            ctx.fillStyle = "#241610";
            ctx.fillRect(0, 0, cw, ch);
            let x = 2;
            while (x < cw - 4) {
                const bw = 6 + Math.floor(rng() * 10);
                const bh = 34 + Math.floor(rng() * 26);
                ctx.fillStyle = ["#7d2b2b", "#2f4f7a", "#3d6b46", "#8a6a2f", "#5b3b73", "#2d5f63", "#8f3f2f"][Math.floor(rng() * 7)];
                ctx.fillRect(x, ch - bh, bw, bh);
                ctx.fillStyle = "rgba(255,235,190,0.5)";
                ctx.fillRect(x + 2, ch - bh + 6, bw - 4, 2);
                x += bw + 2;
            }
        });
        const spineMat = keep(new THREE.MeshStandardMaterial({ map: spines, roughness: 0.8 }));
        for (let s = 1; s <= shelves; s++) {
            const y = (h / (shelves + 1)) * s;
            part(g, gBox, mat.wood, w - side * 2, 0.05, d - 0.08, 0, y, 0.02);
            part(g, gBox, spineMat, w - side * 2 - 0.06, 0.44, d - 0.16, 0, y + 0.25, 0.02);
        }
        return g;
    }

    function makeDesk() {
        const g = new THREE.Group();
        const top = 0.76;
        part(g, gBox, mat.wood, 1.5, 0.08, 0.8, 0, top, 0);
        part(g, gBox, mat.wood, 0.1, top, 0.72, -0.68, top / 2, 0);
        part(g, gBox, mat.wood, 0.1, top, 0.72, 0.68, top / 2, 0);
        part(g, gBox, mat.darkWood, 1.5, 0.28, 0.72, 0, top - 0.18, 0);
        // papers, an inkwell and a candle on the blotter
        for (let i = 0; i < 3; i++) {
            const p = part(g, gBox, mat.paper, 0.32, 0.005, 0.44, -0.35 + i * 0.22, top + 0.05, 0.02);
            p.rotation.y = (rng() - 0.5) * 0.5;
        }
        part(g, gCyl, mat.glass, 0.11, 0.11, 0.11, 0.5, top + 0.1, -0.2);
        const candle = makeCandlestick(0.7);
        candle.position.set(0.56, top + 0.04, 0.22);
        g.add(candle);
        return g;
    }

    function makePiano() {
        const g = new THREE.Group();
        const bodyY = 0.72;
        part(g, gBox, mat.darkWood, 1.5, 0.34, 1.5, 0, bodyY, 0.15);
        part(g, gBox, mat.darkWood, 1.4, 0.05, 1.4, 0, bodyY + 0.36, 0.15);
        const lid = part(g, gBox, mat.darkWood, 1.46, 0.05, 1.3, 0, bodyY + 0.5, -0.05);
        lid.rotation.x = -0.28;
        // keyboard
        const keys = canvasTexture(THREE, 512, 96, (ctx, cw, ch) => {
            ctx.fillStyle = "#f4f0e6";
            ctx.fillRect(0, 0, cw, ch);
            const n = 32;
            for (let i = 1; i < n; i++) {
                ctx.fillStyle = "rgba(0,0,0,0.25)";
                ctx.fillRect((i / n) * cw, 0, 2, ch);
            }
            for (let i = 0; i < n; i++) {
                if (i % 7 === 2 || i % 7 === 6) continue;
                ctx.fillStyle = "#141414";
                ctx.fillRect((i / n) * cw + 4, 0, (cw / n) * 0.55, ch * 0.6);
            }
        });
        const keyMat = keep(new THREE.MeshStandardMaterial({ map: keys, roughness: 0.4 }));
        part(g, gBox, keyMat, 1.34, 0.08, 0.26, 0, bodyY + 0.02, 0.86);
        part(g, gBox, mat.darkWood, 1.5, 0.16, 0.34, 0, bodyY - 0.02, 1.0);
        // legs
        for (const [lx, lz] of [[-0.6, 0.7], [0.6, 0.7], [0, -0.5]]) {
            part(g, gCyl, mat.darkWood, 0.12, bodyY, 0.12, lx, bodyY / 2, lz);
        }
        // bench
        const bench = new THREE.Group();
        part(bench, gBox, mat.darkWood, 0.9, 0.07, 0.34, 0, 0.5, 0);
        part(bench, gBox, mat.fabricRed, 0.8, 0.07, 0.28, 0, 0.54, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(bench, gBox, mat.darkWood, 0.07, 0.5, 0.07, sx * 0.38, 0.25, sz * 0.12);
        bench.position.set(0, 0, 1.45);
        g.add(bench);
        return g;
    }

    function makePlant(size) {
        const s = size || 1;
        const g = new THREE.Group();
        part(g, gTaper, mat.terracotta, 0.5 * s, 0.42 * s, 0.5 * s, 0, 0.21 * s, 0);
        part(g, gCyl, mat.soil, 0.44 * s, 0.06 * s, 0.44 * s, 0, 0.4 * s, 0);
        part(g, gCyl, mat.leafDark, 0.05 * s, 0.7 * s, 0.05 * s, 0, 0.75 * s, 0);
        const clusters = 6;
        for (let i = 0; i < clusters; i++) {
            const a = (i / clusters) * Math.PI * 2;
            const r = 0.16 * s;
            const leaf = part(g, gIco, i % 2 ? mat.leaf : mat.leafDark, 0.5 * s, 0.34 * s, 0.5 * s,
                Math.cos(a) * r, (0.85 + rng() * 0.5) * s, Math.sin(a) * r);
            leaf.rotation.set((rng() - 0.5) * 0.6, a, (rng() - 0.5) * 0.6);
        }
        return g;
    }

    function makeBench() {
        const g = new THREE.Group();
        part(g, gBox, mat.wood, 1.7, 0.08, 0.5, 0, 0.45, 0);
        for (const sx of [-1, 1]) {
            part(g, gBox, mat.iron, 0.1, 0.45, 0.46, sx * 0.72, 0.22, 0);
        }
        part(g, gBox, mat.wood, 1.7, 0.06, 0.08, 0, 0.95, -0.22);
        for (const sx of [-1, 1]) part(g, gBox, mat.iron, 0.07, 0.5, 0.07, sx * 0.72, 0.7, -0.22);
        return g;
    }

    function makeWineRack(w, h) {
        const g = new THREE.Group();
        part(g, gBox, mat.darkWood, 0.08, h, 0.42, -w / 2, h / 2, 0);
        part(g, gBox, mat.darkWood, 0.08, h, 0.42, w / 2, h / 2, 0);
        const rows = 4;
        for (let r = 0; r <= rows; r++) part(g, gBox, mat.darkWood, w, 0.06, 0.42, 0, (h / rows) * r, 0);
        const bottleMat = mat.glassGreen;
        for (let r = 0; r < rows; r++) {
            const y = (h / rows) * r + h / rows / 2;
            let x = -w / 2 + 0.16;
            while (x < w / 2 - 0.12) {
                const b = part(g, gCyl, bottleMat, 0.14, 0.34, 0.14, x, y, 0.02);
                b.rotation.z = Math.PI / 2;
                b.rotation.y = Math.PI / 2;
                part(g, gCyl, bottleMat, 0.06, 0.16, 0.06, x - 0.24, y, 0.02).rotation.z = Math.PI / 2;
                x += 0.22;
            }
        }
        return g;
    }

    function makeBarrel() {
        const g = new THREE.Group();
        part(g, gTaper, mat.wood, 0.9, 0.9, 0.9, 0, 0.45, 0);
        for (const y of [0.14, 0.45, 0.76]) part(g, gTorus, mat.iron, 1.9, 1.9, 1.9, 0, y, 0, 0).rotation.x = Math.PI / 2;
        part(g, gCyl, mat.darkWood, 0.78, 0.05, 0.78, 0, 0.9, 0);
        return g;
    }

    function makeCrate() {
        const g = new THREE.Group();
        part(g, gBox, mat.wood, 0.6, 0.5, 0.6, 0, 0.25, 0);
        for (const s of [-1, 1]) {
            part(g, gBox, mat.darkWood, 0.6, 0.06, 0.06, 0, 0.25, s * 0.31);
            part(g, gBox, mat.darkWood, 0.06, 0.06, 0.6, s * 0.31, 0.25, 0);
        }
        return g;
    }

    function makeChandelier() {
        const g = new THREE.Group();
        part(g, gCyl, mat.brass, 0.05, 1.0, 0.05, 0, -0.5, 0);
        const ring = part(g, gTorus, mat.brass, 1.6, 1.6, 1.6, 0, -1.0, 0);
        ring.rotation.x = Math.PI / 2;
        const arms = 6;
        for (let i = 0; i < arms; i++) {
            const a = (i / arms) * Math.PI * 2;
            const cx = Math.cos(a) * 0.78;
            const cz = Math.sin(a) * 0.78;
            part(g, gCyl, mat.brass, 0.05, 0.22, 0.05, cx, -0.9, cz);
            part(g, gCyl, mat.wax, 0.1, 0.24, 0.1, cx, -0.72, cz);
            const flame = part(g, gCone, mat.flame, 0.09, 0.2, 0.09, cx, -0.5, cz);
            flames.push({ mesh: flame, glow: null, base: 1, phase: rng() * Math.PI * 2 });
            // crystal drops
            part(g, gOct, mat.glass, 0.16, 0.3, 0.16, cx * 0.7, -1.24, cz * 0.7);
        }
        const light = new THREE.PointLight(0xffd9a0, 4.5, 16, 2);
        light.position.set(0, -0.85, 0);
        g.add(light);
        swayers.push({ obj: g, phase: rng() * Math.PI * 2, amp: 0.022 });
        return g;
    }

    function makeLantern() {
        const g = new THREE.Group();
        part(g, gCyl, mat.iron, 0.04, 0.7, 0.04, 0, -0.35, 0);
        part(g, gBox, mat.iron, 0.28, 0.05, 0.28, 0, -0.72, 0);
        part(g, gBox, mat.iron, 0.24, 0.36, 0.24, 0, -0.92, 0);
        part(g, gCyl, mat.wax, 0.09, 0.22, 0.09, 0, -0.95, 0);
        const flame = part(g, gCone, mat.flame, 0.09, 0.2, 0.09, 0, -0.78, 0);
        const light = new THREE.PointLight(0xffb066, 2.2, 9, 2);
        light.position.set(0, -0.85, 0);
        g.add(light);
        flames.push({ mesh: flame, glow: null, base: 1, phase: rng() * Math.PI * 2 });
        swayers.push({ obj: g, phase: rng() * Math.PI * 2, amp: 0.05 });
        return g;
    }

    function makeGlobe() {
        const g = new THREE.Group();
        const sphere = new THREE.Mesh(gSphere, mat.fabricBlue);
        sphere.scale.set(0.36, 0.36, 0.36);
        sphere.position.y = 0.62;
        g.add(sphere);
        part(g, gTorus, mat.brass, 0.9, 0.9, 0.9, 0, 0.62, 0).rotation.x = Math.PI / 2.4;
        part(g, gCyl, mat.brass, 0.05, 0.3, 0.05, 0, 0.32, 0);
        part(g, gCyl, mat.darkWood, 0.24, 0.06, 0.24, 0, 0.14, 0);
        return g;
    }

    // -----------------------------------------------------------------------
    // room dressing
    // -----------------------------------------------------------------------

    // --- foyer: chandelier, console, rug, grand piano -----------------------
    {
        const [cx, cz] = rooms.foyer.center;
        const chandelier = makeChandelier();
        chandelier.position.set(cx, 3.35, cz);
        root.add(chandelier);

        const [rx, rz] = spot("foyer", 0.0, 0.38);
        const rug = makeRug(3.4, 2.2, rugMaterial("#5a1f26", "#c9a24a", "#8d6a2a"));
        rug.position.set(rx, 0.02, rz);
        root.add(rug);

        const console_ = makeTable(1.8, 0.9, 0.5, mat.marble);
        const [tx, tz] = edge("foyer", "n", 0.0, 0.45);
        place(console_, [tx, tz], 0);
        const c1 = makeCandlestick(1.0); c1.position.set(-0.6, 0.9, 0); console_.add(c1);
        const c2 = makeCandlestick(1.0); c2.position.set(0.6, 0.9, 0); console_.add(c2);
        const vase = part(console_, gTaper, mat.marble, 0.22, 0.32, 0.22, 0, 1.06, 0);

        place(makePlant(1.2), edge("foyer", "w", 0.75, 0.75), 0);
        place(makePiano(), edge("foyer", "e", -0.1, 1.7), faceIn("e"));
    }

    // --- library: bookshelves, reading table, chairs, rug -------------------
    {
        const shelves = [];
        shelves.push(place(makeBookshelf(2.4, 2.2, 0.4), edge("library", "n", -0.35, 0.35), 0));
        shelves.push(place(makeBookshelf(2.4, 2.2, 0.4), edge("library", "n", 0.35, 0.35), 0));
        shelves.push(place(makeBookshelf(2.4, 2.2, 0.4), edge("library", "w", 0.1, 0.35), faceIn("w")));

        const [rx, rz] = spot("library", -0.3, 0.18);
        const rug = makeRug(3.0, 2.2, rugMaterial("#243b2c", "#b48a3c", "#6d8f5a"));
        rug.position.set(rx, 0.02, rz);
        root.add(rug);

        const table = makeTable(1.5, 0.78, 0.9, mat.wood);
        table.position.set(rx, 0, rz);
        root.add(table);
        const globe = makeGlobe(); globe.position.set(0.4, 0.82, 0); table.add(globe);
        const bookA = part(table, gBox, bookMats[0], 0.24, 0.05, 0.34, -0.35, 0.85, 0.1);
        bookA.rotation.y = 0.3;
        const cand = makeCandlestick(0.8); cand.position.set(-0.5, 0.78, -0.25); table.add(cand);

        const chairA = makeChair(); chairA.position.set(rx, 0, rz - 0.95); chairA.rotation.y = Math.PI; root.add(chairA);
        const chairB = makeChair(); chairB.position.set(rx + 1.0, 0, rz + 0.2); chairB.rotation.y = -Math.PI / 2; root.add(chairB);

        const stand = makeCandlestick(1.4);
        place(stand, edge("library", "s", 0.5, 0.6), 0);
    }

    // --- study: the scene of the crime --------------------------------------
    const evidenceSpot = spot("study", 0.12, 0.42);
    {
        const desk = makeDesk();
        place(desk, edge("study", "n", 0.0, 0.62), 0);
        const deskChair = makeChair();
        const [dx, dz] = edge("study", "n", 0.0, 1.55);
        deskChair.position.set(dx, 0, dz);
        root.add(deskChair);

        place(makeBookshelf(2.2, 2.2, 0.4), edge("study", "e", 0.15, 0.35), faceIn("e"));
        place(makeTable(1.0, 0.72, 0.6, mat.wood), edge("study", "w", -0.55, 0.7), faceIn("w"));

        // dark rug with a chalk body outline — the murder scene
        const crimeTex = canvasTexture(THREE, 256, 256, (ctx, cw, ch) => {
            ctx.fillStyle = "#2b2320";
            ctx.fillRect(0, 0, cw, ch);
            ctx.strokeStyle = "#4a3d36";
            ctx.lineWidth = 10;
            ctx.strokeRect(12, 12, cw - 24, ch - 24);
            ctx.strokeStyle = "rgba(240,236,220,0.92)";
            ctx.lineWidth = 3;
            // simplified chalk outline of a fallen body
            ctx.beginPath();
            ctx.arc(70, 70, 20, 0, Math.PI * 2); // head
            ctx.moveTo(70, 92);
            ctx.lineTo(150, 150); // torso
            ctx.moveTo(150, 150);
            ctx.lineTo(196, 110); // arm
            ctx.moveTo(150, 150);
            ctx.lineTo(210, 176); // arm
            ctx.moveTo(150, 150);
            ctx.lineTo(130, 216); // leg
            ctx.moveTo(150, 150);
            ctx.lineTo(196, 222); // leg
            ctx.stroke();
            ctx.strokeStyle = "rgba(190,40,40,0.85)";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(120, 120, 26, 0, Math.PI * 2);
            ctx.stroke();
        });
        const crimeMat = keep(new THREE.MeshStandardMaterial({ map: crimeTex, roughness: 0.95 }));
        const crimeRug = makeRug(2.4, 1.9, crimeMat);
        crimeRug.position.set(evidenceSpot[0], 0.025, evidenceSpot[1]);
        root.add(crimeRug);

        // numbered evidence markers around the outline
        const markerPositions = [[-0.9, -0.6], [0.9, -0.6], [1.0, 0.7], [-0.9, 0.7]];
        markerPositions.forEach(([ox, oz]) => {
            const m = part(root, gCone, mat.marker, 0.14, 0.28, 0.14, evidenceSpot[0] + ox, 0.14, evidenceSpot[1] + oz);
            m.rotation.y = rng() * Math.PI;
        });

        // a labelled card floating above the rug
        const label = makeTextSprite("SCENE OF\nTHE CRIME", THREE, {
            scale: 0.42, color: "#ffe6c9", background: "rgba(120,22,22,0.86)", border: "#e0b878",
        });
        label.position.set(evidenceSpot[0], 1.55, evidenceSpot[1]);
        root.add(label);
        keep(label.material.map);
        keep(label.material);
    }

    // --- conservatory: plants, a bench, a little table ----------------------
    {
        const spots = [
            ["n", -0.6, 0.75, 1.3], ["n", 0.0, 0.8, 1.0], ["n", 0.6, 0.75, 1.4],
            ["w", -0.5, 0.8, 1.1], ["w", 0.5, 0.75, 1.5],
            ["e", -0.4, 0.8, 1.2], ["e", 0.5, 0.75, 1.0],
            ["s", -0.55, 0.75, 1.25], ["s", 0.55, 0.75, 1.1],
        ];
        for (const [side, along, inset, size] of spots) {
            place(makePlant(size), edge("conservatory", side, along, inset), 0);
        }
        const bench = makeBench();
        const [bx, bz] = spot("conservatory", 0.0, -0.28);
        bench.position.set(bx, 0, bz);
        root.add(bench);

        const [tx, tz] = spot("conservatory", 0.0, 0.3);
        const table = makeTable(0.9, 0.68, 0.9, mat.iron);
        table.position.set(tx, 0, tz);
        root.add(table);
        part(table, gTaper, mat.terracotta, 0.34, 0.36, 0.34, 0, 0.86, 0);
        const tea = part(table, gCyl, mat.marble, 0.24, 0.16, 0.24, 0.0, 0.76, 0);
        const candle = makeCandlestick(0.7); candle.position.set(-0.3, 0.68, 0.3); table.add(candle);
    }

    // --- cellar: wine racks, barrels, crates, hanging lantern ---------------
    {
        place(makeWineRack(1.9, 1.8), edge("cellar", "n", -0.32, 0.42), 0);
        place(makeWineRack(1.9, 1.8), edge("cellar", "n", 0.32, 0.42), 0);
        place(makeWineRack(1.7, 1.8), edge("cellar", "e", 0.1, 0.42), faceIn("e"));

        const [b1x, b1z] = spot("cellar", -0.38, 0.26);
        place(makeBarrel(), [b1x, b1z], 0);
        const [b2x, b2z] = spot("cellar", -0.12, 0.42);
        place(makeBarrel(), [b2x, b2z], 0);
        const [b3x, b3z] = spot("cellar", 0.42, -0.34);
        place(makeBarrel(), [b3x, b3z], 0);

        const crate = makeCrate();
        place(crate, edge("cellar", "w", 0.35, 0.6), 0);
        const crate2 = makeCrate();
        crate2.position.y = 0.5;
        place(crate2, edge("cellar", "w", 0.35, 0.6), 0);

        // bottles resting on the floor
        for (let i = 0; i < 5; i++) {
            const b = part(root, gCyl, mat.glassGreen, 0.13, 0.32, 0.13,
                rooms.cellar.center[0] - 1.1 + i * 0.34, 0.16, rooms.cellar.center[1] + 1.4);
            b.rotation.z = Math.PI / 2;
            b.rotation.y = rng() * Math.PI;
        }

        const [lx, lz] = spot("cellar", 0.2, -0.1);
        const lantern = makeLantern();
        lantern.position.set(lx, 2.3, lz);
        root.add(lantern);
    }

    // -----------------------------------------------------------------------
    // shadows: only furniture-scale parts cast, tiny bits do not (perf)
    // -----------------------------------------------------------------------
    root.traverse((o) => {
        if (!o.isMesh) return;
        o.receiveShadow = true;
        const s = o.scale;
        o.castShadow = Math.abs(s.x * s.y * s.z) > 0.004;
    });

    // -----------------------------------------------------------------------
    // animation + teardown
    // -----------------------------------------------------------------------
    let time = 0;

    function update(dt) {
        time += dt;
        // candle flames: a two-frequency flicker on scale and glow
        for (const f of flames) {
            const n = 0.78 + 0.22 * Math.sin(time * 13 + f.phase) * Math.sin(time * 7.3 + f.phase * 1.7);
            const w = 0.07 * f.base * n;
            const h = 0.16 * f.base * (0.85 + 0.3 * n);
            f.mesh.scale.set(w, h, w);
            f.mesh.position.y += 0; // flames stay anchored to their candle
            if (f.glow) {
                const g = 0.5 * f.base * (0.85 + 0.35 * n);
                f.glow.scale.set(g, g, 1);
            }
        }
        // chandelier / lantern sway
        for (const s of swayers) {
            s.obj.rotation.z = Math.sin(time * 0.7 + s.phase) * s.amp;
            s.obj.rotation.x = Math.cos(time * 0.53 + s.phase) * s.amp * 0.7;
        }
    }

    function dispose() {
        scene.remove(root);
        for (const o of owned) {
            if (o && typeof o.dispose === "function") o.dispose();
        }
        owned.length = 0;
        flames.length = 0;
        swayers.length = 0;
    }

    return {
        update,
        dispose,
        evidence: { position: [evidenceSpot[0], 0.03, evidenceSpot[1]] },
    };
}
