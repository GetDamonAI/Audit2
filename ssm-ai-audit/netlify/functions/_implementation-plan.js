const IMPLEMENTATION_PLAN_FRAMEWORK = {
  version: 1,
  recommendationShape: {
    title: "string",
    whyItMattersForAiSearch: "string",
    whatToChange: "string",
    stepByStepInstructions: ["string"],
    examplesOrTemplates: ["string"],
    priority: "High|Medium|Low"
  },
  tracks: [
    {
      key: "schema",
      title: "Add and validate entity-first schema",
      whyItMattersForAiSearch:
        "Schema helps answer engines understand the business, connect entities, and cite the site with more confidence.",
      whatToChange:
        "Add the schema types that best describe the business, its services, and the pages that matter most for recommendation visibility.",
      stepByStepInstructions: [
        "Identify which pages should carry Organization, LocalBusiness, Service, FAQPage, Article, or Product schema.",
        "Generate the recommended schema markup with fields aligned to the real business details and page content.",
        "Validate the markup in Google Rich Results Test and Schema Markup Validator.",
        "Add the validated schema to the relevant templates or page-level modules and re-test after publish."
      ],
      examplesOrTemplates: [
        "Organization + sameAs profile template",
        "LocalBusiness schema template with service area fields",
        "FAQPage example for question-led support content"
      ],
      priority: "High"
    },
    {
      key: "topic-clusters",
      title: "Build question-led topic clusters that answer real buyer prompts",
      whyItMattersForAiSearch:
        "AI search rewards useful answers to real questions. Topic clusters make the brand easier to understand and more likely to surface for high-intent prompts.",
      whatToChange:
        "Expand beyond generic service pages with supporting content built around buyer questions, objections, comparisons, and implementation concerns.",
      stepByStepInstructions: [
        "Source question ideas from SERPs, People Also Ask, support tickets, sales calls, reviews, competitors, and AI prompt patterns.",
        "Group related questions into topic clusters anchored to the core services or outcomes the business wants to be known for.",
        "Create or revise pillar and supporting pages so each cluster answers a focused set of prompts with depth and clarity.",
        "Cross-link the cluster pages so answer engines can follow the entity, service, and problem-solution relationships."
      ],
      examplesOrTemplates: [
        "Question sourcing worksheet for SERPs, reviews, and customer conversations",
        "Topic cluster map template with pillar page + supporting pages",
        "Question-led outline template for service support pages"
      ],
      priority: "High"
    },
    {
      key: "publishing-calendar",
      title: "Create an AI-search publishing calendar",
      whyItMattersForAiSearch:
        "Consistent publishing around the right questions helps the brand earn fresher, broader, and more quotable topical coverage in AI answers.",
      whatToChange:
        "Build a publishing cadence around the highest-value prompts, proof points, and comparison topics the business needs to own.",
      stepByStepInstructions: [
        "Prioritize the themes most likely to influence recommendation visibility for the business and its priority services.",
        "Choose a realistic publishing cadence that the team can sustain without producing filler content.",
        "Assign subject ideas, angles, and proof points to each planned piece so content supports recommendation trust, not just traffic.",
        "Review each published piece for clear answers, citations, entity clarity, and cross-links into the broader cluster."
      ],
      examplesOrTemplates: [
        "90-day publishing calendar structure",
        "Topic brief template with AI-search rationale",
        "Thought-starter prompt set for service, comparison, and trust content"
      ],
      priority: "Medium"
    },
    {
      key: "authority",
      title: "Strengthen backlink, mention, and authority signals",
      whyItMattersForAiSearch:
        "Off-site mentions and authority cues help AI systems feel safer recommending a brand and increase the odds of being cited across discovery surfaces.",
      whatToChange:
        "Build a deliberate authority plan around mentions, links, proof assets, and high-trust references connected to the brand and its services.",
      stepByStepInstructions: [
        "Audit current mentions, profiles, partnerships, listings, and existing earned links for authority gaps.",
        "Build an outreach list using industry publications, local sources, association sites, partner pages, podcasts, and expert roundups.",
        "Develop outreach angles backed by helpful resources, unique insights, local expertise, or proprietary proof.",
        "Track newly earned mentions and links so future content and entity work can reinforce the same authority themes."
      ],
      examplesOrTemplates: [
        "Authority opportunity checklist",
        "Outreach email templates for partner, editorial, and local mention requests",
        "Link reclamation workflow for unlinked brand mentions"
      ],
      priority: "High"
    }
  ]
};

function createImplementationPlanSeed({ metadata = {}, intake = {} } = {}) {
  return {
    version: IMPLEMENTATION_PLAN_FRAMEWORK.version,
    url: String(metadata.url || "").trim(),
    businessName: String(metadata.businessName || "").trim(),
    quickAuditScore: Number(metadata.quickAuditScore ?? 0),
    industry: String(metadata.industry || "").trim(),
    service: String(metadata.service || "").trim(),
    intake,
    recommendations: IMPLEMENTATION_PLAN_FRAMEWORK.tracks.map((track) => ({
      key: track.key,
      title: track.title,
      whyItMattersForAiSearch: track.whyItMattersForAiSearch,
      whatToChange: track.whatToChange,
      stepByStepInstructions: [...track.stepByStepInstructions],
      examplesOrTemplates: [...track.examplesOrTemplates],
      priority: track.priority
    }))
  };
}

module.exports = {
  IMPLEMENTATION_PLAN_FRAMEWORK,
  createImplementationPlanSeed
};
