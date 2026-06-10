import { writeFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function exportCsv(rankedActions, filename) {
  const outputDir = resolve(__dirname, "../../data/exports");
  const { mkdir } = await import("fs/promises");
  await mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().split("T")[0];
  const filePath = resolve(outputDir, filename || `digest_${timestamp}.csv`);

  const headers = [
    "Rank",
    "Score",
    "Impact",
    "Type",
    "Category",
    "Action",
    "Revenue Potential",
    "SEO Value",
    "Ease",
    "Deadline",
    "Status",
    "Source Post",
    "Target Keyword",
    "Competitor"
  ];

  const rows = rankedActions.map((a) => [
    a.rank,
    a.scores.normalized,
    a.impact_label,
    a.type || "",
    a.category || "",
    csvEscape(a.action || ""),
    a.revenue_potential || "",
    a.seo_value || "",
    a.ease_of_execution || "",
    a.deadline || "",
    "todo",
    csvEscape(a.source_post || ""),
    csvEscape(a.target_keyword || ""),
    csvEscape(a.competitor || "")
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  await writeFile(filePath, csv);

  console.log(`  [CSV] Exported ${rankedActions.length} actions to ${filePath}`);
  return filePath;
}

function csvEscape(val) {
  if (!val) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
