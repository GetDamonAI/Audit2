{\rtf1\ansi\ansicpg1252\cocoartf2761
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 export async function handler(event) \{\
  try \{\
    const body = JSON.parse(event.body || "\{\}");\
\
    const apiKey = process.env.OPENAI_API_KEY;\
\
    const prompt = `\
You are generating a concise AI visibility audit for a business.\
\
Business info:\
Website: $\{body.url || ""\}\
Business name: $\{body.businessName || ""\}\
Industry: $\{body.industry || ""\}\
Main product or service: $\{body.service || ""\}\
Email: $\{body.email || ""\}\
\
Return valid JSON only with this exact shape:\
\{\
  "score": number,\
  "summary": "string",\
  "breakdown": [\
    \{ "label": "Entity Clarity", "value": number \},\
    \{ "label": "Content Structure", "value": number \},\
    \{ "label": "Authority Signals", "value": number \},\
    \{ "label": "Citation Readiness", "value": number \}\
  ],\
  "priorities": ["string", "string", "string"]\
\}\
\
Keep the tone concise, strategic, and clear.\
`;\
\
    const response = await fetch("https://api.openai.com/v1/responses", \{\
      method: "POST",\
      headers: \{\
        "Content-Type": "application/json",\
        "Authorization": `Bearer $\{apiKey\}`\
      \},\
      body: JSON.stringify(\{\
        model: "gpt-4.1-mini",\
        input: prompt\
      \})\
    \});\
\
    const data = await response.json();\
    const text = data.output?.[0]?.content?.[0]?.text || "\{\}";\
    const parsed = JSON.parse(text);\
\
    return \{\
      statusCode: 200,\
      headers: \{ "Content-Type": "application/json" \},\
      body: JSON.stringify(parsed)\
    \};\
  \} catch (error) \{\
    return \{\
      statusCode: 500,\
      body: JSON.stringify(\{ error: "Audit generation failed." \})\
    \};\
  \}\
\}}