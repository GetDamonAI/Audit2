const fs = require("fs");
const path = require("path");
const { respond } = require("./_paid-utils");

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const DEFAULT_FONT = "F1";
const BOLD_FONT = "F2";

exports.handler = async (event) => {
  try {
    const input = JSON.parse(event.body || "{}");
    if (!input.report) {
      return respond(400, { error: "Missing report payload." });
    }

    const pdf = await generatePdfReport({
      report: input.report,
      fileName: input.fileName
    });

    return respond(200, {
      success: true,
      fileName: pdf.fileName,
      filePath: pdf.filePath,
      bytes: pdf.buffer.length
    });
  } catch (error) {
    return respond(500, { error: error.message || "PDF generation failed." });
  }
};

async function generatePdfReport({ report, fileName }) {
  const safeFileName =
    sanitizeFileName(
      fileName ||
        `${report.businessName || report.url || "ai-visibility-audit"}-ai-visibility-audit.pdf`
    ) || "ai-visibility-audit.pdf";

  const lines = buildReportLines(report);
  const pdfBuffer = buildPdfBuffer({
    title: report.businessName || report.url || "AI Visibility Audit",
    lines
  });
  const filePath = path.join("/tmp", safeFileName);

  fs.writeFileSync(filePath, pdfBuffer);

  return {
    fileName: safeFileName,
    filePath,
    mimeType: "application/pdf",
    buffer: pdfBuffer
  };
}

function buildReportLines(report) {
  const lines = [];
  const title = `${report.businessName || report.url || "AI Visibility Audit"} - AI Visibility Audit + Implementation Plan`;

  pushWrapped(lines, title, {
    font: BOLD_FONT,
    size: 24,
    gapBefore: 0,
    gapAfter: 6,
    maxChars: 38
  });

  pushWrapped(
    lines,
    `Generated for ${report.url || "the submitted website"} on ${formatDate(report.generatedAt)}.`,
    { size: 10.5, color: "muted", gapBefore: 0, gapAfter: 3, maxChars: 84 }
  );

  if (report.quickAuditScore || report.quickAuditStatus) {
    pushWrapped(
      lines,
      `Quick audit score: ${report.quickAuditScore || 0}/100${report.quickAuditStatus ? ` • ${report.quickAuditStatus}` : ""}`,
      { size: 10.5, color: "muted", gapBefore: 0, gapAfter: 8, maxChars: 84 }
    );
  }

  addSection(lines, "AI Visibility Summary", [
    {
      type: "paragraph",
      text: report.executiveSummary?.overallDiagnosis || "No summary available."
    },
    {
      type: "subheading",
      text: "What is helping"
    },
    ...toBullets(report.executiveSummary?.whatIsHelping),
    {
      type: "subheading",
      text: "What is hurting"
    },
    ...toBullets(report.executiveSummary?.whatIsHurting),
    {
      type: "subheading",
      text: "Biggest opportunities"
    },
    ...toBullets(report.executiveSummary?.biggestOpportunities),
    {
      type: "paragraph",
      text: `What matters first: ${report.executiveSummary?.whatMattersFirst || "Clarify the highest-impact pages and strengthen trust signals."}`
    }
  ]);

  addSection(
    lines,
    "Positioning Analysis",
    (report.aiVisibilityDiagnosis || []).flatMap((item) => [
      {
        type: "subheading",
        text: `${item.area} (${item.severity})`
      },
      {
        type: "paragraph",
        text: item.diagnosis
      },
      {
        type: "bullet",
        text: `Why it matters for AI search: ${item.whyItMattersForAiSearch}`
      },
      {
        type: "bullet",
        text: `What it means: ${item.whatItMeans}`
      }
    ])
  );

  addSection(
    lines,
    "Opportunity Map",
    (report.opportunityMap || []).flatMap((item) => [
      {
        type: "subheading",
        text: `${item.query} (${item.priority})`
      },
      {
        type: "bullet",
        text: `Why it matters: ${item.whyItMatters}`
      },
      {
        type: "bullet",
        text: `Recommended intent: ${item.recommendedIntent}`
      }
    ])
  );

  addSection(
    lines,
    "Priority Fixes",
    (report.priorityActions || []).flatMap((item) => [
      {
        type: "subheading",
        text: item.title
      },
      {
        type: "bullet",
        text: `Why it matters: ${item.whyItMatters}`
      },
      {
        type: "bullet",
        text: `Expected impact: ${item.expectedImpact}`
      },
      {
        type: "bullet",
        text: `Difficulty: ${item.difficulty} • Recommended owner: ${item.recommendedOwner}`
      }
    ])
  );

  const contentRecommendations = (report.tacticalRecommendations || []).filter((recommendation) =>
    /(content|topic|question|publishing|internal linking|conversion)/i.test(
      `${recommendation.workstream} ${recommendation.title}`
    )
  );

  const technicalRecommendations = (report.tacticalRecommendations || []).filter((recommendation) =>
    /(technical|schema|structure|site|crawl|accessibility|markup)/i.test(
      `${recommendation.workstream} ${recommendation.title}`
    )
  );

  addSection(
    lines,
    "Content Strategy",
    formatRecommendationSection(contentRecommendations.length ? contentRecommendations : report.tacticalRecommendations)
  );

  addSection(
    lines,
    "Technical + Structure",
    formatRecommendationSection(technicalRecommendations.length ? technicalRecommendations : report.workstreams)
  );

  addSection(
    lines,
    "60-Day Plan",
    (report.sixtyDayCalendar || []).flatMap((phase) => [
      {
        type: "subheading",
        text: phase.phase
      },
      ...((phase.items || []).flatMap((item) => [
        {
          type: "bullet",
          text: `${item.task} — ${item.whyItMatters}`
        },
        {
          type: "bullet",
          text: `Expected outcome: ${item.expectedOutcome}`
        },
        {
          type: "bullet",
          text: `Suggested owner: ${item.suggestedOwner}`
        }
      ]))
    ])
  );

  addSection(
    lines,
    "Implementation Checklist",
    (report.implementationChecklist || []).map((item) => ({
      type: "bullet",
      text: `${item.task} (${item.priority} priority • ${item.owner})`
    }))
  );

  addSection(lines, "Quick Wins", toBullets(report.quickWins));

  addSection(lines, "Coaching Notes", [
    {
      type: "subheading",
      text: "What matters most"
    },
    ...toBullets(report.coachingNotes?.whatMattersMost),
    {
      type: "subheading",
      text: "What to ignore"
    },
    ...toBullets(report.coachingNotes?.whatToIgnore),
    {
      type: "paragraph",
      text: `Where to focus first: ${report.coachingNotes?.whereToFocusFirst || "Focus on the highest-leverage recommendations first."}`
    }
  ]);

  return lines;
}

function addSection(lines, title, items) {
  pushWrapped(lines, title, {
    font: BOLD_FONT,
    size: 17,
    gapBefore: 16,
    gapAfter: 6,
    maxChars: 54,
    divider: true
  });

  (items || []).forEach((item) => {
    if (!item || !item.text) return;

    if (item.type === "subheading") {
      pushWrapped(lines, item.text, {
        font: BOLD_FONT,
        size: 11.5,
        gapBefore: 8,
        gapAfter: 2,
        maxChars: 72
      });
      return;
    }

    if (item.type === "bullet") {
      pushWrapped(lines, item.text, {
        font: DEFAULT_FONT,
        size: 10.5,
        gapBefore: 2,
        gapAfter: 0,
        indent: 14,
        bullet: true,
        maxChars: 88
      });
      return;
    }

    pushWrapped(lines, item.text, {
      font: DEFAULT_FONT,
      size: 10.8,
      gapBefore: 2,
      gapAfter: 0,
      maxChars: 92
    });
  });
}

function formatRecommendationSection(items) {
  const values = Array.isArray(items) ? items : [];

  return values.flatMap((item) => {
    if (item.items && Array.isArray(item.items)) {
      return [
        { type: "subheading", text: item.title || "Recommended focus" },
        { type: "paragraph", text: item.summary || "" },
        ...toBullets(item.items)
      ].filter((entry) => entry.text);
    }

    return [
      { type: "subheading", text: `${item.title} (${item.priority || "Medium"})` },
      { type: "paragraph", text: item.whatToChange || item.diagnosis || "" },
      {
        type: "bullet",
        text: `Why it matters for AI search: ${item.whyItMattersForAiSearch || item.diagnosis || ""}`
      },
      ...toBullets(item.stepByStepImplementation),
      ...toBullets(item.examplesOrTemplates, "Example")
    ].filter((entry) => entry.text);
  });
}

function toBullets(items, prefix) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((text) => ({
      type: "bullet",
      text: prefix ? `${prefix}: ${text}` : text
    }));
}

function pushWrapped(target, text, options) {
  const cleanText = normalizePdfText(text);
  if (!cleanText) return;

  const widthFactor = options.size >= 18 ? 0.55 : options.size >= 12 ? 0.58 : 0.6;
  const maxChars = options.maxChars || Math.max(24, Math.floor(CONTENT_WIDTH / (options.size * widthFactor)));
  const wrapped = wrapText(cleanText, maxChars);

  wrapped.forEach((line, index) => {
    target.push({
      text: line,
      font: options.font || DEFAULT_FONT,
      size: options.size || 11,
      indent: options.indent || 0,
      bullet: Boolean(options.bullet && index === 0),
      divider: Boolean(options.divider && index === 0),
      color: options.color || "default",
      gapBefore: index === 0 ? options.gapBefore || 0 : 0,
      gapAfter: index === wrapped.length - 1 ? options.gapAfter || 0 : 0
    });
  });
}

function buildPdfBuffer({ title, lines }) {
  const pages = paginateLines(title, lines);
  return assemblePdf(pages);
}

function paginateLines(title, lines) {
  const pages = [];
  let currentPage = [];
  let cursorY = PAGE_HEIGHT - MARGIN_TOP;

  const addNewPage = () => {
    if (currentPage.length) {
      pages.push(currentPage);
    }
    currentPage = [];
    cursorY = PAGE_HEIGHT - MARGIN_TOP;
    addPageHeader(currentPage, title);
    cursorY -= 50;
  };

  addNewPage();

  lines.forEach((line) => {
    const textHeight = line.size * 1.35;
    const requiredHeight = line.gapBefore + textHeight + line.gapAfter + (line.divider ? 8 : 0);
    if (cursorY - requiredHeight <= MARGIN_BOTTOM) {
      addNewPage();
    }

    cursorY -= line.gapBefore;

    if (line.divider) {
      currentPage.push({
        type: "rule",
        x1: MARGIN_X,
        x2: PAGE_WIDTH - MARGIN_X,
        y: cursorY + 5
      });
    }

    currentPage.push({
      type: "text",
      text: line.text,
      font: line.font,
      size: line.size,
      x: MARGIN_X + line.indent + (line.bullet ? 12 : 0),
      y: cursorY,
      bullet: line.bullet,
      color: line.color
    });

    cursorY -= textHeight + line.gapAfter;
  });

  if (currentPage.length) {
    pages.push(currentPage);
  }

  return pages.map((page, index) => [
    ...page,
    {
      type: "footer",
      text: `Page ${index + 1} of ${pages.length}`,
      x: PAGE_WIDTH - MARGIN_X,
      y: 28
    }
  ]);
}

function addPageHeader(page, title) {
  page.push({
    type: "text",
    text: normalizePdfText(title),
    font: BOLD_FONT,
    size: 12,
    x: MARGIN_X,
    y: PAGE_HEIGHT - 34,
    color: "muted"
  });
  page.push({
    type: "rule",
    x1: MARGIN_X,
    x2: PAGE_WIDTH - MARGIN_X,
    y: PAGE_HEIGHT - 44
  });
}

function assemblePdf(pages) {
  const objects = [null];
  const pageRefs = [];

  objects.push(Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "utf8"));
  objects.push(null);
  objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "utf8"));
  objects.push(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", "utf8"));

  let objectIndex = 5;

  pages.forEach((page) => {
    const pageObjectId = objectIndex++;
    const contentObjectId = objectIndex++;
    const stream = buildContentStream(page);

    objects[pageObjectId] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      "utf8"
    );
    objects[contentObjectId] = Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "utf8"),
      stream,
      Buffer.from("\nendstream", "utf8")
    ]);

    pageRefs.push(`${pageObjectId} 0 R`);
  });

  objects[2] = Buffer.from(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.join(" ")}] >>`,
    "utf8"
  );

  return finalizePdf(objects);
}

function buildContentStream(page) {
  const commands = [];

  page.forEach((entry) => {
    if (entry.type === "rule") {
      commands.push("0.8 w");
      commands.push("0.90 0.89 0.94 RG");
      commands.push(`${formatNumber(entry.x1)} ${formatNumber(entry.y)} m`);
      commands.push(`${formatNumber(entry.x2)} ${formatNumber(entry.y)} l`);
      commands.push("S");
      return;
    }

    if (entry.type === "footer") {
      commands.push("BT");
      commands.push("/F1 9 Tf");
      commands.push("0.52 0.49 0.56 rg");
      commands.push(`${formatNumber(entry.x)} ${formatNumber(entry.y)} Td`);
      commands.push(`(${escapePdfString(entry.text)}) Tj`);
      commands.push("ET");
      return;
    }

    if (entry.type === "text") {
      if (entry.bullet) {
        commands.push("BT");
        commands.push("/F2 12 Tf");
        commands.push("0.48 0.37 0.30 rg");
        commands.push(`${formatNumber(entry.x - 12)} ${formatNumber(entry.y)} Td`);
        commands.push("(•) Tj");
        commands.push("ET");
      }

      commands.push("BT");
      commands.push(`/${entry.font || DEFAULT_FONT} ${formatNumber(entry.size)} Tf`);
      commands.push(getColorCommand(entry.color));
      commands.push(`${formatNumber(entry.x)} ${formatNumber(entry.y)} Td`);
      commands.push(`(${escapePdfString(entry.text)}) Tj`);
      commands.push("ET");
    }
  });

  return Buffer.from(commands.join("\n"), "utf8");
}

function finalizePdf(objects) {
  const header = Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary");
  const parts = [header];
  const offsets = [0];
  let currentOffset = header.length;

  for (let i = 1; i < objects.length; i += 1) {
    const prefix = Buffer.from(`${i} 0 obj\n`, "utf8");
    const suffix = Buffer.from("\nendobj\n", "utf8");
    offsets[i] = currentOffset;
    parts.push(prefix, objects[i], suffix);
    currentOffset += prefix.length + objects[i].length + suffix.length;
  }

  const xrefStart = currentOffset;
  const xrefEntries = ["0000000000 65535 f "];

  for (let i = 1; i < offsets.length; i += 1) {
    xrefEntries.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }

  const xref = Buffer.from(
    `xref\n0 ${objects.length}\n${xrefEntries.join("\n")}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
    "utf8"
  );

  parts.push(xref);
  return Buffer.concat(parts);
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      return;
    }

    if (current) {
      lines.push(current);
      current = word;
      return;
    }

    let remainder = word;
    while (remainder.length > maxChars) {
      lines.push(remainder.slice(0, maxChars - 1) + "-");
      remainder = remainder.slice(maxChars - 1);
    }
    current = remainder;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [text];
}

function normalizePdfText(value) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function sanitizeFileName(value) {
  const base = String(value || "")
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return base ? `${base}.pdf` : "";
}

function getColorCommand(color) {
  if (color === "muted") {
    return "0.43 0.40 0.47 rg";
  }

  return "0.10 0.10 0.10 rg";
}

function formatDate(value) {
  if (!value) return "Unknown date";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function formatNumber(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

module.exports = {
  generatePdfReport
};
