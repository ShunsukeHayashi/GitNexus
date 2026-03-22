/**
 * graphNodeUtils.ts
 * Shared types, color constants, and Three.js mesh factory for the 3D knowledge graph.
 * Extracted from GraphCanvas.tsx (T006 component split).
 */

import * as THREE from 'three';
import type { AnimationType } from '../hooks/useAppState';

// ---------------------------------------------------------------------------
// Graph data types (used by GraphCanvas and data-wiring logic)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  glow: boolean;
  /** Animation type from triggerNodeAnimation; independent of the static glow flag */
  animationType?: AnimationType;
  activeAgents?: ActiveAgentMarker[];
  raw: any;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  color: string;
}

export interface ActiveAgentMarker {
  agentId: string;
  status: 'reading' | 'writing';
  avatar?: string;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Color constants
// ---------------------------------------------------------------------------

/** Vivid/bright node colors for dark canvas background (#06060a) */
export const NODE_COLORS: Record<string, string> = {
  Project:   '#e879f9',  // Bright fuchsia
  Package:   '#c084fc',  // Bright violet
  Module:    '#a78bfa',  // Bright purple
  Folder:    '#818cf8',  // Bright indigo
  File:      '#60a5fa',  // Bright sky blue
  Class:     '#fbbf24',  // Bright amber
  Function:  '#34d399',  // Bright emerald
  Method:    '#2dd4bf',  // Bright teal
  Interface: '#f472b6',  // Bright pink
  Enum:      '#fb923c',  // Bright orange
  Decorator: '#facc15',  // Bright yellow
  Community: '#38bdf8',  // Bright sky
  Process:   '#fb7185',  // Bright rose
};

/** Vivid edge colors per relationship type */
export const EDGE_COLORS: Record<string, string> = {
  CONTAINS:   '#22c55e',
  DEFINES:    '#06b6d4',
  IMPORTS:    '#60a5fa',
  CALLS:      '#c084fc',
  EXTENDS:    '#fb923c',
  IMPLEMENTS: '#f472b6',
};

export const DEFAULT_NODE_COLOR = '#94a3b8';
export const DEFAULT_EDGE_COLOR = '#4a4a70';

// Highlight colors — one per source (T002)
export const CITATION_COLOR  = '#06b6d4';  // Cyan   — AI citation grounding
export const TOOL_COLOR      = '#a855f7';  // Purple — AI tool result
export const HIGHLIGHT_COLOR = '#38bdf8';  // Sky    — manual query highlight
export const BLAST_COLOR     = '#ef4444';
export const SELECTED_COLOR  = '#f59e0b';
export const ACTIVE_AGENT_COLOR = '#fbbf24';

// ---------------------------------------------------------------------------
// T004: module-level geometry / material caches
// Geometries keyed by "radius:wSeg:hSeg", materials by visual parameters.
// Each node still receives its own THREE.Group for independent positioning.
// ---------------------------------------------------------------------------

const _geoCache     = new Map<string, THREE.SphereGeometry>();
const _matCache     = new Map<string, THREE.MeshPhongMaterial>();
const _haloGeoCache = new Map<string, THREE.SphereGeometry>();
const _haloMatCache = new Map<string, THREE.MeshBasicMaterial>();
const _spriteMatCache = new Map<string, THREE.SpriteMaterial>();

function _cachedSphereGeo(radius: number, w: number, h: number): THREE.SphereGeometry {
  const k = `${radius.toFixed(4)}:${w}:${h}`;
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.SphereGeometry(radius, w, h));
  return _geoCache.get(k)!;
}

function _cachedPhongMat(
  color: THREE.Color,
  shininess: number,
  emissive: THREE.Color,
): THREE.MeshPhongMaterial {
  const k = `${color.getHexString()}:${shininess}:${emissive.getHexString()}`;
  if (!_matCache.has(k)) {
    _matCache.set(k, new THREE.MeshPhongMaterial({
      color:    color.clone(),
      shininess,
      specular: new THREE.Color(0x666666),
      emissive: emissive.clone(),
    }));
  }
  return _matCache.get(k)!;
}

function _cachedHaloMat(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
  const k = `${color.getHexString()}:${opacity}`;
  if (!_haloMatCache.has(k)) {
    _haloMatCache.set(k, new THREE.MeshBasicMaterial({
      color:       color.clone(),
      transparent: true,
      opacity,
      side:        THREE.BackSide,
    }));
  }
  return _haloMatCache.get(k)!;
}

function _cachedAgentSpriteMat(label: string, color: string): THREE.SpriteMaterial {
  const key = `${label}:${color}`;
  if (!_spriteMatCache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.SpriteMaterial({ color: new THREE.Color(color) });
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    ctx.arc(48, 48, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(48, 48, 42, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.slice(0, 2).toUpperCase(), 48, 50);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    _spriteMatCache.set(key, new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  }
  return _spriteMatCache.get(key)!;
}

// ---------------------------------------------------------------------------
// buildNodeObject — MeshPhong sphere + optional glow halo
// Reuses cached geometries/materials (T004) to minimise GPU allocations per frame.
// animationType modifies emissive intensity and halo size independently of glow flag.
// ---------------------------------------------------------------------------

export function buildNodeObject(node: GraphNode): THREE.Group {
  const size  = Math.cbrt(node.val) * 2;
  const color = new THREE.Color(node.color);
  const group = new THREE.Group();
  const activeAgents = node.activeAgents ?? [];

  // Emissive scalar per state
  let emissiveScalar = 0;
  if      (node.animationType === 'glow')   emissiveScalar = 0.60;
  else if (node.animationType === 'pulse')  emissiveScalar = 0.55;
  else if (node.animationType === 'ripple') emissiveScalar = 0.25;
  else if (node.glow)                        emissiveScalar = 0.30;

  const emissiveColor = emissiveScalar > 0
    ? color.clone().multiplyScalar(emissiveScalar)
    : new THREE.Color(0x000000);

  const shininess = node.animationType === 'pulse' ? 120 : 60;

  // Core sphere — reuse cached geo + mat
  const geo = _cachedSphereGeo(size, 16, 8);
  const mat = _cachedPhongMat(color, shininess, emissiveColor);
  group.add(new THREE.Mesh(geo, mat));

  // Halo — ripple spreads wider; pulse/glow are brighter
  if (node.glow || node.animationType != null) {
    const haloRadius  = node.animationType === 'ripple' ? size * 3.5 : size * 2.8;
    const haloOpacity = node.animationType === 'pulse'  ? 0.35
                      : node.animationType === 'glow'   ? 0.30
                      : node.animationType === 'ripple' ? 0.15
                      : 0.18;

    const haloGeoKey = `${haloRadius.toFixed(4)}:12:6`;
    if (!_haloGeoCache.has(haloGeoKey))
      _haloGeoCache.set(haloGeoKey, new THREE.SphereGeometry(haloRadius, 12, 6));

    group.add(new THREE.Mesh(
      _haloGeoCache.get(haloGeoKey)!,
      _cachedHaloMat(color, haloOpacity),
    ));
  }

  if (activeAgents.length > 0) {
    const auraColor = new THREE.Color(ACTIVE_AGENT_COLOR);
    const auraRadius = size * 3.35;
    const auraKey = `${auraRadius.toFixed(4)}:16:10`;
    if (!_haloGeoCache.has(auraKey)) {
      _haloGeoCache.set(auraKey, new THREE.SphereGeometry(auraRadius, 16, 10));
    }
    group.add(new THREE.Mesh(
      _haloGeoCache.get(auraKey)!,
      _cachedHaloMat(auraColor, 0.2),
    ));

    activeAgents.slice(0, 2).forEach((agent, index) => {
      const label = (agent.avatar || agent.displayName || agent.agentId).slice(0, 2);
      const badgeColor = agent.status === 'writing' ? ACTIVE_AGENT_COLOR : '#60a5fa';
      const sprite = new THREE.Sprite(_cachedAgentSpriteMat(label, badgeColor));
      sprite.scale.set(size * 1.55, size * 1.55, 1);
      sprite.position.set(0, size * (2.1 + index * 1.15), 0);
      group.add(sprite);
    });
  }

  return group;
}
