/**
 * usePresence.ts
 * T023: Polls GET /api/presence every 2 seconds and returns the current list
 * of active users with their focused / selected node IDs.
 *
 * Only starts polling when serverBaseUrl is non-empty; returns an empty array
 * otherwise so the hook is safe to call unconditionally (e.g. in zip/local mode).
 */

import { useState, useEffect, useRef } from 'react';
import { UserPresence } from '../core/graph/types';

const POLL_INTERVAL_MS = 2000;

/**
 * @param serverBaseUrl - Base URL of the gitnexus API (e.g. "http://localhost:3000/api").
 *                        Pass an empty string / undefined to disable polling.
 */
export function usePresence(serverBaseUrl: string | undefined): UserPresence[] {
  const [presenceUsers, setPresenceUsers] = useState<UserPresence[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!serverBaseUrl) {
      setPresenceUsers([]);
      return;
    }

    const url = `${serverBaseUrl}/presence`;
    let cancelled = false;

    const fetchPresence = async () => {
      if (cancelled) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!cancelled && res.ok) {
          const data: unknown = await res.json();
          if (!cancelled && Array.isArray(data)) {
            setPresenceUsers(data as UserPresence[]);
          }
        }
      } catch {
        // Network errors or aborts are silently ignored —
        // presence is a best-effort feature.
      }

      if (!cancelled) {
        timerRef.current = setTimeout(fetchPresence, POLL_INTERVAL_MS);
      }
    };

    // Kick off immediately, then repeat via setTimeout chain.
    fetchPresence();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [serverBaseUrl]);

  return presenceUsers;
}
