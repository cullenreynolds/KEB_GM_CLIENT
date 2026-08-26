// ─────────────────────────────────────────────────────────────────────────────
// services/pdfExport.js
// Ported verbatim from old_gm-report-app/src/services/pdfExport.js — this was
// already a complete, working implementation (contrary to PROJECT_BRIEF.md's
// "still to build" note), not something to rebuild. No logic changes.
//
// Captures the live section content area one section at a time and assembles
// a portrait Letter PDF. Short sections are packed together on the same page
// to avoid wasted whitespace.
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Captures a DOM element as a high-res canvas.
 *
 * targetWidth: if provided, the element is temporarily resized to this CSS pixel
 *   width before capture, giving a consistent PDF output regardless of browser size.
 *
 * Before capture:
 *  • Sets width to targetWidth (if given).
 *  • Removes flex-height constraints so the full section renders.
 *  • Expands <textarea> elements so text isn't clipped by fixed heights.
 * All are restored immediately after capture.
 */
export async function captureElement(el, targetWidth = null) {
  const prevFlex = el.style.flex;
  const prevHeight = el.style.height;
  const prevWidth = el.style.width;

  el.style.flex = "none";
  el.style.height = "auto";
  if (targetWidth) el.style.width = `${targetWidth}px`;

  // html2canvas doesn't reliably render textarea text — swap each textarea for a
  // matching <div> so all commentary is captured, then restore after capture.
  const textareas = [...el.querySelectorAll("textarea")];
  const swaps = textareas.map((ta) => {
    const cs = window.getComputedStyle(ta);
    const div = document.createElement("div");
    ["fontFamily", "fontSize", "lineHeight", "color", "padding", "border",
      "borderRadius", "background", "boxSizing", "width", "minHeight"].forEach((p) => {
      div.style[p] = cs[p];
    });
    div.style.whiteSpace = "pre-wrap";
    div.style.wordBreak = "break-word";
    div.style.overflow = "hidden";
    div.style.height = "auto";
    div.textContent = ta.value;
    ta.insertAdjacentElement("afterend", div);
    ta.style.display = "none";
    return { ta, div };
  });

  const canvas = await html2canvas(el, {
    scale: 2, // 2x for sharp output
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: null, // preserve each section's own background
  });

  // Restore
  swaps.forEach(({ ta, div }) => { ta.style.display = ""; div.remove(); });
  el.style.flex = prevFlex;
  el.style.height = prevHeight;
  if (targetWidth) el.style.width = prevWidth;

  return canvas;
}

/**
 * Assembles an ordered array of canvases into a portrait Letter PDF.
 *
 * Sections are packed onto pages greedily: each section is scaled to fill the
 * full page width, then stacked vertically. A new page is started only when
 * the next section won't fit in the remaining space. This lets short sections
 * (e.g. Cost of Goods + Payroll) share a page instead of wasting a full page each.
 *
 * The cover page (index 0, captured at portrait height) naturally fills its
 * own page because nothing fits in the ~0 mm remaining.
 */
export async function buildPDF(canvases, filename = "GM-Report.pdf") {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth(); // 215.9 mm
  const pageH = pdf.internal.pageSize.getHeight(); // 279.4 mm

  let yPos = 0; // current vertical position on the active page

  canvases.forEach((canvas, i) => {
    // All captures use the same targetWidth so cssW is consistent;
    // scale to fill the full page width every time.
    const scale = pageW / (canvas.width / 2);
    const imgH = (canvas.height / 2) * scale;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    // Start a new page if this section won't fit in the remaining space.
    // (i === 0 skips this — the first page is created automatically by jsPDF.)
    if (i > 0 && yPos + imgH > pageH) {
      pdf.addPage();
      yPos = 0;
    }

    pdf.addImage(imgData, "JPEG", 0, yPos, pageW, imgH);
    yPos += imgH;
  });

  // Append back-cover image centered at 50% page width below last exhibit
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = "/back-cover.png";
    });
    const logoW = pageW * 0.25;
    const logoH = logoW * (img.naturalHeight / img.naturalWidth);
    const logoX = (pageW - logoW) / 2;
    const MARGIN = 8; // mm gap between last exhibit and logo

    if (yPos + MARGIN + logoH > pageH) {
      pdf.addPage();
      yPos = 0;
    }

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", logoX, yPos + MARGIN, logoW, logoH);
  } catch {
    // back-cover.png not present — skip silently
  }

  pdf.save(filename);
}
