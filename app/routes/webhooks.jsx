import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      return new Response(null, { status: 200 });
    case "APP_SCOPES_UPDATE":
      return new Response(null, { status: 200 });
    case "CUSTOMERS_DATA_REQUEST":
      return new Response(null, { status: 200 });
    case "CUSTOMERS_REDACT":
      return new Response(null, { status: 200 });
    case "SHOP_REDACT":
      return new Response(null, { status: 200 });
    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }
};