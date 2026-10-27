import { z } from 'zod';

// What the model extracts from an order email (SPEC §5.3). The client is identified by code, not the model.
export const ExtractionSchema = z.object({
  items: z.array(z.object({ sku: z.string(), qty: z.number() })),
  address: z.object({
    line1: z.string().nullable(),
    line2: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    zip: z.string().nullable(),
    raw: z.string().nullable(),
  }),
  requested_commitment: z.enum(['same_day', 'next_day', 'standard']).nullable(),
  confidence: z.object({ items: z.number(), address: z.number() }),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type ExtractedAddress = Extraction['address'];

export interface SavedAddress {
  id: number;
  client_id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
}
