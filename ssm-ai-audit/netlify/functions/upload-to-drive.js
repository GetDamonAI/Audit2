const crypto = require("crypto");
const fs = require("fs");
const { respond } = require("./_paid-utils");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

exports.handler = async (event) => {
  try {
    const input = JSON.parse(event.body || "{}");
    const fileName = String(input.fileName || "").trim();
    const filePath = String(input.filePath || "").trim();
    const contentBase64 = String(input.contentBase64 || "").trim();
    const mimeType = String(input.mimeType || "application/pdf").trim();

    if (!fileName) {
      return respond(400, { error: "Missing file name." });
    }

    const buffer = filePath
      ? fs.readFileSync(filePath)
      : contentBase64
        ? Buffer.from(contentBase64, "base64")
        : null;

    if (!buffer?.length) {
      return respond(400, { error: "Missing file content." });
    }

    const upload = await uploadPdfToDrive({
      buffer,
      fileName,
      mimeType
    });

    return respond(200, {
      success: true,
      ...upload
    });
  } catch (error) {
    return respond(500, { error: error.message || "Drive upload failed." });
  }
};

async function uploadPdfToDrive({ buffer, fileName, mimeType = "application/pdf" }) {
  const credentials = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const accessToken = await getAccessToken(credentials);
  const boundary = `audit-report-${crypto.randomUUID()}`;
  const metadata = {
    name: fileName,
    mimeType
  };

  const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  if (folderId) {
    metadata.parents = [folderId];
  }

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      "utf8"
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
      "utf8"
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, "utf8")
  ]);

  const uploadResponse = await fetch(GOOGLE_DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length)
    },
    body
  });

  const uploadText = await uploadResponse.text();
  let uploadJson = {};

  try {
    uploadJson = uploadText ? JSON.parse(uploadText) : {};
  } catch {
    uploadJson = { raw: uploadText };
  }

  if (!uploadResponse.ok || !uploadJson.id) {
    throw new Error(uploadJson.error?.message || "Google Drive upload failed.");
  }

  const permissionResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploadJson.id)}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone"
      })
    }
  );

  if (!permissionResponse.ok) {
    const text = await permissionResponse.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    throw new Error(json.error?.message || "Unable to make Google Drive file publicly viewable.");
  }

  const fileId = uploadJson.id;
  const driveUrl = uploadJson.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  const downloadUrl = uploadJson.webContentLink || `https://drive.google.com/uc?export=download&id=${fileId}`;

  return {
    fileId,
    fileName: uploadJson.name || fileName,
    driveUrl,
    downloadUrl
  };
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    header: {
      alg: "RS256",
      typ: "JWT"
    },
    payload: {
      iss: credentials.client_email,
      scope: GOOGLE_DRIVE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      exp: now + 3600,
      iat: now
    },
    privateKey: credentials.private_key
  });

  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const tokenText = await tokenResponse.text();
  let tokenJson = {};

  try {
    tokenJson = tokenText ? JSON.parse(tokenText) : {};
  } catch {
    tokenJson = { raw: tokenText };
  }

  if (!tokenResponse.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || "Unable to authenticate with Google Drive.");
  }

  return tokenJson.access_token;
}

function signJwt({ header, payload, privateKey }) {
  const headerSegment = base64UrlJson(header);
  const payloadSegment = base64UrlJson(payload);
  const unsigned = `${headerSegment}.${payloadSegment}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${unsigned}.${base64Url(signature)}`;
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseServiceAccount(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON.");
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
  }

  return {
    ...parsed,
    private_key: String(parsed.private_key).replace(/\\n/g, "\n")
  };
}

module.exports = {
  uploadPdfToDrive
};
