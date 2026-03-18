"use client";

/**
 * ResultCard — shows VLM-extracted Aadhaar fields in editable inputs.
 * User can correct any field before saving to Google Sheet.
 *
 * Last updated: 2026-03-18
 */

import { useState } from "react";
import { AadhaarData } from "@/lib/parseAadhaar";

interface Props {
  data: AadhaarData;
  onReset: () => void;
}

export default function ResultCard({ data, onReset }: Props) {
  const [edited, setEdited] = useState<AadhaarData>({ ...data });

  const update = (key: keyof AadhaarData, value: string) =>
    setEdited((prev) => ({ ...prev, [key]: value }));

  const Field = ({
    label,
    field,
  }: {
    label: string;
    field: keyof AadhaarData;
  }) => {
    if (field === "rawOutput") return null;
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 uppercase tracking-wide">
          {label}
        </label>
        <input
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          value={(edited[field] as string) ?? ""}
          onChange={(e) => update(field, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Extracted Data</h2>
        <span className="text-xs px-2 py-1 rounded-full bg-blue-900 text-blue-300">
          SmolVLM
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Name" field="name" />
        <Field label="Aadhaar Number" field="aadhaarNumber" />
        <Field label="Date of Birth" field="dob" />
        <Field label="Gender" field="gender" />
        <Field label="Address" field="address" />
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
            // Google Sheets integration — coming next
            alert("Google Sheets integration coming soon!");
          }}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Save to Sheet
        </button>
      </div>

      {edited.rawOutput && (
        <details className="mt-1">
          <summary className="text-xs text-gray-500 cursor-pointer">
            Show raw model output
          </summary>
          <pre className="text-xs text-gray-500 mt-2 whitespace-pre-wrap break-words bg-gray-800 p-2 rounded">
            {edited.rawOutput}
          </pre>
        </details>
      )}
    </div>
  );
}
