import { redirect } from "react-router";
import { authenticate, PLANS } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return redirect("/app/settings?role=admin");
};

export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan");

  if (plan === PLANS.STARTER || plan === PLANS.PRO) {
    await billing.request({
      plan,
      isTest: true,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
    });
  }

  return redirect("/app/settings?role=admin");
};

export default function Billing() {
  return null;
}