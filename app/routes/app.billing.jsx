import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (plan === PLANS.STARTER || plan === PLANS.PRO) {
    const response = await billing.request({
      plan,
      isTest: true,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
    });
    return response;
  }

  return redirect("/app/settings?role=admin");
};

export default function Billing() {
  return null;
}