import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* =================================================================================
 * Component-level tests for the real broadsheet entry grid and publish flow.
 * The supabase client is mocked with an in-memory fixture store so the actual
 * NumericBroadsheet component (header/cell order, read-only locking) and the
 * publish/unpublish orchestration can be asserted against live code.
 * ================================================================================= */

const { supabaseState } = vi.hoisted(() => {
  const state: {
    fixtures: Record<string, any[]>;
    calls: Array<{ type: string; table?: string; fn?: string; patch?: any; rows?: any; args?: any }>;
    failOn: Record<string, { message: string; code?: string }>;
    failRpc: Record<string, { message: string; code?: string }>;
  } = {
    fixtures: {},
    calls: [],
    failOn: {},
    failRpc: {},
  };
  return { supabaseState: state };
});

vi.mock("@/integrations/supabase/client", () => {
  const buildQuery = (table: string) => {
    const q: any = {};
    const snapshot = () => [...(supabaseState.fixtures[table] ?? [])];
    const resolve = () =>
      supabaseState.failOn[table]
        ? { data: null, error: supabaseState.failOn[table] }
        : { data: snapshot(), error: null };
    q.select = () => q;
    q.eq = () => q;
    q.is = () => q;
    q.or = () => q;
    q.order = () => q;
    q.limit = () => q;
    q.single = async () => {
      const r = snapshot();
      return { data: r[0] ?? null, error: r[0] ? null : { message: "not found", code: "PGRST116" } };
    };
    q.maybeSingle = async () => {
      const r = snapshot();
      return { data: r[0] ?? null, error: null };
    };
    q.update = (patch: any) => {
      supabaseState.calls.push({ type: "update", table, patch });
      return q;
    };
    q.insert = (rows: any) => {
      supabaseState.calls.push({ type: "insert", table, rows });
      return q;
    };
    q.upsert = (rows: any) => {
      supabaseState.calls.push({ type: "upsert", table, rows });
      return q;
    };
    q.delete = () => {
      supabaseState.calls.push({ type: "delete", table });
      return q;
    };
    q.then = (onOk: (v: any) => any, onErr?: (e: any) => any) =>
      Promise.resolve(resolve()).then(onOk, onErr);
    return q;
  };

  return {
    supabase: {
      from: (table: string) => buildQuery(table),
      rpc: async (fn: string, args?: any) => {
        supabaseState.calls.push({ type: "rpc", fn, args });
        return supabaseState.failRpc[fn]
          ? { data: null, error: supabaseState.failRpc[fn] }
          : { data: [], error: null };
      },
      auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    },
  };
});

import { supabase } from "@/integrations/supabase/client";
import { NumericBroadsheet } from "@/routes/_authenticated/broadsheet";
import { publishBroadsheetAndOpenPortal, unpublishBroadsheetAndClosePortal } from "@/lib/broadsheet";

const BASE_FIXTURES: Record<string, any[]> = {
  sessions: [{ id: "s1", name: "2025/2026", is_current: true }],
  terms: [{ id: "t1", name: "First", session_id: "s1", is_current: true }],
  classes: [{ id: "c1", name: "JSS 1", level: "jss" }],
  students: [{ id: "st1", full_name: "Amina Bello" }],
  subjects: [{ id: "sub1", name: "Mathematics" }],
  broadsheet_headers: [{ id: "h1", status: "draft", validated_at: null, published_at: null }],
  broadsheets: [],
  broadsheet_student_comments: [],
  assessment_structures: [],
  school_settings: [
    {
      id: 1,
      scoring_scheme: "weighted_ca_exam",
      cumulative_method: "average_of_terms",
      ca1_weight: 15,
      ca2_weight: 15,
      ca3_weight: 0,
      exam_weight: 70,
      promotion_min_average: 50,
      grading_scale: [],
      school_name: "Test School",
    },
  ],
};

const SCOPES = {
  headerId: "h1",
  sessionId: "s1",
  termId: "t1",
  classId: "c1",
};

function renderGrid(fixtures: Record<string, any[]>) {
  supabaseState.fixtures = fixtures;
  supabaseState.calls = [];
  const qc = new QueryClient();
  const utils = render(
    <QueryClientProvider client={qc}>
      <NumericBroadsheet sessionId="s1" termId="t1" classId="c1" onPreview={vi.fn()} />
    </QueryClientProvider>
  );
  return { ...utils, queryClient: qc };
}

describe("NumericBroadsheet: grid alignment & locking", () => {
  beforeEach(() => {
    supabaseState.calls = [];
    supabaseState.failOn = {};
    supabaseState.failRpc = {};
  });

  it("renders the subheader row exactly as [CA1, CA2, ∑CA, Exam, Total] under a subject", async () => {
    renderGrid(BASE_FIXTURES);
    await screen.findByText("Amina Bello");

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    const caIdx = headers.indexOf("CA1");
    expect(caIdx).toBeGreaterThanOrEqual(0);
    expect(headers.slice(caIdx, caIdx + 5)).toEqual(["CA1", "CA2", "∑CA", "Exam", "Total"]);
  });

  it("renders one editable input per numeric component (CA1, CA2, Exam) in draft mode", async () => {
    renderGrid(BASE_FIXTURES);
    await screen.findByText("Amina Bello");

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(3);
    for (const input of inputs) expect(input).not.toBeDisabled();
    expect(screen.getByText("Status: draft")).toBeInTheDocument();
  });

  it("locks all score inputs when the broadsheet is validated", async () => {
    renderGrid({ ...BASE_FIXTURES, broadsheet_headers: [{ id: "h1", status: "validated", validated_at: "2026-09-01", published_at: null }] });
    await screen.findByText("Amina Bello");

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(3);
    for (const input of inputs) expect(input).toBeDisabled();
    expect(screen.getByText("Status: validated")).toBeInTheDocument();
  });
});

describe("publish/unpublish orchestration (I3/I4)", () => {
  beforeEach(() => {
    supabaseState.calls = [];
    supabaseState.failOn = {};
    supabaseState.failRpc = {};
    supabaseState.fixtures = {
      broadsheet_student_comments: [
        { student_id: "st1", teacher_comment: "Very diligent", principal_comment: "Promoted" },
      ],
    };
  });

  it("publishes the header, copies comments to report_cards, and opens the portal gate", async () => {
    await publishBroadsheetAndOpenPortal(supabase as any, { ...SCOPES, publishedBy: "u1" });

    const update = supabaseState.calls.find((c) => c.type === "update" && c.table === "broadsheet_headers");
    expect(update).toBeDefined();
    expect(update!.patch.status).toBe("published");

    const upsert = supabaseState.calls.find((c) => c.type === "upsert" && c.table === "report_cards");
    expect(upsert).toBeDefined();
    expect(upsert!.rows).toEqual([
      {
        student_id: "st1",
        term_id: "t1",
        class_id: "c1",
        teacher_comment: "Very diligent",
        principal_comment: "Promoted",
      },
    ]);

    const rpc = supabaseState.calls.find((c) => c.type === "rpc" && c.fn === "publish_results");
    expect(rpc).toBeDefined();
    expect(rpc!.args).toEqual({
      _session_id: "s1",
      _term_id: "t1",
      _class_id: "c1",
      _exam_type: "combined",
    });
  });

  it("flips the header status LAST, after the comments copy and the portal gate", async () => {
    await publishBroadsheetAndOpenPortal(supabase as any, { ...SCOPES, publishedBy: "u1" });

    const idx = (pred: (c: any) => boolean) => supabaseState.calls.findIndex(pred);
    const headerFlip = idx((c) => c.type === "update" && c.table === "broadsheet_headers");
    const gate = idx((c) => c.type === "rpc" && c.fn === "publish_results");
    const upsert = idx((c) => c.type === "upsert" && c.table === "report_cards");
    expect(headerFlip).toBeGreaterThanOrEqual(0);
    // The status commit must be the last orchestration step so an earlier failure
    // can never leave the sheet published without an open gate.
    expect(headerFlip).toBeGreaterThan(upsert);
    expect(headerFlip).toBeGreaterThan(gate);
    expect(headerFlip).toBe(supabaseState.calls.length - 1);
  });

  it("does NOT flip the header when the portal gate RPC fails (no half-commit)", async () => {
    supabaseState.failRpc["publish_results"] = { message: "gate exploded" };

    await expect(
      publishBroadsheetAndOpenPortal(supabase as any, { ...SCOPES, publishedBy: "u1" })
    ).rejects.toThrow("gate exploded");

    const headerFlip = supabaseState.calls.find((c) => c.type === "update" && c.table === "broadsheet_headers");
    expect(headerFlip).toBeUndefined();
    const compensate = supabaseState.calls.find((c) => c.type === "rpc" && c.fn === "unpublish_results");
    expect(compensate).toBeUndefined();
  });

  it("compensates by closing the gate when the final header flip fails", async () => {
    supabaseState.failOn["broadsheet_headers"] = { message: "flip exploded" };

    await expect(
      publishBroadsheetAndOpenPortal(supabase as any, { ...SCOPES, publishedBy: "u1" })
    ).rejects.toThrow("flip exploded");

    const calls = supabaseState.calls;
    const last = calls[calls.length - 1];
    expect(last).toMatchObject({ type: "rpc", fn: "unpublish_results" });
    // The attempted flip itself must still be recorded (it errored), but never committed silently.
    expect(calls.some((c) => c.type === "update" && c.table === "broadsheet_headers")).toBe(true);
  });

  it("unpublishes by closing the gate before flipping the header to draft", async () => {
    await unpublishBroadsheetAndClosePortal(supabase as any, { ...SCOPES, publishedBy: null });

    const idx = (pred: (c: any) => boolean) => supabaseState.calls.findIndex(pred);
    const headerFlip = idx((c) => c.type === "update" && c.table === "broadsheet_headers");
    const gate = idx((c) => c.type === "rpc" && c.fn === "unpublish_results");
    expect(headerFlip).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(gate).toBeLessThan(headerFlip);

    const update = supabaseState.calls[headerFlip];
    expect(update!.patch.status).toBe("draft");
  });

  it("does NOT flip the header to draft when closing the gate fails", async () => {
    supabaseState.failRpc["unpublish_results"] = { message: "gate stuck" };

    await expect(
      unpublishBroadsheetAndClosePortal(supabase as any, { ...SCOPES, publishedBy: null })
    ).rejects.toThrow("gate stuck");

    const headerFlip = supabaseState.calls.find((c) => c.type === "update" && c.table === "broadsheet_headers");
    expect(headerFlip).toBeUndefined();
  });
});
