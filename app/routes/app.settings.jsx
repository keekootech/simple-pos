import { useLoaderData, useFetcher } from "react-router";
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
        metafields(first: 10, namespace: "simple_pos") {
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
    },
  };

  return { shop, settings };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  // Get app installation ID first
  const appRes = await admin.graphql(`
    query {
      appInstallation {
        id
      }
    }
  `);
  const appData = await appRes.json();
  const appInstallationId = appData.data.appInstallation.id;

  const keys = [
    "customer_phone", "customer_email", "customer_address",
    "customer_birthday", "customer_anniversary",
    "payment_cash", "payment_card", "payment_upi",
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
  const fetcher = useFetcher();

  const [customerFields, setCustomerFields] = useState(settings.customerFields);
  const [paymentMethods, setPaymentMethods] = useState(settings.paymentMethods);

  const isSaving = fetcher.state === "submitting";
  const saved = fetcher.data?.success;

  const saveSettings = () => {
    const formData = new FormData();
    formData.append("customer_phone", String(customerFields.phone));
    formData.append("customer_email", String(customerFields.email));
    formData.append("customer_address", String(customerFields.address));
    formData.append("customer_birthday", String(customerFields.birthday));
    formData.append("customer_anniversary", String(customerFields.anniversary));
    formData.append("payment_cash", String(paymentMethods.cash));
    formData.append("payment_card", String(paymentMethods.card));
    formData.append("payment_upi", String(paymentMethods.upi));
    fetcher.submit(formData, { method: "POST" });
  };

  const Toggle = ({ checked, onChange, disabled }) => (
    <div onClick={() => !disabled && onChange(!checked)}
      style={{ width: "44px", height: "24px", borderRadius: "24px", background: checked ? "#008060" : "#ddd", position: "relative", cursor: disabled ? "not-allowed" : "pointer", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", width: "18px", height: "18px", background: "white", borderRadius: "50%", top: "3px", left: checked ? "23px" : "3px", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "32px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: "24px", fontWeight: "700" }}>⚙️ Settings</h1>
          <p style={{ margin: 0, color: "#637381", fontSize: "14px" }}>Customize Simple POS for your store</p>
        </div>
        <button onClick={saveSettings} disabled={isSaving}
          style={{ padding: "12px 24px", background: isSaving ? "#ccc" : "#1a1a1a", color: "white", border: "none", borderRadius: "10px", fontWeight: "700", cursor: isSaving ? "not-allowed" : "pointer", fontSize: "14px" }}>
          {isSaving ? "Saving..." : saved ? "✅ Saved!" : "Save Settings"}
        </button>
      </div>

      {/* Store Info */}
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

      {/* Customer Fields */}
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

      {/* Payment Methods */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>💳 Payment Methods</h2>
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#637381" }}>Choose which payment methods appear at checkout</p>
        {[
          { label: "💵 Cash", description: "Physical cash payment", key: "cash" },
          { label: "💳 Card", description: "Credit / Debit card via external machine", key: "card" },
          { label: "📱 UPI", description: "GPay, PhonePe, Paytm etc.", key: "upi" },
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

      {/* Plan */}
      <div style={{ ...cardStyle, background: "#1a1a1a", color: "white" }}>
        <h2 style={{ ...sectionTitle, color: "white" }}>⚡ Current Plan</h2>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: "800" }}>Free</p>
            <p style={{ margin: 0, fontSize: "13px", color: "#aaa" }}>Up to 30 products · 1 staff login</p>
          </div>
          <button style={{ padding: "12px 20px", background: "white", color: "#1a1a1a", border: "none", borderRadius: "10px", fontWeight: "700", cursor: "pointer", fontSize: "14px" }}>
            Upgrade →
          </button>
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