"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@repo/ui";
import type { Interrupt, JsonSchema } from "@repo/contracts";

export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

export interface ApprovalDialogProps {
  interrupt: Interrupt;
  open: boolean;
  isSubmitting: boolean;
  issues: FieldIssue[];
  summary?: ReactNode;
  onSubmit: (response: { approved: boolean; editedReason?: string }) => void;
  onCancel: () => void;
}

interface FieldSchema {
  type?: string;
  "ui:widget"?: string;
  "ui:prefillFrom"?: string;
  maxLength?: number;
}

function resolvePointer(root: unknown, pointer: string): string {
  if (!pointer.startsWith("/")) return "";
  const parts = pointer.slice(1).split("/");
  let cur: unknown = root;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return "";
    }
  }
  return typeof cur === "string" ? cur : "";
}

export function ApprovalDialog({
  interrupt,
  open,
  isSubmitting,
  issues,
  summary,
  onSubmit,
  onCancel,
}: ApprovalDialogProps) {
  const schema = interrupt.responseSchema as JsonSchema & {
    properties?: Record<string, FieldSchema>;
  };
  const editedReasonField = schema.properties?.editedReason;
  const prefill = editedReasonField?.["ui:prefillFrom"]
    ? resolvePointer(interrupt, editedReasonField["ui:prefillFrom"])
    : "";

  const [editedReason, setEditedReason] = useState(prefill);

  useEffect(() => {
    setEditedReason(prefill);
  }, [interrupt.id, prefill]);

  const reasonIssue = issues.find((i) => i.path[0] === "editedReason");
  const maxLen = editedReasonField?.maxLength;
  const tooLong =
    typeof maxLen === "number" && editedReason.length > maxLen;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{interrupt.message}</DialogTitle>
        </DialogHeader>
        {summary}
        {editedReasonField && (
          <div className="mt-3">
            <label className="text-xs font-medium text-muted">Reason</label>
            <Textarea
              value={editedReason}
              maxLength={maxLen}
              onChange={(e) => setEditedReason(e.target.value)}
              aria-invalid={Boolean(reasonIssue || tooLong) || undefined}
            />
            {(reasonIssue || tooLong) && (
              <p className="mt-1 text-xs text-destructive">
                {reasonIssue?.message ?? `Maximum ${maxLen} characters.`}
              </p>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onSubmit({ approved: false })}
            disabled={isSubmitting}
          >
            Reject
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                approved: true,
                ...(editedReasonField ? { editedReason } : {}),
              })
            }
            disabled={isSubmitting || tooLong}
          >
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
