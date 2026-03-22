/**
 * DiffViewer.tsx
 * Renders the output of the `suggest` tool as a styled unified diff
 * with Accept / Reject action buttons.
 *
 * T008: Integrate Suggest Tool (Diff Proposals) into RightPanel UI
 */

import { useState } from 'react';
import { Check, X, Copy, FilePenLine } from 'lucide-react';
import type { ToolCallInfo } from '../core/llm/types';

// ---------------------------------------------------------------------------
// Diff line parsing — reads the ```diff ... ``` block from suggest result
// ---------------------------------------------------------------------------

type DiffLineType = 'add' | 'remove' | 'context' | 'hunk' | 'meta';

interface DiffLine {
  type: DiffLineType;
  content: string;
}

function parseDiffBlock(markdown: string): DiffLine[] {
  const match = markdown.match(/```diff\n([\s\S]*?)```/);
  if (!match) return [];

  return match[1]
    .split('\n')
    .filter((_, i, arr) => i < arr.length - 1 || arr[i] !== '')  // trim trailing blank
    .map((line): DiffLine => {
      if (line.startsWith('+') && !line.startsWith('+++'))
        return { type: 'add',     content: line.slice(1) };
      if (line.startsWith('-') && !line.startsWith('---'))
        return { type: 'remove',  content: line.slice(1) };
      if (line.startsWith('@@'))
        return { type: 'hunk',    content: line };
      if (line.startsWith('+++') || line.startsWith('---'))
        return { type: 'meta',    content: line };
      return   { type: 'context', content: line.startsWith(' ') ? line.slice(1) : line };
    });
}

// ---------------------------------------------------------------------------
// SuggestArgs — shape of toolCall.args for name='suggest'
// ---------------------------------------------------------------------------

interface SuggestArgs {
  filePath:    string;
  startLine:   number;
  endLine:     number;
  replacement: string;
  reason:      string;
}

function parseSuggestArgs(args: Record<string, unknown>): SuggestArgs | null {
  if (
    typeof args.filePath    !== 'string' ||
    typeof args.startLine   !== 'number' ||
    typeof args.endLine     !== 'number' ||
    typeof args.replacement !== 'string' ||
    typeof args.reason      !== 'string'
  ) return null;
  return args as unknown as SuggestArgs;
}

// ---------------------------------------------------------------------------
// DiffViewer component
// ---------------------------------------------------------------------------

export interface DiffViewerProps {
  toolCall: ToolCallInfo;
  /** Called when user clicks Accept. Receives the structured args so the parent
   *  can apply the patch to in-memory fileContents. */
  onAccept?: (filePath: string, startLine: number, endLine: number, replacement: string) => void;
}

type ActionState = 'pending' | 'accepted' | 'rejected';

export function DiffViewer({ toolCall, onAccept }: DiffViewerProps) {
  const [actionState, setActionState] = useState<ActionState>('pending');
  const [copied, setCopied] = useState(false);

  const args = parseSuggestArgs(toolCall.args);
  const diffLines = toolCall.result ? parseDiffBlock(toolCall.result) : [];

  if (!args) return null;
  if (actionState === 'rejected') return null;

  const handleAccept = () => {
    onAccept?.(args.filePath, args.startLine, args.endLine, args.replacement);
    setActionState('accepted');
  };

  const handleReject = () => setActionState('rejected');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(args.replacement);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Accepted state — compact confirmation
  if (actionState === 'accepted') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
        <Check className="w-3.5 h-3.5" />
        <span>Change applied to <code className="font-mono">{args.filePath}</code></span>
      </div>
    );
  }

  const addCount    = diffLines.filter(l => l.type === 'add').length;
  const removeCount = diffLines.filter(l => l.type === 'remove').length;

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-black/40">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
        <FilePenLine className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
        <span className="font-mono text-xs text-white/80 flex-1 truncate" title={args.filePath}>
          {args.filePath}
        </span>
        <span className="text-[10px] text-emerald-400 font-mono">+{addCount}</span>
        <span className="text-[10px] text-rose-400 font-mono">-{removeCount}</span>
      </div>

      {/* Reason */}
      {args.reason && (
        <div className="px-3 py-1.5 bg-amber-500/5 border-b border-white/5 text-[11px] text-amber-300/80 italic">
          {args.reason}
        </div>
      )}

      {/* Diff lines */}
      <div className="max-h-56 overflow-y-auto font-mono text-[11px] leading-5">
        {diffLines.length === 0 ? (
          <pre className="px-3 py-2 text-white/40 whitespace-pre-wrap">{toolCall.result}</pre>
        ) : (
          diffLines.map((line, i) => {
            if (line.type === 'meta') return null;
            return (
              <div
                key={i}
                className={
                  line.type === 'add'     ? 'bg-emerald-500/15 text-emerald-300 px-3 py-px'
                  : line.type === 'remove' ? 'bg-rose-500/15    text-rose-300    px-3 py-px'
                  : line.type === 'hunk'   ? 'bg-white/5         text-white/30    px-3 py-px text-[10px]'
                  :                          'text-white/50       px-3 py-px'
                }
              >
                <span className="select-none mr-2 text-white/20">
                  {line.type === 'add'    ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                {line.content}
              </div>
            );
          })
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-t border-white/10">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
          title="Copy replacement to clipboard"
        >
          <Copy className="w-3 h-3" />
          {copied ? 'Copied!' : 'Copy'}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReject}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border border-white/10 text-white/40 hover:border-rose-500/40 hover:text-rose-400 transition-colors"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
          <button
            onClick={handleAccept}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
