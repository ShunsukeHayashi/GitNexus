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

// ---------------------------------------------------------------------------
// T004: module-level geometry / material caches
// Geometries keyed by "radius:wSeg:hSeg", materials by visual parameters.
// Each node still receives its own THREE.Group for independent positioning.
// ---------------------------------------------------------------------------

const _geoCache     = new Map<string, THREE.SphereGeometry>();
const _matCache     = new Map<string, THREE.MeshPhongMaterial>();
const _haloGeoCache = new Map<string, THREE.SphereGeometry>();
const _haloMatCache = new Map<string, THREE.MeshBasicMaterial>();

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

// ---------------------------------------------------------------------------
// T025: Golden aura color constant for active AI agent work
// ---------------------------------------------------------------------------

/** Golden aura color (#fbbf24) rendered on nodes being actively read/written by an AI agent */
export const AGENT_AURA_COLOR = '#fbbf24';

// Cache for T025 agent aura geometry/material (reused across all active nodes)
const _agentAuraGeoCache = new Map<string, THREE.SphereGeometry>();
const _agentAuraMatCache = new Map<string, THREE.MeshBasicMaterial>();

function _cachedAgentAuraMat(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
  const k = `${color.getHexString()}:${opacity}`;
  if (!_agentAuraMatCache.has(k)) {
    _agentAuraMatCache.set(k, new THREE.MeshBasicMaterial({
      color:       color.clone(),
      transparent: true,
      opacity,
      side:        THREE.BackSide,
    }));
  }
  return _agentAuraMatCache.get(k)!;
}

// ---------------------------------------------------------------------------
// buildNodeObject — MeshPhong sphere + optional glow halo
// Reuses cached geometries/materials (T004) to minimise GPU allocations per frame.
// animationType modifies emissive intensity and halo size independently of glow flag.
// T025: accepts an optional `isAgentActive` flag to add a golden aura.
// ---------------------------------------------------------------------------

export function buildNodeObject(node: GraphNode, isAgentActive = false): THREE.Group {
  const size  = Math.cbrt(node.val) * 2;
  const color = new THREE.Color(node.color);
  const group = new THREE.Group();

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

  // T025: Golden aura for nodes being actively read/written by an AI agent
  if (isAgentActive) {
    const auraRadius  = size * 4.2;
    const auraColor   = new THREE.Color(AGENT_AURA_COLOR);
    const auraGeoKey  = `${auraRadius.toFixed(4)}:14:7`;
    if (!_agentAuraGeoCache.has(auraGeoKey)) {
      _agentAuraGeoCache.set(auraGeoKey, new THREE.SphereGeometry(auraRadius, 14, 7));
    }
    group.add(new THREE.Mesh(
      _agentAuraGeoCache.get(auraGeoKey)!,
      _cachedAgentAuraMat(auraColor, 0.35),
    ));
  }

  return group;
}
