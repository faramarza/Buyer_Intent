import { readdir, readFile, stat } from "fs/promises";
import { resolve } from "path";
import { parse } from "csv-parse/sync";

export async function loadAhrefsData() {
  const folderPath = process.env.AHREFS_CSV_FOLDER;

  if (!folderPath) {
    console.log("  [Ahrefs] Skipped — AHREFS_CSV_FOLDER not set");
    return null;
  }

  let files;
  try {
    files = await readdir(folderPath);
  } catch (err) {
    console.log(`  [Ahrefs] Cannot read folder ${folderPath}: ${err.message}`);
    return null;
  }

  const csvFiles = files.filter((f) => f.endsWith(".csv"));
  if (csvFiles.length === 0) {
    console.log("  [Ahrefs] No CSV files found in folder");
    return null;
  }

  console.log(`  [Ahrefs] Found ${csvFiles.length} CSV files`);

  let keywordGap = [];
  let backlinkProfile = [];

  for (const file of csvFiles) {
    const filePath = resolve(folderPath, file);
    const fileStat = await stat(filePath);
    const content = await readFile(filePath, "utf-8");

    const lowerFile = file.toLowerCase();
    const fetchedAt = fileStat.mtime.toISOString();

    try {
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });

      if (lowerFile.includes("keyword") || lowerFile.includes("content-gap") || lowerFile.includes("gap")) {
        const parsed = records.map((r) => normalizeKeywordGap(r)).filter(Boolean);
        keywordGap.push(...parsed.map((r) => ({ ...r, source_file: file, fetchedAt })));
        console.log(`  [Ahrefs] Keyword gap: ${parsed.length} rows from ${file}`);
      } else if (lowerFile.includes("backlink") || lowerFile.includes("referring") || lowerFile.includes("anchor")) {
        const parsed = records.map((r) => normalizeBacklink(r)).filter(Boolean);
        backlinkProfile.push(...parsed.map((r) => ({ ...r, source_file: file, fetchedAt })));
        console.log(`  [Ahrefs] Backlinks: ${parsed.length} rows from ${file}`);
      } else {
        console.log(`  [Ahrefs] Skipped ${file} — filename doesn't match keyword-gap or backlink pattern`);
      }
    } catch (err) {
      console.log(`  [Ahrefs] Parse error in ${file}: ${err.message}`);
    }
  }

  if (keywordGap.length === 0 && backlinkProfile.length === 0) {
    console.log("  [Ahrefs] No usable data parsed");
    return null;
  }

  return {
    source: "ahrefs_csv_export",
    fetchedAt: new Date().toISOString(),
    keywordGap: keywordGap.slice(0, 500),
    backlinkProfile: backlinkProfile.slice(0, 300)
  };
}

function normalizeKeywordGap(row) {
  const keyword = row["Keyword"] || row["keyword"] || row["Query"] || row["query"];
  if (!keyword) return null;

  return {
    keyword,
    volume: parseInt(row["Volume"] || row["Search Volume"] || row["volume"] || "0", 10),
    difficulty: parseInt(row["KD"] || row["Keyword Difficulty"] || row["difficulty"] || "0", 10),
    yourPosition: parseInt(row["Position"] || row["Your position"] || row["Current Position"] || "0", 10) || null,
    competitor1Position: parseInt(row["Competitor 1"] || row["comp1_position"] || "0", 10) || null,
    competitor2Position: parseInt(row["Competitor 2"] || row["comp2_position"] || "0", 10) || null,
    url: row["URL"] || row["Current URL"] || null,
    cpc: parseFloat(row["CPC"] || "0") || null,
    trafficPotential: parseInt(row["Traffic Potential"] || row["Traffic potential"] || "0", 10) || null
  };
}

function normalizeBacklink(row) {
  const domain = row["Referring Domain"] || row["Referring domain"] || row["Domain"] || row["domain"];
  if (!domain) return null;

  return {
    referringDomain: domain,
    domainRating: parseInt(row["DR"] || row["Domain Rating"] || row["domain_rating"] || "0", 10) || null,
    backlinks: parseInt(row["Backlinks"] || row["Links"] || row["backlinks"] || "1", 10),
    anchorText: row["Anchor"] || row["Anchor Text"] || row["anchor"] || null,
    targetUrl: row["Target URL"] || row["Target"] || row["target_url"] || null,
    firstSeen: row["First Seen"] || row["First seen"] || null,
    type: row["Type"] || row["Link Type"] || null
  };
}
