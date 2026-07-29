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

    // Soft circular texture, reused for nebula glows
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

    // ── MOUSE-DRIVEN SHOOTING STAR TRAIL ────────────────────────────────────
    const TRAIL_MAX = 140;
    const trailPos   = new Float32Array(TRAIL_MAX * 3);
    const trailVel   = new Float32Array(TRAIL_MAX * 3);
    const trailLife  = new Float32Array(TRAIL_MAX).fill(1); // 1 = dead/invisible
    let trailCursor = 0;

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    trailGeo.setAttribute("aLife", new THREE.BufferAttribute(trailLife, 1));

    const trailMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute float aLife;
        varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          float size = mix(0.22, 0.02, aLife);
          gl_PointSize = size * (260.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float edge = smoothstep(0.5, 0.0, d);
          float alpha = edge * (1.0 - vLife);
          vec3 col = mix(vec3(0.65, 0.85, 1.0), vec3(1.0, 1.0, 0.98), 1.0 - vLife);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    scene.add(new THREE.Points(trailGeo, trailMat));

    const spawnSpark = (x: number, y: number, z: number, vx: number, vy: number) => {
      const i = trailCursor;
      trailCursor = (trailCursor + 1) % TRAIL_MAX;
      trailPos[i * 3]     = x + (Math.random() - 0.5) * 0.05;
      trailPos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.05;
      trailPos[i * 3 + 2] = z;
      trailVel[i * 3]     = vx * 0.02 + (Math.random() - 0.5) * 0.003;
      trailVel[i * 3 + 1] = vy * 0.02 + (Math.random() - 0.5) * 0.003;
      trailVel[i * 3 + 2] = 0;
      trailLife[i] = 0;
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

    let lastMouse: { x: number; y: number } | null = null;
    const mouseTarget = { x: 0, y: 0 };

    const onPointerMove = (e: PointerEvent) => {
      const p = worldFromMouse(e.clientX, e.clientY);
      mouseTarget.x = e.clientX / window.innerWidth - 0.5;
      mouseTarget.y = e.clientY / window.innerHeight - 0.5;

      if (lastMouse) {
        const dx = p.x - lastMouse.x;
        const dy = p.y - lastMouse.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.min(Math.ceil(dist / 0.08), 12);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          spawnSpark(
            lastMouse.x + dx * t,
            lastMouse.y + dy * t,
            0,
            dx / (steps * 0.016),
            dy / (steps * 0.016)
          );
        }
      }
      lastMouse = p;
    };
    window.addEventListener("pointermove", onPointerMove);

    // ── ANIMATION ─────────────────────────────────────────────────────────────
    let frameId: number;
    let time = 0;
    const trailPosAttr  = trailGeo.attributes.position as THREE.BufferAttribute;
    const trailLifeAttr = trailGeo.attributes.aLife as THREE.BufferAttribute;
    let parallaxX = 0;
    let parallaxY = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      time += 0.016;

      starMat.uniforms.uTime.value = time;

      for (let i = 0; i < TRAIL_MAX; i++) {
        if (trailLife[i] >= 1) continue;
        trailLife[i] += 0.045;
        trailPos[i * 3]     += trailVel[i * 3];
        trailPos[i * 3 + 1] += trailVel[i * 3 + 1];
      }
      trailPosAttr.needsUpdate = true;
      trailLifeAttr.needsUpdate = true;

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
