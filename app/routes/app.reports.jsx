import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "today";

  let dateFilter = "";
  const now = new Date();

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    dateFilter = `created_at:>='${start.toISOString()}'`;
  } else if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    dateFilter = `created_at:>='${start.toISOString()}'`;
  } else if (period === "month") {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    dateFilter = `created_at:>='${start.toISOString()}'`;
  }

  const res = await admin.graphql(`
    query {
      orders(first: 250, query: "tag:POS ${dateFilter}") {
        edges {
          node {
            id
            name
            totalPriceSet { shopMoney { amount currencyCode } }
            tags
            createdAt
            lineItems(first: 10) {
              edges {
                node {
                  title
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await res.json();
  const orders = data.data.orders.edges.map((e) => e.node);

  // Staff performance
  const staffMap = {};
  orders.forEach((order) => {
    const staffTag = order.tags.find((t) => t.startsWith("Staff:"));
    const staffName = staffTag ? staffTag.replace("Staff:", "") : "Unknown";
    if (!staffMap[staffName]) staffMap[staffName] = { orders: 0, revenue: 0 };
    staffMap[staffName].orders += 1;
    staffMap[staffName].revenue += parseFloat(order.totalPriceSet.shopMoney.amount);
  });

  const staffPerformance = Object.entries(staffMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  // Payment breakdown
  const paymentMap = { Cash: 0, Card: 0, UPI: 0 };
  orders.forEach((order) => {
    if (order.tags.includes("Cash")) paymentMap.Cash += 1;
    else if (order.tags.includes("Card")) paymentMap.Card += 1;
    else if (order.tags.includes("UPI")) paymentMap.UPI += 1;
  });

  // Top products
  const productMap = {};
  orders.forEach((order) => {
    order.lineItems.edges.forEach((li) => {
      const title = li.node.title;
      if (!productMap[title]) productMap[title] = 0;
      productMap[title] += li.node.quantity;
    });
  });

  const topProducts = Object.entries(productMap)
    .map(([title, qty]) => ({ title, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount), 0);
  const currency = orders[0]?.totalPriceSet.shopMoney.currencyCode || "INR";

  return { staffPerformance, paymentMap, topProducts, totalOrders: orders.length, totalRevenue, currency, period };
};

export default function Reports() {
  const { staffPerformance, paymentMap, topProducts, totalOrders, totalRevenue, currency, period } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") || "";
  if (!role) {
    window.location.href = "/app/reports?role=admin&period=today";
  }

  if (role !== "admin") {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "48px" }}>🔒</p>
          <h2 style={{ margin: "0 0 8px" }}>Admin Only</h2>
          <p style={{ color: "#637381" }}>You need admin access to view reports.</p>
        </div>
      </div>
    );
  }

  const totalPayments = Object.values(paymentMap).reduce((a, b) => a + b, 0);

  const fmt = (amount) => `${currency === "INR" ? "₹" : "$"}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto", padding: "32px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: "24px", fontWeight: "700" }}>📊 Reports</h1>
          <p style={{ margin: 0, color: "#637381", fontSize: "14px" }}>POS sales performance</p>
        </div>

        {/* Period toggle */}
        <div style={{ display: "flex", background: "#f0f0f0", borderRadius: "10px", padding: "3px", gap: "2px" }}>
        {["today", "week", "month"].map((p) => (
            <button key={p}
              onClick={() => navigate(`/app/reports?role=admin&period=${p}`)}
              style={{ padding: "7px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", border: "none", cursor: "pointer", background: period === p ? "white" : "transparent", color: period === p ? "#1a1a1a" : "#888", boxShadow: period === p ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        <div style={cardStyle}>
          <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "0.6px" }}>Total Orders</p>
          <p style={{ margin: 0, fontSize: "32px", fontWeight: "800" }}>{totalOrders}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "0.6px" }}>Total Revenue</p>
          <p style={{ margin: 0, fontSize: "32px", fontWeight: "800" }}>{fmt(totalRevenue)}</p>
        </div>
      </div>

      {/* Staff Performance */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>👥 Staff Performance</h2>
        {staffPerformance.length === 0 ? (
          <p style={{ color: "#bbb", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>No orders found for this period</p>
        ) : (
          staffPerformance.map((s, i) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: i === 0 ? "#1a1a1a" : "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", color: i === 0 ? "white" : "#333", fontWeight: "700", fontSize: "14px" }}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: "0 0 2px", fontWeight: "600", fontSize: "14px" }}>{s.name}</p>
                  <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>{s.orders} order{s.orders !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: "0 0 2px", fontWeight: "700", fontSize: "15px" }}>{fmt(s.revenue)}</p>
                {i === 0 && <span style={{ fontSize: "11px", background: "#e6f4ea", color: "#008060", padding: "1px 6px", borderRadius: "4px" }}>🏆 Top</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Payment Breakdown */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>💳 Payment Breakdown</h2>
        {totalPayments === 0 ? (
          <p style={{ color: "#bbb", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>No payments found</p>
        ) : (
          [
            { label: "💵 Cash", key: "Cash", color: "#2e7d32" },
            { label: "💳 Card", key: "Card", color: "#1565c0" },
            { label: "📱 UPI", key: "UPI", color: "#6a1b9a" },
          ].map((pm) => {
            const pct = totalPayments > 0 ? Math.round((paymentMap[pm.key] / totalPayments) * 100) : 0;
            return (
              <div key={pm.key} style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>{pm.label}</span>
                  <span style={{ fontSize: "13px", color: "#637381" }}>{paymentMap[pm.key]} orders · {pct}%</span>
                </div>
                <div style={{ height: "8px", background: "#f0f0f0", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pm.color, borderRadius: "4px", transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Top Products */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>📦 Top Products</h2>
        {topProducts.length === 0 ? (
          <p style={{ color: "#bbb", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>No products found</p>
        ) : (
          topProducts.map((p, i) => (
            <div key={p.title} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", color: "#888", fontWeight: "600", minWidth: "20px" }}>#{i + 1}</span>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: "500" }}>{p.title}</p>
              </div>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "#1a1a1a" }}>{p.qty} sold</span>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

const cardStyle = {
  background: "white", borderRadius: "16px", padding: "20px 24px",
  marginBottom: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  border: "1px solid #f0f0f0",
};

const sectionTitle = {
  margin: "0 0 16px", fontSize: "16px", fontWeight: "700", color: "#1a1a1a",
};