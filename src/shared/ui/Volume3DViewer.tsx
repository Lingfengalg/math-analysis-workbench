import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  TRIPLE_REGION_LABELS,
  type TripleIntegralRequest,
  type TripleIntegralResult,
  type TripleRegionType,
  type TripleVoxel,
} from '@/shared/contracts';
import styles from './Volume3DViewer.module.css';

export interface Volume3DViewerProps {
  result: TripleIntegralResult;
  request: TripleIntegralRequest;
}

type CameraPreset = 'iso' | 'top' | 'front' | 'side';

interface VolumeSpatialTransform {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  mapX: (x: number) => number;
  mapY: (y: number) => number;
  mapZ: (z: number) => number;
}

interface VolumeEngineHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  contentGroup: THREE.Group;
  shellGroup: THREE.Group;
  requestRender: () => void;
  flyTo: (preset: CameraPreset) => void;
}

const BOX_HALF = 2.75;

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  iso: { pos: [6.4, -7.2, 5.2], target: [0, 0, -0.05] },
  top: { pos: [0, -0.003, 10.8], target: [0, 0, 0] },
  front: { pos: [0, -10.6, 0.12], target: [0, 0, 0] },
  side: { pos: [10.6, 0, 0.12], target: [0, 0, 0] },
};

const COLOR_STOPS: ReadonlyArray<{ t: number; hex: number }> = [
  { t: 0.0, hex: 0x0d5c4d },
  { t: 0.36, hex: 0x1ea888 },
  { t: 0.7, hex: 0xeab354 },
  { t: 1.0, hex: 0xdf6c4f },
];

function detectWebGLSupport(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  if (
    !('WebGLRenderingContext' in window) &&
    !('WebGL2RenderingContext' in window)
  ) {
    return false;
  }
  try {
    const probe = document.createElement('canvas');
    const ctx =
      probe.getContext('webgl2') ??
      probe.getContext('webgl') ??
      probe.getContext('experimental-webgl');
    return Boolean(ctx);
  } catch {
    return false;
  }
}

function formatAxisNumber(val: number): string {
  const clean = Object.is(val, -0) || Math.abs(val) < 1e-12 ? 0 : val;
  if (clean === 0) return '0';
  const abs = Math.abs(clean);
  if (abs >= 1e4 || abs < 1e-3) {
    return clean.toExponential(1).replace('+', '');
  }
  return String(Number(clean.toFixed(2)));
}

function writeDensityColor(
  tRaw: number,
  out: THREE.Color,
  scratchA: THREE.Color,
  scratchB: THREE.Color,
): THREE.Color {
  const t = Math.max(0, Math.min(1, tRaw));
  for (let i = 0; i < COLOR_STOPS.length - 1; i += 1) {
    const c0 = COLOR_STOPS[i];
    const c1 = COLOR_STOPS[i + 1];
    if (t <= c1.t || i === COLOR_STOPS.length - 2) {
      const localT =
        c1.t > c0.t ? Math.max(0, Math.min(1, (t - c0.t) / (c1.t - c0.t))) : 0;
      scratchA.setHex(c0.hex);
      scratchB.setHex(c1.hex);
      return out.lerpColors(scratchA, scratchB, localT);
    }
  }
  return out.setHex(COLOR_STOPS[COLOR_STOPS.length - 1].hex);
}

function resolveValueBounds(result: TripleIntegralResult): {
  vLo: number;
  vHi: number;
} {
  let vLo =
    result.valueMin !== null && Number.isFinite(result.valueMin)
      ? result.valueMin
      : Infinity;
  let vHi =
    result.valueMax !== null && Number.isFinite(result.valueMax)
      ? result.valueMax
      : -Infinity;

  if (!Number.isFinite(vLo) || !Number.isFinite(vHi)) {
    for (const v of result.voxels) {
      if (!Number.isFinite(v.value)) continue;
      if (v.value < vLo) vLo = v.value;
      if (v.value > vHi) vHi = v.value;
    }
  }

  if (!Number.isFinite(vLo) || !Number.isFinite(vHi)) {
    return { vLo: 0, vHi: 1 };
  }
  return { vLo, vHi };
}

function buildVolumeSpatialTransform(
  request: TripleIntegralRequest,
): VolumeSpatialTransform {
  const xMin = Number.isFinite(request.xMin) ? request.xMin : -1;
  let xMax = Number.isFinite(request.xMax) ? request.xMax : 1;
  if (xMax <= xMin) xMax = xMin + 2;

  const yMin = Number.isFinite(request.yMin) ? request.yMin : -1;
  let yMax = Number.isFinite(request.yMax) ? request.yMax : 1;
  if (yMax <= yMin) yMax = yMin + 2;

  const zMin = Number.isFinite(request.zMin) ? request.zMin : -1;
  let zMax = Number.isFinite(request.zMax) ? request.zMax : 1;
  if (zMax <= zMin) zMax = zMin + 2;

  const xMid = (xMin + xMax) * 0.5;
  const yMid = (yMin + yMax) * 0.5;
  const zMid = (zMin + zMax) * 0.5;

  const xHalf = Math.max((xMax - xMin) * 0.5, 1e-6);
  const yHalf = Math.max((yMax - yMin) * 0.5, 1e-6);
  const zHalf = Math.max((zMax - zMin) * 0.5, 1e-6);

  const scaleX = BOX_HALF / xHalf;
  const scaleY = BOX_HALF / yHalf;
  const scaleZ = BOX_HALF / zHalf;

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
    scaleX,
    scaleY,
    scaleZ,
    mapX: (x: number) => (x - xMid) * scaleX,
    mapY: (y: number) => (y - yMid) * scaleY,
    mapZ: (z: number) => (z - zMid) * scaleZ,
  };
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ('geometry' in obj && obj.geometry instanceof THREE.BufferGeometry) {
      obj.geometry.dispose();
    }
    if ('material' in obj && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m instanceof THREE.Material) {
          if ('map' in m && m.map instanceof THREE.Texture) {
            m.map.dispose();
          }
          m.dispose();
        }
      }
    }
    if (obj instanceof THREE.InstancedMesh) {
      obj.dispose();
    }
  });
  while (root.children.length > 0) {
    root.remove(root.children[0]);
  }
}

function createTextSprite(
  text: string,
  color: string,
  options?: { bold?: boolean; scale?: number },
): THREE.Sprite | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontSize = 36;
    const weight = options?.bold ? '700' : '600';
    const font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", sans-serif`;
    ctx.font = font;
    const textWidth = Math.ceil(ctx.measureText(text).width);
    const padX = 24;
    const padY = 14;

    canvas.width = Math.max(64, textWidth + padX * 2);
    canvas.height = fontSize + padY * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.74)';
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(r, 2);
    ctx.lineTo(canvas.width - r, 2);
    ctx.quadraticCurveTo(canvas.width - 2, 2, canvas.width - 2, r);
    ctx.lineTo(canvas.width - 2, canvas.height - r);
    ctx.quadraticCurveTo(
      canvas.width - 2,
      canvas.height - 2,
      canvas.width - r,
      canvas.height - 2,
    );
    ctx.lineTo(r, canvas.height - 2);
    ctx.quadraticCurveTo(2, canvas.height - 2, 2, canvas.height - r);
    ctx.lineTo(2, r);
    ctx.quadraticCurveTo(2, 2, r, 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.52);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const baseScale = options?.scale ?? 0.31;
    const aspect = canvas.width / canvas.height;
    sprite.scale.set(baseScale * aspect, baseScale, 1);
    sprite.renderOrder = 14;
    return sprite;
  } catch {
    return null;
  }
}

function buildCoordinateBoxAndAxes(tf: VolumeSpatialTransform): THREE.Group {
  const group = new THREE.Group();
  const b = BOX_HALF;

  const boxVerts = new Float32Array([
    b,
    -b,
    -b,
    b,
    b,
    -b,
    b,
    b,
    -b,
    -b,
    b,
    -b,
    -b,
    -b,
    b,
    b,
    -b,
    b,
    b,
    -b,
    b,
    b,
    b,
    b,
    b,
    b,
    b,
    -b,
    b,
    b,
    -b,
    b,
    b,
    -b,
    -b,
    b,
    b,
    -b,
    -b,
    b,
    -b,
    b,
    b,
    b,
    -b,
    b,
    b,
    b,
    -b,
    b,
    -b,
    -b,
    b,
    b,
  ]);
  const boxGeo = new THREE.BufferGeometry();
  boxGeo.setAttribute('position', new THREE.BufferAttribute(boxVerts, 3));
  group.add(
    new THREE.LineSegments(
      boxGeo,
      new THREE.LineBasicMaterial({
        color: 0x1e4d40,
        transparent: true,
        opacity: 0.16,
      }),
    ),
  );

  // Subtle floor grid on z = -BOX_HALF
  const floorPlaneGeo = new THREE.PlaneGeometry(b * 2, b * 2);
  const floorMesh = new THREE.Mesh(
    floorPlaneGeo,
    new THREE.MeshBasicMaterial({
      color: 0xf2f8f6,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  floorMesh.position.set(0, 0, -b - 0.008);
  group.add(floorMesh);

  const gridSegs: number[] = [];
  const gridDivs = 8;
  for (let k = 0; k <= gridDivs; k += 1) {
    const u = -b + (b * 2 * k) / gridDivs;
    gridSegs.push(u, -b, -b, u, b, -b);
    gridSegs.push(-b, u, -b, b, u, -b);
  }
  const floorGridGeo = new THREE.BufferGeometry();
  floorGridGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(gridSegs), 3),
  );
  group.add(
    new THREE.LineSegments(
      floorGridGeo,
      new THREE.LineBasicMaterial({
        color: 0x1c5446,
        transparent: true,
        opacity: 0.12,
      }),
    ),
  );

  const addAxisWithArrow = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    hex: number,
  ) => {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
    group.add(
      new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: hex })),
    );

    const coneGeo = new THREE.ConeGeometry(0.072, 0.22, 18);
    const coneMat = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.35,
      metalness: 0.1,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    const dir = end.clone().sub(start).normalize();
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(cone);
  };

  addAxisWithArrow(
    new THREE.Vector3(-b, -b, -b),
    new THREE.Vector3(b + 0.32, -b, -b),
    0xd45846,
  );
  addAxisWithArrow(
    new THREE.Vector3(-b, -b, -b),
    new THREE.Vector3(-b, b + 0.32, -b),
    0x168f72,
  );
  addAxisWithArrow(
    new THREE.Vector3(-b, -b, -b),
    new THREE.Vector3(-b, -b, b + 0.32),
    0x3568d4,
  );

  const placeLabel = (
    text: string,
    color: string,
    pos: [number, number, number],
    bold = false,
    scale = 0.28,
  ) => {
    const sp = createTextSprite(text, color, { bold, scale });
    if (sp) {
      sp.position.set(pos[0], pos[1], pos[2]);
      group.add(sp);
    }
  };

  placeLabel('X', '#c54634', [b + 0.62, -b, -b], true, 0.34);
  placeLabel('Y', '#117c62', [-b, b + 0.62, -b], true, 0.34);
  placeLabel('Z', '#2856c2', [-b, -b, b + 0.62], true, 0.34);

  const xMid = (tf.xMin + tf.xMax) * 0.5;
  const yMid = (tf.yMin + tf.yMax) * 0.5;
  const zMid = (tf.zMin + tf.zMax) * 0.5;

  placeLabel(formatAxisNumber(tf.xMin), '#8f3a2e', [-b, -b - 0.34, -b - 0.14]);
  placeLabel(formatAxisNumber(xMid), '#8f3a2e', [0, -b - 0.34, -b - 0.14]);
  placeLabel(formatAxisNumber(tf.xMax), '#8f3a2e', [b, -b - 0.34, -b - 0.14]);

  placeLabel(formatAxisNumber(tf.yMin), '#126954', [-b - 0.36, -b, -b - 0.14]);
  placeLabel(formatAxisNumber(yMid), '#126954', [-b - 0.36, 0, -b - 0.14]);
  placeLabel(formatAxisNumber(tf.yMax), '#126954', [-b - 0.36, b, -b - 0.14]);

  placeLabel(formatAxisNumber(tf.zMin), '#274da8', [-b - 0.36, -b - 0.26, -b]);
  placeLabel(formatAxisNumber(zMid), '#274da8', [-b - 0.36, -b - 0.26, 0]);
  placeLabel(formatAxisNumber(tf.zMax), '#274da8', [-b - 0.36, -b - 0.26, b]);

  return group;
}

function buildRegionShellGroup(regionType: TripleRegionType): THREE.Group {
  const group = new THREE.Group();
  const b = BOX_HALF;

  const glassMat = () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x169c80,
      transparent: true,
      opacity: 0.09,
      roughness: 0.18,
      metalness: 0.04,
      clearcoat: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

  const wireMat = (opacity = 0.44) =>
    new THREE.LineBasicMaterial({
      color: 0x0d7a63,
      transparent: true,
      opacity,
    });

  if (regionType === 'box') {
    const geo = new THREE.BoxGeometry(b * 2, b * 2, b * 2);
    const mesh = new THREE.Mesh(geo, glassMat());
    mesh.renderOrder = 6;
    group.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      wireMat(0.46),
    );
    edges.renderOrder = 7;
    group.add(edges);
    return group;
  }

  if (regionType === 'sphere') {
    const geo = new THREE.SphereGeometry(b, 40, 28);
    const mesh = new THREE.Mesh(geo, glassMat());
    mesh.renderOrder = 6;
    group.add(mesh);

    const ringSegs = 72;
    const ringVerts = (fn: (t: number) => THREE.Vector3) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < ringSegs; i += 1) {
        pts.push(fn((Math.PI * 2 * i) / ringSegs));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    };

    // Equator + 2 orthogonal principal meridians
    const eq = new THREE.LineLoop(
      ringVerts((t) => new THREE.Vector3(b * Math.cos(t), b * Math.sin(t), 0)),
      wireMat(0.48),
    );
    const merXZ = new THREE.LineLoop(
      ringVerts((t) => new THREE.Vector3(b * Math.cos(t), 0, b * Math.sin(t))),
      wireMat(0.36),
    );
    const merYZ = new THREE.LineLoop(
      ringVerts((t) => new THREE.Vector3(0, b * Math.cos(t), b * Math.sin(t))),
      wireMat(0.36),
    );
    eq.renderOrder = 7;
    merXZ.renderOrder = 7;
    merYZ.renderOrder = 7;
    group.add(eq, merXZ, merYZ);

    // Latitude rings at z = +-0.5 * b
    for (const zSign of [-0.5, 0.5]) {
      const rLat = b * Math.sqrt(1 - zSign * zSign);
      const zLat = b * zSign;
      const latLoop = new THREE.LineLoop(
        ringVerts(
          (t) =>
            new THREE.Vector3(rLat * Math.cos(t), rLat * Math.sin(t), zLat),
        ),
        wireMat(0.24),
      );
      latLoop.renderOrder = 7;
      group.add(latLoop);
    }
    return group;
  }

  if (regionType === 'cylinder') {
    const geo = new THREE.CylinderGeometry(b, b, b * 2, 48, 1, false);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, glassMat());
    mesh.renderOrder = 6;
    group.add(mesh);

    const ringSegs = 64;
    for (const zEnd of [-b, 0, b]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < ringSegs; i += 1) {
        const theta = (Math.PI * 2 * i) / ringSegs;
        pts.push(
          new THREE.Vector3(b * Math.cos(theta), b * Math.sin(theta), zEnd),
        );
      }
      const loop = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        wireMat(zEnd === 0 ? 0.24 : 0.5),
      );
      loop.renderOrder = 7;
      group.add(loop);
    }

    const genVerts: number[] = [];
    for (let k = 0; k < 8; k += 1) {
      const theta = (Math.PI * 2 * k) / 8;
      const cx = b * Math.cos(theta);
      const cy = b * Math.sin(theta);
      genVerts.push(cx, cy, -b, cx, cy, b);
    }
    const genGeo = new THREE.BufferGeometry();
    genGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(genVerts), 3),
    );
    const genLines = new THREE.LineSegments(genGeo, wireMat(0.32));
    genLines.renderOrder = 7;
    group.add(genLines);
    return group;
  }

  if (regionType === 'tetrahedron') {
    const verts = new Float32Array([
      -b,
      -b,
      -b, // 0: origin corner
      b,
      -b,
      -b, // 1: +X corner
      -b,
      b,
      -b, // 2: +Y corner
      -b,
      -b,
      b, // 3: +Z corner
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, glassMat());
    mesh.renderOrder = 6;
    group.add(mesh);

    const edgeSegs = new Float32Array([
      -b,
      -b,
      -b,
      b,
      -b,
      -b,
      -b,
      -b,
      -b,
      -b,
      b,
      -b,
      -b,
      -b,
      -b,
      -b,
      -b,
      b,
      b,
      -b,
      -b,
      -b,
      b,
      -b,
      -b,
      b,
      -b,
      -b,
      -b,
      b,
      -b,
      -b,
      b,
      b,
      -b,
      -b,
    ]);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeSegs, 3));
    const edgeLines = new THREE.LineSegments(edgeGeo, wireMat(0.54));
    edgeLines.renderOrder = 7;
    group.add(edgeLines);
    return group;
  }

  // 'paraboloid-cap': z >= zMin + (zMax - zMin) * (((x-cx)/rx)^2 + ((y-cy)/ry)^2), z <= zMax
  const radialSteps = 20;
  const angularSteps = 48;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let ir = 0; ir <= radialSteps; ir += 1) {
    const r = ir / radialSteps;
    const wz = (-1 + 2 * r * r) * b;
    for (let ia = 0; ia <= angularSteps; ia += 1) {
      const theta = (Math.PI * 2 * ia) / angularSteps;
      positions.push(r * b * Math.cos(theta), r * b * Math.sin(theta), wz);
    }
  }

  const stride = angularSteps + 1;
  for (let ir = 0; ir < radialSteps; ir += 1) {
    for (let ia = 0; ia < angularSteps; ia += 1) {
      const i00 = ir * stride + ia;
      const i10 = i00 + 1;
      const i01 = i00 + stride;
      const i11 = i01 + 1;
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  const bowlGeo = new THREE.BufferGeometry();
  bowlGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  bowlGeo.setIndex(indices);
  bowlGeo.computeVertexNormals();
  const bowlMesh = new THREE.Mesh(bowlGeo, glassMat());
  bowlMesh.renderOrder = 6;
  group.add(bowlMesh);

  // Top flat cap disk at z = +b
  const capGeo = new THREE.CircleGeometry(b, angularSteps);
  const capMesh = new THREE.Mesh(
    capGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x169c80,
      transparent: true,
      opacity: 0.06,
      roughness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  capMesh.position.z = b;
  capMesh.renderOrder = 6;
  group.add(capMesh);

  // Latitude rings at r = 0.5, 0.75, 1.0
  for (const rRing of [0.5, 0.75, 1.0]) {
    const zRing = (-1 + 2 * rRing * rRing) * b;
    const pts: THREE.Vector3[] = [];
    for (let ia = 0; ia < 64; ia += 1) {
      const theta = (Math.PI * 2 * ia) / 64;
      pts.push(
        new THREE.Vector3(
          rRing * b * Math.cos(theta),
          rRing * b * Math.sin(theta),
          zRing,
        ),
      );
    }
    const loop = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      wireMat(rRing === 1 ? 0.52 : 0.28),
    );
    loop.renderOrder = 7;
    group.add(loop);
  }

  // 8 parabolic meridian ribs
  for (let k = 0; k < 8; k += 1) {
    const theta = (Math.PI * 2 * k) / 8;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const pts: THREE.Vector3[] = [];
    for (let ir = 0; ir <= radialSteps; ir += 1) {
      const r = ir / radialSteps;
      pts.push(
        new THREE.Vector3(r * b * cosT, r * b * sinT, (-1 + 2 * r * r) * b),
      );
    }
    const rib = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      wireMat(0.32),
    );
    rib.renderOrder = 7;
    group.add(rib);
  }

  return group;
}

function buildVoxelInstancedMesh(
  items: TripleVoxel[],
  tf: VolumeSpatialTransform,
  vLo: number,
  vHi: number,
  options: {
    opacity: number;
    depthWrite: boolean;
    renderOrder: number;
    gapFactor: number;
    withEdgeOutline: boolean;
  },
): THREE.Group {
  const group = new THREE.Group();
  if (items.length === 0) return group;

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: options.opacity,
    roughness: 0.26,
    metalness: 0.05,
    clearcoat: options.withEdgeOutline ? 0.28 : 0.08,
    depthWrite: options.depthWrite,
  });

  const instanced = new THREE.InstancedMesh(unitBox, mat, items.length);
  instanced.renderOrder = options.renderOrder;

  const dummyPos = new THREE.Vector3();
  const dummyQuat = new THREE.Quaternion();
  const dummyScale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const cOut = new THREE.Color();
  const cA = new THREE.Color();
  const cB = new THREE.Color();

  const span = vHi - vLo;
  const edgePositions: number[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const v = items[i];
    const wx = tf.mapX(v.x);
    const wy = tf.mapY(v.y);
    const wz = tf.mapZ(v.z);

    const sx = Math.max(v.dx * options.gapFactor * tf.scaleX, 0.014);
    const sy = Math.max(v.dy * options.gapFactor * tf.scaleY, 0.014);
    const sz = Math.max(v.dz * options.gapFactor * tf.scaleZ, 0.014);

    dummyPos.set(wx, wy, wz);
    dummyScale.set(sx, sy, sz);
    matrix.compose(dummyPos, dummyQuat, dummyScale);
    instanced.setMatrixAt(i, matrix);

    const t = span > 1e-9 ? (v.value - vLo) / span : 0.36;
    writeDensityColor(t, cOut, cA, cB);
    instanced.setColorAt(i, cOut);

    if (options.withEdgeOutline) {
      const hx = sx * 0.5;
      const hy = sy * 0.5;
      const hz = sz * 0.5;
      const x0 = wx - hx;
      const x1 = wx + hx;
      const y0 = wy - hy;
      const y1 = wy + hy;
      const z0 = wz - hz;
      const z1 = wz + hz;

      // Top & bottom rims of each highlighted slice voxel
      edgePositions.push(
        x0,
        y0,
        z1,
        x1,
        y0,
        z1,
        x1,
        y0,
        z1,
        x1,
        y1,
        z1,
        x1,
        y1,
        z1,
        x0,
        y1,
        z1,
        x0,
        y1,
        z1,
        x0,
        y0,
        z1,
        x0,
        y0,
        z0,
        x1,
        y0,
        z0,
        x1,
        y0,
        z0,
        x1,
        y1,
        z0,
        x1,
        y1,
        z0,
        x0,
        y1,
        z0,
        x0,
        y1,
        z0,
        x0,
        y0,
        z0,
      );
    }
  }

  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) {
    instanced.instanceColor.needsUpdate = true;
  }
  group.add(instanced);

  if (options.withEdgeOutline && edgePositions.length > 0) {
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(edgePositions), 3),
    );
    const edges = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({
        color: 0xd8fff4,
        transparent: true,
        opacity: 0.62,
      }),
    );
    edges.renderOrder = options.renderOrder + 1;
    group.add(edges);
  }

  return group;
}

function buildCrossSectionSliceGroup(
  sliceZ: number,
  regionType: TripleRegionType,
  tf: VolumeSpatialTransform,
): THREE.Group {
  const group = new THREE.Group();
  const b = BOX_HALF;
  const clampedZ = Math.max(tf.zMin, Math.min(tf.zMax, sliceZ));
  const wz = tf.mapZ(clampedZ);

  // Subtle glowing horizontal sheet across bounding square
  const sheetGeo = new THREE.PlaneGeometry(b * 2.04, b * 2.04);
  const sheetMat = new THREE.MeshBasicMaterial({
    color: 0x06d6a0,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const sheetMesh = new THREE.Mesh(sheetGeo, sheetMat);
  sheetMesh.position.set(0, 0, wz);
  sheetMesh.renderOrder = 8;
  group.add(sheetMesh);

  // Outer glowing emerald frame at z = sliceZ
  const framePts = [
    new THREE.Vector3(-b * 1.02, -b * 1.02, wz),
    new THREE.Vector3(b * 1.02, -b * 1.02, wz),
    new THREE.Vector3(b * 1.02, b * 1.02, wz),
    new THREE.Vector3(-b * 1.02, b * 1.02, wz),
  ];
  const frameLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(framePts),
    new THREE.LineBasicMaterial({
      color: 0x05b58d,
      transparent: true,
      opacity: 0.86,
    }),
  );
  frameLine.renderOrder = 9;
  group.add(frameLine);

  // Analytical cross-section contour Dz on z = sliceZ
  const zSpan = Math.max(tf.zMax - tf.zMin, 1e-9);
  const t = (clampedZ - tf.zMin) / zSpan;
  const contourPts: THREE.Vector3[] = [];

  if (regionType === 'cylinder') {
    const segs = 64;
    for (let i = 0; i < segs; i += 1) {
      const theta = (Math.PI * 2 * i) / segs;
      contourPts.push(
        new THREE.Vector3(b * Math.cos(theta), b * Math.sin(theta), wz + 0.008),
      );
    }
  } else if (regionType === 'sphere') {
    const zn = 2 * t - 1;
    const rScale = Math.sqrt(Math.max(0, 1 - zn * zn));
    if (rScale > 1e-4) {
      const segs = 64;
      for (let i = 0; i < segs; i += 1) {
        const theta = (Math.PI * 2 * i) / segs;
        contourPts.push(
          new THREE.Vector3(
            rScale * b * Math.cos(theta),
            rScale * b * Math.sin(theta),
            wz + 0.008,
          ),
        );
      }
    }
  } else if (regionType === 'paraboloid-cap') {
    const rScale = Math.sqrt(Math.max(0, t));
    if (rScale > 1e-4) {
      const segs = 64;
      for (let i = 0; i < segs; i += 1) {
        const theta = (Math.PI * 2 * i) / segs;
        contourPts.push(
          new THREE.Vector3(
            rScale * b * Math.cos(theta),
            rScale * b * Math.sin(theta),
            wz + 0.008,
          ),
        );
      }
    }
  } else if (regionType === 'tetrahedron') {
    const s = Math.max(0, 1 - t);
    if (s > 1e-4) {
      contourPts.push(
        new THREE.Vector3(-b, -b, wz + 0.008),
        new THREE.Vector3(-b + 2 * b * s, -b, wz + 0.008),
        new THREE.Vector3(-b, -b + 2 * b * s, wz + 0.008),
      );
    }
  }

  if (contourPts.length >= 3) {
    const contourLoop = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(contourPts),
      new THREE.LineBasicMaterial({
        color: 0x34f5c5,
        transparent: true,
        opacity: 0.98,
      }),
    );
    contourLoop.renderOrder = 10;
    group.add(contourLoop);

    const shape = new THREE.Shape(
      contourPts.map((p) => new THREE.Vector2(p.x, p.y)),
    );
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMesh = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({
        color: 0x06d6a0,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    fillMesh.position.z = wz + 0.004;
    fillMesh.renderOrder = 9;
    group.add(fillMesh);
  }

  const label = createTextSprite(`z = ${formatAxisNumber(sliceZ)}`, '#0d6f59', {
    bold: true,
    scale: 0.28,
  });
  if (label) {
    label.position.set(b + 0.56, b + 0.14, wz);
    group.add(label);
  }

  return group;
}

export function Volume3DViewer({ result, request }: Volume3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VolumeEngineHandle | null>(null);

  const [webglSupported] = useState(() => detectWebGLSupport());
  const [runtimeFallback, setRuntimeFallback] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPreset | null>('iso');
  const [shellEnabled, setShellEnabled] = useState(true);

  const shellRef = useRef(shellEnabled);
  useEffect(() => {
    shellRef.current = shellEnabled;
  }, [shellEnabled]);

  const spatial = useMemo(
    () => buildVolumeSpatialTransform(request),
    [request],
  );
  const { vLo, vHi } = useMemo(() => resolveValueBounds(result), [result]);
  const hasSlice = request.sliceZ !== undefined;

  // Effect 1: Initialize WebGLRenderer, Z-up Camera, Lighting & On-Demand OrbitControls
  useEffect(() => {
    if (!webglSupported || runtimeFallback) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      queueMicrotask(() => setRuntimeFallback(true));
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    const scene = new THREE.Scene();

    const initW = Math.max(container.clientWidth || 720, 100);
    const initH = Math.max(container.clientHeight || 480, 100);
    renderer.setSize(initW, initH, false);

    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.1, 120);
    camera.up.set(0, 0, 1);
    camera.position.set(...CAMERA_PRESETS.iso.pos);
    camera.lookAt(...CAMERA_PRESETS.iso.target);

    const hemiLight = new THREE.HemisphereLight(0xf6fcf9, 0xd5e6e0, 1.18);
    hemiLight.position.set(0, 0, 10);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.32);
    keyLight.position.set(7.5, -8.5, 11);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdcf4ec, 0.64);
    fillLight.position.set(-8, 7.5, 6);
    scene.add(fillLight);

    const underLight = new THREE.DirectionalLight(0xfbe8d3, 0.34);
    underLight.position.set(0, 2, -9);
    scene.add(underLight);

    const contentGroup = new THREE.Group();
    const shellGroup = new THREE.Group();
    shellGroup.visible = shellRef.current;
    scene.add(contentGroup);
    scene.add(shellGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.iso.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.84;
    controls.zoomSpeed = 0.95;
    controls.panSpeed = 0.82;
    controls.minDistance = 3.2;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.015;
    controls.maxPolarAngle = Math.PI * 0.96;
    controls.update();

    let rafId = 0;
    let isTicking = false;
    let tweenState: {
      startTime: number;
      durationMs: number;
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
      fromTarget: THREE.Vector3;
      toTarget: THREE.Vector3;
    } | null = null;

    const tick = (now: number) => {
      rafId = 0;
      isTicking = true;

      let tweenActive = false;
      if (tweenState) {
        const elapsed = Math.max(0, now - tweenState.startTime);
        const rawT = Math.min(1, elapsed / tweenState.durationMs);
        const eased = 1 - Math.pow(1 - rawT, 3);
        camera.position.lerpVectors(
          tweenState.fromPos,
          tweenState.toPos,
          eased,
        );
        controls.target.lerpVectors(
          tweenState.fromTarget,
          tweenState.toTarget,
          eased,
        );
        if (rawT >= 1) {
          tweenState = null;
        } else {
          tweenActive = true;
        }
      }

      const dampingActive = controls.update();
      renderer.render(scene, camera);
      isTicking = false;

      if (tweenActive || dampingActive) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const requestRender = () => {
      if (isTicking || rafId !== 0) return;
      rafId = window.requestAnimationFrame(tick);
    };

    const onUserInteractStart = () => {
      tweenState = null;
      setActivePreset(null);
      requestRender();
    };

    controls.addEventListener('start', onUserInteractStart);
    controls.addEventListener('change', requestRender);

    const flyTo = (preset: CameraPreset) => {
      const cfg = CAMERA_PRESETS[preset];
      const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (reducedMotion) {
        tweenState = null;
        camera.position.set(...cfg.pos);
        controls.target.set(...cfg.target);
        controls.update();
        requestRender();
        return;
      }

      tweenState = {
        startTime: performance.now(),
        durationMs: 340,
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(...cfg.pos),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(...cfg.target),
      };
      requestRender();
    };

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 20 || h <= 20) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(container);

    engineRef.current = {
      scene,
      camera,
      renderer,
      controls,
      contentGroup,
      shellGroup,
      requestRender,
      flyTo,
    };

    requestRender();

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      controls.removeEventListener('start', onUserInteractStart);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      disposeObjectTree(contentGroup);
      disposeObjectTree(shellGroup);
      renderer.dispose();
      engineRef.current = null;
    };
  }, [webglSupported, runtimeFallback]);

  // Effect 2: Rebuild 3D voxels, region shell, and cross-section slice when data changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    disposeObjectTree(engine.contentGroup);
    disposeObjectTree(engine.shellGroup);

    engine.contentGroup.add(buildCoordinateBoxAndAxes(spatial));
    engine.shellGroup.add(buildRegionShellGroup(request.regionType));

    if (request.sliceZ !== undefined) {
      const nonSliceVoxels = result.voxels.filter((v) => !v.inSlice);
      const sliceVoxels = result.voxels.filter((v) => v.inSlice);

      if (nonSliceVoxels.length > 0) {
        engine.contentGroup.add(
          buildVoxelInstancedMesh(nonSliceVoxels, spatial, vLo, vHi, {
            opacity: 0.18,
            depthWrite: false,
            renderOrder: 2,
            gapFactor: 0.86,
            withEdgeOutline: false,
          }),
        );
      }

      if (sliceVoxels.length > 0) {
        engine.contentGroup.add(
          buildVoxelInstancedMesh(sliceVoxels, spatial, vLo, vHi, {
            opacity: 0.92,
            depthWrite: true,
            renderOrder: 4,
            gapFactor: 0.92,
            withEdgeOutline: true,
          }),
        );
      }

      engine.contentGroup.add(
        buildCrossSectionSliceGroup(
          request.sliceZ,
          request.regionType,
          spatial,
        ),
      );
    } else if (result.voxels.length > 0) {
      engine.contentGroup.add(
        buildVoxelInstancedMesh(result.voxels, spatial, vLo, vHi, {
          opacity: 0.84,
          depthWrite: true,
          renderOrder: 3,
          gapFactor: 0.9,
          withEdgeOutline: false,
        }),
      );
    }

    engine.requestRender();
  }, [result, request.regionType, request.sliceZ, spatial, vLo, vHi]);

  // Effect 3: Instant toggle of geometric envelope shell without geometry reconstruction
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.shellGroup.visible = shellEnabled;
    engine.requestRender();
  }, [shellEnabled]);

  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    engineRef.current?.flyTo(preset);
  };

  const handleResetCamera = () => {
    setActivePreset('iso');
    engineRef.current?.flyTo('iso');
  };

  const showFallback = !webglSupported || runtimeFallback;

  return (
    <div
      ref={containerRef}
      className={`function-chart ${styles.viewerRoot}`}
      role="img"
      aria-label={`三元函数 ${request.expression} 的三重积分空间体素图像`}
    >
      {showFallback ? (
        <div className={styles.fallbackPanel}>
          <span className={styles.fallbackBadge}>三维体素视图 · 静态摘要</span>
          <p className={styles.fallbackTitle}>
            f(x, y, z) = {request.expression}
          </p>
          <p className={styles.fallbackMeta}>
            {TRIPLE_REGION_LABELS[request.regionType]}
            {' · '}包围盒 [{formatAxisNumber(spatial.xMin)},{' '}
            {formatAxisNumber(spatial.xMax)}] × [
            {formatAxisNumber(spatial.yMin)}, {formatAxisNumber(spatial.yMax)}]
            {' × '}[{formatAxisNumber(spatial.zMin)},{' '}
            {formatAxisNumber(spatial.zMax)}]{' · '}体素 {result.voxels.length}{' '}
            个
            {hasSlice &&
              request.sliceZ !== undefined &&
              ` · 截面 z = ${formatAxisNumber(request.sliceZ)}`}
          </p>
        </div>
      ) : (
        <canvas ref={canvasRef} className={styles.webglCanvas} />
      )}

      <div className={styles.hudTopRight}>
        <div className={styles.capsuleGroup}>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'iso' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('iso')}
          >
            等轴 3D
          </button>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'top' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('top')}
          >
            俯视 xOy（看截面 Dz）
          </button>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'front' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('front')}
          >
            正视 xOz
          </button>
          <button
            type="button"
            className={`${styles.capsuleBtn} ${activePreset === 'side' ? styles.capsuleBtnActive : ''}`}
            onClick={() => handleSelectPreset('side')}
          >
            侧视 yOz
          </button>
          <button
            type="button"
            className={styles.capsuleBtn}
            onClick={handleResetCamera}
          >
            重置视角
          </button>
        </div>

        <div className={styles.capsuleGroup}>
          <button
            type="button"
            aria-pressed={shellEnabled}
            className={`${styles.capsuleBtn} ${shellEnabled ? styles.capsuleBtnActive : ''}`}
            onClick={() => setShellEnabled((prev) => !prev)}
          >
            几何包络壳
          </button>
        </div>
      </div>

      <div className={styles.hudBottomLeft} aria-hidden="true">
        <div className={styles.scaleCard}>
          <div className={styles.scaleRow}>
            <span className={styles.scaleLabel}>密度 f</span>
            <span>{formatAxisNumber(vLo)}</span>
            <span className={styles.colorRamp} />
            <span>{formatAxisNumber(vHi)}</span>
          </div>

          <div className={styles.featureBadges}>
            {hasSlice && request.sliceZ !== undefined ? (
              <>
                <span className={styles.badgeItem}>
                  <span className={styles.swatchSlice} />
                  截面 z = {formatAxisNumber(request.sliceZ)}
                </span>
                <span className={styles.badgeItem}>
                  <span className={styles.swatchGhost} />
                  非截面体素 (0.18)
                </span>
              </>
            ) : (
              <span className={styles.badgeItem}>
                <span className={styles.swatchVoxel} />
                空间体素 ({result.voxels.length})
              </span>
            )}
            {shellEnabled && (
              <span className={styles.badgeItem}>
                <span className={styles.swatchShell} />
                几何包络壳
              </span>
            )}
          </div>
        </div>

        <div className={styles.interactionHint}>
          拖拽旋转 · 滚轮缩放 · 右键平移
        </div>
      </div>
    </div>
  );
}
