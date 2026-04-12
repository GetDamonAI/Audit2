const {
  respond,
  stripeRequest,
  withSessionPlaceholder
} = require("./_paid-utils");

exports.handler = async (event) => {
  try {
    const input = JSON.parse(event.body || "{}");
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID || "price_1TLHXdDsECZ5fUW1CUp1KCn7";
    const successUrl = process.env.STRIPE_SUCCESS_URL;
    const cancelUrl = process.env.STRIPE_CANCEL_URL;

    if (!secretKey || !priceId || !successUrl || !cancelUrl) {
      return respond(500, { error: "Missing Stripe configuration." });
    }

    const url = String(input.url || "").trim();
    if (!url) {
      return respond(400, { error: "Missing website URL." });
    }

    const businessName = String(input.businessName || "").trim();
    const industry = String(input.industry || "").trim();
    const service = String(input.service || "").trim();
    const quickAuditScore = String(input.quickAuditScore ?? "").trim();
    const aiVerdict = String(input.aiVerdict || "").trim();
    const summary = String(input.summary || "").trim();
    const email = String(input.email || "").trim();

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", withSessionPlaceholder(successUrl));
    params.set("cancel_url", cancelUrl);
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("metadata[url]", url);
    params.set("metadata[businessName]", businessName);
    params.set("metadata[industry]", industry);
    params.set("metadata[service]", service);
    params.set("metadata[quickAuditScore]", quickAuditScore);
    params.set("metadata[aiVerdict]", aiVerdict);
    params.set("metadata[summary]", summary);
    if (email) {
      params.set("customer_email", email);
      params.set("metadata[email]", email);
    }
    params.set("allow_promotion_codes", "true");
    params.set("billing_address_collection", "auto");

    const stripeResponse = await stripeRequest({
      secretKey,
      path: "checkout/sessions",
      method: "POST",
      body: params
    });

    if (!stripeResponse.ok) {
      return respond(500, {
        error: stripeResponse.json?.error?.message || "Stripe checkout session creation failed.",
        stripe: stripeResponse.json
      });
    }

    return respond(200, {
      success: true,
      url: stripeResponse.json.url,
      sessionId: stripeResponse.json.id
    });
  } catch (error) {
    return respond(500, { error: error.message || "Stripe checkout session creation failed." });
  }
};
