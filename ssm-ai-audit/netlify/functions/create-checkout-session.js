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
    const stripeMode = String(secretKey || "").startsWith("sk_live_")
      ? "live"
      : String(secretKey || "").startsWith("sk_test_")
        ? "test"
        : "unknown";

    if (!secretKey || !priceId || !successUrl || !cancelUrl) {
      return respond(500, { error: "Missing Stripe configuration." });
    }

    let normalizedSuccessUrl;
    let normalizedCancelUrl;

    try {
      normalizedSuccessUrl = new URL(withSessionPlaceholder(successUrl)).toString();
      normalizedCancelUrl = new URL(cancelUrl).toString();
    } catch (error) {
      return respond(500, {
        error: "Stripe success or cancel URL is not a fully qualified absolute URL.",
        details: error.message
      });
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
    params.set("success_url", normalizedSuccessUrl);
    params.set("cancel_url", normalizedCancelUrl);
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

    const debugPayloadBase = {
      priceId: process.env.STRIPE_PRICE_ID || "price_1TLHXdDsECZ5fUW1CUp1KCn7",
      successUrl: process.env.STRIPE_SUCCESS_URL,
      cancelUrl: process.env.STRIPE_CANCEL_URL,
      stripeMode
    };

    if (!stripeResponse.ok) {
      console.log(
        JSON.stringify({
          type: "stripe-checkout-session-error",
          ...debugPayloadBase,
          mode: "payment",
          stripeError: stripeResponse.json?.error || stripeResponse.json
        })
      );

      return respond(500, {
        error: stripeResponse.json?.error?.message || "Stripe checkout session creation failed.",
        stripe: stripeResponse.json
      });
    }

    const sessionId = stripeResponse.json.id;
    const sessionUrl = stripeResponse.json.url;
    const sessionMode = stripeResponse.json.mode;
    const checkoutUrlIsAbsolute = Boolean(sessionUrl && /^https?:\/\//i.test(sessionUrl));
    const debugPayload = {
      url: sessionUrl,
      sessionId,
      priceId: process.env.STRIPE_PRICE_ID || "price_1TLHXdDsECZ5fUW1CUp1KCn7",
      successUrl: process.env.STRIPE_SUCCESS_URL,
      cancelUrl: process.env.STRIPE_CANCEL_URL,
      stripeMode,
      livemode: stripeResponse.json.livemode,
      mode: sessionMode,
      checkoutUrlIsAbsolute
    };

    console.log(
      JSON.stringify({
        type: "stripe-checkout-session-created",
        ...debugPayload
      })
    );

    return respond(200, {
      success: true,
      url: sessionUrl,
      sessionId,
      debug: debugPayload
    });
  } catch (error) {
    return respond(500, { error: error.message || "Stripe checkout session creation failed." });
  }
};
