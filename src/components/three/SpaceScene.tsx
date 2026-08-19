"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function SpaceScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const W = mount.clientWidth || window.innerWidth;
    const H = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Soft circular texture, reused for nebula glows and the comet head
    const makeCircleTex = () => {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 64;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0,   "rgba(255,255,255,1)");
      g.addColorStop(0.4, "rgba(255,255,255,0.5)");
      g.addColorStop(1,   "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    };
    const circleTex = makeCircleTex();

    // ── DEEP STARFIELD ──────────────────────────────────────────────────────
    const starGroup = new THREE.Group();
    scene.add(starGroup);

    const STAR_COUNT = 1600;
    const starPos   = new Float32Array(STAR_COUNT * 3);
    const starPhase = new Float32Array(STAR_COUNT);
    const starSpeed = new Float32Array(STAR_COUNT);
    const starSize  = new Float32Array(STAR_COUNT);
    const starCol   = new Float32Array(STAR_COUNT * 3);

    const STAR_PALETTE = [
      [1.00, 0.98, 0.95], // warm white
      [0.80, 0.88, 1.00], // blue-white
      [1.00, 0.90, 0.80], // faint amber
    ];

    for (let i = 0; i < STAR_COUNT; i++) {
      starPos[i * 3]     = (Math.random() - 0.5) * 40;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 5;
      starPhase[i]       = Math.random() * Math.PI * 2;
      starSpeed[i]       = 0.25 + Math.random() * 1.1;
      starSize[i]        = Math.random() * 0.6 + 0.15;
      const c = STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)];
      starCol[i * 3] = c[0]; starCol[i * 3 + 1] = c[1]; starCol[i * 3 + 2] = c[2];
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("aPhase",   new THREE.BufferAttribute(starPhase, 1));
    starGeo.setAttribute("aSpeed",   new THREE.BufferAttribute(starSpeed, 1));
    starGeo.setAttribute("aSize",    new THREE.BufferAttribute(starSize, 1));
    starGeo.setAttribute("aColor",   new THREE.BufferAttribute(starCol, 3));

    const starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aSize;
        attribute vec3 aColor;
        uniform float uTime;
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          vColor = aColor;
          vOpacity = 0.12 + 0.88 * abs(sin(uTime * aSpeed + aPhase));
          float twinkleSize = 0.7 + 0.3 * abs(sin(uTime * aSpeed + aPhase));
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * twinkleSize * (220.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = (1.0 - d * 2.0) * vOpacity;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    starGroup.add(new THREE.Points(starGeo, starMat));

    // ── NEBULA GLOW ──────────────────────────────────────────────────────────
    // A few large, soft, additive-blended color blobs far behind the stars.
    const nebulaGroup = new THREE.Group();
    scene.add(nebulaGroup);

    const NEBULAE = [
      { color: 0x3b3f8f, x: -8,  y: 3,  z: -22, r: 9,  o: 0.16 },
      { color: 0x6a3f8f, x: 9,   y: -4, z: -28, r: 11, o: 0.13 },
      { color: 0x2f6a72, x: 2,   y: 6,  z: -18, r: 7,  o: 0.12 },
    ];
    const nebulaMeshes = NEBULAE.map(({ color, x, y, z, r, o }) => {
      const mat = new THREE.MeshBasicMaterial({
        map: circleTex, color, transparent: true, opacity: o,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat);
      mesh.position.set(x, y, z);
      nebulaGroup.add(mesh);
      return mesh;
    });

    // ── COMET TAIL (the cursor is a shooting star) ───────────────────────────
    // The tail is a triangle strip built from a chain of followers: node 0 is
    // the comet head, every other node eases toward the one ahead of it. The
    // chain stretches while the cursor moves and collapses into the head when
    // it stops, so the tail lengthens and vanishes on its own.
    const TAIL_NODES = 30;
    const tailX = new Float32Array(TAIL_NODES);
    const tailY = new Float32Array(TAIL_NODES);

    const tailPos = new Float32Array(TAIL_NODES * 2 * 3); // 2 verts per node
    const tailT   = new Float32Array(TAIL_NODES * 2);     // 0 at head → 1 at tip
    const tailIdx: number[] = [];
    for (let i = 0; i < TAIL_NODES; i++) {
      const t = i / (TAIL_NODES - 1);
      tailT[i * 2] = t;
      tailT[i * 2 + 1] = t;
      if (i < TAIL_NODES - 1) {
        const a = i * 2;
        tailIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute("position", new THREE.BufferAttribute(tailPos, 3));
    tailGeo.setAttribute("aT", new THREE.BufferAttribute(tailT, 1));
    tailGeo.setIndex(tailIdx);

    const tailMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uStrength: { value: 0 } },
      vertexShader: `
        attribute float aT;
        varying float vT;
        void main() {
          vT = aT;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uStrength;
        varying float vT;
        void main() {
          // White-hot at the head, cooling to blue then violet down the tail.
          vec3 hot   = vec3(1.00, 0.98, 0.92);
          vec3 mid   = vec3(0.55, 0.78, 1.00);
          vec3 cold  = vec3(0.45, 0.32, 0.95);
          vec3 col = mix(hot, mid, smoothstep(0.0, 0.35, vT));
          col = mix(col, cold, smoothstep(0.35, 1.0, vT));
          float fade = pow(1.0 - vT, 2.4);
          gl_FragColor = vec4(col, fade * uStrength * 0.8);
        }
      `,
    });
    scene.add(new THREE.Mesh(tailGeo, tailMat));

    // Bright core at the cursor itself.
    const headMat = new THREE.MeshBasicMaterial({
      map: circleTex, color: 0xdfeaff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const headMesh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), headMat);
    scene.add(headMesh);

    // ── SPARKS SHED BY THE COMET ─────────────────────────────────────────────
    const SPARK_MAX = 150;
    const sparkPos  = new Float32Array(SPARK_MAX * 3);
    const sparkVel  = new Float32Array(SPARK_MAX * 3);
    const sparkLife = new Float32Array(SPARK_MAX).fill(1); // 1 = dead
    const sparkDecay = new Float32Array(SPARK_MAX).fill(1);
    const sparkSeed = new Float32Array(SPARK_MAX);
    let sparkCursor = 0;

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute("aLife", new THREE.BufferAttribute(sparkLife, 1));
    sparkGeo.setAttribute("aSeed", new THREE.BufferAttribute(sparkSeed, 1));

    const sparkMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aLife;
        attribute float aSeed;
        varying float vLife;
        varying float vSeed;
        void main() {
          vLife = aLife;
          vSeed = aSeed;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          float size = mix(0.11, 0.008, aLife) * (0.6 + aSeed * 0.8);
          gl_PointSize = size * (260.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vLife;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float edge = smoothstep(0.5, 0.0, d);
          // Embers cool from white to amber as they fall away.
          vec3 col = mix(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.62, 0.30), vLife * (0.5 + vSeed * 0.5));
          gl_FragColor = vec4(col, edge * (1.0 - vLife) * 0.9);
        }
      `,
    });
    scene.add(new THREE.Points(sparkGeo, sparkMat));

    const spawnSpark = (x: number, y: number, vx: number, vy: number) => {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % SPARK_MAX;
      const spread = 0.35;
      sparkPos[i * 3]     = x + (Math.random() - 0.5) * 0.12;
      sparkPos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.12;
      sparkPos[i * 3 + 2] = 0;
      // Embers keep a fraction of the comet's motion, plus a little scatter.
      sparkVel[i * 3]     = -vx * 0.06 + (Math.random() - 0.5) * spread * 0.04;
      sparkVel[i * 3 + 1] = -vy * 0.06 + (Math.random() - 0.5) * spread * 0.04;
      sparkVel[i * 3 + 2] = 0;
      sparkLife[i] = 0;
      sparkDecay[i] = 0.03 + Math.random() * 0.04;
      sparkSeed[i] = Math.random();
    };

    // Converts a screen-space mouse position into a world point on the
    // z=0 plane, matching the camera's perspective at that depth.
    const planeDist = camera.position.z;
    const fovRad = (camera.fov * Math.PI) / 180;
    const worldFromMouse = (clientX: number, clientY: number) => {
      const rect = mount.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      const halfH = Math.tan(fovRad / 2) * planeDist;
      const halfW = halfH * (rect.width / rect.height);
      return { x: ndcX * halfW, y: ndcY * halfH };
    };

    const pointer = { x: 0, y: 0 };
    let pointerSeen = false;
    const mouseTarget = { x: 0, y: 0 };

    const onPointerMove = (e: PointerEvent) => {
      const p = worldFromMouse(e.clientX, e.clientY);
      pointer.x = p.x;
      pointer.y = p.y;
      mouseTarget.x = e.clientX / window.innerWidth - 0.5;
      mouseTarget.y = e.clientY / window.innerHeight - 0.5;

      if (!pointerSeen) {
        pointerSeen = true;
        for (let i = 0; i < TAIL_NODES; i++) { tailX[i] = p.x; tailY[i] = p.y; }
        headMesh.position.set(p.x, p.y, 0);
      }
    };
    window.addEventListener("pointermove", onPointerMove);

    // ── ANIMATION ─────────────────────────────────────────────────────────────
    let frameId: number;
    let time = 0;
    const sparkPosAttr  = sparkGeo.attributes.position as THREE.BufferAttribute;
    const sparkLifeAttr = sparkGeo.attributes.aLife as THREE.BufferAttribute;
    const sparkSeedAttr = sparkGeo.attributes.aSeed as THREE.BufferAttribute;
    const tailPosAttr   = tailGeo.attributes.position as THREE.BufferAttribute;
    let parallaxX = 0;
    let parallaxY = 0;
    let speed = 0;      // smoothed head speed, drives glow and tail opacity
    let sparkDebt = 0;  // fractional sparks carried between frames

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      time += 0.016;

      starMat.uniforms.uTime.value = time;

      if (pointerSeen) {
        // Head chases the cursor with a slight lag, which is what gives the
        // trail its swooping, comet-like curve.
        const hx = tailX[0], hy = tailY[0];
        const nx = hx + (pointer.x - hx) * 0.28;
        const ny = hy + (pointer.y - hy) * 0.28;
        const vx = nx - hx;
        const vy = ny - hy;
        tailX[0] = nx;
        tailY[0] = ny;

        const inst = Math.hypot(vx, vy);
        speed += (inst - speed) * 0.2;

        // Each node eases toward the one in front, more loosely down the tail.
        for (let i = 1; i < TAIL_NODES; i++) {
          const ease = 0.62 - (i / TAIL_NODES) * 0.14;
          tailX[i] += (tailX[i - 1] - tailX[i]) * ease;
          tailY[i] += (tailY[i - 1] - tailY[i]) * ease;
        }

        // Ribbon: offset each node along its own perpendicular, tapering out.
        const HEAD_WIDTH = 0.035;
        for (let i = 0; i < TAIL_NODES; i++) {
          const ax = tailX[Math.max(i - 1, 0)];
          const ay = tailY[Math.max(i - 1, 0)];
          const bx = tailX[Math.min(i + 1, TAIL_NODES - 1)];
          const by = tailY[Math.min(i + 1, TAIL_NODES - 1)];
          let dx = bx - ax;
          let dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;

          const t = i / (TAIL_NODES - 1);
          // Slight bulge just behind the head, then a long taper to a point.
          const w = HEAD_WIDTH * (0.55 + 0.45 * Math.sin(t * Math.PI * 0.9)) *
                    Math.pow(1 - t, 1.1) * Math.min(1, 0.35 + speed * 6);

          const px = -dy * w;
          const py = dx * w;
          const o = i * 6;
          tailPos[o]     = tailX[i] + px;
          tailPos[o + 1] = tailY[i] + py;
          tailPos[o + 2] = 0;
          tailPos[o + 3] = tailX[i] - px;
          tailPos[o + 4] = tailY[i] - py;
          tailPos[o + 5] = 0;
        }
        tailPosAttr.needsUpdate = true;
        tailMat.uniforms.uStrength.value = Math.min(1, speed * 9);

        headMesh.position.set(tailX[0], tailY[0], 0);
        const glow = Math.min(1, 0.18 + speed * 7);
        headMat.opacity = glow * 0.55;
        const s = 0.16 + glow * 0.34;
        headMesh.scale.set(s, s, 1);

        // Shed embers in proportion to distance travelled, not frame count.
        sparkDebt += inst * 20;
        while (sparkDebt >= 1) {
          sparkDebt -= 1;
          spawnSpark(tailX[0], tailY[0], vx / 0.016, vy / 0.016);
        }
      }

      for (let i = 0; i < SPARK_MAX; i++) {
        if (sparkLife[i] >= 1) continue;
        sparkLife[i] = Math.min(1, sparkLife[i] + sparkDecay[i]);
        sparkVel[i * 3]     *= 0.965;
        sparkVel[i * 3 + 1] *= 0.965;
        sparkVel[i * 3 + 1] -= 0.00035; // embers drift downward as they die
        sparkPos[i * 3]     += sparkVel[i * 3];
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1];
      }
      sparkPosAttr.needsUpdate = true;
      sparkLifeAttr.needsUpdate = true;
      sparkSeedAttr.needsUpdate = true;

      // Gentle parallax drift of the starfield toward the cursor.
      parallaxX += (mouseTarget.x - parallaxX) * 0.02;
      parallaxY += (mouseTarget.y - parallaxY) * 0.02;

      // Slow autonomous drift, independent of the mouse, so the sky is
      // always gently moving — a faint rotation plus a subtle vertical bob.
      const driftY = time * 0.012;
      const driftX = Math.sin(time * 0.055) * 0.035;
      starGroup.rotation.y = driftY + parallaxX * 0.15;
      starGroup.rotation.x = driftX + parallaxY * 0.1;
      nebulaGroup.rotation.y = driftY * 0.4 + parallaxX * 0.05;

      nebulaMeshes.forEach((m, i) => {
        m.rotation.z += 0.0006 * (i % 2 === 0 ? 1 : -1);
      });

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0" />
    </div>
  );
}
