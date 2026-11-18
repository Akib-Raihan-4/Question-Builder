"use client";

import { create } from "zustand";
import type { PaperHeader } from "@/db/schema";
import * as m from "./model";

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
  /** Whether the paper preview is on screen (not on a phone's "Pick" tab, not collapsed). */
  previewVisible: boolean;
  setPreviewVisible: (v: boolean) => void;
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
    load: (d) => set({ title: d.title, header: d.header, items: d.items, version: 0 }),
    addToBank: (qs) => set((s) => ({ bank: { ...s.bank, ...Object.fromEntries(qs.map((q) => [q.id, q])) } })),
    addQuestion: (q) => edit((s) => ({ items: m.addQuestion(s.items, q), bank: withBank(s, q) })),
    addPart: (q, partId) => edit((s) => ({ items: m.addPart(s.items, q, partId), bank: withBank(s, q) })),
    removePart: (q, partId) => edit((s) => ({ items: m.removePart(s.items, q, partId) })),
    removeItem: (questionId) => edit((s) => ({ items: m.removeItem(s.items, questionId) })),
    move: (from, to) => edit((s) => ({ items: m.move(s.items, from, to) })),
    setTitle: (title) => edit(() => ({ title })),
    setHeader: (patch) => edit((s) => ({ header: { ...s.header, ...patch } })),
  };
});
