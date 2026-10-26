/** Only these are removed before an email reaches the AI model. Address is deliberately absent: the model must read it. */
export const PII_CATEGORIES = ['Person', 'PhoneNumber', 'Email'] as const;
export type PiiCategory = (typeof PII_CATEGORIES)[number];

export interface PiiEntity {
  category: PiiCategory;
  offset: number; // UTF-16 code units, as JavaScript strings index
  length: number;
  text: string;
}

/** Finds personal data in text. Implementations: azure-language, recorded. */
export interface PiiDetector {
  readonly name: string;
  detect(text: string): Promise<PiiEntity[]>;
}

export type PiiErrorKind = 'transport' | 'missing_recording';

export class PiiError extends Error {
  constructor(message: string, readonly kind: PiiErrorKind) {
    super(message);
    this.name = 'PiiError';
  }
}
