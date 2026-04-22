const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

const TEST_HTML = `
<html>
  <body style="font-family: Arial; padding: 40px;">
    <h1>AI Visibility Audit</h1>
    <p>This is a test PDF to confirm generation is working.</p>
  </body>
</html>
`;

exports.handler = async () => {
  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setContent(TEST_HTML, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="ai-visibility-audit-test.pdf"'
      },
      isBase64Encoded: true,
      body: pdfBuffer.toString("base64")
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: error.message || "PDF generation failed."
      })
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
