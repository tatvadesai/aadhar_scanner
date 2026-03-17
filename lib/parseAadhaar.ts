export interface AadhaarData {
  name?: string;
  dob?: string;
  gender?: string;
  aadhaarNumber?: string;
  pincode?: string;
  rawText?: string;
  source: "ocr";
}

export function parseOCRText(text: string): AadhaarData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Aadhaar number: XXXX XXXX XXXX or 12 digits straight
  const aadhaarMatch = text.match(/\b(\d{4}\s\d{4}\s\d{4}|\d{12})\b/);

  // DOB: DD/MM/YYYY or DD-MM-YYYY
  const dobMatch = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);

  // Gender
  const genderMatch = text.match(/\b(Male|Female|MALE|FEMALE)\b/);

  // Pincode: 6 digits (not matching the aadhaar number)
  const pincodeMatch = text.replace(/\d{4}\s\d{4}\s\d{4}/, "").match(/\b(\d{6})\b/);

  // Name extraction: find longest run of consecutive Title-Case words
  // Skip lines containing DOB, gender, aadhaar number, or Hindi-only content
  let name: string | undefined;

  // Try "Name:" label first
  for (let i = 0; i < lines.length; i++) {
    const sameLine = lines[i].match(/(?:name|नाम)\s*[:\-]\s*([A-Za-z][A-Za-z ]{3,})/i);
    if (sameLine) { name = sameLine[1].trim(); break; }
    if (/^(name|नाम)\s*[:\-]?\s*$/i.test(lines[i]) && lines[i + 1]) {
      name = lines[i + 1].replace(/[^A-Za-z ]/g, " ").trim();
      break;
    }
  }

  if (!name) {
    let bestMatch = "";
    for (const line of lines) {
      if (/\d{2}[\/\-]\d{2}[\/\-]\d{4}/.test(line)) continue; // skip DOB lines
      if (/\b(male|female|dob|yob|year|birth)\b/i.test(line)) continue;
      if (/\d{4}\s\d{4}/.test(line)) continue; // skip aadhaar lines

      // Extract consecutive Title-Case words (2+ chars each)
      const matches = line.match(/\b([A-Z][a-z]{1,})\b/g);
      if (matches && matches.length >= 2) {
        const candidate = matches.join(" ");
        if (candidate.length > bestMatch.length) bestMatch = candidate;
      }
    }
    if (bestMatch) name = bestMatch;
  }

  return {
    name,
    dob: dobMatch?.[1],
    gender: genderMatch?.[1],
    aadhaarNumber: aadhaarMatch?.[1],
    pincode: pincodeMatch?.[1],
    rawText: text,
    source: "ocr",
  };
}
