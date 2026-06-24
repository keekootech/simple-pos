// Global staff role store
let globalStaffSession = (() => {
  try {
    const s = sessionStorage.getItem("spos_staff");
    if (s) return JSON.parse(s);
  } catch(e) {}
  return null;
})();
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState, useEffect, useRef } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");


  // If cursor request, only return products
  if (cursor) {
    console.log("CURSOR REQUEST:", cursor);
    const res = await admin.graphql(`
      query {
        products(first: 100) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id title productType
              images(first: 1) { edges { node { url altText } } }
              options { name values }
              variants(first: 10) {
                edges {
                  node { id title price inventoryQuantity barcode selectedOptions { name value } }
                }
              }
            }
          }
        }
      }
    `);
    const data = await res.json();
    const allProducts = data.data.products.edges.map((e) => ({
      id: e.node.id,
      title: e.node.title,
      productType: e.node.productType || "Other",
      image: e.node.images.edges[0]?.node.url || null,
      options: e.node.options || [],
      variants: e.node.variants.edges.map((v) => ({
        id: v.node.id,
        title: v.node.title,
        price: v.node.price,
        inventory: v.node.inventoryQuantity || 0,
        barcode: v.node.barcode || "",
        selectedOptions: v.node.selectedOptions,
      })),
    }));
    return { allProducts };
  }


const [productRes, collectionRes, customerRes, settingsRes] = await Promise.all([
    admin.graphql(`
      query {
          products(first: 100) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id title productType
              images(first: 1) { edges { node { url altText } } }
              options { name values }
              variants(first: 10) {
                edges {
                  node {
                    id title price inventoryQuantity barcode
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
                    variants(first: 10) {
                      edges {
                        node {
                          id title price inventoryQuantity barcode
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
    admin.graphql(`
      query {
        appInstallation {
          metafields(first: 10, namespace: "simple_pos") {
            edges { node { key value } }
          }
        }
      }
    `),
  ]);

  const [productData, collectionData, customerData, settingsData] = await Promise.all([
    productRes.json(), collectionRes.json(), customerRes.json(), settingsRes.json(),
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
      barcode: v.node.barcode || "",
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

  const metafields = settingsData.data.appInstallation.metafields.edges.reduce((acc, e) => {
    acc[e.node.key] = e.node.value;
    return acc;
  }, {});

  const onboardingComplete = metafields.onboarding_complete === "true";

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

 const shopRes = await admin.graphql(`
    query {
      shop {
        billingAddress { countryCode }
        currencyCode
      }
    }
  `);
  const shopData = await shopRes.json();
  const countryCode = shopData.data.shop.billingAddress?.countryCode || "IN";
  const storeCurrency = shopData.data.shop.currencyCode || "USD";
  const currencySymbol = storeCurrency === "INR" ? "₹" : storeCurrency === "GBP" ? "£" : storeCurrency === "EUR" ? "€" : "$";

  const countryDialCodes = {
    IN: "+91", US: "+1", GB: "+44", AE: "+971", SG: "+65",
    AU: "+61", CA: "+1", NZ: "+64", ZA: "+27", MY: "+60",
    PK: "+92", BD: "+880", LK: "+94", NP: "+977", SA: "+966",
    QA: "+974", KW: "+965", BH: "+973", OM: "+968", EG: "+20",
  };

  const defaultDialCode = countryDialCodes[countryCode] || "+91";

return { allProducts, collections, productTypes, customers, settings, defaultDialCode, onboardingComplete, currencySymbol };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "setupAdmin") {
    const adminMember = JSON.parse(formData.get("adminMember"));
    const { admin } = await authenticate.admin(request);
    
    const appRes = await admin.graphql(`query { appInstallation { id } }`);
    const appData = await appRes.json();
    const appInstallationId = appData.data.appInstallation.id;

    await admin.graphql(
      `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { key value }
          userErrors { field message }
        }
      }`,
      { variables: { metafields: [
        { namespace: "simple_pos", key: "staff_list", value: JSON.stringify([adminMember]), type: "single_line_text_field", ownerId: appInstallationId },
        { namespace: "simple_pos", key: "onboarding_complete", value: "true", type: "single_line_text_field", ownerId: appInstallationId },
      ]}}
    );

    return { intent: "setupAdmin", success: true };
  }

  if (intent === "createCustomer") {
    const res = await admin.graphql(
      `#graphql
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id firstName lastName phone email }
          userErrors { field message }
        }
      }`,
      { variables: { input: { firstName: formData.get("firstName"), lastName: formData.get("lastName") || "", phone: formData.get("phone") || null, email: formData.get("email") || null, addresses: formData.get("address") ? [{ address1: formData.get("address") }] : [] } } }
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
    const staffName = formData.get("staffName") || "Unknown";
    const customerName = formData.get("customerName");

    // Step 1: Create Draft Order
    const draftInput = {
      lineItems: cartItems.map((item) => ({ variantId: item.variantId, quantity: item.qty })),
      note: `Payment: ${paymentMethod}${customerName ? ` | Customer: ${customerName}` : ""} | Staff: ${staffName}`,
      tags: [paymentMethod, "POS", `Staff:${staffName}`],
    };
    if (customerId) draftInput.customerId = customerId;

    const draftResponse = await admin.graphql(
      `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { 
            id 
            totalPriceSet { shopMoney { amount } }
          }
          userErrors { field message }
        }
      }`,
      { variables: { input: draftInput } }
    );

    const draftData = await draftResponse.json();
    const draftOrder = draftData.data.draftOrderCreate.draftOrder;
    const draftErrors = draftData.data.draftOrderCreate.userErrors;

    if (draftErrors.length > 0) return { intent: "placeOrder", success: false, error: draftErrors[0].message };

    // Step 2: Complete Draft Order (marks as paid)
    const completeResponse = await admin.graphql(
      `#graphql
      mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
        draftOrderComplete(id: $id, paymentPending: $paymentPending) {
          draftOrder {
            order {
              id
              totalPriceSet { shopMoney { amount } }
            }
          }
          userErrors { field message }
        }
      }`,
      { variables: { id: draftOrder.id, paymentPending: false } }
    );

    const completeData = await completeResponse.json();
    const completedOrder = completeData.data.draftOrderComplete.draftOrder?.order;
    const completeErrors = completeData.data.draftOrderComplete.userErrors;

    if (completeErrors.length > 0) return { intent: "placeOrder", success: false, error: completeErrors[0].message };
    return { intent: "placeOrder", success: true, total: completedOrder.totalPriceSet.shopMoney.amount, paymentMethod, customerName };
  }
};

export default function Index() {
  const { allProducts, collections, productTypes, customers, settings, defaultDialCode, onboardingComplete, currencySymbol } = useLoaderData();
  const fetcher = useFetcher();

  // Staff login check
const [currentStaff, setCurrentStaff] = useState(globalStaffSession);
const [loginPin, setLoginPin] = useState("");
const [loginError, setLoginError] = useState("");
const [selectedLoginStaff, setSelectedLoginStaff] = useState(null);
const [cart, setCart] = useState([]);
const [showModal, setShowModal] = useState(false);
const [step, setStep] = useState("customer");
const [selectedCustomer, setSelectedCustomer] = useState(null);
const [showNewCustomer, setShowNewCustomer] = useState(false);
const [customerSearch, setCustomerSearch] = useState("");
const [productSearch, setProductSearch] = useState("");
const [viewMode, setViewMode] = useState("collections");
const [showSuccess, setShowSuccess] = useState(false);
const [cashGiven, setCashGiven] = useState("");
const [showCashCalc, setShowCashCalc] = useState(false);
const [showScanner, setShowScanner] = useState(false);
const scannerRef = useRef(null);


  useEffect(() => {
    if (!showScanner) {
     if (scannerRef.current) {
        try {
          scannerRef.current.stop();
        } catch(e) {}
        try {
          scannerRef.current.clear();
        } catch(e) {}
        scannerRef.current = null;
      }
      return;
    }

    let html5QrCode;
    const loadScanner = () => new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
        script.onload = () => resolve(window.Html5Qrcode);
        document.head.appendChild(script);
      });

      loadScanner().then((Html5Qrcode) => {
      html5QrCode = new Html5Qrcode("barcode-scanner");
      scannerRef.current = html5QrCode;
      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          // Find product by barcode
          const found = allProducts.find((p) =>
            p.variants.some((v) => v.barcode === decodedText)
          );
          if (found) {
            setShowScanner(false);
            openDrawer(found);
          } else {
            // Try search by title
            setProductSearch(decodedText);
            setShowScanner(false);
          }
        },
        () => {}
      ).catch((err) => {
        console.error("Scanner error:", err);
      });
    });

    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch(e) {}
        try { scannerRef.current.clear(); } catch(e) {}
        scannerRef.current = null;
      }
    };
  }, [showScanner]);



  // Variant drawer
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [selectedOptions, setSelectedOptions] = useState({});

const [phoneCountryCode, setPhoneCountryCode] = useState(defaultDialCode);
const [newFirst, setNewFirst] = useState("");
const [newLast, setNewLast] = useState("");
const [newPhone, setNewPhone] = useState("");
const [newEmail, setNewEmail] = useState("");
const [newAddress, setNewAddress] = useState("");
const [newBirthday, setNewBirthday] = useState("");
const [newAnniversary, setNewAnniversary] = useState("");


// Fresh install — no staff yet, show setup screen
if (settings?.staff?.length === 0) {
  return <FirstTimeSetup onComplete={(adminMember) => {
    globalStaffSession = adminMember;
    try { sessionStorage.setItem("spos_staff", JSON.stringify(adminMember)); } catch(e) {}
    setCurrentStaff(adminMember);
    window.dispatchEvent(new CustomEvent('staffLogin', { detail: { role: 'admin' } }));
  }} />;
}

// Staff login check — MUST be after all useState
if (!currentStaff && settings?.staff?.length > 0)  {
  return <StaffLoginGate staff={settings?.staff || []} onLogin={setCurrentStaff} />;
}

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
    if (paymentMethod === "Cash" && settings.paymentMethods.cashCalculator) {
      setShowCashCalc(true);
      setShowModal(false);
      return;
    }
    submitOrder(paymentMethod);
  };

  const submitOrder = (paymentMethod) => {
    const formData = new FormData();
    formData.append("intent", "placeOrder");
    formData.append("cartItems", JSON.stringify(cart));
    formData.append("paymentMethod", paymentMethod);
    formData.append("customerId", selectedCustomer?.id || "");
    formData.append("customerName", selectedCustomer?.name || "");
    formData.append("staffName", currentStaff?.name || "Unknown");
    fetcher.submit(formData, { method: "POST" });
    setShowCashCalc(false);
    setCashGiven("");
  };

  const createCustomer = () => {
    const formData = new FormData();
    formData.append("intent", "createCustomer");
    formData.append("firstName", newFirst);
    formData.append("lastName", newLast);
    formData.append("phone", newPhone ? `${phoneCountryCode}${newPhone}` : "");
    formData.append("email", newEmail);
    formData.append("address", newAddress);
    fetcher.submit(formData, { method: "POST" });
  };

const logout = () => {
    globalStaffSession = null;
try { sessionStorage.removeItem("spos_staff"); } catch(e) {}
setCurrentStaff(null);
    window.dispatchEvent(new CustomEvent('staffLogin', { detail: { role: null } }));
  };

const clearCart = () => {
    setCart([]); 
    setSelectedCustomer(null); 
    setCustomerSearch("");
    setNewFirst(""); 
    setNewLast(""); 
    setNewPhone(""); 
    setNewEmail("");
    setNewAddress("");
    setNewBirthday("");
    setNewAnniversary("");
    setPhoneCountryCode(defaultDialCode);
    setShowSuccess(false);
    fetcher.load("/app");
  };

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch)
  );

  const total = cart.reduce((sum, item) => sum + parseFloat(item.price) * item.qty, 0).toFixed(2);
const paymentMethods = [
    settings.paymentMethods.cash && { label: "💵 Cash", value: "Cash", color: "#2e7d32" },
    settings.paymentMethods.card && { label: "💳 Card", value: "Card", color: "#1565c0" },
    settings.paymentMethods.upi && { label: "📱 UPI", value: "UPI", color: "#6a1b9a" },
  ].filter(Boolean);

  const filterProducts = (products) =>
    products.filter((p) => p.title.toLowerCase().includes(productSearch.toLowerCase()));

// Use paginated products for "Product Type" view
  const paginatedTypes = {};
  allProducts.forEach((p) => {
    const type = p.productType || "Other";
    if (!paginatedTypes[type]) paginatedTypes[type] = [];
    paginatedTypes[type].push(p);
  });
  const paginatedTypeGroups = Object.entries(paginatedTypes).map(([title, prods]) => ({ title, products: prods }));

  const groups = viewMode === "collections" ? collections : paginatedTypeGroups;
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
// Show login screen if no staff logged in
  if (!currentStaff && settings.staff?.length > 0) {
console.log("SETTINGS:", JSON.stringify(settings));
    const handlePinPress = (digit) => {
      if (loginPin.length < 4) {
        const newPin = loginPin + digit;
        setLoginPin(newPin);
        setLoginError("");
        if (newPin.length === 4) {
          setTimeout(() => {
            if (newPin === selectedLoginStaff.pin) {
             setCurrentStaff(selectedLoginStaff);
              setLoginPin("");
              setSelectedLoginStaff(null);
            } else {
              setLoginError("Wrong PIN. Try again.");
              setLoginPin("");
            }
          }, 100);
        }
      }
    };

    if (selectedLoginStaff) {
      return (
        <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
          <div style={{ textAlign: "center", width: "320px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "700", fontSize: "24px", margin: "0 auto 12px" }}>
              {selectedLoginStaff.name.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "700" }}>{selectedLoginStaff.name}</h2>
            <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#637381" }}>Enter your 4-digit PIN</p>
            <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "8px" }}>
              {[0,1,2,3].map((i) => (
                <div key={i} style={{ width: "16px", height: "16px", borderRadius: "50%", background: loginPin.length > i ? "#1a1a1a" : "#ddd", transition: "background 0.15s" }} />
              ))}
            </div>
            {loginError && <p style={{ color: "#e53e3e", fontSize: "13px", marginBottom: "8px" }}>{loginError}</p>}
            {!loginError && <div style={{ height: "21px", marginBottom: "8px" }} />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
              {[1,2,3,4,5,6,7,8,9].map((n) => (
                <button key={n} onClick={() => handlePinPress(String(n))}
                  style={{ padding: "18px", background: "white", border: "none", borderRadius: "12px", fontSize: "20px", fontWeight: "600", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                  {n}
                </button>
              ))}
              <button onClick={() => setLoginPin(loginPin.slice(0,-1))}
                style={{ padding: "18px", background: "#f0f0f0", border: "none", borderRadius: "12px", fontSize: "20px", cursor: "pointer" }}>⌫</button>
              <button onClick={() => handlePinPress("0")}
                style={{ padding: "18px", background: "white", border: "none", borderRadius: "12px", fontSize: "20px", fontWeight: "600", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>0</button>
              <button onClick={() => { setSelectedLoginStaff(null); setLoginPin(""); setLoginError(""); }}
                style={{ padding: "18px", background: "#f0f0f0", border: "none", borderRadius: "12px", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ textAlign: "center", width: "100%", maxWidth: "500px", padding: "20px" }}>
          <h1 style={{ margin: "0 0 4px", fontSize: "28px", fontWeight: "800" }}>Simple POS</h1>
          <p style={{ margin: "0 0 40px", color: "#637381", fontSize: "15px" }}>Who are you?</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" }}>
{staff.map((member) => (
              <div key={member.id} onClick={() => setSelected(member)}
                style={{ width: "120px", padding: "20px 16px", background: "white", borderRadius: "16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", textAlign: "center" }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "700", fontSize: "20px", margin: "0 auto 10px" }}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <p style={{ margin: "0 0 4px", fontWeight: "600", fontSize: "14px" }}>{member.name}</p>
               <p style={{ margin: 0, fontSize: "16px", fontWeight: "900", letterSpacing: "1.5px", color: member.role === "admin" ? "#cc071e" : "#555", textTransform: "uppercase" }}>{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", position: "relative", background: "#f6f6f7" }}>
{/* Barcode Scanner Modal */}
      {showScanner && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "20px", padding: "24px", width: "340px", boxShadow: "0 16px 60px rgba(0,0,0,0.25)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700" }}>📷 Scan Barcode</h3>
            <p style={{ margin: "0 0 16px", color: "#637381", fontSize: "13px" }}>Point camera at product barcode</p>
            <div id="barcode-scanner" style={{ width: "100%", borderRadius: "12px", overflow: "hidden" }} />
            <button onClick={() => setShowScanner(false)}
              style={{ width: "100%", marginTop: "16px", padding: "12px", background: "transparent", border: "1px solid #e0e0e0", borderRadius: "10px", cursor: "pointer", color: "#637381", fontSize: "14px" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

{/* Cash Calculator Modal */}
      {showCashCalc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "20px", padding: "32px", width: "340px", boxShadow: "0 16px 60px rgba(0,0,0,0.25)", fontFamily: "-apple-system, sans-serif" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700" }}>💵 Cash Payment</h3>
            <p style={{ margin: "0 0 20px", color: "#637381", fontSize: "13px" }}>Bill Total: <strong style={{ color: "#1a1a1a" }}>{currencySymbol}{total}</strong></p>

            {/* Quick buttons */}
            <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "0.6px" }}>Cash Received</p>
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
              {[500, 1000, 2000].map((amt) => (
                <button key={amt} onClick={() => setCashGiven(String(amt))}
                  style={{ flex: 1, padding: "10px", background: cashGiven === String(amt) ? "#1a1a1a" : "#f4f4f4", color: cashGiven === String(amt) ? "white" : "#1a1a1a", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "14px" }}>
                  ₹{amt}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <input
              type="number"
              placeholder="Or enter custom amount..."
              value={cashGiven}
              onChange={(e) => setCashGiven(e.target.value)}
              style={{ width: "100%", padding: "12px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "15px", boxSizing: "border-box", marginBottom: "16px" }}
            />

            {/* Change display */}
            {cashGiven && parseFloat(cashGiven) >= parseFloat(total) && (
              <div style={{ background: "#e6f4ea", borderRadius: "12px", padding: "16px", marginBottom: "16px", textAlign: "center" }}>
                <p style={{ margin: "0 0 4px", fontSize: "13px", color: "#637381" }}>Change to return</p>
                <p style={{ margin: 0, fontSize: "36px", fontWeight: "800", color: "#1e7e34" }}>
                  ₹{(parseFloat(cashGiven) - parseFloat(total)).toFixed(0)}
                </p>
              </div>
            )}

            {cashGiven && parseFloat(cashGiven) < parseFloat(total) && (
              <div style={{ background: "#fff0f0", borderRadius: "12px", padding: "12px", marginBottom: "16px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "14px", color: "#e53e3e", fontWeight: "600" }}>
                  ₹{(parseFloat(total) - parseFloat(cashGiven)).toFixed(0)} short
                </p>
              </div>
            )}

            <button
              onClick={() => submitOrder("Cash")}
              disabled={!cashGiven || parseFloat(cashGiven) < parseFloat(total)}
              style={{ width: "100%", padding: "14px", background: !cashGiven || parseFloat(cashGiven) < parseFloat(total) ? "#ccc" : "#2e7d32", color: "white", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: "700", cursor: !cashGiven || parseFloat(cashGiven) < parseFloat(total) ? "not-allowed" : "pointer" }}>
              ✅ Confirm & Place Order
            </button>

            <button onClick={() => { setShowCashCalc(false); setCashGiven(""); setShowModal(true); }}
              style={{ width: "100%", marginTop: "10px", padding: "10px", background: "transparent", border: "none", cursor: "pointer", color: "#999", fontSize: "13px" }}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Order Success Overlay */}
      {showSuccess && orderResult?.success && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "24px", padding: "48px 36px", textAlign: "center", width: "320px", boxShadow: "0 16px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ width: "88px", height: "88px", background: "#e6f4ea", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "44px" }}>✅</div>
            <h2 style={{ margin: "0 0 6px", fontSize: "24px", fontWeight: "700", color: "#1a1a1a" }}>Order Confirmed!</h2>
            {orderResult.customerName && <p style={{ margin: "0 0 4px", fontSize: "14px", color: "#666" }}>👤 {orderResult.customerName}</p>}
            <p style={{ margin: "8px 0 4px", fontSize: "28px", fontWeight: "800", color: "#1a1a1a" }}>{currencySymbol}{orderResult.total}</p>
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
                   
                   {settings.customerFields.phone && (
                  <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                   <select value={phoneCountryCode} onChange={(e) => setPhoneCountryCode(e.target.value)}
      style={{ width: "120px", padding: "10px 8px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", background: "white", flexShrink: 0 }}>
      {[
        { code: "+91", flag: "🇮🇳", label: "IN" },
        { code: "+1", flag: "🇺🇸", label: "US" },
        { code: "+44", flag: "🇬🇧", label: "GB" },
        { code: "+971", flag: "🇦🇪", label: "AE" },
        { code: "+65", flag: "🇸🇬", label: "SG" },
        { code: "+61", flag: "🇦🇺", label: "AU" },
        { code: "+1", flag: "🇨🇦", label: "CA" },
        { code: "+880", flag: "🇧🇩", label: "BD" },
        { code: "+966", flag: "🇸🇦", label: "SA" },
        { code: "+974", flag: "🇶🇦", label: "QA" },
        { code: "+965", flag: "🇰🇼", label: "KW" },
        { code: "+60", flag: "🇲🇾", label: "MY" },
        { code: "+27", flag: "🇿🇦", label: "ZA" },
        { code: "+64", flag: "🇳🇿", label: "NZ" },
        { code: "+977", flag: "🇳🇵", label: "NP" },
        { code: "+94", flag: "🇱🇰", label: "LK" },
      ].map((c) => (
        <option key={`${c.flag}-${c.code}`} value={c.code}>{c.flag} {c.code}</option>
      ))}
    </select>
                    <input type="tel" placeholder="Phone number" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                      style={{ flex: 1, padding: "10px 12px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
                    />
                  </div>
                )}

                {[
                  { label: "First Name *", val: newFirst, set: setNewFirst, show: true },
                  { label: "Last Name", val: newLast, set: setNewLast, show: true },
                  { label: "Email", val: newEmail, set: setNewEmail, show: settings.customerFields.email },
                  { label: "Address (optional)", val: newAddress, set: setNewAddress, show: settings.customerFields.address },
                  { label: "Birthday (optional)", val: newBirthday, set: setNewBirthday, show: settings.customerFields.birthday },
                  { label: "Anniversary (optional)", val: newAnniversary, set: setNewAnniversary, show: settings.customerFields.anniversary },
                ].filter((f) => f.show).map((field) => (
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "4px" }}>
            <div style={{ width: "28px", height: "28px", background: "#1a1a1a", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "white", fontSize: "14px" }}>S</span>
            </div>
            <span style={{ fontSize: "15px", fontWeight: "800", letterSpacing: "-0.3px", color: "#1a1a1a" }}>Simple POS</span>
          </div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>🛍️ Products</h2>
          <input type="text" placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
            style={{ flex: 1, padding: "9px 14px", border: "1px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", background: "white" }}
          />
          <button onClick={() => setShowScanner(true)}
            style={{ padding: "9px 14px", background: "#1a1a1a", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", whiteSpace: "nowrap" }}>
            📷 Scan
          </button>
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
        {/* Infinite scroll trigger */}
       
      </div>

      {/* Cart */}
      <div style={{ width: "300px", background: "white", borderLeft: "1px solid #ebebeb", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px", borderBottom: "1px solid #f0f0f0" }}>
          {currentStaff && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ margin: 0, fontSize: "13px", fontWeight: "600" }}>👋 {currentStaff.name}</p>
              <button onClick={logout} style={{ padding: "6px 14px", background: "#1a1a1a", color: "white", border: "none", borderRadius: "20px", cursor: "pointer", fontSize: "12px", fontWeight: "600", letterSpacing: "0.3px" }}>👋 Logout</button>
            </div>
          )}
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
                    <p style={{ margin: 0, color: "#637381", fontSize: "12px" }}>{currencySymbol}{item.price}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                  <button onClick={() => updateQty(item.id, item.qty - 1)} style={btnStyle}>−</button>
                  <span style={{ fontWeight: "600", fontSize: "14px", minWidth: "20px", textAlign: "center" }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, item.qty + 1)} style={btnStyle}>+</button>
                  <span style={{ marginLeft: "auto", fontWeight: "600", fontSize: "13px" }}>{currencySymbol}{(parseFloat(item.price) * item.qty).toFixed(2)}</span>
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
            <span style={{ fontWeight: "800", fontSize: "20px", color: "#1a1a1a" }}>{currencySymbol}{total}</span>
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

function StaffLoginGate({ staff, onLogin }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handlePin = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      if (newPin.length === 4) {
        setTimeout(() => {
      if (newPin === selected.pin) {
            globalStaffSession = selected;
try { sessionStorage.setItem("spos_staff", JSON.stringify(selected)); } catch(e) {}
onLogin(selected);
            // Store role in URL for nav
            window.dispatchEvent(new CustomEvent('staffLogin', { detail: { role: selected.role } }));
            window.history.replaceState({}, '', `/app?role=${selected.role}`);
          } else {
            setError("Wrong PIN. Try again.");
            setPin("");
          }
        }, 100);
      }
    }
  };

  if (selected) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ textAlign: "center", width: "320px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "700", fontSize: "24px", margin: "0 auto 12px" }}>
            {selected.name.charAt(0).toUpperCase()}
          </div>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "700" }}>{selected.name}</h2>
          <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#637381" }}>Enter your 4-digit PIN</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "8px" }}>
            {[0,1,2,3].map((i) => (
              <div key={i} style={{ width: "16px", height: "16px", borderRadius: "50%", background: pin.length > i ? "#1a1a1a" : "#ddd", transition: "background 0.15s" }} />
            ))}
          </div>
          {error && <p style={{ color: "#e53e3e", fontSize: "13px", marginBottom: "8px" }}>{error}</p>}
          {!error && <div style={{ height: "21px", marginBottom: "8px" }} />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
            {[1,2,3,4,5,6,7,8,9].map((n) => (
              <button key={n} onClick={() => handlePin(String(n))}
                style={{ padding: "18px", background: "white", border: "none", borderRadius: "12px", fontSize: "20px", fontWeight: "600", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                {n}
              </button>
            ))}
            <button onClick={() => setPin(pin.slice(0,-1))}
              style={{ padding: "18px", background: "#f0f0f0", border: "none", borderRadius: "12px", fontSize: "20px", cursor: "pointer" }}>⌫</button>
            <button onClick={() => handlePin("0")}
              style={{ padding: "18px", background: "white", border: "none", borderRadius: "12px", fontSize: "20px", fontWeight: "600", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>0</button>
            <button onClick={() => { setSelected(null); setPin(""); setError(""); }}
              style={{ padding: "18px", background: "#f0f0f0", border: "none", borderRadius: "12px", fontSize: "20px", cursor: "pointer" }}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ textAlign: "center", width: "100%", maxWidth: "500px", padding: "20px" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "28px", fontWeight: "800" }}>Simple POS</h1>
        <p style={{ margin: "0 0 40px", color: "#637381", fontSize: "15px" }}>Who are you?</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" }}>
          {staff.map((member) => (
            <div key={member.id} onClick={() => setSelected(member)}
              style={{ width: "120px", padding: "20px 16px", background: member.role === "admin" ? "#fff5f5" : "white", borderRadius: "16px", cursor: "pointer", boxShadow: member.role === "admin" ? "0 4px 16px rgba(204,7,30,0.2)" : "0 2px 8px rgba(0,0,0,0.08)", textAlign: "center", border: member.role === "admin" ? "2px solid #cc071e" : "1.5px solid transparent" }}
              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "700", fontSize: "20px", margin: "0 auto 10px" }}>
                {member.name.charAt(0).toUpperCase()}
              </div>
              <p style={{ margin: "0 0 6px", fontWeight: "700", fontSize: "16px" }}>{member.name}</p>
              <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{member.role}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FirstTimeSetup({ onComplete }) {
  const fetcher = useFetcher();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSetup = () => {
    if (!name) { setError("Please enter your name"); return; }
    if (pin.length !== 4 || !/^\d+$/.test(pin)) { setError("PIN must be exactly 4 digits"); return; }
    
    const adminMember = {
      id: Date.now().toString(),
      name,
      pin,
      role: "admin",
    };

    setSaving(true);
    const formData = new FormData();
    formData.append("intent", "setupAdmin");
    formData.append("adminMember", JSON.stringify(adminMember));
    fetcher.submit(formData, { method: "POST" });

    setTimeout(() => {
      onComplete(adminMember);
    }, 500);
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ width: "400px", background: "white", borderRadius: "20px", padding: "40px", boxShadow: "0 4px 24px rgba(0,0,0,0.1)" }}>
        
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
          <div style={{ width: "36px", height: "36px", background: "#1a1a1a", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: "18px", fontWeight: "800" }}>S</span>
          </div>
          <span style={{ fontSize: "18px", fontWeight: "800" }}>Simple POS</span>
        </div>

        <h2 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: "700" }}>Welcome! 👋</h2>
        <p style={{ margin: "0 0 28px", color: "#637381", fontSize: "14px" }}>Let's set you up as the store admin. You can add more staff later in Settings.</p>

        <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Your Name</label>
        <input type="text" placeholder="e.g. Saloni Shah" value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "15px", marginBottom: "20px", boxSizing: "border-box", outline: "none" }}
        />

        <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Set Your 4-Digit PIN</label>
        <input type="password" placeholder="e.g. 1234" value={pin} maxLength={4}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "15px", marginBottom: "8px", boxSizing: "border-box", outline: "none", letterSpacing: "8px" }}
        />

        {error && <p style={{ color: "#e53e3e", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
        {!error && <div style={{ height: "29px" }} />}

        <button onClick={handleSetup} disabled={saving || !name || pin.length !== 4}
          style={{ width: "100%", padding: "15px", background: saving || !name || pin.length !== 4 ? "#ccc" : "#1a1a1a", color: "white", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: saving || !name || pin.length !== 4 ? "not-allowed" : "pointer" }}>
          {saving ? "Setting up..." : "Set Up & Continue →"}
        </button>

        <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: "12px", color: "#aaa" }}>You'll be logged in as Admin · Add more staff in Settings</p>
      </div>
    </div>
  );
}