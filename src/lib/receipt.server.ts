import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import { AI_GATEWAY_URL, createLovableAiGatewayRunIdFetch } from "./ai-gateway.server";
import { RECEIPT_CATEGORIES, type ReceiptScanResult } from "./receipt-types";

const MODEL = "openai/gpt-6-astra";

const receiptSchema = z.object({
  is_receipt: z.boolean(),
  merchant: z.string(),
  date: z.string().nullable(),
  currency: z.enum(["AED", "SAR", "KWD"]).nullable(),
  total: z.number(),
  items: z.array(
    z.object({
      name: z.string(),
      price: z.number(),
      category: z.enum(RECEIPT_CATEGORIES),
    }),
  ),
});

const INSTRUCTIONS = `You read shop receipts from the UAE, Saudi Arabia and Kuwait for a personal finance app.
Return:
- is_receipt: false if the image is not a purchase receipt or is unreadable.
- merchant: the shop name as a person would say it (e.g. "Carrefour", "Lulu Hypermarket"), not the legal entity.
- date: purchase date as YYYY-MM-DD, or null if not shown.
- currency: AED, SAR or KWD based on the receipt (dirham/درهم → AED, riyal/ريال → SAR, dinar/دينار/KD → KWD); null if unclear.
- total: the final amount paid including VAT, after discounts.
- items: every purchased line with its line total (quantity × unit price) and the best category:
  groceries (food, drinks, household consumables), dining (restaurants, cafes, takeaway), transport (fuel, taxis, parking),
  shopping (clothes, home goods, gifts, beauty), electronics (devices, cables, appliances), utilities (bills, phone top-ups),
  health (pharmacy, clinic, gym), entertainment, education (books, school supplies), housing (furniture, repairs), fees, other.
Do not list VAT, service charge, rounding, payment or change lines as items. Read Arabic and English text.
The receipt may be a photo or a PDF (e-receipt, online order or tax invoice); for a multi-page PDF, read all pages as one purchase.`;

/** A receipt photo goes in as an image; a PDF receipt as a file with its base64 bytes. */
function receiptPart(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const mediaType = dataUrl.slice(5, dataUrl.indexOf(";"));
  const base64 = dataUrl.slice(comma + 1);
  if (!base64) throw new Error("Empty file");
  if (mediaType === "application/pdf") {
    return { type: "file" as const, filename: "receipt.pdf", data: base64, mediaType: "application/pdf" };
  }
  return { type: "image" as const, image: new URL(dataUrl) };
}

export async function readReceipt(fileDataUrl: string): Promise<ReceiptScanResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, reason: "failed" };

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: AI_GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: INSTRUCTIONS,
      maxRetries: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this receipt." },
            receiptPart(fileDataUrl),
          ],
        },
      ],
      output: Output.object({ schema: receiptSchema }),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const out = await result.output;
    if (!out.is_receipt || out.items.length === 0) return { ok: false, reason: "notReceipt" };
    return {
      ok: true,
      receipt: {
        merchant: out.merchant.trim() || "Receipt",
        date: out.date && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null,
        currency: out.currency,
        total: Number(out.total) || 0,
        items: out.items.map((i) => ({ name: i.name.trim(), price: Number(i.price) || 0, category: i.category })),
      },
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return { ok: false, reason: "notReceipt" };
    const status = APICallError.isInstance(error) ? error.statusCode : undefined;
    console.error("Receipt scan failed", status, error instanceof Error ? error.message : error);
    if (status === 402 || status === 403) return { ok: false, reason: "credits" };
    if (status === 429) return { ok: false, reason: "busy" };
    return { ok: false, reason: "failed" };
  }
}
