const DEFAULT_MAX_PAGES = 20;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_MAX_SERPER_QUERIES = 8;
const KNOWN_SCHEMA_TYPES = [
  "Organization",
  "LocalBusiness",
  "FAQPage",
  "Product",
  "Service",
  "Article",
  "Review",
  "BreadcrumbList"
];

async function collectSiteIntelligence({
  url,
  businessName = "",
  industry = "",
  service = "",
  competitors = "",
  targetLocations = "",
  aiQuestionTargeting = "",
  desiredVisibility = "",
  serperKey = "",
  maxPages = DEFAULT_MAX_PAGES,
  maxSerperQueries = DEFAULT_MAX_SERPER_QUERIES,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS
}) {
  const normalizedUrl = normalizeUrl(url);
  const hostname = getHostname(normalizedUrl);
  const crawl = await crawlSite({
    startUrl: normalizedUrl,
    maxPages,
    hostname,
    fetchTimeoutMs
  });

  const homepage = crawl.pages[0] || createEmptyPageSummary(normalizedUrl);
  const htmlChecks = getHtmlChecks(homepage.rawHtml || "");
  const schema = summarizeSchema({
    crawl,
    service,
    industry
  });
  const serper = serperKey
    ? await getExpandedSerperSignals({
        hostname,
        businessName,
        industry,
        service,
        competitors,
        targetLocations,
        aiQuestionTargeting,
        desiredVisibility,
        serperKey,
        maxQueries: maxSerperQueries
      })
    : createEmptySerperSignals();

  return {
    crawl,
    homepage,
    htmlChecks,
    schema,
    contentDepth: crawl.contentDepth,
    serper
  };
}

async function crawlSite({
  startUrl,
  maxPages = DEFAULT_MAX_PAGES,
  hostname,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS
}) {
  const queue = [startUrl];
  const visited = new Set();
  const pages = [];

  while (queue.length && pages.length < maxPages) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const html = await fetchHtml(currentUrl, fetchTimeoutMs);
    const page = summarizePage(currentUrl, html);
    pages.push(page);

    const linkObjects = extractInternalLinks({
      pageUrl: currentUrl,
      html,
      hostname: hostname || getHostname(startUrl)
    });

    page.internalLinkCount = linkObjects.length;

    linkObjects
      .sort((a, b) => b.priority - a.priority)
      .forEach((linkObject) => {
        const link = linkObject.url;
        if (!visited.has(link) && !queue.includes(link) && pages.length + queue.length < maxPages * 3) {
          queue.push(link);
        }
      });
  }

  return summarizeCrawl(pages, maxPages);
}

function summarizeCrawl(pages, maxPages) {
  const safePages = Array.isArray(pages) ? pages : [];
  const pagesWithSchema = safePages.filter((page) => page.hasSchema);
  const schemaTypes = Array.from(new Set(safePages.flatMap((page) => page.schemaTypes || []).filter(Boolean)));
  const totalWords = safePages.reduce((sum, page) => sum + (page.wordCount || 0), 0);
  const averageWordCount = safePages.length ? Math.round(totalWords / safePages.length) : 0;
  const pagesWithQuestions = safePages.filter((page) => page.questionCount > 0 || page.questionStyleHeadings.length > 0).length;
  const pagesWithStrongHeadings = safePages.filter((page) => page.headingScore >= 2).length;
  const servicePages = safePages.filter((page) => page.pageType === "service");
  const faqPages = safePages.filter((page) => page.pageType === "faq");
  const blogPages = safePages.filter((page) => page.pageType === "blog");
  const contentDepth = scoreContentDepth({
    pages: safePages,
    averageWordCount,
    pagesWithQuestions,
    pagesWithStrongHeadings,
    servicePages,
    faqPages,
    blogPages
  });

  return {
    pages: safePages,
    summary: {
      pagesCrawled: safePages.length,
      crawlLimit: maxPages,
      averageWordCount,
      pagesWithQuestions,
      pagesWithStrongHeadings,
      pagesWithSchema: pagesWithSchema.length,
      servicePages: servicePages.length,
      blogPages: blogPages.length,
      faqPages: faqPages.length
    },
    schema: {
      hasSchema: pagesWithSchema.length > 0,
      schemaTypes,
      pagesWithSchema: pagesWithSchema.length
    },
    contentDepth
  };
}

function summarizePage(url, html) {
  if (!html) {
    return createEmptyPageSummary(url);
  }

  const title = extractTagText(html, "title");
  const metaDescription = extractMetaDescription(html);
  const headings = {
    h1: extractHeadingTexts(html, "h1"),
    h2: extractHeadingTexts(html, "h2"),
    h3: extractHeadingTexts(html, "h3")
  };
  const text = stripHtml(html);
  const wordCount = countWords(text);
  const schemaScripts = extractJsonLdScripts(html);
  const schemaTypes = Array.from(new Set(schemaScripts.flatMap((item) => item.types || []).filter(Boolean)));
  const questionStyleHeadings = [...headings.h1, ...headings.h2, ...headings.h3].filter(isQuestionStyleHeading);
  const questionCount = countQuestionSignals(text) + questionStyleHeadings.length;
  const headingScore = Number(Boolean(headings.h1.length)) + Number(Boolean(headings.h2.length)) + Number(Boolean(headings.h3.length));
  const pageType = classifyPageType({ url, title, headings });

  return {
    url,
    path: getPathname(url),
    title,
    metaDescription,
    headings,
    h1: headings.h1[0] || "",
    wordCount,
    internalLinkCount: 0,
    questionCount,
    questionStyleHeadings,
    headingScore,
    pageType,
    hasSchema: schemaTypes.length > 0,
    schemaTypes,
    schemaScripts,
    rawHtml: html
  };
}

function createEmptyPageSummary(url) {
  return {
    url,
    path: getPathname(url),
    title: "",
    metaDescription: "",
    headings: { h1: [], h2: [], h3: [] },
    h1: "",
    wordCount: 0,
    internalLinkCount: 0,
    questionCount: 0,
    questionStyleHeadings: [],
    headingScore: 0,
    pageType: "other",
    hasSchema: false,
    schemaTypes: [],
    schemaScripts: [],
    rawHtml: ""
  };
}

function scoreContentDepth({
  pages,
  averageWordCount,
  pagesWithQuestions,
  pagesWithStrongHeadings,
  servicePages,
  faqPages,
  blogPages
}) {
  const pageCount = pages.length || 1;
  const serviceCoverage = servicePages.length
    ? servicePages.filter((page) => servicePageCoverage(page) >= 3).length / servicePages.length
    : 0;
  const faqCoverage = faqPages.length > 0 || pages.some((page) => page.questionStyleHeadings.length > 2) ? 1 : 0;
  const topicClusterSignal = blogPages.length >= 4 ? 1 : blogPages.length >= 2 ? 0.6 : 0.2;

  const score = clamp(
    Math.round(
      Math.min(30, averageWordCount / 20) +
      (pagesWithStrongHeadings / pageCount) * 20 +
      (pagesWithQuestions / pageCount) * 20 +
      serviceCoverage * 15 +
      faqCoverage * 5 +
      topicClusterSignal * 10
    ),
    0,
    100
  );

  const questionAnswerReadiness = clamp(Math.round(((pagesWithQuestions / pageCount) * 60) + (faqCoverage * 40)), 0, 100);
  const servicePageClarity = clamp(Math.round(serviceCoverage * 100), 0, 100);
  const topicClusterMaturity = clamp(Math.round(topicClusterSignal * 100), 0, 100);

  return {
    score,
    averageWordCount,
    pagesWithQuestions,
    pagesWithStrongHeadings,
    questionAnswerReadiness,
    servicePageClarity,
    topicClusterMaturity,
    summary:
      score >= 75
        ? "Content depth is strong enough to support broader AI answer extraction."
        : score >= 50
          ? "Content depth is mixed. Some pages support AI interpretation well, but coverage is uneven."
          : "Content depth is thin for AI search. More structured, question-led coverage is needed."
  };
}

function servicePageCoverage(page) {
  const text = [page.title, page.metaDescription, page.h1, ...(page.headings.h2 || [])]
    .join(" ")
    .toLowerCase();
  let score = 0;
  if (/\b(what|overview|service|solution|about)\b/.test(text)) score += 1;
  if (/\b(who|for|ideal|businesses|clients|teams)\b/.test(text)) score += 1;
  if (/\b(why|benefits|results|choose|proof|experience)\b/.test(text)) score += 1;
  if (/\b(cost|pricing|timeline|expect|process|how it works)\b/.test(text)) score += 1;
  return score;
}

function summarizeSchema({ crawl, service, industry }) {
  const types = crawl.schema?.schemaTypes || [];
  const lowerTypes = new Set(types.map((type) => String(type).toLowerCase()));
  const missingOpportunities = [];

  if (!lowerTypes.has("organization")) {
    missingOpportunities.push("Organization schema is missing or not clearly detectable.");
  }

  if ((service || industry) && !lowerTypes.has("service")) {
    missingOpportunities.push("Service schema looks like a likely opportunity on core service pages.");
  }

  if (!lowerTypes.has("localbusiness") && /\b(local|near me|vancouver|service area|location)\b/i.test(`${service} ${industry}`)) {
    missingOpportunities.push("LocalBusiness schema looks like an opportunity for stronger local entity clarity.");
  }

  if (!lowerTypes.has("faqpage") && crawl.contentDepth?.questionAnswerReadiness < 55) {
    missingOpportunities.push("FAQPage or question-led structured content appears to be underused.");
  }

  if (crawl.summary?.blogPages > 0 && !lowerTypes.has("article")) {
    missingOpportunities.push("Article schema appears to be missing on content or resource pages.");
  }

  if (!lowerTypes.has("breadcrumblist") && crawl.summary?.pagesCrawled > 3) {
    missingOpportunities.push("BreadcrumbList schema may help clarify page relationships across the site.");
  }

  return {
    present: types.length > 0,
    commonTypes: types.filter((type) => KNOWN_SCHEMA_TYPES.includes(type)),
    allTypes: types,
    missingOpportunities
  };
}

async function getExpandedSerperSignals({
  hostname,
  businessName,
  industry,
  service,
  competitors,
  targetLocations,
  aiQuestionTargeting,
  desiredVisibility,
  serperKey,
  maxQueries = DEFAULT_MAX_SERPER_QUERIES
}) {
  const queries = buildSerperQueries({
    hostname,
    businessName,
    industry,
    service,
    competitors,
    targetLocations,
    aiQuestionTargeting,
    desiredVisibility
  });

  const limitedQueries = queries.slice(0, Math.max(1, maxQueries));
  const results = [];
  for (const queryConfig of limitedQueries) {
    results.push(await runSerperQuery({ queryConfig, hostname, businessName, competitors, serperKey }));
  }

  const foundCount = results.filter((item) => item.brandFound).length;
  const rankPositions = results.map((item) => item.rankPosition).filter((value) => Number.isFinite(value));
  const bestRank = rankPositions.length ? Math.min(...rankPositions) : null;
  const competitorOverlap = Array.from(
    new Set(results.flatMap((item) => item.competitorOverlap || []).filter(Boolean))
  );

  return {
    query: results[0]?.query || "",
    presence:
      foundCount >= 3
        ? `Found consistently across ${foundCount} query patterns`
        : foundCount > 0
          ? `Found in ${foundCount} of ${results.length} query patterns`
          : "Not found across tested query patterns",
    brandFound: foundCount > 0,
    bestRank,
    organicCount: results.reduce((sum, item) => sum + (item.organicCount || 0), 0),
    paaCount: results.reduce((sum, item) => sum + (item.paaCount || 0), 0),
    competitorOverlap,
    queries: results
  };
}

function buildSerperQueries({
  hostname,
  businessName,
  industry,
  service,
  competitors,
  targetLocations,
  aiQuestionTargeting,
  desiredVisibility
}) {
  const cleanBusiness = String(businessName || hostname || "").trim();
  const cleanService = String(service || industry || cleanBusiness || "").trim();
  const cleanLocation = String(targetLocations || "").split(/,|;|\n/)[0].trim();
  const competitorItems = splitValues(competitors);
  const firstCompetitor = competitorItems[0] || "";
  const questionLed = splitValues(aiQuestionTargeting)[0] || splitValues(desiredVisibility)[0] || "";

  const queries = [
    { label: "brand", query: cleanBusiness || hostname },
    { label: "brand-service", query: [cleanBusiness, cleanService].filter(Boolean).join(" ") },
    { label: "best", query: `best ${cleanService}${cleanLocation ? ` ${cleanLocation}` : ""}`.trim() },
    { label: "near-me", query: `${cleanService} near me`.trim() },
    { label: "cost", query: `how much does ${cleanService} cost`.trim() },
    { label: "hire", query: `who should I hire for ${cleanService}`.trim() }
  ];

  if (firstCompetitor) {
    queries.push({
      label: "competitor",
      query: `${cleanBusiness} vs ${firstCompetitor}`.trim()
    });
  }

  if (questionLed) {
    queries.push({
      label: "question-led",
      query: questionLed
    });
  }

  return queries.filter((item) => item.query);
}

async function runSerperQuery({ queryConfig, hostname, businessName, competitors, serperKey }) {
  const label = String(queryConfig?.label || "").trim();
  const query = String(queryConfig?.query || "").trim();
  const competitorTerms = splitValues(competitors).map((item) => item.toLowerCase());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        q: query,
        num: 8
      })
    });

    const json = await response.json();
    const organic = Array.isArray(json.organic) ? json.organic : [];
    const paa = Array.isArray(json.peopleAlsoAsk) ? json.peopleAlsoAsk : [];
    const topResults = organic.slice(0, 8).map((item, index) => {
      const domain = getHostname(item.link || "");
      const competitorMatch = competitorTerms.find((term) => term && (`${domain} ${item.title || ""}`.toLowerCase().includes(term))) || "";
      return {
        position: index + 1,
        title: String(item.title || "").trim(),
        link: String(item.link || "").trim(),
        domain,
        clientDomainMatch: isBrandMatch({ item, hostname, businessName }),
        competitorMatch
      };
    });
    const matchingResult = topResults.find((item) => item.clientDomainMatch);
    const competitorOverlap = Array.from(new Set(topResults.map((item) => item.competitorMatch).filter(Boolean)));

    return {
      label,
      query,
      brandFound: Boolean(matchingResult),
      rankPosition: matchingResult?.position ?? null,
      organicCount: organic.length,
      paaCount: paa.length,
      competitorOverlap,
      topResults
    };
  } catch {
    return {
      label,
      query,
      brandFound: false,
      rankPosition: null,
      organicCount: 0,
      paaCount: 0,
      competitorOverlap: [],
      topResults: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isBrandMatch({ item, hostname, businessName }) {
  const link = String(item?.link || "").toLowerCase();
  const title = String(item?.title || "").toLowerCase();
  const snippet = String(item?.snippet || "").toLowerCase();
  const brand = String(businessName || "").toLowerCase();

  return (
    (hostname && link.includes(String(hostname).toLowerCase())) ||
    (brand && (title.includes(brand) || snippet.includes(brand)))
  );
}

function createEmptySerperSignals() {
  return {
    query: "",
    presence: "Unavailable",
    brandFound: false,
    bestRank: null,
    organicCount: 0,
    paaCount: 0,
    competitorOverlap: [],
    queries: []
  };
}

function extractInternalLinks({ pageUrl, html, hostname }) {
  const matches = Array.from(
    html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
  );
  const links = new Map();

  matches.forEach((match) => {
    const rawHref = String(match[1] || "").trim();
    const anchorText = cleanText(stripHtml(match[2] || ""));
    if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(rawHref)) {
      return;
    }

    try {
      const resolved = new URL(rawHref, pageUrl);
      if (!/^https?:$/i.test(resolved.protocol)) return;
      if (resolved.hostname.replace(/^www\./i, "") !== String(hostname || "").replace(/^www\./i, "")) return;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|xml|css|js)$/i.test(resolved.pathname)) return;

      resolved.hash = "";
      if (resolved.pathname !== "/" && resolved.pathname.endsWith("/")) {
        resolved.pathname = resolved.pathname.replace(/\/+$/, "");
      }

      const url = resolved.toString();
      const existing = links.get(url);
      const priority = scoreInternalLinkPriority({ url, anchorText });
      links.set(url, {
        url,
        anchorText,
        priority: existing ? Math.max(existing.priority, priority) : priority
      });
    } catch {
      // Ignore invalid links.
    }
  });

  return Array.from(links.values());
}

function scoreInternalLinkPriority({ url, anchorText }) {
  const pathname = getPathname(url).toLowerCase();
  const combined = `${pathname} ${String(anchorText || "").toLowerCase()}`;
  let score = 1;

  if (pathname === "/" || /\b(home)\b/.test(combined)) score += 100;
  if (/\b(service|services|solutions?)\b/.test(combined)) score += 60;
  if (/\b(about|team|company|story)\b/.test(combined)) score += 55;
  if (/\b(contact|book|schedule|get-started)\b/.test(combined)) score += 50;
  if (/\b(faq|questions)\b/.test(combined)) score += 48;
  if (/\b(blog|resource|resources|insights|articles?)\b/.test(combined)) score += 45;
  if (/\b(pricing|cost|quote)\b/.test(combined)) score += 40;
  if (/\b(case-study|testimonial|review)\b/.test(combined)) score += 35;

  const depth = pathname.split("/").filter(Boolean).length;
  score -= Math.max(0, depth - 1) * 2;

  return score;
}

function classifyPageType({ url, title, headings }) {
  const pathname = getPathname(url).toLowerCase();
  const text = `${pathname} ${title} ${(headings.h1 || []).join(" ")} ${(headings.h2 || []).join(" ")}`.toLowerCase();

  if (pathname === "/") return "homepage";
  if (/\b(faq|frequently asked|questions?)\b/.test(text)) return "faq";
  if (/\b(blog|resource|resources|insights|articles?)\b/.test(text)) return "blog";
  if (/\b(about|team|company|story)\b/.test(text)) return "about";
  if (/\b(contact|book|schedule|consult)\b/.test(text)) return "contact";
  if (/\b(service|services|solution|solutions|offerings?)\b/.test(text)) return "service";
  return "other";
}

function extractTagText(html, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = html.match(regex);
  return match ? cleanText(match[1]) : "";
}

function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return match ? cleanText(match[1]) : "";
}

function extractHeadingTexts(html, tagName) {
  return Array.from(html.matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi")))
    .map((match) => cleanText(match[1]))
    .filter(Boolean)
    .slice(0, tagName === "h1" ? 3 : 10);
}

function isQuestionStyleHeading(value) {
  const text = String(value || "").trim();
  return /\?$/.test(text) || /^(how|what|why|when|where|who|which|can|should|do|does|is|are)\b/i.test(text);
}

function extractJsonLdScripts(html) {
  const scripts = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );

  return scripts.map((match) => {
    const raw = String(match[1] || "").trim();
    const parsed = tryParseJsonLd(raw);
    return {
      raw,
      types: parsed ? Array.from(new Set(extractJsonLdTypes(parsed))) : []
    };
  });
}

function tryParseJsonLd(raw) {
  if (!raw) return null;

  const candidates = [raw, raw.replace(/,\s*([}\]])/g, "$1")];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function extractJsonLdTypes(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractJsonLdTypes(item));
  }
  if (typeof value !== "object") {
    return [];
  }

  const direct = [];
  const typeValue = value["@type"];
  if (Array.isArray(typeValue)) {
    direct.push(...typeValue.map((item) => String(item || "").trim()).filter(Boolean));
  } else if (typeValue) {
    direct.push(String(typeValue).trim());
  }

  return Object.values(value).reduce((acc, current) => {
    acc.push(...extractJsonLdTypes(current));
    return acc;
  }, direct);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text) {
  const words = String(text || "").match(/\b[\p{L}\p{N}'-]+\b/gu);
  return words ? words.length : 0;
}

function countQuestionSignals(text) {
  const raw = String(text || "");
  const questionMarks = (raw.match(/\?/g) || []).length;
  const questionOpeners = (
    raw.match(/\b(how|what|why|when|where|who|which|can|should|do|does|is|are)\b/gi) || []
  ).length;
  return questionMarks + Math.min(questionOpeners, 12);
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function splitValues(value) {
  return String(value || "")
    .split(/,|\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getHtmlChecks(html) {
  const schemaScripts = extractJsonLdScripts(html);
  const schemaTypes = Array.from(new Set(schemaScripts.flatMap((item) => item.types || [])));
  const hasTitle = /<title[^>]*>[\s\S]*?<\/title>/i.test(html);
  const hasMetaDescription = /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i.test(html);
  const hasH1 = /<h1[^>]*>[\s\S]*?<\/h1>/i.test(html);
  const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*href=["'][^"']+["'][^>]*>/i.test(html);
  const hasSchema = schemaTypes.length > 0;
  const hasNoindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);

  return {
    hasTitle,
    hasMetaDescription,
    hasH1,
    hasCanonical,
    hasSchema,
    hasNoindex,
    schemaTypes,
    metaText: hasTitle && hasMetaDescription ? "Good" : hasTitle || hasMetaDescription ? "Partial" : "Weak",
    indexabilityText: hasNoindex ? "Restricted" : "Valid"
  };
}

async function fetchHtml(url, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SemanticSearchMarketingAudit/1.0)"
      },
      signal: controller.signal
    });
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function getPathname(url) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  collectSiteIntelligence,
  createEmptySerperSignals,
  fetchHtml,
  getExpandedSerperSignals,
  getHtmlChecks,
  getHostname,
  normalizeUrl
};
