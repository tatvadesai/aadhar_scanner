export interface AadhaarData {
  name?: string;
  dob?: string;
  gender?: string;
  aadhaarNumber?: string;
  address?: string;
  pincode?: string;
  rawText?: string;
  source: "qr" | "ocr";
}

// Parse old-style XML QR code
function parseXmlQR(text: string): AadhaarData | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");
    const root = doc.querySelector("PrintLetterBioInfo, POA, ProofOfAddress");

    if (!root) return null;

    const get = (attr: string) => root.getAttribute(attr) ?? undefined;

    const house = get("house") ?? get("co") ?? "";
    const street = get("street") ?? get("lm") ?? "";
    const loc = get("loc") ?? get("vtc") ?? "";
    const dist = get("dist") ?? "";
    const state = get("state") ?? "";
    const pc = get("pc") ?? "";

    const addressParts = [house, street, loc, dist, state, pc].filter(Boolean);

    return {
      name: get("name"),
      dob: get("dob") ?? get("yob"),
      gender: get("gender"),
      aadhaarNumber: get("uid"),
      address: addressParts.join(", "),
      pincode: pc,
      source: "qr",
    };
  } catch {
    return null;
  }
}

// Parse QR text that might be XML or key=value format
export function parseQRText(text: string): AadhaarData | null {
  // Try XML format
  if (text.includes("<") && text.includes(">")) {
    return parseXmlQR(text);
  }

  // Try simple key=value or JSON fallback
  try {
    const json = JSON.parse(text);
    return {
      name: json.name ?? json.Name,
      dob: json.dob ?? json.DOB,
      gender: json.gender ?? json.Gender,
      aadhaarNumber: json.uid ?? json.aadhaar,
      address: json.address ?? json.Address,
      source: "qr",
    };
  } catch {
    return null;
  }
}

// Extract fields from raw OCR text
export function parseOCRText(text: string): AadhaarData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Aadhaar number: 12 digits, often formatted as XXXX XXXX XXXX
  const aadhaarMatch = text.match(/\b(\d{4}\s\d{4}\s\d{4}|\d{12})\b/);

  // DOB: DD/MM/YYYY or DD-MM-YYYY or Year of Birth: YYYY
  const dobMatch = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4})\b/);

  // Gender
  const genderMatch = text.match(/\b(Male|Female|MALE|FEMALE|M|F)\b/);

  // Name: usually the line after "Name" or the first capitalized line
  let name: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    if (/^name/i.test(lines[i]) && lines[i + 1]) {
      name = lines[i + 1];
      break;
    }
  }
  if (!name) {
    // Fallback: first line that looks like a name (only letters and spaces, 2+ words)
    name = lines.find((l) => /^[A-Za-z ]{5,40}$/.test(l) && l.split(" ").length >= 2);
  }

  // Pincode: 6 digits
  const pincodeMatch = text.match(/\b(\d{6})\b/);

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
