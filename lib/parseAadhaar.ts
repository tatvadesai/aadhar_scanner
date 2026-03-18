/**
 * Aadhaar card data types.
 * Extraction is handled by SmolVLM-256M-Instruct via lib/vlm.ts.
 * This file keeps the shared data interface used across components.
 *
 * Last updated: 2026-03-18
 */

export interface AadhaarData {
  name: string;
  aadhaarNumber: string;
  dob: string;
  gender: string;
  address: string;
  rawOutput: string;
}
