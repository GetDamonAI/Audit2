(function () {
  const PARTNER_HOST_SUFFIX = "semanticsearchmarketing.com";
  const PARTNER_CONFIG = {
    telus: {
      name: "TELUS",
      logo: "/partners/telus.png",
      eyebrow: "Exclusive Offer For TELUS Business Customers",
      lockupName: "TELUS",
      logoHeight: "108px",
      logoHeightTablet: "118px",
      logoHeightDesktop: "126px",
      subhead: "",
      offerPriceLabel: "Exclusive TELUS Business Customer Offer",
      offerSubhead: "",
      accentColor: "#7966a6",
      accentSoft: "rgba(121, 102, 166, 0.08)"
    },
    bctech: {
      name: "BC Tech",
      logo: "/partners/bctech.png",
      eyebrow: "Exclusive Offer For BC Tech Members",
      lockupName: "BC Tech",
      logoHeight: "88px",
      logoHeightTablet: "96px",
      logoHeightDesktop: "102px",
      subhead: "",
      offerPriceLabel: "Exclusive BC Tech Member Offer",
      offerSubhead: "",
      accentColor: "#9c8450",
      accentSoft: "rgba(156, 132, 80, 0.08)"
    },
    smallbusinessbc: {
      name: "Small Business BC",
      logo: "/partners/smallbusiness.png",
      eyebrow: "Exclusive Offer For Small Business BC Members",
      lockupName: "Small Business BC",
      logoHeight: "92px",
      logoHeightTablet: "100px",
      logoHeightDesktop: "108px",
      subhead: "",
      offerPriceLabel: "Exclusive Small Business BC Member Offer",
      offerSubhead: "",
      accentColor: "#4f8782",
      accentSoft: "rgba(79, 135, 130, 0.08)"
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
    const eyebrowKey = options.eyebrowKey || "eyebrow";
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
      const defaultOfferEyebrow = partner.eyebrow || "";
      const eyebrowText = partner[eyebrowKey] || defaultOfferEyebrow;
      eyebrowElement.textContent = eyebrowText;
      eyebrowElement.hidden = !eyebrowText;
    }

    if (subheadElement) {
      subheadElement.textContent = partner[subheadKey] || defaultSubhead;
    }

    if (logoElement && (partner.logo || partner.logoPath)) {
      logoElement.onload = () => {
        logoElement.style.display = "block";
        if (typeof options.onUpdate === "function") {
          options.onUpdate();
        }
      };
      logoElement.onerror = () => {
        logoElement.style.display = "none";
        logoElement.removeAttribute("src");
        logoElement.alt = "";
      };
      logoElement.src = partner.logo || partner.logoPath;
      logoElement.alt = partner.name ? `${partner.name} logo` : "Partner logo";
    } else if (logoElement) {
      logoElement.style.display = "none";
      logoElement.removeAttribute("src");
      logoElement.alt = "";
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
