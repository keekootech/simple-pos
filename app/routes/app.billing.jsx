import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return redirect("/app/settings?role=admin");
};

export const action = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan");

  if (plan === PLANS.STARTER || plan === PLANS.PRO) {
    await billing.request({
      plan,
      isTest: false,
      returnUrl: `https://admin.shopify.com/store/${session.shop.replace(".myshopify.com", "")}/apps/simple-pos-1`,
    });
  }

  return redirect("/app/settings?role=admin");
};

export default function Billing() {
  return null;
}