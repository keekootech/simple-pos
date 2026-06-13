export const loader = async () => {
  return {};
};
export default function Privacy() {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#1a1a1a", lineHeight: "1.7" }}>
      
      <div style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <div style={{ width: "32px", height: "32px", background: "#1a1a1a", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: "16px", fontWeight: "800" }}>S</span>
          </div>
          <span style={{ fontSize: "18px", fontWeight: "800" }}>Simple POS</span>
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: "32px", fontWeight: "800" }}>Privacy Policy</h1>
        <p style={{ margin: 0, color: "#637381", fontSize: "14px" }}>Last updated: June 2026 · Kee Koo Tech</p>
      </div>

      {[
        {
          title: "1. Introduction",
          content: "Simple POS is a Shopify embedded application developed by Kee Koo Tech. This Privacy Policy explains how we collect, use, and protect information when you use our app. By installing Simple POS, you agree to the terms of this policy."
        },
        {
          title: "2. Information We Collect",
          content: "Simple POS accesses the following data from your Shopify store to provide its core functionality:",
          list: [
            "Products — to display your product catalog in the POS billing screen",
            "Orders — to create and manage sales made through the POS",
            "Customers — to search existing customers and create new customer profiles",
            "Inventory — to display stock levels at your store locations",
            "Shop information — store name, currency, country, and billing address",
            "Staff data — names, roles, and encrypted PINs (stored in Shopify Metafields)",
            "App settings — payment methods, customer fields, and preferences (stored in Shopify Metafields)"
          ]
        },
        {
          title: "3. How We Use Your Data",
          content: "We use the data accessed from your Shopify store solely to:",
          list: [
            "Display products and inventory in the POS interface",
            "Create orders and record payments on your behalf",
            "Search and create customer profiles",
            "Show sales reports and staff performance data",
            "Save your app preferences and staff configurations"
          ]
        },
        {
          title: "4. Data Storage",
          content: "Simple POS does not operate its own database for merchant or customer data. All data is stored directly in your Shopify store via Shopify's APIs and Metafields. Staff PINs are stored as Metafields on your Shopify App Installation and are never transmitted to any third-party server. Session data is stored temporarily in the merchant's browser session only."
        },
        {
          title: "5. Data Sharing",
          content: "We do not sell, trade, or share your data or your customers' data with any third parties. Data accessed through the Shopify API is used exclusively to power the features of Simple POS and is never used for advertising, analytics platforms, or any purpose beyond providing the app's functionality."
        },
        {
          title: "6. Customer Data",
          content: "Simple POS accesses customer names, phone numbers, email addresses, and addresses solely to enable customer lookup and profile creation at the point of sale. This data is read from and written to your Shopify store. We do not store or process customer data on any external server."
        },
        {
          title: "7. Security",
          content: "We take data security seriously. All communication between Simple POS and Shopify's APIs is encrypted via HTTPS. Staff PINs are stored in Shopify Metafields and are never logged or transmitted in plain text. We follow Shopify's security best practices for embedded app development."
        },
        {
          title: "8. Data Retention",
          content: "Simple POS does not independently retain any data. All data lives within your Shopify store and is subject to Shopify's own data retention policies. When you uninstall Simple POS, our app loses access to your store data immediately. Any Metafields created by the app (settings, staff list) may remain in your Shopify store and can be deleted manually if needed."
        },
        {
          title: "9. Your Rights",
          content: "As a merchant, you have the right to:",
          list: [
            "Access all data stored by Simple POS (via your Shopify admin)",
            "Delete staff and settings data by removing app Metafields",
            "Uninstall the app at any time to revoke all data access",
            "Request data deletion by contacting us at the email below"
          ]
        },
        {
          title: "10. Shopify's Role",
          content: "Simple POS is built on Shopify's platform. Shopify acts as a data processor for the data stored in your store. Please refer to Shopify's Privacy Policy at shopify.com/legal/privacy for information on how Shopify handles your data."
        },
        {
          title: "11. Changes to This Policy",
          content: "We may update this Privacy Policy from time to time. We will notify merchants of significant changes via the app or email. Continued use of Simple POS after changes constitutes acceptance of the updated policy."
        },
        {
          title: "12. Contact Us",
          content: "If you have any questions about this Privacy Policy or how we handle your data, please contact us:",
          contact: true
        },
      ].map((section) => (
        <div key={section.title} style={{ marginBottom: "32px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: "700" }}>{section.title}</h2>
          <p style={{ margin: "0 0 8px", color: "#333", fontSize: "15px" }}>{section.content}</p>
          {section.list && (
            <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
              {section.list.map((item) => (
                <li key={item} style={{ color: "#333", fontSize: "15px", marginBottom: "6px" }}>{item}</li>
              ))}
            </ul>
          )}
          {section.contact && (
            <div style={{ marginTop: "12px", padding: "16px 20px", background: "#f9f9f9", borderRadius: "10px" }}>
              <p style={{ margin: "0 0 4px", fontWeight: "600" }}>Kee Koo Tech</p>
              <p style={{ margin: "0 0 4px", color: "#637381" }}>Email: hello@keekootech.in</p>
              <p style={{ margin: 0, color: "#637381" }}>Website: https://keekootech.in/</p>
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "24px", marginTop: "40px" }}>
        <p style={{ margin: 0, color: "#aaa", fontSize: "13px" }}>© 2026 Kee Koo Tech. All rights reserved. Simple POS is a product of Kee Koo Tech.</p>
      </div>

    </div>
  );
}