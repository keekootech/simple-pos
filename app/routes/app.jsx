import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
 const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("spos_staff");
      if (s) {
        const staff = JSON.parse(s);
        setIsAdmin(staff.role === "admin");
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    const handler = (e) => {
      setIsAdmin(e.detail.role === "admin");
    };
    window.addEventListener('staffLogin', handler);
    return () => window.removeEventListener('staffLogin', handler);
  }, []);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">🛍️ POS</s-link>
        {isAdmin && <s-link href="/app/reports?role=admin">📊 Reports</s-link>}
        {isAdmin && <s-link href="/app/settings?role=admin">⚙️ Settings</s-link>}
        <s-link href="/app/privacy">Privacy Policy</s-link>

      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};