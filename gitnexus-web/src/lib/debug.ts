/**
 * Structured debug logger for NexusAI.
 *
 * In development builds (`import.meta.env.DEV === true`), messages are printed
 * to the console with a category prefix.  In production builds, Vite's dead-code
 * elimination removes every `debugLog` call-site because the branch is statically
 * `false`.
 *
 * Usage:
 *   import { debugLog } from '../lib/debug';
 *   debugLog('agent', 'Stream completed normally');
 *   debugLog('openrouter', 'Config:', { model, baseUrl });
 */

type DebugCategory = 'agent' | 'openrouter' | 'stream' | 'settings' | 'chat';

/**
 * Log a debug message.  Completely stripped in production builds.
 */
export const debugLog = (category: DebugCategory, ...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`[debug:${category}]`, ...args);
  }
};

/**
 * Log a debug error.  Completely stripped in production builds.
 */
export const debugError = (category: DebugCategory, ...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[debug:${category}]`, ...args);
  }
};
