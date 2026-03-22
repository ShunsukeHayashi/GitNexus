/**
 * GraphCanvasOverlay.tsx
 * UI overlays rendered on top of the 3D canvas:
 *   - Selected-node info bar (top-centre)
 *   - Camera controls: ZoomIn / ZoomOut / Reset (bottom-right)
 *   - AI Highlights toggle (top-right)
 *   - Node-colour legend (bottom-left)
 *   - QueryFAB
 *
 * Extracted from GraphCanvas.tsx (T006 component split).
 * This component is a pure presentational layer — all logic lives in GraphCanvas.
 */

import { ZoomIn, ZoomOut, Maximize2, Lightbulb, LightbulbOff, X } from 'lucide-react';
import { QueryFAB } from './QueryFAB';
import {
  NODE_COLORS,
  SELECTED_COLOR,
  CITATION_COLOR,
  TOOL_COLOR,
  HIGHLIGHT_COLOR,
  BLAST_COLOR,
} from '../lib/graphNodeUtils';
import type { UserPresence } from '../core/graph/types';

/** Maximum number of presence users shown inline; excess shown as "+N more". */
const MAX_PRESENCE_DISPLAYED = 5;

// Minimal shape of the selected node needed by this UI layer.
interface OverlayNode {
  label: string;
  properties: { name: string };
}

export interface GraphCanvasOverlayProps {
  selectedNode:         OverlayNode | null;
  onClearSelection:     () => void;
  isAIHighlightsEnabled: boolean;
  onToggleAIHighlights: () => void;
  onZoomIn:             () => void;
  onZoomOut:            () => void;
  onResetCamera:        () => void;
  /** T023: active presence users; if undefined or empty the panel is hidden */
  presenceUsers?:       UserPresence[];
}

export function GraphCanvasOverlay({
  selectedNode,
  onClearSelection,
  isAIHighlightsEnabled,
  onToggleAIHighlights,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  presenceUsers,
}: GraphCanvasOverlayProps) {
  // T023: Only show users who have a focused node (most useful to display)
  const focusedUsers = (presenceUsers ?? []).filter(u => !!u.focusedNodeId);
  const visibleUsers = focusedUsers.slice(0, MAX_PRESENCE_DISPLAYED);
  const overflowCount = focusedUsers.length - visibleUsers.length;
  return (
    <>
      {/* T023: Presence user list — top-left corner, below the node-type legend area */}
      {visibleUsers.length > 0 && (
        <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-20">
          {visibleUsers.map(user => (
            <div
              key={user.userId}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-black/70 border border-white/10 rounded-lg backdrop-blur-sm"
            >
              {/* Color dot */}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: user.color }}
              />
              {/* Display name */}
              <span className="text-xs text-white/80 font-medium">{user.displayName}</span>
              {/* Arrow + focused node id */}
              {user.focusedNodeId && (
                <>
                  <span className="text-white/30 text-xs">→</span>
                  <span className="font-mono text-xs text-white/50 truncate max-w-[120px]">
                    {user.focusedNodeId}
                  </span>
                </>
              )}
            </div>
          ))}
          {overflowCount > 0 && (
            <div className="px-2.5 py-1 bg-black/50 border border-white/10 rounded-lg text-xs text-white/40">
              +{overflowCount} more
            </div>
          )}
        </div>
      )}

      {/* Selected node info bar */}
      {selectedNode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/70 border border-white/10 rounded-xl backdrop-blur-sm z-20">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: SELECTED_COLOR }}
          />
          <span className="font-mono text-sm text-white">
            {selectedNode.properties.name}
          </span>
          <span className="text-xs text-white/50">
            ({selectedNode.label})
          </span>
          <button
            onClick={onClearSelection}
            className="ml-1 p-0.5 text-white/40 hover:text-white transition-colors rounded"
            title="Clear selection"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Camera controls — Bottom Right */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        <button
          onClick={onZoomIn}
          className="w-9 h-9 flex items-center justify-center bg-black/60 border border-white/10 rounded-md text-white/60 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onZoomOut}
          className="w-9 h-9 flex items-center justify-center bg-black/60 border border-white/10 rounded-md text-white/60 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={onResetCamera}
          className="w-9 h-9 flex items-center justify-center bg-black/60 border border-white/10 rounded-md text-white/60 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
          title="Reset Camera"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* AI Highlights toggle — Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={onToggleAIHighlights}
          className={
            isAIHighlightsEnabled
              ? 'w-10 h-10 flex items-center justify-center bg-cyan-500/20 border border-cyan-400/40 rounded-lg text-cyan-300 hover:bg-cyan-500/30 transition-colors backdrop-blur-sm'
              : 'w-10 h-10 flex items-center justify-center bg-black/60 border border-white/10 rounded-lg text-white/40 hover:text-white hover:bg-black/80 transition-colors backdrop-blur-sm'
          }
          title={isAIHighlightsEnabled ? 'Turn off highlights' : 'Turn on AI highlights'}
        >
          {isAIHighlightsEnabled
            ? <Lightbulb    className="w-4 h-4" />
            : <LightbulbOff className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Node colour legend — Bottom Left */}
      <div className="absolute bottom-4 left-4 p-3 bg-black/70 border border-white/10 rounded-xl backdrop-blur-md z-10 max-h-64 overflow-y-auto">
        <p className="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wider">
          Node Types
        </p>
        <div className="flex flex-col gap-1.5">
          {(
            ['Project','Package','Module','Folder','File','Class','Function','Method','Interface'] as const
          ).map(label => (
            <div key={label} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: NODE_COLORS[label] }}
              />
              <span className="text-xs text-white/70">{label}</span>
            </div>
          ))}

          <div className="border-t border-white/10 my-1" />

          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SELECTED_COLOR }} />
            <span className="text-xs text-white/60">Selected</span>
          </div>
          {/* T002: distinct legend entries per AI highlight source */}
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CITATION_COLOR }} />
            <span className="text-xs text-white/60">AI Citation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TOOL_COLOR }} />
            <span className="text-xs text-white/60">AI Tool</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: HIGHLIGHT_COLOR }} />
            <span className="text-xs text-white/60">Query Match</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
              style={{ backgroundColor: BLAST_COLOR }}
            />
            <span className="text-xs text-white/60">Blast Radius</span>
          </div>
        </div>
      </div>

      {/* Query FAB */}
      <QueryFAB />
    </>
  );
}
