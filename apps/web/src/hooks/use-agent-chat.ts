"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Operation } from "fast-json-patch";
import { createAgentClient } from "@/lib/ag-ui/client";
import { applyMessage, clearAllSurfaces } from "@/lib/a2ui/store";
import { useMemoryContext } from "@/contexts/memory-context";
import {
  interruptRunFinishedResultSchema,
  type A2UIMessage,
  type Interrupt,
  type ViewingPreferences,
} from "@repo/contracts";
import type { HttpAgent, Message } from "@ag-ui/client";

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
          applyMessage(event.value as A2UIMessage);
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
        const snapshot = (event as { snapshot?: unknown }).snapshot;
        memory.applySnapshot((snapshot ?? {}) as ViewingPreferences);
      },

      onStateDeltaEvent({ event }) {
        const delta = (event as { delta?: unknown }).delta;
        if (Array.isArray(delta)) {
          memory.applyDelta(delta as Operation[]);
        }
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
      setPendingInterrupt(null);
      pendingToolCallNamesRef.current.clear();

      try {
        await agentRef.current.runAgent({
          forwardedProps: { interruptResponse: { interruptId, response } },
        });
      } catch (err) {
        setIsLoading(false);
        setError(
          err instanceof Error ? err.message : "Failed to respond to interrupt",
        );
      }
    },
    [],
  );

  const cancelInterrupt = useCallback(() => {
    setPendingInterrupt(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    pendingInterrupt,
    toolResults,
    sendMessage,
    respondToInterrupt,
    cancelInterrupt,
  };
}
