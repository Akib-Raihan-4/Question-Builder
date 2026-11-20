"use client";

import { msDocKey } from "@/components/pdf/pdf-cache";
import { DrawBoxesDialog, type DrawnBox } from "@/components/pdf/draw-boxes-dialog";
import type { MsRowView } from "@/lib/mark-schemes/server";

/**
 * Full-screen: the mark scheme's pages, with the rows already found outlined. Drag on a page to
 * draw a box round the part's answer (more than one if it runs over pages), then Save.
 */
export function DrawBoxDialog({
  paperId,
  version,
  title,
  rows,
  startPage,
  initialBoxes,
  onClose,
  onSave,
}: {
  paperId: string;
  version?: string;
  title: string;
  rows: MsRowView[];
  startPage?: number;
  /** Adjusting a row: its boxes now (otherwise a new box is drawn). */
  initialBoxes?: DrawnBox[];
  onClose: () => void;
  onSave: (boxes: DrawnBox[]) => void;
}) {
  return (
    <DrawBoxesDialog
      docKey={msDocKey(paperId, version)}
      heading={initialBoxes ? `Adjust the boxes of row ${title}` : `Draw the mark scheme for ${title}`}
      help={
        initialBoxes
          ? "Click a box to move it or drag its handles to resize it. Remove one with its ×, or drag on the page to add another."
          : "Drag on the page round this part's row (answer, guidance and marks). Runs onto another page? Draw a second box there. Click a box to move or resize it."
      }
      boxLabel={title}
      outlines={rows.flatMap((r) => r.regions.map((g) => ({ ...g, label: r.label, dashed: !r.questionId })))}
      startPage={startPage}
      initialBoxes={initialBoxes}
      saveLabel="Save"
      onClose={onClose}
      onSave={onSave}
    />
  );
}
