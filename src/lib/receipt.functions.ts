import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readReceipt } from "./receipt.server";

// ~6 MB of base64 covers a resized phone photo or a PDF up to 4 MB.
const input = z.object({
  file: z
    .string()
    .max(6_000_000)
    .regex(/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/),
});

/** Reads a receipt photo or PDF with Lovable AI and returns its merchant, total and line items. */
export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }) => readReceipt(data.file));
