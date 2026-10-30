/** A complete US address to look up on the map. */
export interface AddressQuery {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

/** The parts of an Azure Maps Get Geocoding feature that the address rules read. */
export interface GeocodeFeature {
  geometry?: { type: 'Point'; coordinates: [number, number] }; // [longitude, latitude] (E19 start pin)
  properties: {
    type: string; // Address | RoadBlock | RoadIntersection | Neighborhood | PopulatedPlace | Postcode1 | AdminDivision1 | ...
    confidence: 'High' | 'Medium' | 'Low';
    matchCodes?: string[]; // Good | Ambiguous | UpHierarchy
    address?: {
      addressLine?: string;
      locality?: string;
      postalCode?: string;
      adminDistricts?: { shortName?: string; name?: string }[]; // first entry is the state
      formattedAddress?: string;
    };
  };
}

export interface GeocodeResponse {
  features: GeocodeFeature[];
}

/** Looks an address up on a map. Implementations: azure-maps, recorded. The rules live in modules/intake/validate.ts. */
export interface AddressValidator {
  readonly name: string;
  geocode(q: AddressQuery): Promise<GeocodeResponse>;
  /** The address at a pin (E19 second Confirm, REQ-LINK-03); optional so stand-ins need not implement it. */
  reverse?(pin: { lat: number; lon: number }): Promise<GeocodeResponse>;
}

export type AddressValidatorErrorKind = 'transport' | 'missing_recording' | 'unsupported';

export class AddressValidatorError extends Error {
  constructor(message: string, readonly kind: AddressValidatorErrorKind) {
    super(message);
    this.name = 'AddressValidatorError';
  }
}
