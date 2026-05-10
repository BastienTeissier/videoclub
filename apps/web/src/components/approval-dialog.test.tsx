import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Interrupt } from "@repo/contracts";
import { ApprovalDialog } from "./approval-dialog";

function commitInterrupt(reason: string): Interrupt {
  return {
    id: "tc-c",
    reason: "approval",
    message: "Confirm tonight's movie pick before I commit.",
    proposed: {
      pickedMovieId: "11111111-1111-4111-8111-111111111111",
      backupMovieIds: [],
      reason,
    },
    responseSchema: {
      type: "object",
      properties: {
        approved: { type: "boolean" },
        editedReason: {
          type: "string",
          "ui:widget": "textarea",
          "ui:prefillFrom": "/proposed/reason",
          maxLength: 1000,
        },
      },
      required: ["approved"],
    },
  };
}

function searchTmdbInterrupt(): Interrupt {
  return {
    id: "tc-s",
    reason: "approval",
    message: "Approve calling search_tmdb?",
    proposed: { toolName: "search_tmdb", input: { query: "x" } },
    responseSchema: {
      type: "object",
      properties: { approved: { type: "boolean" } },
      required: ["approved"],
    },
  };
}

describe("ApprovalDialog", () => {
  it("renders title from interrupt.message and prefills textarea via ui:prefillFrom", () => {
    render(
      <ApprovalDialog
        interrupt={commitInterrupt("feel-good")}
        open
        isSubmitting={false}
        issues={[]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByText(/Confirm tonight's movie pick before I commit\./),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("feel-good")).toBeInTheDocument();
  });

  it("does not render textarea when schema lacks editedReason", () => {
    render(
      <ApprovalDialog
        interrupt={searchTmdbInterrupt()}
        open
        isSubmitting={false}
        issues={[]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("Approve click submits { approved: true, editedReason: <textarea value> }", () => {
    const onSubmit = vi.fn();
    render(
      <ApprovalDialog
        interrupt={commitInterrupt("feel-good")}
        open
        isSubmitting={false}
        issues={[]}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    const ta = screen.getByDisplayValue("feel-good") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "edited reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onSubmit).toHaveBeenCalledWith({
      approved: true,
      editedReason: "edited reason",
    });
  });

  it("Reject click submits { approved: false }", () => {
    const onSubmit = vi.fn();
    render(
      <ApprovalDialog
        interrupt={commitInterrupt("feel-good")}
        open
        isSubmitting={false}
        issues={[]}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onSubmit).toHaveBeenCalledWith({ approved: false });
  });

  it("renders 422 issue under the textarea and preserves typed value", () => {
    render(
      <ApprovalDialog
        interrupt={commitInterrupt("feel-good")}
        open
        isSubmitting={false}
        issues={[{ path: ["editedReason"], message: "Too long" }]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Too long")).toBeInTheDocument();
    expect(screen.getByDisplayValue("feel-good")).toBeInTheDocument();
  });
});
