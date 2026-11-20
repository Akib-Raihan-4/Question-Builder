"use client";

import { create } from "zustand";
import type { AnswerSpace, PaperHeader } from "@/db/schema";
import * as m from "./model";

/** A mark scheme row as the preview shows it (see lib/mark-schemes/for-builder.ts). */
export type MsPreviewRow = {
  label: string;
  partId: string | null;
  marks: number | null;
  regions: { page: number; x0: number; y0: number; x1: number; y1: number }[];
  own?: boolean;
};

type State = {
  title: string;
  header: PaperHeader;
  items: m.Item[];
  bank: m.Bank;
  /** Bumped on every change the server doesn't have yet. */
  version: number;
  load: (data: { title: string; header: PaperHeader; items: m.Item[] }) => void;
  addToBank: (qs: m.BankQuestion[]) => void;
  addQuestion: (q: m.BankQuestion) => void;
  addPart: (q: m.BankQuestion, partId: string) => void;
  removePart: (q: m.BankQuestion, partId: string) => void;
  removeItem: (questionId: string) => void;
  move: (from: number, to: number) => void;
  setTitle: (title: string) => void;
  setHeader: (patch: Partial<PaperHeader>) => void;
  /** One question's answer space, or every question's (questionId null). */
  setAnswerSpace: (questionId: string | null, space: AnswerSpace | null) => void;
  /** Whether the paper preview is on screen (not on a phone's "Pick" tab, not collapsed). */
  previewVisible: boolean;
  setPreviewVisible: (v: boolean) => void;
  /** Mark scheme rows per question (loaded when first shown), and each source paper's MS file version. */
  ms: Record<string, MsPreviewRow[]>;
  msVersions: Record<string, string>;
  setMs: (rows: Record<string, MsPreviewRow[]>, versions: Record<string, string>) => void;
  /** Forget loaded rows (after the teacher changes their own boxes) so they load again. */
  dropMs: (questionIds: string[]) => void;
  /** Show every question's mark scheme under it in the preview. */
  showAllMs: boolean;
  setShowAllMs: (v: boolean) => void;
};

export const useBuilder = create<State>((set) => {
  const edit = (fn: (s: State) => Partial<State>) =>
    set((s) => ({ ...fn(s), version: s.version + 1 }));
  const withBank = (s: State, q: m.BankQuestion) => ({ ...s.bank, [q.id]: q });
  return {
    title: "Untitled paper",
    header: {},
    items: [],
    bank: {},
    version: 0,
    previewVisible: true,
    setPreviewVisible: (previewVisible) => set({ previewVisible }),
    ms: {},
    msVersions: {},
    setMs: (rows, versions) => set((s) => ({ ms: { ...s.ms, ...rows }, msVersions: { ...s.msVersions, ...versions } })),
    dropMs: (ids) => set((s) => ({ ms: Object.fromEntries(Object.entries(s.ms).filter(([k]) => !ids.includes(k))) })),
    showAllMs: false,
    setShowAllMs: (showAllMs) => set({ showAllMs }),
    load: (d) => set({ title: d.title, header: d.header, items: d.items, version: 0 }),
    addToBank: (qs) => set((s) => ({ bank: { ...s.bank, ...Object.fromEntries(qs.map((q) => [q.id, q])) } })),
    addQuestion: (q) => edit((s) => ({ items: m.addQuestion(s.items, q), bank: withBank(s, q) })),
    addPart: (q, partId) => edit((s) => ({ items: m.addPart(s.items, q, partId), bank: withBank(s, q) })),
    removePart: (q, partId) => edit((s) => ({ items: m.removePart(s.items, q, partId) })),
    removeItem: (questionId) => edit((s) => ({ items: m.removeItem(s.items, questionId) })),
    move: (from, to) => edit((s) => ({ items: m.move(s.items, from, to) })),
    setTitle: (title) => edit(() => ({ title })),
    setHeader: (patch) => edit((s) => ({ header: { ...s.header, ...patch } })),
    setAnswerSpace: (questionId, space) =>
      edit((s) => ({
        items: s.items.map((i) => (questionId === null || i.questionId === questionId ? { ...i, answerSpace: space } : i)),
      })),
  };
});
