"use client";

import { useState } from "react";
import { AadhaarData } from "@/lib/parseAadhaar";

interface Props {
  data: AadhaarData;
  onReset: () => void;
}

export default function ResultCard({ data, onReset }: Props) {
  const [edited, setEdited] = useState<AadhaarData>({ ...data });

  const field = (label: string, key: keyof AadhaarData) => {
    if (key === "source" || key === "rawText") return null;
    return (
      <div key={key} className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 uppercase tracking-wide">{label}</label>
        <input
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          value={(edited[key] as string) ?? ""}
          onChange={(e) => setEdited((prev) => ({ ...prev, [key]: e.target.value }))}
        />
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Extracted Data</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-yellow-900 text-yellow-300">
          via OCR
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {field("Name", "name")}
        {field("Aadhaar Number", "aadhaarNumber")}
        {field("Date of Birth", "dob")}
        {field("Gender", "gender")}
{field("Pincode", "pincode")}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onReset}
          className="flex-1 border border-gray-600 text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
        >
          Scan Another
        </button>
        <button
          onClick={() => {
            // Google Sheets integration will go here
            alert("Google Sheets integration coming soon!");
          }}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Save to Sheet
        </button>
      </div>

      {data.rawText && (
        <details className="mt-1">
          <summary className="text-xs text-gray-500 cursor-pointer">Show raw OCR text</summary>
          <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap break-words bg-gray-800 p-2 rounded">{data.rawText}</pre>
        </details>
      )}
    </div>
  );
}
