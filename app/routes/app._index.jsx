import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  const productRes = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            images(first: 1) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }
  `);

  const productData = await productRes.json();
  const products = productData.data.products.edges.map((edge) => ({
    id: edge.node.id,
    title: edge.node.title,
    image: edge.node.images.edges[0]?.node.url || null,
    variantId: edge.node.variants.edges[0]?.node.id,
    price: edge.node.variants.edges[0]?.node.price || "0.00",
    inventory: edge.node.variants.edges[0]?.node.inventoryQuantity || 0,
  }));

const customerRes = await admin.graphql(`
    query {
      customers(first: 50) {
        edges {
          node {
            id
            firstName
            lastName
            phone
            email
          }
        }
      }
    }
  `);

  const customerData = await customerRes.json();
  const customers = customerData.data.customers.edges.map((edge) => ({
    id: edge.node.id,
    name: `${edge.node.firstName || ""} ${edge.node.lastName || ""}`.trim(),
    phone: edge.node.phone || "",
    email: edge.node.email || "",
  }));

  return { products, customers };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "createCustomer") {
    const firstName = formData.get("firstName");
    const lastName = formData.get("lastName");
    const phone = formData.get("phone");
    const email = formData.get("email");

    const res = await admin.graphql(
      `#graphql
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            firstName
            lastName
            phone
            email
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            firstName,
            lastName,
            phone: phone || null,
            email: email || null,
          },
        },
      }
    );

    const data = await res.json();
    const customer = data.data.customerCreate.customer;
    const errors = data.data.customerCreate.userErrors;

    if (errors.length > 0) {
      return { intent: "createCustomer", success: false, error: errors[0].message };
    }

    return {
      intent: "createCustomer",
      success: true,
      customer: {
        id: customer.id,
        name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
        phone: customer.phone || "",
        email: customer.email || "",
      },
    };
  }

  if (intent === "placeOrder") {
    const cartItems = JSON.parse(formData.get("cartItems"));
    const paymentMethod = formData.get("paymentMethod");
    const customerId = formData.get("customerId");
    const customerName = formData.get("customerName");

    const lineItems = cartItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.qty,
    }));

    const orderInput = {
      lineItems: lineItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      note: `Payment: ${paymentMethod}${customerName ? ` | Customer: ${customerName}` : ""}`,
      financialStatus: "PENDING",
      tags: [paymentMethod],
    };

    if (customerId) {
      orderInput.customerId = customerId;
    }

    const response = await admin.graphql(
      `#graphql
      mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          userErrors {
            field
            message
          }
          order {
            id
            totalPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }`,
      {
        variables: {
          order: orderInput,
          options: {
            inventoryBehaviour: "DECREMENT_IGNORING_POLICY",
            sendReceipt: true,
          },
        },
      }
    );

    const data = await response.json();
    const order = data.data.orderCreate.order;
    const errors = data.data.orderCreate.userErrors;

    if (errors.length > 0) {
      return { intent: "placeOrder", success: false, error: errors[0].message };
    }

    return {
      intent: "placeOrder",
      success: true,
      total: order.totalPriceSet.shopMoney.amount,
      paymentMethod,
      customerName,
    };
  }
};

export default function Index() {
  const { products, customers, search } = useLoaderData();
  const fetcher = useFetcher();
  const searchFetcher = useFetcher();

  const [cart, setCart] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState("customer"); // "customer" | "payment"
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // New customer form
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const isPlacing = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "placeOrder";
  const isCreating = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "createCustomer";
  const orderResult = fetcher.data?.intent === "placeOrder" ? fetcher.data : null;
  const createResult = fetcher.data?.intent === "createCustomer" ? fetcher.data : null;

  // Auto-select newly created customer
  if (createResult?.success && !selectedCustomer) {
    setSelectedCustomer(createResult.customer);
    setShowNewCustomer(false);
    setStep("payment");
  }

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((item) => item.id !== id));

  const updateQty = (id, qty) => {
    if (qty < 1) return removeFromCart(id);
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, qty } : item)));
  };

const handleSearch = (val) => {
    setSearchQuery(val);
    if (val.length > 1) {
      searchFetcher.load(`/app?search=${encodeURIComponent(val)}`);
    }
  };

  const placeOrder = (paymentMethod) => {
    const formData = new FormData();
    formData.append("intent", "placeOrder");
    formData.append("cartItems", JSON.stringify(cart));
    formData.append("paymentMethod", paymentMethod);
    formData.append("customerId", selectedCustomer?.id || "");
    formData.append("customerName", selectedCustomer?.name || "");
    fetcher.submit(formData, { method: "POST" });
    setShowModal(false);
  };

  const createCustomer = () => {
    const formData = new FormData();
    formData.append("intent", "createCustomer");
    formData.append("firstName", newFirst);
    formData.append("lastName", newLast);
    formData.append("phone", newPhone);
    formData.append("email", newEmail);
    fetcher.submit(formData, { method: "POST" });
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(null);
    setSearchQuery("");
    setNewFirst(""); setNewLast(""); setNewPhone(""); setNewEmail("");
  };

  const openModal = () => {
    setStep("customer");
    setShowNewCustomer(false);
    setShowModal(true);
  };

  const searchResults = searchFetcher.data?.customers || [];

  const total = cart
    .reduce((sum, item) => sum + parseFloat(item.price) * item.qty, 0)
    .toFixed(2);

  const paymentMethods = [
    { label: "💵 Cash", value: "Cash", color: "#2e7d32" },
    { label: "💳 Card", value: "Card", color: "#1565c0" },
    { label: "📱 UPI", value: "UPI", color: "#6a1b9a" },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif", position: "relative" }}>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "28px", width: "360px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>

            {/* Step 1: Customer */}
            {step === "customer" && (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>Who is this order for?</h3>
                <p style={{ margin: "0 0 16px", color: "#637381", fontSize: "13px" }}>Search existing or add new</p>

                {!showNewCustomer ? (
                  <>
                  <input
  type="text"
  placeholder="Filter customers..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box" }}
/>

<div style={{ maxHeight: "200px", overflowY: "auto", marginBottom: "12px" }}>
  {customers
    .filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
    )
    .map((c) => (
      <div
        key={c.id}
        onClick={() => { setSelectedCustomer(c); setStep("payment"); }}
        style={{ padding: "10px 12px", border: "1px solid #e0e0e0", borderRadius: "8px", marginBottom: "8px", cursor: "pointer", background: selectedCustomer?.id === c.id ? "#f0faf5" : "white" }}
      >
        <p style={{ margin: "0 0 2px", fontWeight: "600", fontSize: "14px" }}>👤 {c.name || "No name"}</p>
        <p style={{ margin: 0, fontSize: "12px", color: "#637381" }}>{c.phone || c.email || "No contact info"}</p>
      </div>
    ))}
</div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setShowNewCustomer(true)}
                        style={{ flex: 1, padding: "10px", background: "#f4f4f4", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
                      >
                        + New Customer
                      </button>
                      <button
                        onClick={() => setStep("payment")}
                        style={{ flex: 1, padding: "10px", background: "#637381", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
                      >
                        Skip →
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 style={{ margin: "0 0 12px" }}>New Customer</h4>
                    {[
                      { label: "First Name *", val: newFirst, set: setNewFirst },
                      { label: "Last Name", val: newLast, set: setNewLast },
                      { label: "Phone", val: newPhone, set: setNewPhone },
                      { label: "Email", val: newEmail, set: setNewEmail },
                    ].map((field) => (
                      <input
                        key={field.label}
                        type="text"
                        placeholder={field.label}
                        value={field.val}
                        onChange={(e) => field.set(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", marginBottom: "10px", boxSizing: "border-box" }}
                      />
                    ))}
                    {createResult?.success === false && (
                      <p style={{ color: "red", fontSize: "13px" }}>❌ {createResult.error}</p>
                    )}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setShowNewCustomer(false)} style={{ flex: 1, padding: "10px", background: "#f4f4f4", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>← Back</button>
                      <button
                        onClick={createCustomer}
                        disabled={!newFirst || isCreating}
                        style={{ flex: 1, padding: "10px", background: !newFirst ? "#ccc" : "#008060", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}
                      >
                        {isCreating ? "Saving..." : "Save Customer"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Step 2: Payment */}
            {step === "payment" && (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>How is the customer paying?</h3>
                <p style={{ margin: "0 0 4px", color: "#637381", fontSize: "13px" }}>Total: ₹{total}</p>
                {selectedCustomer && (
                  <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#008060", fontWeight: "600" }}>👤 {selectedCustomer.name}</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {paymentMethods.map((pm) => (
                    <button
                      key={pm.value}
                      onClick={() => placeOrder(pm.value)}
                      style={{ padding: "14px", background: pm.color, color: "white", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: "600", cursor: "pointer" }}
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep("customer")} style={{ marginTop: "12px", width: "100%", padding: "10px", background: "transparent", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer", color: "#637381" }}>
                  ← Change Customer
                </button>
              </>
            )}

            <button onClick={() => setShowModal(false)} style={{ marginTop: "10px", width: "100%", padding: "10px", background: "transparent", border: "none", cursor: "pointer", color: "#999", fontSize: "13px" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Product Grid */}
      <div style={{ flex: 1, padding: "20px", overflowY: "auto", background: "#f6f6f7" }}>
  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
  <h2 style={{ margin: 0 }}>🛍️ Products</h2>
  <input
    type="text"
    placeholder="Search products..."
    value={productSearch}
    onChange={(e) => setProductSearch(e.target.value)}
    style={{ flex: 1, padding: "8px 14px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px" }}
  />
  
</div>
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
  {products.filter((p) => p.title.toLowerCase().includes(productSearch.toLowerCase())).map((product) => (
            <div
              key={product.id}
              onClick={() => addToCart(product)}
              style={{ background: "white", borderRadius: "12px", padding: "12px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", transition: "transform 0.1s" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {product.image ? (
                <img src={product.image} alt={product.title} style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "8px" }} />
              ) : (
                <div style={{ width: "100%", height: "140px", background: "#e0e0e0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>No image</div>
              )}
              <p style={{ margin: "8px 0 4px", fontWeight: "600", fontSize: "14px" }}>{product.title}</p>
<p style={{ margin: 0, color: "#637381", fontSize: "13px" }}>₹{product.price}</p>
<p style={{ margin: "4px 0 0", fontSize: "12px", fontWeight: "600", color: product.inventory <= 5 ? "#e53e3e" : "#008060" }}>
  {product.inventory <= 0 ? "❌ Out of stock" : `${product.inventory} in stock`}
</p>            </div>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div style={{ width: "320px", background: "white", borderLeft: "1px solid #e0e0e0", padding: "20px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ marginBottom: "16px" }}>🧾 Cart</h2>

        {orderResult?.success && (
          <div style={{ background: "#e6f4ea", border: "1px solid #34a853", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
            <p style={{ margin: "0 0 4px", fontWeight: "600", color: "#1e7e34" }}>✅ Order Created!</p>
            {orderResult.customerName && <p style={{ margin: "0 0 2px", fontSize: "13px", color: "#1e7e34" }}>Customer: {orderResult.customerName}</p>}
            <p style={{ margin: "0 0 2px", fontSize: "13px", color: "#1e7e34" }}>Total: ₹{orderResult.total}</p>
            <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#1e7e34" }}>Paid via: {orderResult.paymentMethod}</p>
            <button onClick={clearCart} style={{ background: "#008060", color: "white", border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px" }}>
              New Order
            </button>
          </div>
        )}

        {orderResult?.success === false && (
          <div style={{ background: "#fff0f0", border: "1px solid #e53e3e", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>
            <p style={{ margin: 0, color: "#c53030", fontSize: "13px" }}>❌ {orderResult.error}</p>
          </div>
        )}

        {cart.length === 0 && !orderResult?.success ? (
          <p style={{ color: "#999" }}>Tap a product to add it here</p>
        ) : (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {cart.map((item) => (
              <div key={item.id} style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #f0f0f0" }}>
                <p style={{ margin: "0 0 6px", fontWeight: "600", fontSize: "14px" }}>{item.title}</p>
                <p style={{ margin: "0 0 8px", color: "#637381", fontSize: "13px" }}>₹{item.price} each</p>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button onClick={() => updateQty(item.id, item.qty - 1)} style={btnStyle}>−</button>
                  <span style={{ fontWeight: "600" }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, item.qty + 1)} style={btnStyle}>+</button>
                  <button onClick={() => removeFromCart(item.id)} style={{ ...btnStyle, marginLeft: "auto", color: "red", borderColor: "red" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "2px solid #e0e0e0", paddingTop: "16px", marginTop: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <span style={{ fontWeight: "600", fontSize: "16px" }}>Total</span>
            <span style={{ fontWeight: "700", fontSize: "18px" }}>₹{total}</span>
          </div>
          <button
            onClick={openModal}
            disabled={cart.length === 0 || isPlacing}
            style={{
              width: "100%", padding: "14px",
              background: cart.length === 0 || isPlacing ? "#ccc" : "#008060",
              color: "white", border: "none", borderRadius: "8px",
              fontSize: "16px", fontWeight: "600",
              cursor: cart.length === 0 || isPlacing ? "not-allowed" : "pointer",
            }}
          >
            {isPlacing ? "Creating Order..." : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  width: "28px", height: "28px",
  border: "1px solid #ddd", borderRadius: "6px",
  background: "white", cursor: "pointer",
  fontSize: "16px", display: "flex",
  alignItems: "center", justifyContent: "center",
};