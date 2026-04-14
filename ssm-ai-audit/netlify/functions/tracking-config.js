exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      gaMeasurementId: String(process.env.GA_MEASUREMENT_ID || "").trim(),
      metaPixelId: String(process.env.META_PIXEL_ID || "").trim()
    })
  };
};
