#!/usr/bin/env node
import { readFile, writeFile } from "fs/promises";
import { parse } from "csv-parse/sync";

const USAGE = `
Usage: node scripts/convert-magento-csv.mjs --orders <orders.csv> [--products <products.csv>] [--out <output.json>]

  --orders   Orders Report CSV exported from Magento (required)
  --products Ordered Products Report CSV exported from Magento (optional)
  --out      Output JSON path (default: magento-export.json)

Export instructions:
  1. Reports → Sales → Orders → set 90-day range, Show By: Day → Export CSV
  2. Reports → Products → Ordered → same date range → Export CSV
`;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { out: "magento-export.json" };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i].replace(/^--/, "");
    opts[flag] = args[i + 1];
  }
  if (!opts.orders) {
    console.log(USAGE);
    process.exit(1);
  }
  return opts;
}

function parseCurrency(val) {
  if (val == null) return 0;
  return parseFloat(String(val).replace(/[$,]/g, "")) || 0;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const mdyMatch = trimmed.match(/^(\w+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (mdyMatch) {
    const d = new Date(`${mdyMatch[1]} ${mdyMatch[2]}, ${mdyMatch[3]}`);
    return d.toISOString().split("T")[0];
  }
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let year = parseInt(slashMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, parseInt(slashMatch[1]) - 1, parseInt(slashMatch[2]));
    return d.toISOString().split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return trimmed;
}

function inferCategory(productName) {
  const lower = productName.toLowerCase();
  if (lower.includes("name train") || lower.includes("alphabet name train") || lower.includes("letter") && lower.includes("train"))
    return "Name Trains";
  if (lower.includes("puzzle stool") || lower.includes("step stool")) return "Puzzle Stools";
  if (lower.includes("rug") || lower.includes("carpet")) return "Classroom Rugs";
  if (lower.includes("book") || lower.includes("story")) return "Personalized Books";
  if (lower.includes("mirror") || lower.includes("montessori")) return "Montessori & Learning";
  if (lower.includes("lightbox") || lower.includes("led")) return "Learning Toys";
  return "Other";
}

function stripBom(str) {
  return str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;
}

async function convertOrders(csvPath) {
  const raw = stripBom(await readFile(csvPath, "utf-8"));
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  let lastDate = null;
  const daily = [];

  for (const row of records) {
    const dateRaw = row["Interval"] || row["Period"] || row["Date"];
    const date = dateRaw ? normalizeDate(dateRaw) : lastDate;
    if (date) lastDate = date;
    if (!date) continue;

    const orders = parseInt(row["Orders"] || row["Number of Orders"] || "0") || 0;
    const revenue = parseCurrency(row["Revenue"] || row["Sales Total"] || row["Total"]);

    if (orders === 0 && revenue === 0) continue;

    daily.push({
      order_date: date,
      orders,
      revenue: Math.round(revenue * 100) / 100,
      aov: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0
    });
  }

  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = daily.reduce((s, d) => s + d.orders, 0);

  return {
    last90Days: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    aov: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    dailyTrend: daily.slice(0, 30)
  };
}

async function convertProducts(csvPath) {
  const raw = stripBom(await readFile(csvPath, "utf-8"));
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const isRevenueFormat = records.length > 0 && ("Revenue" in records[0] || "Product Revenue" in records[0]);

  const productMap = new Map();
  const categoryMap = new Map();
  let lastDate = null;

  for (const row of records) {
    const name = row["Product"] || row["Product Name"] || "";
    if (!name) continue;

    let revenue = 0;
    let qty = 0;

    if (isRevenueFormat) {
      revenue = parseCurrency(row["Revenue"] || row["Product Revenue"]);
      if (revenue === 0) continue;
      qty = 1;
    } else {
      const dateRaw = row["Interval"] || row["Period"] || row["Date"];
      if (dateRaw && dateRaw.trim()) lastDate = normalizeDate(dateRaw);
      qty = parseInt(row["Ordered Quantity"] || row["Qty Ordered"] || row["Quantity"] || "0") || 0;
      if (qty === 0) continue;
    }

    const sku = row["SKU"] || "";
    const key = sku || name;
    if (productMap.has(key)) {
      const p = productMap.get(key);
      p.units += qty;
      p.orders += 1;
      p.revenue += revenue;
    } else {
      productMap.set(key, { name, sku, orders: 1, units: qty, revenue, avgPrice: 0 });
    }

    const cat = inferCategory(name);
    if (categoryMap.has(cat)) {
      const c = categoryMap.get(cat);
      c.orders += 1;
      c.revenue += revenue;
    } else {
      categoryMap.set(cat, { category: cat, orders: 1, revenue });
    }
  }

  for (const p of productMap.values()) {
    if (p.units > 0) p.avgPrice = Math.round((p.revenue / p.units) * 100) / 100;
  }

  const products = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 100);

  const categories = [...categoryMap.values()]
    .sort((a, b) => b.revenue - a.revenue);

  return { products, categories };
}

async function main() {
  const opts = parseArgs();

  console.log("Converting Magento CSV exports to JSON...\n");

  const revenue = await convertOrders(opts.orders);
  console.log(`  Orders: ${revenue.totalOrders} orders, $${revenue.last90Days} revenue, $${revenue.aov} AOV`);
  console.log(`  Daily data points: ${revenue.dailyTrend.length}`);

  let productConversion = [];
  let categoryRevenue = [];

  if (opts.products) {
    const result = await convertProducts(opts.products);
    productConversion = result.products;
    categoryRevenue = result.categories;
    console.log(`  Products: ${productConversion.length} unique SKUs`);
    console.log(`  Categories: ${categoryRevenue.length} inferred categories`);
  } else {
    console.log("  Products: skipped (no --products CSV provided)");
  }

  const output = {
    exportedAt: new Date().toISOString(),
    revenue,
    productConversion,
    categoryRevenue
  };

  await writeFile(opts.out, JSON.stringify(output, null, 2));
  console.log(`\n  Written to: ${opts.out}`);
  console.log("\nSet in .env:");
  console.log(`  MAGENTO_MODE=export`);
  console.log(`  MAGENTO_EXPORT_PATH=${opts.out}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
