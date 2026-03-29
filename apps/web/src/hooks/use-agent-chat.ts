"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAgentClient } from "@/lib/ag-ui/client";
import type { HttpAgent, Message } from "@ag-ui/client";

interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);

  const agentRef = useRef<HttpAgent | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);

  // Track tool calls that have been started but not yet received results
  const pendingToolCallsRef = useRef<Map<string, { toolName: string; args: Record<string, unknown> }>>(new Map());

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
    // Clean up previous
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

      onToolCallEndEvent({ event, toolCallName, toolCallArgs }) {
        pendingToolCallsRef.current.set(event.toolCallId, {
          toolName: toolCallName,
          args: toolCallArgs,
        });
      },

      onToolCallResultEvent({ event }) {
        const toolCallId = event.toolCallId;
        const pending = pendingToolCallsRef.current.get(toolCallId);
        pendingToolCallsRef.current.delete(toolCallId);

        let parsed: unknown;
        const raw = event.content ?? event.result;
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          parsed = raw;
        }

        setToolResults((prev) => [
          ...prev,
          {
            toolName: pending?.toolName ?? "",
            toolCallId,
            result: parsed,
          },
        ]);
      },

      onRunFinishedEvent() {
        setIsLoading(false);

        // Check for tool calls without results — pending approval
        for (const [toolCallId, info] of pendingToolCallsRef.current.entries()) {
          setPendingApproval({
            toolCallId,
            toolName: info.toolName,
            args: info.args,
          });
          break; // Only one pending approval at a time
        }
      },

      onRunErrorEvent({ event }) {
        setIsLoading(false);
        setError(event.message ?? "An error occurred");
      },
    });

    unsubscribeRef.current = unsubscribe;
    return agent;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setError(null);
      setPendingApproval(null);
      setIsLoading(true);
      pendingToolCallsRef.current.clear();

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: trimmed },
      ]);

      const agent = setupAgent();

      // Add user message to agent's internal state so it's sent in the request
      agent.addMessage({
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      } as Message);

      // Store threadId from agent after first run
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
    [setupAgent]
  );

  const approveToolCall = useCallback(
    async (toolCallId: string) => {
      if (!agentRef.current) return;

      setIsLoading(true);
      setPendingApproval(null);
      pendingToolCallsRef.current.clear();

      // Add a tool message as approval response
      const approvalMessage: Message = {
        id: `tool-approval-${Date.now()}`,
        role: "tool",
        toolCallId,
        content: JSON.stringify({ approved: true }),
      } as Message;

      agentRef.current.messages = [
        ...agentRef.current.messages,
        approvalMessage,
      ];

      try {
        await agentRef.current.runAgent();
      } catch (err) {
        setIsLoading(false);
        setError(err instanceof Error ? err.message : "Failed to approve tool call");
      }
    },
    []
  );

  const rejectToolCall = useCallback(
    async (toolCallId: string) => {
      setPendingApproval(null);
      pendingToolCallsRef.current.delete(toolCallId);
    },
    []
  );

  return {
    messages,
    isLoading,
    error,
    pendingApproval,
    toolResults,
    sendMessage,
    approveToolCall,
    rejectToolCall,
  };
}
