import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const [productRes, collectionRes, customerRes] = await Promise.all([
    admin.graphql(`
      query {
        products(first: 100) {
          edges {
            node {
              id title productType
              images(first: 1) { edges { node { url altText } } }
              options { name values }
              variants(first: 50) {
                edges {
                  node {
                    id title price inventoryQuantity
                    selectedOptions { name value }
                  }
                }
              }
            }
          }
        }
      }
    `),
    admin.graphql(`
      query {
        collections(first: 50) {
          edges {
            node {
              id title
              products(first: 100) {
                edges {
                  node {
                    id title productType
                    images(first: 1) { edges { node { url altText } } }
                    options { name values }
                    variants(first: 50) {
                      edges {
                        node {
                          id title price inventoryQuantity
                          selectedOptions { name value }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `),
    admin.graphql(`
      query {
        customers(first: 50) {
          edges { node { id firstName lastName phone email } }
        }
      }
    `),
  ]);

  const [productData, collectionData, customerData] = await Promise.all([
    productRes.json(), collectionRes.json(), customerRes.json(),
  ]);

  const mapProduct = (node) => ({
    id: node.id,
    title: node.title,
    productType: node.productType || "Other",
    image: node.images.edges[0]?.node.url || null,
    options: node.options || [],
    variants: node.variants.edges.map((v) => ({
      id: v.node.id,
      title: v.node.title,
      price: v.node.price,
      inventory: v.node.inventoryQuantity || 0,
      selectedOptions: v.node.selectedOptions,
    })),
  });

  const allProducts = productData.data.products.edges.map((e) => mapProduct(e.node));
  const collections = collectionData.data.collections.edges.map((e) => ({
    id: e.node.id,
    title: e.node.title,
    products: e.node.products.edges.map((p) => mapProduct(p.node)),
  })).filter((c) => c.products.length > 0);

  const typeMap = {};
  allProducts.forEach((p) => {
    const type = p.productType || "Other";
    if (!typeMap[type]) typeMap[type] = [];
    typeMap[type].push(p);
  });
  const productTypes = Object.entries(typeMap).map(([title, products]) => ({ title, products }));

  const customers = customerData.data.customers.edges.map((e) => ({
    id: e.node.id,
    name: `${e.node.firstName || ""} ${e.node.lastName || ""}`.trim(),
    phone: e.node.phone || "",
    email: e.node.email || "",
  }));

  return { allProducts, collections, productTypes, customers };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "createCustomer") {
    const res = await admin.graphql(
      `#graphql
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id firstName lastName phone email }
          userErrors { field message }
        }
      }`,
      { variables: { input: { firstName: formData.get("firstName"), lastName: formData.get("lastName") || "", phone: formData.get("phone") || null, email: formData.get("email") || null } } }
    );
    const data = await res.json();
    const customer = data.data.customerCreate.customer;
    const errors = data.data.customerCreate.userErrors;
    if (errors.length > 0) return { intent: "createCustomer", success: false, error: errors[0].message };
    return { intent: "createCustomer", success: true, customer: { id: customer.id, name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(), phone: customer.phone || "", email: customer.email || "" } };
  }

  if (intent === "placeOrder") {
    const cartItems = JSON.parse(formData.get("cartItems"));
    const paymentMethod = formData.get("paymentMethod");
    const customerId = formData.get("customerId");
    const customerName = formData.get("customerName");

    const orderInput = {
      lineItems: cartItems.map((item) => ({ variantId: item.variantId, quantity: item.qty })),
      note: `Payment: ${paymentMethod}${customerName ? ` | Customer: ${customerName}` : ""}`,
      financialStatus: "PAID",
      tags: [paymentMethod, "POS"],
    };
    if (customerId) orderInput.customerId = customerId;

    const response = await admin.graphql(
      `#graphql
      mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          userErrors { field message }
          order { id totalPriceSet { shopMoney { amount } } }
        }
      }`,
      { variables: { order: orderInput, options: { inventoryBehaviour: "DECREMENT_IGNORING_POLICY", sendReceipt: true } } }
    );

    const data = await response.json();
    const order = data.data.orderCreate.order;
    const errors = data.data.orderCreate.userErrors;
    if (errors.length > 0) return { intent: "placeOrder", success: false, error: errors[0].message };
    return { intent: "placeOrder", success: true, total: order.totalPriceSet.shopMoney.amount, paymentMethod, customerName };
  }
};

export default function Index() {
  const { allProducts, collections, productTypes, customers } = useLoaderData();
  const fetcher = useFetcher();

  const [cart, setCart] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState("customer");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [viewMode, setViewMode] = useState("collections");
  const [showSuccess, setShowSuccess] = useState(false);

  // Variant drawer
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [selectedOptions, setSelectedOptions] = useState({});

  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const isPlacing = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "placeOrder";
  const isCreating = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "createCustomer";
  const orderResult = fetcher.data?.intent === "placeOrder" ? fetcher.data : null;
  const createResult = fetcher.data?.intent === "createCustomer" ? fetcher.data : null;

  if (orderResult?.success && !showSuccess) setShowSuccess(true);
  if (createResult?.success && selectedCustomer?.id !== createResult.customer?.id) {
    setSelectedCustomer(createResult.customer);
    setShowNewCustomer(false);
    setStep("payment");
  }

  // Find matching variant from selected options
  const getSelectedVariant = () => {
    if (!drawerProduct) return null;
    return drawerProduct.variants.find((v) =>
      v.selectedOptions.every((opt) => selectedOptions[opt.name] === opt.value)
    );
  };

  const openDrawer = (product) => {
    setDrawerProduct(product);
    const defaults = {};
    product.options.forEach((opt) => { defaults[opt.name] = opt.values[0]; });
    setSelectedOptions(defaults);
  };

  const addToCart = () => {
    const variant = getSelectedVariant();
    if (!variant || variant.inventory <= 0) return;
    const cartItem = {
      id: `${drawerProduct.id}-${variant.id}`,
      productId: drawerProduct.id,
      title: drawerProduct.title,
      variantTitle: variant.title !== "Default Title" ? variant.title : "",
      variantId: variant.id,
      image: drawerProduct.image,
      price: variant.price,
      qty: 1,
    };
    setCart((prev) => {
      const existing = prev.find((item) => item.id === cartItem.id);
      if (existing) return prev.map((item) => item.id === cartItem.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, cartItem];
    });
    setDrawerProduct(null);
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((item) => item.id !== id));
  const updateQty = (id, qty) => {
    if (qty < 1) return removeFromCart(id);
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, qty } : item));
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
    setCart([]); setSelectedCustomer(null); setCustomerSearch("");
    setNewFirst(""); setNewLast(""); setNewPhone(""); setNewEmail("");
    setShowSuccess(false);
  };

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch)
  );

  const total = cart.reduce((sum, item) => sum + parseFloat(item.price) * item.qty, 0).toFixed(2);
  const paymentMethods = [
    { label: "💵 Cash", value: "Cash", color: "#2e7d32" },
    { label: "💳 Card", value: "Card", color: "#1565c0" },
    { label: "📱 UPI", value: "UPI", color: "#6a1b9a" },
  ];

  const filterProducts = (products) =>
    products.filter((p) => p.title.toLowerCase().includes(productSearch.toLowerCase()));

  const groups = viewMode === "collections" ? collections : productTypes;
  const selectedVariant = getSelectedVariant();

  const ProductCard = ({ product }) => (
    <div
      onClick={() => openDrawer(product)}
      style={{ minWidth: "160px", maxWidth: "160px", background: "white", borderRadius: "12px", padding: "10px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", marginRight: "12px", flexShrink: 0, transition: "transform 0.1s" }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {product.image ? (
        <img src={product.image} alt={product.title} style={{ width: "100%", height: "120px", objectFit: "cover", borderRadius: "8px" }} />
      ) : (
        <div style={{ width: "100%", height: "120px", background: "#f0f0f0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: "12px" }}>No image</div>
      )}
      <p style={{ margin: "8px 0 2px", fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</p>
      <p style={{ margin: 0, color: "#637381", fontSize: "12px" }}>from ₹{product.variants[0]?.price || "0.00"}</p>
      {product.options.length > 0 && product.options[0].name !== "Title" && (
        <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#aaa" }}>{product.options.map(o => o.name).join(" · ")}</p>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", position: "relative", background: "#f6f6f7" }}>

      {/* Order Success Overlay */}
      {showSuccess && orderResult?.success && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "24px", padding: "48px 36px", textAlign: "center", width: "320px", boxShadow: "0 16px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ width: "88px", height: "88px", background: "#e6f4ea", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "44px" }}>✅</div>
            <h2 style={{ margin: "0 0 6px", fontSize: "24px", fontWeight: "700", color: "#1a1a1a" }}>Order Confirmed!</h2>
            {orderResult.customerName && <p style={{ margin: "0 0 4px", fontSize: "14px", color: "#666" }}>👤 {orderResult.customerName}</p>}
            <p style={{ margin: "8px 0 4px", fontSize: "28px", fontWeight: "800", color: "#1a1a1a" }}>₹{orderResult.total}</p>
            <p style={{ margin: "0 0 28px", fontSize: "15px", color: "#637381" }}>
              {orderResult.paymentMethod === "Cash" ? "💵" : orderResult.paymentMethod === "Card" ? "💳" : "📱"} Paid via {orderResult.paymentMethod}
            </p>
            <button onClick={clearCart} style={{ width: "100%", padding: "16px", background: "#1a1a1a", color: "white", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "600", cursor: "pointer", letterSpacing: "0.3px" }}>
              New Order
            </button>
          </div>
        </div>
      )}

      {/* Variant Drawer */}
      {drawerProduct && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
          <div onClick={() => setDrawerProduct(null)} style={{ flex: 1, background: "rgba(0,0,0,0.4)" }} />
          <div style={{ width: "380px", background: "white", height: "100%", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}>
            
            {/* Product Image */}
            {drawerProduct.image ? (
              <img src={drawerProduct.image} alt={drawerProduct.title} style={{ width: "100%", height: "260px", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "260px", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>No image</div>
            )}

            <div style={{ padding: "24px", flex: 1 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "700" }}>{drawerProduct.title}</h2>
              <p style={{ margin: "0 0 20px", fontSize: "22px", fontWeight: "800", color: "#1a1a1a" }}>
                ₹{selectedVariant?.price || drawerProduct.variants[0]?.price}
              </p>

              {/* Options */}
              {drawerProduct.options.map((option) => {
                if (option.name === "Title") return null;
                return (
                  <div key={option.name} style={{ marginBottom: "20px" }}>
                    <p style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: "600", color: "#666", textTransform: "uppercase", letterSpacing: "0.8px" }}>{option.name}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {option.values.map((value) => {
                        const isSelected = selectedOptions[option.name] === value;
                        const testOptions = { ...selectedOptions, [option.name]: value };
                        const testVariant = drawerProduct.variants.find((v) =>
                          v.selectedOptions.every((opt) => testOptions[opt.name] === opt.value)
                        );
                        const outOfStock = testVariant && testVariant.inventory <= 0;
                        return (
                          <button
                            key={value}
                            onClick={() => !outOfStock && setSelectedOptions((prev) => ({ ...prev, [option.name]: value }))}
                            style={{
                              padding: "8px 16px",
                              borderRadius: "8px",
                              border: isSelected ? "2px solid #1a1a1a" : "1.5px solid #e0e0e0",
                              background: isSelected ? "#1a1a1a" : outOfStock ? "#f9f9f9" : "white",
                              color: isSelected ? "white" : outOfStock ? "#ccc" : "#1a1a1a",
                              cursor: outOfStock ? "not-allowed" : "pointer",
                              fontSize: "14px",
                              fontWeight: isSelected ? "600" : "400",
                              textDecoration: outOfStock ? "line-through" : "none",
                            }}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Stock info */}
              {selectedVariant && (
                <p style={{ margin: "0 0 24px", fontSize: "13px", fontWeight: "600", color: selectedVariant.inventory <= 5 ? "#e53e3e" : "#008060" }}>
                  {selectedVariant.inventory <= 0 ? "❌ Out of stock" : selectedVariant.inventory <= 5 ? `⚠️ Only ${selectedVariant.inventory} left` : `✅ ${selectedVariant.inventory} in stock`}
                </p>
              )}
            </div>

            {/* Add to Cart button */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #f0f0f0" }}>
              <button
                onClick={addToCart}
                disabled={!selectedVariant || selectedVariant.inventory <= 0}
                style={{ width: "100%", padding: "16px", background: !selectedVariant || selectedVariant.inventory <= 0 ? "#e0e0e0" : "#1a1a1a", color: !selectedVariant || selectedVariant.inventory <= 0 ? "#999" : "white", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: !selectedVariant || selectedVariant.inventory <= 0 ? "not-allowed" : "pointer", letterSpacing: "0.3px" }}
              >
                {selectedVariant?.inventory <= 0 ? "Out of Stock" : "Add to Cart"}
              </button>
              <button onClick={() => setDrawerProduct(null)} style={{ width: "100%", marginTop: "10px", padding: "12px", background: "transparent", border: "none", cursor: "pointer", color: "#999", fontSize: "14px" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer / Payment Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "20px", padding: "28px", width: "360px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>

            {step === "customer" && (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700" }}>Who is this order for?</h3>
                <p style={{ margin: "0 0 16px", color: "#637381", fontSize: "13px" }}>Search or add new customer</p>
                {!showNewCustomer ? (
                  <>
                    <input type="text" placeholder="Search by name or phone..." value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", marginBottom: "10px", boxSizing: "border-box" }}
                    />
                    <select onChange={(e) => { const found = customers.find((c) => c.id === e.target.value); if (found) { setSelectedCustomer(found); setStep("payment"); } }} defaultValue=""
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", marginBottom: "12px", boxSizing: "border-box", background: "white" }}
                    >
                      <option value="" disabled>Select a customer...</option>
                      {filteredCustomers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || "No name"}{c.phone ? ` — ${c.phone}` : ""}</option>
                      ))}
                    </select>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setShowNewCustomer(true)} style={{ flex: 1, padding: "10px", background: "#f4f4f4", border: "1px solid #e0e0e0", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>+ New</button>
                      <button onClick={() => setStep("payment")} style={{ flex: 1, padding: "10px", background: "#1a1a1a", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>Skip →</button>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 style={{ margin: "0 0 12px", fontWeight: "600" }}>New Customer</h4>
                    {[{ label: "First Name *", val: newFirst, set: setNewFirst }, { label: "Last Name", val: newLast, set: setNewLast }, { label: "Phone", val: newPhone, set: setNewPhone }, { label: "Email", val: newEmail, set: setNewEmail }].map((field) => (
                      <input key={field.label} type="text" placeholder={field.label} value={field.val} onChange={(e) => field.set(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", marginBottom: "10px", boxSizing: "border-box" }}
                      />
                    ))}
                    {createResult?.success === false && <p style={{ color: "red", fontSize: "13px" }}>❌ {createResult.error}</p>}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setShowNewCustomer(false)} style={{ flex: 1, padding: "10px", background: "#f4f4f4", border: "1px solid #e0e0e0", borderRadius: "8px", cursor: "pointer" }}>← Back</button>
                      <button onClick={createCustomer} disabled={!newFirst || isCreating} style={{ flex: 1, padding: "10px", background: !newFirst ? "#ccc" : "#008060", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                        {isCreating ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {step === "payment" && (
              <>
                <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700" }}>How is the customer paying?</h3>
                <p style={{ margin: "0 0 4px", color: "#637381", fontSize: "13px" }}>Total: ₹{total}</p>
                {selectedCustomer && <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#008060", fontWeight: "600" }}>👤 {selectedCustomer.name}</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {paymentMethods.map((pm) => (
                    <button key={pm.value} onClick={() => placeOrder(pm.value)}
                      style={{ padding: "14px", background: pm.color, color: "white", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: "600", cursor: "pointer" }}>
                      {pm.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setStep("customer")} style={{ marginTop: "12px", width: "100%", padding: "10px", background: "transparent", border: "1px solid #e0e0e0", borderRadius: "8px", cursor: "pointer", color: "#637381" }}>← Change Customer</button>
              </>
            )}

            <button onClick={() => setShowModal(false)} style={{ marginTop: "10px", width: "100%", padding: "10px", background: "transparent", border: "none", cursor: "pointer", color: "#bbb", fontSize: "13px" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Product Area */}
      <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>🛍️ Products</h2>
          <input type="text" placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
            style={{ flex: 1, padding: "9px 14px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", background: "white" }}
          />
          <div style={{ display: "flex", background: "#e8e8e8", borderRadius: "8px", padding: "3px", gap: "2px" }}>
            {["collections", "types"].map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{ padding: "6px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600", background: viewMode === mode ? "white" : "transparent", color: viewMode === mode ? "#1a1a1a" : "#888", transition: "all 0.15s" }}
              >
                {mode === "collections" ? "Collections" : "Product Type"}
              </button>
            ))}
          </div>
        </div>

        {groups.map((group) => {
          const filtered = filterProducts(group.products);
          if (filtered.length === 0) return null;
          return (
            <div key={group.title || group.id} style={{ marginBottom: "28px" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: "700", color: "#333", textTransform: "uppercase", letterSpacing: "0.6px" }}>{group.title}</h3>
              <div style={{ display: "flex", overflowX: "auto", paddingBottom: "8px", gap: "12px" }}>
                {filtered.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
            </div>
          );
        })}

        {groups.length === 0 && <p style={{ color: "#999", textAlign: "center", marginTop: "60px" }}>No products found</p>}
      </div>

      {/* Cart */}
      <div style={{ width: "300px", background: "white", borderLeft: "1px solid #ebebeb", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px", borderBottom: "1px solid #f0f0f0" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>🧾 Cart {cart.length > 0 && <span style={{ background: "#1a1a1a", color: "white", borderRadius: "20px", padding: "2px 8px", fontSize: "12px", marginLeft: "6px" }}>{cart.length}</span>}</h2>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {cart.length === 0 ? (
            <p style={{ color: "#bbb", textAlign: "center", marginTop: "40px", fontSize: "14px" }}>Tap a product to add</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid #f5f5f5" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  {item.image && <img src={item.image} alt={item.title} style={{ width: "44px", height: "44px", borderRadius: "8px", objectFit: "cover" }} />}
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 2px", fontWeight: "600", fontSize: "13px" }}>{item.title}</p>
                    {item.variantTitle && <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#888" }}>{item.variantTitle}</p>}
                    <p style={{ margin: 0, color: "#637381", fontSize: "12px" }}>₹{item.price}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                  <button onClick={() => updateQty(item.id, item.qty - 1)} style={btnStyle}>−</button>
                  <span style={{ fontWeight: "600", fontSize: "14px", minWidth: "20px", textAlign: "center" }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, item.qty + 1)} style={btnStyle}>+</button>
                  <span style={{ marginLeft: "auto", fontWeight: "600", fontSize: "13px" }}>₹{(parseFloat(item.price) * item.qty).toFixed(2)}</span>
                  <button onClick={() => removeFromCart(item.id)} style={{ ...btnStyle, color: "#e53e3e", borderColor: "#e53e3e" }}>✕</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #ebebeb" }}>
          {orderResult?.success === false && (
            <p style={{ color: "#e53e3e", fontSize: "12px", marginBottom: "8px" }}>❌ {orderResult.error}</p>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontWeight: "600", fontSize: "15px", color: "#333" }}>Total</span>
            <span style={{ fontWeight: "800", fontSize: "20px", color: "#1a1a1a" }}>₹{total}</span>
          </div>
          <button
            onClick={() => { setStep("customer"); setShowNewCustomer(false); setShowModal(true); }}
            disabled={cart.length === 0 || isPlacing}
            style={{ width: "100%", padding: "15px", background: cart.length === 0 || isPlacing ? "#e0e0e0" : "#1a1a1a", color: cart.length === 0 || isPlacing ? "#999" : "white", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "700", cursor: cart.length === 0 || isPlacing ? "not-allowed" : "pointer", letterSpacing: "0.3px" }}
          >
            {isPlacing ? "Placing Order..." : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  width: "28px", height: "28px", border: "1px solid #e0e0e0", borderRadius: "6px",
  background: "white", cursor: "pointer", fontSize: "15px",
  display: "flex", alignItems: "center", justifyContent: "center",
};