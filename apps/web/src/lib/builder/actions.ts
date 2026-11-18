"use client";

import { toast } from "@/components/feedback";
import type { BankQuestion } from "./model";
import { useBuilder } from "./store";

/**
 * Picking questions, with a short notice ("Added as question 5") when the paper preview isn't on
 * screen — on a phone's "Pick questions" tab, or with the preview collapsed — so a tap never
 * goes unnoticed.
 */
function notify(text: string) {
  if (!useBuilder.getState().previewVisible) toast(text);
}
const serialOf = (questionId: string) => useBuilder.getState().items.findIndex((i) => i.questionId === questionId) + 1;
const totals = () => {
  const { items } = useBuilder.getState();
  return `${items.length} question${items.length === 1 ? "" : "s"}`;
};

export function pickQuestion(q: BankQuestion) {
  const had = serialOf(q.id) > 0;
  useBuilder.getState().addQuestion(q);
  notify(had ? `Q${q.number} is now in full as question ${serialOf(q.id)}` : `Added Q${q.number} as question ${serialOf(q.id)} · ${totals()}`);
}

export function pickPart(q: BankQuestion, partId: string) {
  const label = q.parts.find((p) => p.id === partId)?.label ?? "";
  const had = serialOf(q.id) > 0;
  useBuilder.getState().addPart(q, partId);
  notify(had ? `Added part (${label}) to question ${serialOf(q.id)}` : `Added Q${q.number}(${label}) as question ${serialOf(q.id)} · ${totals()}`);
}

export function unpickPart(q: BankQuestion, partId: string) {
  const label = q.parts.find((p) => p.id === partId)?.label ?? "";
  useBuilder.getState().removePart(q, partId);
  notify(serialOf(q.id) ? `Removed part (${label})` : `Removed Q${q.number} · ${totals()}`);
}

export function unpickQuestion(q: BankQuestion) {
  useBuilder.getState().removeItem(q.id);
  notify(`Removed Q${q.number} · ${totals()}`);
}
