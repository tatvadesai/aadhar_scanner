/**
 * POST /api/extract
 * Sends captured Aadhaar card image to Groq (LLaMA 3.2 Vision 11B).
 * Groq is free, fast, and works in India.
 *
 * Last updated: 2026-03-18
 */

import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const PROMPT = `This is an Indian Aadhaar card. Extract the name, aadhaar number, date of birth, and gender.

Return ONLY this JSON with real values from the card:
{"name":"","aadhaar_number":"","dob":"","gender":""}

Example of correct output:
{"name":"Rahul Kumar","aadhaar_number":"1234 5678 9012","dob":"15/08/1990","gender":"Male"}

Rules:
- aadhaar_number: 12 digits as XXXX XXXX XXXX
- dob: DD/MM/YYYY format
- gender: Male or Female (पुरुष = Male, महिला = Female)
- Use "" for any field not visible
- Return ONLY the JSON, nothing else`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 500 });
  }

  const { imageBase64, mimeType } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const body = {
    model: "llama-3.2-11b-vision-preview",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType ?? "image/jpeg"};base64,${imageBase64}` },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 256,
  };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Groq] error:", err);
    return NextResponse.json({ error: "Groq API error", detail: err }, { status: 502 });
  }

  const data = await res.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "";
  console.log("[Groq] raw:", raw);

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
