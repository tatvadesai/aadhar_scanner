/**
 * POST /api/extract
 * Sends the captured Aadhaar card image to Gemini 2.0 Flash and returns
 * structured JSON with name, aadhaar_number, dob, gender.
 *
 * Last updated: 2026-03-18
 */

import { NextRequest, NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const PROMPT = `This is an Indian Aadhaar card. Extract the following fields and return ONLY valid JSON, no explanation.

{"name":"","aadhaar_number":"","dob":"","gender":""}

Rules:
- name: full name in English
- aadhaar_number: 12 digits formatted as XXXX XXXX XXXX
- dob: DD/MM/YYYY
- gender: Male or Female (पुरुष = Male, महिला = Female)
- If a field is not visible use ""
- Return ONLY the JSON object`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  const { imageBase64, mimeType } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType ?? "image/jpeg", data: imageBase64 } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 256 },
  };

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Gemini] error:", err);
    return NextResponse.json({ error: "Gemini API error", detail: err }, { status: 502 });
  }

  const data = await res.json();
  const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  console.log("[Gemini] raw:", raw);

  // Strip markdown fences if model wraps output
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "No JSON in response", raw }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      name: parsed.name ?? "",
      aadhaar_number: parsed.aadhaar_number ?? "",
      dob: parsed.dob ?? "",
      gender: parsed.gender ?? "",
      raw,
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse JSON", raw }, { status: 500 });
  }
}
