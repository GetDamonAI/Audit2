exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      score: 78,
      summary: "Your brand shows a decent foundation, but key AI visibility signals still need improvement.",
      breakdown: [
        { label: "Entity Clarity", value: 74 },
        { label: "Content Structure", value: 82 },
        { label: "Authority Signals", value: 68 },
        { label: "Citation Readiness", value: 79 }
      ],
      priorities: [
        "Clarify the core brand and service language",
        "Improve page structure for easier AI parsing",
        "Strengthen trust and authority signals"
      ]
    })
  };
};
