const DEFAULT_MAX_PAGES = 20;

async function collectSiteIntelligence({
  url,
  businessName = "",
  industry = "",
  service = "",
  competitors = "",
  targetLocations = "",
  serperKey = "",
  maxPages = DEFAULT_MAX_PAGES
}) {
  const normalizedUrl = normalizeUrl(url);
  const hostname = getHostname(normalizedUrl);
  const crawl = await crawlSite({
    startUrl: normalizedUrl,
    maxPages,
    hostname
  });

  const homepage = crawl.pages[0] || createEmptyPageSummary(normalizedUrl);
  const pageSpeedCompatibleHtmlChecks = getHtmlChecks(homepage.rawHtml || "");
  const serper = serperKey
    ? await getExpandedSerperSignals({
        hostname,
        businessName,
        industry,
        service,
        competitors,
        targetLocations,
        serperKey
      })
    : createEmptySerperSignals();

  return {
    crawl,
    homepage,
    htmlChecks: pageSpeedCompatibleHtmlChecks,
    schema: crawl.schema,
    contentDepth: crawl.contentDepth,
    serper
  };
}

async function crawlSite({ startUrl, maxPages = DEFAULT_MAX_PAGES, hostname }) {
  const queue = [startUrl];
  const visited = new Set();
  const pages = [];

  while (queue.length && pages.length < maxPages) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const html = await fetchHtml(currentUrl);
    const page = summarizePage(currentUrl, html);
    pages.push(page);

    const links = extractInternalLinks({
      pageUrl: currentUrl,
      html,
      hostname: hostname || getHostname(startUrl)
    });

    links.forEach((link) => {
      if (!visited.has(link) && !queue.includes(link) && pages.length + queue.length < maxPages * 2) {
        queue.push(link);
      }
    });
  }

  return summarizeCrawl(pages, maxPages);
}

function summarizeCrawl(pages, maxPages) {
  const safePages = Array.isArray(pages) ? pages : [];
  const pagesWithSchema = safePages.filter((page) => page.hasSchema);
  const schemaTypes = Array.from(
    new Set(pagesWithSchema.flatMap((page) => page.schemaTypes || []).filter(Boolean))
  );
  const totalWords = safePages.reduce((sum, page) => sum + (page.wordCount || 0), 0);
  const averageWordCount = safePages.length ? Math.round(totalWords / safePages.length) : 0;
  const pagesWithQuestions = safePages.filter((page) => page.questionCount > 0).length;
  const pagesWithStrongHeadings = safePages.filter((page) => page.headingScore >= 2).length;
  const contentDepth = scoreContentDepth({
    pages: safePages,
    averageWordCount,
    pagesWithQuestions,
    pagesWithStrongHeadings
  });

  return {
    pages: safePages,
    summary: {
      pagesCrawled: safePages.length,
      crawlLimit: maxPages,
      averageWordCount,
      pagesWithQuestions,
      pagesWithStrongHeadings,
      pagesWithSchema: pagesWithSchema.length
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
  const schemaTypes = Array.from(
    new Set(schemaScripts.flatMap((item) => item.types || []).filter(Boolean))
  );
  const questionCount = countQuestionSignals(text);
  const headingScore = Number(Boolean(headings.h1.length)) + Number(Boolean(headings.h2.length)) + Number(Boolean(headings.h3.length));

  return {
    url,
    path: getPathname(url),
    title,
    metaDescription,
    headings,
    wordCount,
    questionCount,
    headingScore,
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
    wordCount: 0,
    questionCount: 0,
    headingScore: 0,
    hasSchema: false,
    schemaTypes: [],
    schemaScripts: [],
    rawHtml: ""
  };
}

function scoreContentDepth({ pages, averageWordCount, pagesWithQuestions, pagesWithStrongHeadings }) {
  const pageCount = pages.length || 1;
  const averageWordsScore = clamp(Math.round(Math.min(35, averageWordCount / 20)), 0, 35);
  const headingScore = clamp(Math.round((pagesWithStrongHeadings / pageCount) * 25), 0, 25);
  const questionScore = clamp(Math.round((pagesWithQuestions / pageCount) * 20), 0, 20);
  const schemaScore = clamp(
    Math.round((pages.filter((page) => page.hasSchema).length / pageCount) * 20),
    0,
    20
  );
  const score = clamp(averageWordsScore + headingScore + questionScore + schemaScore, 0, 100);

  return {
    score,
    averageWordCount,
    pagesWithQuestions,
    pagesWithStrongHeadings,
    summary:
      score >= 75
        ? "Content depth is strong enough to support broader AI answer extraction."
        : score >= 50
          ? "Content depth is mixed. Some pages support AI interpretation well, but coverage is uneven."
          : "Content depth is thin for AI search. More structured, question-led coverage is needed."
  };
}

async function getExpandedSerperSignals({
  hostname,
  businessName,
  industry,
  service,
  competitors,
  targetLocations,
  serperKey
}) {
  const queries = buildSerperQueries({
    hostname,
    businessName,
    industry,
    service,
    competitors,
    targetLocations
  });

  const results = [];
  for (const queryConfig of queries) {
    results.push(await runSerperQuery({ queryConfig, hostname, businessName, serperKey }));
  }

  const foundCount = results.filter((item) => item.brandFound).length;
  return {
    query: results[0]?.query || "",
    presence:
      foundCount >= 3
        ? `Found consistently across ${foundCount} query patterns`
        : foundCount > 0
          ? `Found in ${foundCount} of ${results.length} query patterns`
          : "Not found across tested query patterns",
    brandFound: foundCount > 0,
    organicCount: results.reduce((sum, item) => sum + (item.organicCount || 0), 0),
    paaCount: results.reduce((sum, item) => sum + (item.paaCount || 0), 0),
    queries: results
  };
}

function buildSerperQueries({
  hostname,
  businessName,
  industry,
  service,
  competitors,
  targetLocations
}) {
  const cleanBusiness = String(businessName || hostname || "").trim();
  const cleanService = String(service || industry || cleanBusiness || "").trim();
  const cleanLocation = String(targetLocations || "").split(",")[0].trim();
  const firstCompetitor = String(competitors || "")
    .split(/,|\n|;/)
    .map((item) => item.trim())
    .find(Boolean);

  return [
    { label: "brand", query: cleanBusiness || hostname },
    { label: "service", query: [cleanService, cleanLocation].filter(Boolean).join(" ") || cleanBusiness || hostname },
    { label: "best", query: `best ${cleanService || cleanBusiness}${cleanLocation ? ` ${cleanLocation}` : ""}`.trim() },
    { label: "cost", query: `${cleanService || cleanBusiness} cost${cleanLocation ? ` ${cleanLocation}` : ""}`.trim() },
    {
      label: "competitor",
      query: firstCompetitor
        ? `${cleanBusiness} vs ${firstCompetitor}`.trim()
        : `${cleanService || cleanBusiness} competitors${cleanLocation ? ` ${cleanLocation}` : ""}`.trim()
    }
  ].filter((item) => item.query);
}

async function runSerperQuery({ queryConfig, hostname, businessName, serperKey }) {
  const label = String(queryConfig?.label || "").trim();
  const query = String(queryConfig?.query || "").trim();

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        num: 10
      })
    });

    const json = await response.json();
    const organic = Array.isArray(json.organic) ? json.organic : [];
    const paa = Array.isArray(json.peopleAlsoAsk) ? json.peopleAlsoAsk : [];
    const brandFound = organic.some((item) => isBrandMatch({ item, hostname, businessName }));

    return {
      label,
      query,
      brandFound,
      organicCount: organic.length,
      paaCount: paa.length,
      topTitles: organic.slice(0, 3).map((item) => String(item.title || "").trim()).filter(Boolean)
    };
  } catch {
    return {
      label,
      query,
      brandFound: false,
      organicCount: 0,
      paaCount: 0,
      topTitles: []
    };
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
    organicCount: 0,
    paaCount: 0,
    queries: []
  };
}

function extractInternalLinks({ pageUrl, html, hostname }) {
  const matches = Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi));
  const links = new Set();

  matches.forEach((match) => {
    const rawHref = String(match[1] || "").trim();
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
      links.add(resolved.toString());
    } catch {
      // Ignore invalid links.
    }
  });

  return Array.from(links);
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
    .slice(0, tagName === "h1" ? 3 : 8);
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

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

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
