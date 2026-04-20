const partnerHelpers = window.SSMAuditPartners || null;
const partnerLogo = document.getElementById("partner-logo");
const partnerEyebrow = document.getElementById("partner-eyebrow");
const offerSubhead = document.getElementById("offer-subhead");
const offerUrlInput = document.getElementById("offer-url");
const offerMessage = document.getElementById("offer-message");
const offerPrimaryCta = document.getElementById("offer-cta");
const offerFinalCta = document.getElementById("offer-final-cta");
const DEFAULT_OFFER_SUBHEAD = offerSubhead?.textContent?.trim() || "";

const offerContext = {
  url: ""
};

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(value) {
  try {
    const candidate = new URL(normalizeUrl(value));
    return Boolean(candidate.hostname);
  } catch {
    return false;
  }
}

function hostnameToName(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return hostname
      .split(".")[0]
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function setMessage(message, type = "error") {
  if (!offerMessage) return;
  offerMessage.textContent = message;
  offerMessage.classList.toggle("is-success", type === "success");
}

function setLoadingState(isLoading) {
  [offerPrimaryCta, offerFinalCta].forEach((button) => {
    if (!button) return;
    button.disabled = isLoading;
  });
}

function readJsonSafely(response) {
  return response.text().then((text) => {
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("The checkout service returned an invalid response.");
    }
  });
}

function applyPartnerBranding() {
  if (!partnerHelpers || typeof partnerHelpers.applyPartnerBranding !== "function") {
    return null;
  }

  return partnerHelpers.applyPartnerBranding({
    logoElement: partnerLogo,
    eyebrowElement: partnerEyebrow,
    subheadElement: offerSubhead,
    defaultSubhead: DEFAULT_OFFER_SUBHEAD,
    eyebrowKey: "offerEyebrowText",
    subheadKey: "offerSubhead"
  });
}

async function beginCheckout() {
  setMessage("");

  const url = normalizeUrl(offerUrlInput?.value || offerContext.url);
  if (!url || !isValidUrl(url)) {
    setMessage("Enter your website to continue.");
    offerUrlInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    offerUrlInput?.focus();
    return;
  }

  offerContext.url = url;
  setLoadingState(true);

  try {
    const partner = partnerHelpers?.getPartnerConfig?.() || null;
    const response = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        businessName: hostnameToName(url),
        partner: partner?.key || "",
        sourcePage: "ai-visibility-audit-offer"
      })
    });

    const data = await readJsonSafely(response);
    if (!response.ok || !data.url) {
      throw new Error(data.error || "Unable to start checkout.");
    }

    if (window.top && window.top !== window.self) {
      window.top.location.href = data.url;
    } else {
      window.location.href = data.url;
    }
  } catch (error) {
    setMessage(error.message || "Unable to start checkout.");
    setLoadingState(false);
  }
}

function attachCta(button) {
  if (!button) return;
  button.addEventListener("click", beginCheckout);
}

applyPartnerBranding();
attachCta(offerPrimaryCta);
attachCta(offerFinalCta);
