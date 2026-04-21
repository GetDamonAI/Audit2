const partnerHelpers = window.SSMAuditPartners || null;
const partnerLogo = document.getElementById("partner-logo");
const offerCoBrandStack = document.getElementById("offer-co-brand-stack");
const offerCoBrandPartner = document.getElementById("offer-co-brand-partner");
const offerPartnerAudience = document.getElementById("offer-partner-audience");
const offerPartnerBenefit = document.getElementById("offer-partner-benefit");
const partnerEyebrow = document.getElementById("partner-eyebrow");
const offerSubhead = document.getElementById("offer-subhead");
const offerPriceLabel = document.getElementById("offer-price-label");
const offerFinalPriceLabel = document.getElementById("offer-final-price-label");
const offerMessage = document.getElementById("offer-message");
const offerPrimaryCta = document.getElementById("offer-cta");
const offerFinalCta = document.getElementById("offer-final-cta");
const damonPhoto = document.querySelector(".offer-damon-photo");
const damonPhotoSlot = document.querySelector(".offer-damon-photo-slot");
const CHECKOUT_PLACEHOLDER_URL = "https://pending-site.example";

const DEFAULT_OFFER_SUBHEAD = offerSubhead?.textContent?.trim() || "";
const DEFAULT_OFFER_PRICE_LABEL = offerPriceLabel?.textContent?.trim() || "";

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
    if (offerCoBrandStack) {
      offerCoBrandStack.hidden = true;
    }
    if (offerPartnerAudience) {
      offerPartnerAudience.hidden = true;
      offerPartnerAudience.textContent = "";
    }
    if (offerPartnerBenefit) {
      offerPartnerBenefit.hidden = true;
      offerPartnerBenefit.textContent = "";
    }
    return null;
  }

  const partner = partnerHelpers.applyPartnerBranding({
    logoElement: partnerLogo,
    eyebrowElement: partnerEyebrow,
    subheadElement: offerSubhead,
    defaultSubhead: DEFAULT_OFFER_SUBHEAD,
    eyebrowKey: "offerEyebrowText",
    subheadKey: "offerSubhead"
  });

  if (offerPriceLabel) {
    offerPriceLabel.textContent = partner?.offerPriceLabel || DEFAULT_OFFER_PRICE_LABEL;
  }

  if (offerFinalPriceLabel) {
    offerFinalPriceLabel.textContent = partner?.offerPriceLabel || DEFAULT_OFFER_PRICE_LABEL;
  }

  if (offerCoBrandStack && offerCoBrandPartner) {
    offerCoBrandPartner.textContent = partner?.name || "";
    offerCoBrandStack.hidden = !partner?.name;
  }

  if (offerPartnerAudience) {
    offerPartnerAudience.textContent = partner?.audienceLine || "";
    offerPartnerAudience.hidden = !partner?.audienceLine;
  }

  if (offerPartnerBenefit) {
    offerPartnerBenefit.textContent = partner?.benefitLine || "";
    offerPartnerBenefit.hidden = !partner?.benefitLine;
  }

  return partner;
}

function setupDamonPhoto() {
  if (!damonPhoto || !damonPhotoSlot) return;

  damonPhoto.addEventListener("load", () => {
    damonPhoto.classList.remove("is-missing");
    damonPhotoSlot.classList.add("has-image");
  });

  damonPhoto.addEventListener("error", () => {
    damonPhoto.classList.add("is-missing");
    damonPhotoSlot.classList.remove("has-image");
  });

  if (damonPhoto.complete && damonPhoto.naturalWidth > 0) {
    damonPhotoSlot.classList.add("has-image");
  } else if (damonPhoto.complete && damonPhoto.naturalWidth === 0) {
    damonPhoto.classList.add("is-missing");
    damonPhotoSlot.classList.remove("has-image");
  }
}

async function beginCheckout() {
  setMessage("");
  const url = CHECKOUT_PLACEHOLDER_URL;
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
        businessName: "",
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
setupDamonPhoto();
attachCta(offerPrimaryCta);
attachCta(offerFinalCta);
