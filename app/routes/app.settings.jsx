import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`
    query {
      shop {
        name
        email
        currencyCode
        billingAddress { countryCode }
      }
      appInstallation {
        metafields(first: 20, namespace: "simple_pos") {
          edges {
            node { key value }
          }
        }
      }
    }
  `);

  const data = await res.json();
  const shop = data.data.shop;
  const metafields = data.data.appInstallation.metafields.edges.reduce((acc, e) => {
    acc[e.node.key] = e.node.value;
    return acc;
  }, {});

  const settings = {
    customerFields: {
      phone: metafields.customer_phone !== "false",
      email: metafields.customer_email !== "false",
      address: metafields.customer_address === "true",
      birthday: metafields.customer_birthday === "true",
      anniversary: metafields.customer_anniversary === "true",
    },
    paymentMethods: {
      cash: metafields.payment_cash !== "false",
      card: metafields.payment_card !== "false",
      upi: metafields.payment_upi !== "false",
      cashCalculator: metafields.cash_calculator !== "false",
    },
    staff: metafields.staff_list ? JSON.parse(metafields.staff_list) : [],
  };

  return { shop, settings };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const appRes = await admin.graphql(`query { appInstallation { id } }`);
  const appData = await appRes.json();
  const appInstallationId = appData.data.appInstallation.id;

  const keys = [
    "customer_phone", "customer_email", "customer_address",
    "customer_birthday", "customer_anniversary",
    "payment_cash", "payment_card", "payment_upi",
    "cash_calculator", "staff_list",
  ];

  const metafields = keys.map((key) => ({
    namespace: "simple_pos",
    key,
    value: formData.get(key) || "false",
    type: "single_line_text_field",
    ownerId: appInstallationId,
  }));

  await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key value }
        userErrors { field message }
      }
    }`,
    { variables: { metafields } }
  );

  return { success: true };
};

export default function Settings() {
  const { shop, settings } = useLoaderData();
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role");
  const fetcher = useFetcher();
  const billingFetcher = useFetcher();

  const [customerFields, setCustomerFields] = useState(settings.customerFields);
  const [paymentMethods, setPaymentMethods] = useState(settings.paymentMethods);
  const [staff, setStaff] = useState(settings.staff);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("staff");
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [pinError, setPinError] = useState("");

  const isSaving = fetcher.state === "submitting";
  const saved = fetcher.data?.success;

  const saveSettings = (updatedStaff) => {
    const formData = new FormData();
    formData.append("customer_phone", String(customerFields.phone));
    formData.append("customer_email", String(customerFields.email));
    formData.append("customer_address", String(customerFields.address));
    formData.append("customer_birthday", String(customerFields.birthday));
    formData.append("customer_anniversary", String(customerFields.anniversary));
    formData.append("payment_cash", String(paymentMethods.cash));
    formData.append("payment_card", String(paymentMethods.card));
    formData.append("payment_upi", String(paymentMethods.upi));
    formData.append("cash_calculator", String(paymentMethods.cashCalculator));
    formData.append("staff_list", JSON.stringify(updatedStaff || staff));
    fetcher.submit(formData, { method: "POST" });
  };

  const addStaff = () => {
    if (!newStaffName) return;
    if (newStaffPin.length !== 4 || !/^\d+$/.test(newStaffPin)) {
      setPinError("PIN must be exactly 4 digits");
      return;
    }
    setPinError("");
    const newMember = {
      id: Date.now().toString(),
      name: newStaffName,
      pin: newStaffPin,
      role: newStaffRole,
    };
    const updated = [...staff, newMember];
    setStaff(updated);
    setNewStaffName("");
    setNewStaffPin("");
    setNewStaffRole("staff");
    setShowAddStaff(false);
    saveSettings(updated);
  };

  const removeStaff = (id) => {
    const updated = staff.filter((s) => s.id !== id);
    setStaff(updated);
    saveSettings(updated);
  };

  const Toggle = ({ checked, onChange, disabled }) => (
    <div onClick={() => !disabled && onChange(!checked)}
      style={{ width: "44px", height: "24px", borderRadius: "24px", background: checked ? "#008060" : "#ddd", position: "relative", cursor: disabled ? "not-allowed" : "pointer", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", width: "18px", height: "18px", background: "white", borderRadius: "50%", top: "3px", left: checked ? "23px" : "3px", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );

  // Admin check AFTER all hooks
  if (role !== "admin") {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "48px" }}>🔒</p>
          <h2 style={{ margin: "0 0 8px" }}>Admin Only</h2>
          <p style={{ color: "#637381" }}>You need admin access to view settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "32px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: "24px", fontWeight: "700" }}>⚙️ Settings</h1>
          <p style={{ margin: 0, color: "#637381", fontSize: "14px" }}>Customize Simple POS for your store</p>
        </div>
        <button onClick={() => saveSettings()} disabled={isSaving}
          style={{ padding: "12px 24px", background: isSaving ? "#ccc" : "#1a1a1a", color: "white", border: "none", borderRadius: "10px", fontWeight: "700", cursor: isSaving ? "not-allowed" : "pointer", fontSize: "14px" }}>
          {isSaving ? "Saving..." : saved ? "✅ Saved!" : "Save Settings"}
        </button>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>🏪 Store</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {[
            { label: "Store Name", value: shop.name },
            { label: "Email", value: shop.email },
            { label: "Currency", value: shop.currencyCode },
            { label: "Country", value: shop.billingAddress?.countryCode || "—" },
          ].map((item) => (
            <div key={item.label} style={{ padding: "12px", background: "#f9f9f9", borderRadius: "8px" }}>
              <p style={{ margin: "0 0 2px", fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.6px" }}>{item.label}</p>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>👥 Staff</h2>
          <button onClick={() => setShowAddStaff(!showAddStaff)}
            style={{ padding: "8px 16px", background: "#1a1a1a", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}>
            + Add Staff
          </button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#637381" }}>Staff members can log in to POS with their name and 4-digit PIN</p>

        {showAddStaff && (
          <div style={{ background: "#f9f9f9", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
            <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>New Staff Member</h4>
            <input type="text" placeholder="Full Name *" value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="4-digit PIN *" value={newStaffPin}
              onChange={(e) => setNewStaffPin(e.target.value.slice(0, 4))}
              maxLength={4} style={inputStyle} />
            {pinError && <p style={{ color: "red", fontSize: "12px", margin: "-8px 0 10px" }}>{pinError}</p>}
            <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value)}
              style={{ ...inputStyle, background: "white" }}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button onClick={() => setShowAddStaff(false)}
                style={{ flex: 1, padding: "10px", background: "white", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>Cancel</button>
              <button onClick={addStaff} disabled={!newStaffName || newStaffPin.length !== 4}
                style={{ flex: 1, padding: "10px", background: !newStaffName || newStaffPin.length !== 4 ? "#ccc" : "#008060", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                Add Staff
              </button>
            </div>
          </div>
        )}

        {staff.length === 0 ? (
          <p style={{ color: "#bbb", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>No staff added yet</p>
        ) : (
          staff.map((member) => (
            <div key={member.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "700", fontSize: "16px" }}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: "0 0 2px", fontWeight: "600", fontSize: "14px" }}>{member.name}</p>
                  <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>
                    {member.role.charAt(0).toUpperCase() + member.role.slice(1)} · PIN: ••••
                  </p>
                </div>
              </div>
              <button onClick={() => removeStaff(member.id)}
                style={{ padding: "6px 12px", background: "#fff0f0", color: "#e53e3e", border: "1px solid #fcc", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>👤 Customer Fields</h2>
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#637381" }}>Choose what to collect when adding a new customer at POS</p>
        {[
          { label: "Name", description: "First and last name", key: null, required: true },
          { label: "Phone", description: "Mobile number", key: "phone" },
          { label: "Email", description: "Email address", key: "email" },
          { label: "Address", description: "Shipping / billing address", key: "address" },
          { label: "Birthday", description: "For birthday offers and loyalty", key: "birthday" },
          { label: "Anniversary", description: "For special occasion marketing", key: "anniversary" },
        ].map((field) => (
          <div key={field.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #f5f5f5" }}>
            <div>
              <p style={{ margin: "0 0 2px", fontWeight: "600", fontSize: "14px" }}>
                {field.label} {field.required && <span style={{ fontSize: "11px", color: "#008060", background: "#e6f4ea", padding: "1px 6px", borderRadius: "4px", marginLeft: "6px" }}>Required</span>}
              </p>
              <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>{field.description}</p>
            </div>
            <Toggle
              checked={field.required ? true : customerFields[field.key]}
              onChange={(val) => setCustomerFields((prev) => ({ ...prev, [field.key]: val }))}
              disabled={field.required}
            />
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>💳 Payment Methods</h2>
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#637381" }}>Choose which payment methods appear at checkout</p>
        {[
          { label: "💵 Cash", description: "Physical cash payment", key: "cash" },
          { label: "💳 Card", description: "Credit / Debit card via external machine", key: "card" },
          { label: "📱 UPI", description: "GPay, PhonePe, Paytm etc.", key: "upi" },
          { label: "🧮 Cash Change Calculator", description: "Show change amount when customer pays cash", key: "cashCalculator" },
        ].map((method) => (
          <div key={method.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #f5f5f5" }}>
            <div>
              <p style={{ margin: "0 0 2px", fontWeight: "600", fontSize: "14px" }}>{method.label}</p>
              <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>{method.description}</p>
            </div>
            <Toggle
              checked={paymentMethods[method.key]}
              onChange={(val) => setPaymentMethods((prev) => ({ ...prev, [method.key]: val }))}
            />
          </div>
        ))}
      </div>

     <div style={{ ...cardStyle, background: "#1a1a1a", color: "white" }}>
        <h2 style={{ ...sectionTitle, color: "white" }}>⚡ Current Plan — Free</h2>
        <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#aaa" }}>Upgrade to unlock more staff and products</p>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: "12px", padding: "16px" }}>
            <p style={{ margin: "0 0 4px", fontWeight: "700", fontSize: "16px" }}>Starter</p>
            <p style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: "800" }}>₹999<span style={{ fontSize: "13px", fontWeight: "400", color: "#aaa" }}>/mo</span></p>
            <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#aaa" }}>3 staff · 200 products</p>
            <button onClick={() => billingFetcher.submit({ plan: "Starter" }, { method: "POST", action: "/app/billing" })}
  style={{ display: "block", width: "100%", padding: "10px", background: "white", color: "#1a1a1a", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", textAlign: "center", cursor: "pointer" }}>
  {billingFetcher.state === "submitting" ? "Loading..." : "Upgrade →"}
</button>
          </div>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.15)", borderRadius: "12px", padding: "16px", border: "1px solid rgba(255,255,255,0.3)" }}>
            <p style={{ margin: "0 0 4px", fontWeight: "700", fontSize: "16px" }}>Pro ⭐</p>
            <p style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: "800" }}>₹2,499<span style={{ fontSize: "13px", fontWeight: "400", color: "#aaa" }}>/mo</span></p>
            <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#aaa" }}>Unlimited everything</p>
            <button onClick={() => billingFetcher.submit({ plan: "Pro" }, { method: "POST", action: "/app/billing" })}
  style={{ display: "block", width: "100%", padding: "10px", background: "white", color: "#1a1a1a", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "13px", textAlign: "center", cursor: "pointer" }}>
  {billingFetcher.state === "submitting" ? "Loading..." : "Upgrade →"}
</button>
          </div>
        </div>
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

const inputStyle = {
  width: "100%", padding: "10px 12px", border: "1px solid #e0e0e0",
  borderRadius: "8px", fontSize: "14px", marginBottom: "10px",
  boxSizing: "border-box",
};