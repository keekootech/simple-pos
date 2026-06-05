import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`
    query {
      appInstallation {
        metafields(first: 20, namespace: "simple_pos") {
          edges { node { key value } }
        }
      }
      shop { name }
    }
  `);

  const data = await res.json();
  const metafields = data.data.appInstallation.metafields.edges.reduce((acc, e) => {
    acc[e.node.key] = e.node.value;
    return acc;
  }, {});

  const staff = metafields.staff_list ? JSON.parse(metafields.staff_list) : [];
  const shopName = data.data.shop.name;

  return { staff, shopName };
};

export default function Login() {
  const { staff, shopName } = useLoaderData();
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loggedInStaff, setLoggedInStaff] = useState(null);

  const handlePinPress = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");
      if (newPin.length === 4) {
        setTimeout(() => verifyPin(newPin), 100);
      }
    }
  };

  const verifyPin = (enteredPin) => {
    if (enteredPin === selectedStaff.pin) {
      setLoggedIn(true);
      setLoggedInStaff(selectedStaff);
      // Store in sessionStorage so POS knows who's logged in
sessionStorage.setItem("pos_staff", JSON.stringify(selectedStaff));
      sessionStorage.setItem("pos_staff_date", new Date().toDateString());
      // Redirect to POS after short delay
      setTimeout(() => {
        window.location.href = "/app";
      }, 1500);
    } else {
      setError("Wrong PIN. Try again.");
      setPin("");
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError("");
  };

  // Success screen
  if (loggedIn) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "80px", height: "80px", background: "#e6f4ea", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "36px" }}>✅</div>
          <h2 style={{ margin: "0 0 8px", fontSize: "24px" }}>Welcome, {loggedInStaff.name}!</h2>
          <p style={{ color: "#637381" }}>Opening POS...</p>
        </div>
      </div>
    );
  }

  // PIN entry screen
  if (selectedStaff) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
        <div style={{ textAlign: "center", width: "320px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "700", fontSize: "24px", margin: "0 auto 12px" }}>
            {selectedStaff.name.charAt(0).toUpperCase()}
          </div>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "700" }}>{selectedStaff.name}</h2>
          <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#637381" }}>Enter your 4-digit PIN</p>

          {/* PIN dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "8px" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: "16px", height: "16px", borderRadius: "50%", background: pin.length > i ? "#1a1a1a" : "#ddd", transition: "background 0.15s" }} />
            ))}
          </div>

          {error && <p style={{ color: "#e53e3e", fontSize: "13px", marginBottom: "8px" }}>{error}</p>}
          {!error && <div style={{ height: "21px", marginBottom: "8px" }} />}

          {/* Number pad */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
            {[1,2,3,4,5,6,7,8,9].map((n) => (
              <button key={n} onClick={() => handlePinPress(String(n))} style={pinBtnStyle}>{n}</button>
            ))}
            <button onClick={handleDelete} style={{ ...pinBtnStyle, background: "#f0f0f0", color: "#637381" }}>⌫</button>
            <button onClick={() => handlePinPress("0")} style={pinBtnStyle}>0</button>
            <button onClick={() => { setSelectedStaff(null); setPin(""); setError(""); }} style={{ ...pinBtnStyle, background: "#f0f0f0", color: "#637381" }}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  // Staff selection screen
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ textAlign: "center", width: "100%", maxWidth: "500px", padding: "20px" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "28px", fontWeight: "800" }}>Simple POS</h1>
        <p style={{ margin: "0 0 40px", color: "#637381", fontSize: "15px" }}>{shopName} · Who are you?</p>

        {staff.length === 0 ? (
          <div>
            <p style={{ color: "#999", marginBottom: "16px" }}>No staff added yet.</p>
            <p style={{ color: "#637381", fontSize: "13px" }}>Go to Settings → Staff to add team members.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" }}>
            {staff.map((member) => (
              <div key={member.id} onClick={() => setSelectedStaff(member)}
                style={{ width: "120px", padding: "20px 16px", background: "white", borderRadius: "16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", transition: "transform 0.1s", textAlign: "center" }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "700", fontSize: "20px", margin: "0 auto 10px" }}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <p style={{ margin: "0 0 4px", fontWeight: "600", fontSize: "14px" }}>{member.name}</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{member.role}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const pinBtnStyle = {
  padding: "18px", background: "white", border: "none", borderRadius: "12px",
  fontSize: "20px", fontWeight: "600", cursor: "pointer",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)", transition: "transform 0.1s",
};