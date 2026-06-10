import { readFile } from "fs/promises";
import mysql from "mysql2/promise";

export async function fetchMagentoData() {
  const mode = (process.env.MAGENTO_MODE || "export").toLowerCase();

  if (mode === "replica") {
    return fetchFromReplica();
  }
  return fetchFromExport();
}

async function fetchFromReplica() {
  const host = process.env.MAGENTO_DB_HOST;
  const user = process.env.MAGENTO_DB_USER;
  const password = process.env.MAGENTO_DB_PASSWORD;
  const database = process.env.MAGENTO_DB_NAME;
  const port = parseInt(process.env.MAGENTO_DB_PORT || "3306", 10);

  if (!host || !user || !database) {
    console.log("  [Magento] Replica mode but DB credentials not set — skipping");
    return null;
  }

  console.log("  [Magento] Connecting to read replica...");

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 2,
    connectTimeout: 10000,
    waitForConnections: true,
    enableKeepAlive: false
  });

  const queryTimeout = parseInt(process.env.MAGENTO_QUERY_TIMEOUT || "30000", 10);

  try {
    const [revenueRows] = await pool.query({
      sql: `SELECT
              DATE(created_at) as order_date,
              COUNT(*) as orders,
              SUM(grand_total) as revenue,
              AVG(grand_total) as aov
            FROM sales_order
            WHERE status NOT IN ('canceled', 'fraud')
              AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            GROUP BY DATE(created_at)
            ORDER BY order_date DESC`,
      timeout: queryTimeout
    });

    const [productRows] = await pool.query({
      sql: `SELECT
              soi.name as product_name,
              soi.sku,
              COUNT(DISTINCT soi.order_id) as orders,
              SUM(soi.qty_ordered) as units,
              SUM(soi.row_total) as revenue,
              AVG(soi.price) as avg_price
            FROM sales_order_item soi
            JOIN sales_order so ON soi.order_id = so.entity_id
            WHERE so.status NOT IN ('canceled', 'fraud')
              AND so.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            GROUP BY soi.sku, soi.name
            ORDER BY revenue DESC
            LIMIT 100`,
      timeout: queryTimeout
    });

    const [categoryRows] = await pool.query({
      sql: `SELECT
              ccv.value as category_name,
              COUNT(DISTINCT soi.order_id) as orders,
              SUM(soi.row_total) as revenue
            FROM sales_order_item soi
            JOIN sales_order so ON soi.order_id = so.entity_id
            JOIN catalog_category_product ccp ON soi.product_id = ccp.product_id
            JOIN catalog_category_entity_varchar ccv ON ccp.category_id = ccv.entity_id AND ccv.attribute_id = (
              SELECT attribute_id FROM eav_attribute WHERE attribute_code = 'name' AND entity_type_id = 3 LIMIT 1
            )
            WHERE so.status NOT IN ('canceled', 'fraud')
              AND so.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            GROUP BY ccv.value
            ORDER BY revenue DESC`,
      timeout: queryTimeout
    });

    await pool.end();
    console.log("  [Magento] Replica query complete");

    return buildMagentoResult("magento_replica", revenueRows, productRows, categoryRows);
  } catch (err) {
    console.log(`  [Magento] Replica query failed: ${err.message}`);
    await pool.end().catch(() => {});
    return null;
  }
}

async function fetchFromExport() {
  const exportPath = process.env.MAGENTO_EXPORT_PATH;

  if (!exportPath) {
    console.log("  [Magento] Skipped — MAGENTO_EXPORT_PATH not set (export mode)");
    return null;
  }

  console.log(`  [Magento] Reading export from ${exportPath}...`);

  try {
    const raw = await readFile(exportPath, "utf-8");
    const data = JSON.parse(raw);

    return {
      source: "magento_export",
      fetchedAt: data.exportedAt || new Date().toISOString(),
      revenue: data.revenue || null,
      productConversion: data.productConversion || data.products || [],
      categoryRevenue: data.categoryRevenue || data.categories || [],
      siteConversion: data.siteConversion || null,
      aov: data.aov || null
    };
  } catch (err) {
    console.log(`  [Magento] Export read failed: ${err.message}`);
    return null;
  }
}

function buildMagentoResult(source, revenueRows, productRows, categoryRows) {
  const totalRevenue = revenueRows.reduce((s, r) => s + (parseFloat(r.revenue) || 0), 0);
  const totalOrders = revenueRows.reduce((s, r) => s + (parseInt(r.orders) || 0), 0);
  const aov = totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0;

  return {
    source,
    fetchedAt: new Date().toISOString(),
    revenue: {
      last90Days: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      aov,
      dailyTrend: revenueRows.slice(0, 30).map((r) => ({
        date: r.order_date,
        orders: parseInt(r.orders),
        revenue: Math.round(parseFloat(r.revenue) * 100) / 100,
        aov: Math.round(parseFloat(r.aov) * 100) / 100
      }))
    },
    productConversion: productRows.map((r) => ({
      name: r.product_name,
      sku: r.sku,
      orders: parseInt(r.orders),
      units: parseInt(r.units),
      revenue: Math.round(parseFloat(r.revenue) * 100) / 100,
      avgPrice: Math.round(parseFloat(r.avg_price) * 100) / 100
    })),
    categoryRevenue: categoryRows.map((r) => ({
      category: r.category_name,
      orders: parseInt(r.orders),
      revenue: Math.round(parseFloat(r.revenue) * 100) / 100
    })),
    siteConversion: null,
    aov
  };
}
