(function () {
  const PARTNER_HOST_SUFFIX = "semanticsearchmarketing.com";
  const PARTNER_CONFIG = {
    telus: {
      name: "TELUS",
      logoPath: "/partner-logos/telus.svg",
      eyebrowText: "In partnership with TELUS",
      subhead: "",
      offerPriceLabel: "Limited Partner Offer",
      offerSubhead: ""
    },
    bctech: {
      name: "BC Tech",
      logoPath: "",
      eyebrowText: "In partnership with BC Tech",
      subhead: "",
      offerPriceLabel: "Limited Partner Offer",
      offerSubhead: ""
    }
  };

  function getPartnerKeyFromLocation(locationObject) {
    const locationRef = locationObject || window.location;
    const params = new URLSearchParams(locationRef.search);
    const queryPartner = (params.get("partner") || "").trim().toLowerCase();
    if (queryPartner) {
      return queryPartner;
    }

    const hostname = String(locationRef.hostname || "").toLowerCase();
    if (
      hostname.endsWith(`.${PARTNER_HOST_SUFFIX}`) &&
      hostname !== PARTNER_HOST_SUFFIX
    ) {
      const subdomain = hostname.slice(
        0,
        -1 * (`.${PARTNER_HOST_SUFFIX}`).length
      );
      return subdomain.split(".").filter(Boolean)[0] || "";
    }

    return "";
  }

  function getPartnerConfig(locationObject) {
    const partnerKey = getPartnerKeyFromLocation(locationObject);
    if (!partnerKey || !PARTNER_CONFIG[partnerKey]) {
      return null;
    }

    return {
      key: partnerKey,
      ...PARTNER_CONFIG[partnerKey]
    };
  }

  function applyPartnerBranding(options = {}) {
    const partner = getPartnerConfig(options.locationObject);
    const logoElement = options.logoElement || null;
    const eyebrowElement = options.eyebrowElement || null;
    const subheadElement = options.subheadElement || null;
    const defaultSubhead = options.defaultSubhead || "";
    const eyebrowKey = options.eyebrowKey || "eyebrowText";
    const subheadKey = options.subheadKey || "subhead";

    if (!partner) {
      if (logoElement) {
        logoElement.style.display = "none";
        logoElement.removeAttribute("src");
        logoElement.alt = "";
      }

      if (eyebrowElement) {
        eyebrowElement.hidden = true;
        eyebrowElement.textContent = "";
      }

      if (subheadElement) {
        subheadElement.textContent = defaultSubhead;
      }

      return null;
    }

    if (eyebrowElement) {
      const defaultOfferEyebrow =
        eyebrowKey === "offerEyebrowText" && partner.name
          ? `Exclusive Offer for ${partner.name}`
          : "";
      const eyebrowText = partner[eyebrowKey] || defaultOfferEyebrow;
      eyebrowElement.textContent = eyebrowText;
      eyebrowElement.hidden = !eyebrowText;
    }

    if (subheadElement) {
      subheadElement.textContent = partner[subheadKey] || defaultSubhead;
    }

    if (logoElement && partner.logoPath) {
      logoElement.onload = () => {
        logoElement.style.display = "block";
        if (typeof options.onUpdate === "function") {
          options.onUpdate();
        }
      };
      logoElement.onerror = () => {
        logoElement.style.display = "none";
      };
      logoElement.src = partner.logoPath;
      logoElement.alt = partner.name ? `${partner.name} logo` : "Partner logo";
    } else if (logoElement) {
      logoElement.style.display = "none";
    }

    return partner;
  }

  window.SSMAuditPartners = {
    PARTNER_HOST_SUFFIX,
    PARTNER_CONFIG,
    applyPartnerBranding,
    getPartnerConfig,
    getPartnerKeyFromLocation
  };
})();
