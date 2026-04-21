const partnerHelpers = window.SSMAuditPartners || null;
const partnerLogo = document.getElementById("partner-logo");
const offerBrandLockup = document.getElementById("offer-brand-lockup");
const offerCoBrandStack = document.getElementById("offer-co-brand-stack");
const offerCoBrandPartner = document.getElementById("offer-co-brand-partner");
const partnerEyebrow = document.getElementById("partner-eyebrow");
const offerSubhead = document.getElementById("offer-subhead");
const offerPriceLabel = document.getElementById("offer-price-label");
const offerFinalKicker = document.getElementById("offer-final-kicker");
const offerFinalPriceLabel = document.getElementById("offer-final-price-label");
const offerMessage = document.getElementById("offer-message");
const offerPrimaryCta = document.getElementById("offer-cta");
const offerFinalCta = document.getElementById("offer-final-cta");
const damonPhoto = document.querySelector(".offer-damon-photo");
const damonPhotoSlot = document.querySelector(".offer-damon-photo-slot");
const CHECKOUT_PLACEHOLDER_URL = "https://pending-site.example";

const DEFAULT_OFFER_SUBHEAD = offerSubhead?.textContent?.trim() || "";
const DEFAULT_OFFER_PRICE_LABEL = offerPriceLabel?.textContent?.trim() || "";
const DEFAULT_HERO_PRICE_LABEL = "Exclusive member pricing";
const DEFAULT_ACCENT_COLOR = "#8b3e2f";
const DEFAULT_ACCENT_SOFT = "rgba(139, 62, 47, 0.07)";
const DEFAULT_LOGO_HEIGHT = "82px";
const DEFAULT_LOGO_HEIGHT_TABLET = "90px";
const DEFAULT_LOGO_HEIGHT_DESKTOP = "96px";
const DEFAULT_LOGO_SCALE = "1";
const DEFAULT_LOGO_SCALE_TABLET = "1";
const DEFAULT_LOGO_SCALE_DESKTOP = "1";
const DEFAULT_LOGO_GAP_AFTER = "0px";

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
    document.documentElement.style.setProperty("--offer-accent", DEFAULT_ACCENT_COLOR);
    document.documentElement.style.setProperty("--offer-accent-soft", DEFAULT_ACCENT_SOFT);
    if (offerBrandLockup) {
      offerBrandLockup.hidden = true;
    }
    if (offerCoBrandStack) {
      offerCoBrandStack.hidden = true;
    }
    return null;
  }

  const partner = partnerHelpers.applyPartnerBranding({
    logoElement: partnerLogo,
    eyebrowElement: partnerEyebrow,
    subheadElement: offerSubhead,
    defaultSubhead: DEFAULT_OFFER_SUBHEAD,
    eyebrowKey: "eyebrow",
    subheadKey: "offerSubhead"
  });

  if (offerPriceLabel) {
    offerPriceLabel.textContent = partner ? DEFAULT_HERO_PRICE_LABEL : DEFAULT_OFFER_PRICE_LABEL;
  }

  document.documentElement.style.setProperty(
    "--offer-accent",
    partner?.accentColor || DEFAULT_ACCENT_COLOR
  );
  document.documentElement.style.setProperty(
    "--offer-accent-soft",
    partner?.accentSoft || DEFAULT_ACCENT_SOFT
  );
  document.documentElement.style.setProperty(
    "--partner-logo-height",
    partner?.logoHeight || DEFAULT_LOGO_HEIGHT
  );
  document.documentElement.style.setProperty(
    "--partner-logo-height-tablet",
    partner?.logoHeightTablet || DEFAULT_LOGO_HEIGHT_TABLET
  );
  document.documentElement.style.setProperty(
    "--partner-logo-height-desktop",
    partner?.logoHeightDesktop || DEFAULT_LOGO_HEIGHT_DESKTOP
  );
  document.documentElement.style.setProperty(
    "--partner-logo-scale",
    String(partner?.logoScale || DEFAULT_LOGO_SCALE)
  );
  document.documentElement.style.setProperty(
    "--partner-logo-scale-tablet",
    String(partner?.logoScaleTablet || DEFAULT_LOGO_SCALE_TABLET)
  );
  document.documentElement.style.setProperty(
    "--partner-logo-scale-desktop",
    String(partner?.logoScaleDesktop || DEFAULT_LOGO_SCALE_DESKTOP)
  );
  document.documentElement.style.setProperty(
    "--partner-logo-gap-after",
    partner?.logoGapAfter || DEFAULT_LOGO_GAP_AFTER
  );

  if (offerFinalKicker) {
    offerFinalKicker.textContent = partner?.offerPriceLabel || DEFAULT_OFFER_PRICE_LABEL;
  }

  if (offerFinalPriceLabel) {
    offerFinalPriceLabel.textContent = partner?.offerPriceLabel || DEFAULT_OFFER_PRICE_LABEL;
  }

  if (offerBrandLockup) {
    offerBrandLockup.hidden = !partner?.name;
  }

  if (offerCoBrandStack && offerCoBrandPartner) {
    offerCoBrandPartner.textContent = partner?.lockupName || partner?.name || "";
    offerCoBrandStack.hidden = !partner?.name;
  }

  if (partnerEyebrow) {
    if (partner?.eyebrow) {
      partnerEyebrow.textContent = partner.eyebrow;
      partnerEyebrow.hidden = false;
    } else {
      partnerEyebrow.hidden = true;
      partnerEyebrow.textContent = "";
    }
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
