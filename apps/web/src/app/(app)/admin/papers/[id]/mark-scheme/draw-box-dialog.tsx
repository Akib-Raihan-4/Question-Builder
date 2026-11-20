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
  onClose,
  onSave,
}: {
  paperId: string;
  version?: string;
  title: string;
  rows: MsRowView[];
  startPage?: number;
  onClose: () => void;
  onSave: (boxes: DrawnBox[]) => void;
}) {
  return (
    <DrawBoxesDialog
      docKey={msDocKey(paperId, version)}
      heading={`Draw the mark scheme for ${title}`}
      help="Drag on the page round this part's row (answer, guidance and marks). Runs onto another page? Draw a second box there."
      boxLabel={title}
      outlines={rows.flatMap((r) => r.regions.map((g) => ({ ...g, label: r.label, dashed: !r.questionId })))}
      startPage={startPage}
      saveLabel="Save"
      onClose={onClose}
      onSave={onSave}
    />
  );
}
