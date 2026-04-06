exports.handler = async (event) => {
  try {
    const input = JSON.parse(event.body || "{}");
    const openAiKey = process.env.OPENAI_API_KEY;
    const pageSpeedKey = process.env.PAGESPEED_API_KEY;

    if (!openAiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" })
      };
    }

    const url = normalizeUrl(input.url);

    const homepageHtml = await fetchHtml(url);
    const htmlChecks = getHtmlChecks(homepageHtml);

    const pageSpeed = pageSpeedKey
      ? await getPageSpeed(url, pageSpeedKey)
      : null;

    const tech = {
      speed: pageSpeed?.speedText || "Unavailable",
      mobile: pageSpeed?.mobileText || "Unknown",
      meta: htmlChecks.metaText,
      indexability: htmlChecks.indexabilityText
    };

    const prompt = `
You are generating a concise AI visibility audit for a business.

Business info:
Website: ${url}
Business name: ${input.businessName || ""}
Industry: ${input.industry || ""}
Main product or service: ${input.service || ""}

Technical findings:
- Title tag present: ${htmlChecks.hasTitle}
- Meta description present: ${htmlChecks.hasMetaDescription}
- H1 present: ${htmlChecks.hasH1}
- Canonical present: ${htmlChecks.hasCanonical}
- Schema present: ${htmlChecks.hasSchema}
- Robots noindex found: ${htmlChecks.hasNoindex}
- PageSpeed mobile score: ${pageSpeed?.score ?? "Unavailable"}

Return valid JSON only with this exact shape:
{
  "score": number,
  "summary": "string",
  "breakdown": [
    { "label": "Entity Clarity", "value": number },
    { "label": "Content Structure", "value": number },
    { "label": "Authority Signals", "value": number },
    { "label": "Citation Readiness", "value": number }
  ],
  "priorities": ["string", "string", "string"]
}

Keep the tone concise, strategic, and credible.
Do not use markdown fences.
Base the answer partly on the technical findings above.
`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: "You are an expert in AI search visibility, semantic SEO, and technical site readiness. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const aiJson = await aiResponse.json();

    if (!aiResponse.ok) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: aiJson.error?.message || "OpenAI request failed."
        })
      };
    }

    const raw = aiJson.choices?.[0]?.message?.content || "{}";
    const cleaned = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    parsed.tech = tech;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Audit generation failed." })
    };
  }
};

function normalizeUrl(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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
  } catch (error) {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function getHtmlChecks(html) {
  const hasTitle = /<title[^>]*>[\s\S]*?<\/title>/i.test(html);
  const hasMetaDescription = /<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i.test(html);
  const hasH1 = /<h1[^>]*>[\s\S]*?<\/h1>/i.test(html);
  const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]*href=["'][^"']+["'][^>]*>/i.test(html);
  const hasSchema = /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i.test(html);
  const hasNoindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);

  return {
    hasTitle,
    hasMetaDescription,
    hasH1,
    hasCanonical,
    hasSchema,
    hasNoindex,
    metaText: hasTitle && hasMetaDescription ? "Good" : hasTitle || hasMetaDescription ? "Partial" : "Weak",
    indexabilityText: hasNoindex ? "Restricted" : "Valid"
  };
}

async function getPageSpeed(url, apiKey) {
  try {
    const params = new URLSearchParams({
      url,
      strategy: "mobile",
      category: "performance",
      key: apiKey
    });

    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`);
    const json = await response.json();

    const score = json?.lighthouseResult?.categories?.performance?.score;
    const numeric = typeof score === "number" ? Math.round(score * 100) : null;

    return {
      score: numeric,
      speedText: numeric !== null ? `${numeric}/100` : "Unavailable",
      mobileText: numeric !== null ? (numeric >= 90 ? "Strong" : numeric >= 50 ? "Moderate" : "Needs work") : "Unknown"
    };
  } catch (error) {
    return null;
  }
}
