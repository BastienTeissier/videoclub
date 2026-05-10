"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Operation } from "fast-json-patch";
import { createAgentClient } from "@/lib/ag-ui/client";
import { applyMessage, clearAllSurfaces } from "@/lib/a2ui/store";
import { useMemoryContext } from "@/contexts/memory-context";
import {
  a2uiMessageSchema,
  interruptRunFinishedResultSchema,
  jsonPatchOpsSchema,
  pendingInterruptResponseSchema,
  viewingPreferencesSchema,
  type Interrupt,
} from "@repo/contracts";
import type { HttpAgent, Message } from "@ag-ui/client";

export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ToolResult {
  toolName: string;
  toolCallId: string;
  result: unknown;
}

export function useAgentChat() {
  const memory = useMemoryContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInterrupt, setPendingInterrupt] = useState<Interrupt | null>(
    null,
  );
  const [interruptIssues, setInterruptIssues] = useState<FieldIssue[]>([]);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);

  const agentRef = useRef<HttpAgent | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);

  const pendingToolCallNamesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      if (agentRef.current) {
        agentRef.current.abortRun();
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const setupAgent = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const agent = createAgentClient(threadIdRef.current);
    agentRef.current = agent;

    const { unsubscribe } = agent.subscribe({
      onTextMessageContentEvent({ textMessageBuffer }) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { ...last, content: textMessageBuffer },
            ];
          }
          return [
            ...prev,
            { id: `assistant-${Date.now()}`, role: "assistant", content: textMessageBuffer },
          ];
        });
      },

      onCustomEvent({ event }) {
        if (event.name === "a2ui") {
          const parsed = a2uiMessageSchema.safeParse(event.value);
          if (parsed.success) applyMessage(parsed.data);
          else console.warn("[use-agent-chat] dropped invalid a2ui event", parsed.error);
          return;
        }
        if (event.name === "memory-applied") {
          const value = event.value as { keys?: unknown } | undefined;
          const keys = value?.keys;
          if (Array.isArray(keys)) {
            memory.markApplied(
              keys.filter((k): k is string => typeof k === "string"),
            );
          }
          return;
        }
      },

      onStateSnapshotEvent({ event }) {
        const raw = (event as { snapshot?: unknown }).snapshot;
        const parsed = viewingPreferencesSchema.safeParse(raw ?? {});
        if (parsed.success) memory.applySnapshot(parsed.data);
        else console.warn("[use-agent-chat] dropped invalid STATE_SNAPSHOT", parsed.error);
      },

      onStateDeltaEvent({ event }) {
        const raw = (event as { delta?: unknown }).delta;
        const parsed = jsonPatchOpsSchema.safeParse(raw);
        if (parsed.success) memory.applyDelta(parsed.data as Operation[]);
        else console.warn("[use-agent-chat] dropped invalid STATE_DELTA", parsed.error);
      },

      onToolCallEndEvent({ event, toolCallName }) {
        pendingToolCallNamesRef.current.set(event.toolCallId, toolCallName);
      },

      onToolCallResultEvent({ event }) {
        const toolCallId = event.toolCallId;
        const toolName =
          pendingToolCallNamesRef.current.get(toolCallId) ?? "";
        pendingToolCallNamesRef.current.delete(toolCallId);

        let parsed: unknown;
        const raw = event.content ?? event.result;
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          parsed = raw;
        }

        setToolResults((prev) => [
          ...prev,
          { toolName, toolCallId, result: parsed },
        ]);
      },

      onRunFinishedEvent({ event }) {
        setIsLoading(false);

        const result = (event as { result?: unknown }).result;
        const parsed = interruptRunFinishedResultSchema.safeParse(result);
        if (parsed.success && parsed.data.interrupts.length > 0) {
          setPendingInterrupt(parsed.data.interrupts[0]!);
        } else {
          // Resume completed without a fresh interrupt → close the dialog and
          // clear any field errors from a prior 422 response.
          setPendingInterrupt(null);
          setInterruptIssues([]);
        }
      },

      onRunErrorEvent({ event }) {
        setIsLoading(false);
        setError(event.message ?? "An error occurred");
      },
    });

    unsubscribeRef.current = unsubscribe;
    return agent;
  }, [memory]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setError(null);
      setPendingInterrupt(null);
      setToolResults([]);
      setIsLoading(true);
      pendingToolCallNamesRef.current.clear();
      clearAllSurfaces();

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: trimmed },
      ]);

      const agent = setupAgent();

      agent.addMessage({
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      } as Message);

      if (!threadIdRef.current) {
        threadIdRef.current = agent.threadId;
      }

      try {
        await agent.runAgent();
      } catch (err) {
        setIsLoading(false);
        setError(err instanceof Error ? err.message : "Failed to send message");
      }
    },
    [setupAgent],
  );

  const respondToInterrupt = useCallback(
    async (interruptId: string, response: unknown) => {
      if (!agentRef.current) return;

      setIsLoading(true);
      setInterruptIssues([]);
      pendingToolCallNamesRef.current.clear();

      try {
        await agentRef.current.runAgent({
          forwardedProps: { interruptResponse: { interruptId, response } },
        });
      } catch (err) {
        setIsLoading(false);
        // Server returned 422 with field issues → keep the dialog open so
        // the user can correct their input without retyping.
        const issues = await extractIssuesFrom422(err);
        if (issues) {
          setInterruptIssues(issues);
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to respond to interrupt",
        );
      }
    },
    [],
  );

  const cancelInterrupt = useCallback(() => {
    setPendingInterrupt(null);
    setInterruptIssues([]);
  }, []);

  // Reload-recovery: on mount, fetch the latest unresolved interrupt and
  // replay the surface it owned so the dialog re-opens automatically.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/chat/pending-interrupt", {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { data: unknown };
        const parsed = pendingInterruptResponseSchema.safeParse(body.data);
        if (!parsed.success || !parsed.data || cancelled) return;
        for (const msg of parsed.data.a2uiMessages) applyMessage(msg);
        threadIdRef.current = parsed.data.threadId;
        setPendingInterrupt(parsed.data.interrupt);
      } catch {
        // Network error on bootstrap is non-fatal — the dialog can be
        // re-opened on the next reload.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    messages,
    isLoading,
    error,
    pendingInterrupt,
    interruptIssues,
    toolResults,
    sendMessage,
    respondToInterrupt,
    cancelInterrupt,
  };
}

async function extractIssuesFrom422(err: unknown): Promise<FieldIssue[] | null> {
  const candidate = err as
    | { status?: number; json?: () => Promise<unknown> }
    | Response;
  const status =
    candidate instanceof Response
      ? candidate.status
      : (candidate as { status?: number }).status;
  if (status !== 422) return null;
  try {
    const body =
      candidate instanceof Response
        ? await candidate.json()
        : await (candidate as { json: () => Promise<unknown> }).json();
    const issues = (body as { issues?: unknown }).issues;
    if (!Array.isArray(issues)) return null;
    return issues
      .map((i): FieldIssue | null => {
        if (!i || typeof i !== "object") return null;
        const path = (i as { path?: unknown }).path;
        const message = (i as { message?: unknown }).message;
        if (!Array.isArray(path) || typeof message !== "string") return null;
        return {
          path: path.filter(
            (p): p is string | number =>
              typeof p === "string" || typeof p === "number",
          ),
          message,
        };
      })
      .filter((i): i is FieldIssue => i !== null);
  } catch {
    return null;
  }
}
