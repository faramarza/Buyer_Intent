-- Magento Daily Rollup Export
-- Run this on the Magento host during off-peak hours (e.g., 03:00 via cron)
-- Writes results to a JSON file the growth agent reads

-- Revenue rollup (last 90 days)
SELECT
  DATE(created_at) as order_date,
  COUNT(*) as orders,
  SUM(grand_total) as revenue,
  AVG(grand_total) as aov
FROM sales_order
WHERE status NOT IN ('canceled', 'fraud')
  AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
GROUP BY DATE(created_at)
ORDER BY order_date DESC;

-- Product conversion rollup
SELECT
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
LIMIT 100;

-- Category revenue rollup
SELECT
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
ORDER BY revenue DESC;
