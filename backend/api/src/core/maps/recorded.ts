import { readRecording, RECORDINGS_DIR, writeRecording } from '../recordings.js';
import { type AddressQuery, type AddressValidator, AddressValidatorError, type GeocodeResponse } from './types.js';

/** The recording key: the four fields in a fixed order, so the same address always finds its recording. */
export const queryText = (q: AddressQuery) => JSON.stringify({ line1: q.line1, city: q.city, state: q.state, zip: q.zip });
/** The reverse-geocoding recording key (E19): the pin, latitude first. */
export const pinText = (pin: { lat: number; lon: number }) => JSON.stringify({ lat: pin.lat, lon: pin.lon });

/** Replays map responses saved by RecordingAddressValidator. Used by tests and CI. */
export class RecordedAddressValidator implements AddressValidator {
  readonly name = 'recorded';
  constructor(private readonly dir = RECORDINGS_DIR) {}

  async geocode(q: AddressQuery): Promise<GeocodeResponse> {
    const saved = readRecording(this.dir, 'address', '', queryText(q));
    if (saved === null) throw new AddressValidatorError(`no address recording for ${queryText(q)} in ${this.dir}`, 'missing_recording');
    return JSON.parse(saved) as GeocodeResponse;
  }

  async reverse(pin: { lat: number; lon: number }): Promise<GeocodeResponse> {
    const saved = readRecording(this.dir, 'address', 'reverse', pinText(pin));
    if (saved === null) throw new AddressValidatorError(`no reverse-geocoding recording for ${pinText(pin)} in ${this.dir}`, 'missing_recording');
    return JSON.parse(saved) as GeocodeResponse;
  }
}

/** Wraps a real validator and saves every response so RecordedAddressValidator can replay it (RECORD=1). */
export class RecordingAddressValidator implements AddressValidator {
  readonly name: string;
  constructor(private readonly inner: AddressValidator, private readonly dir = RECORDINGS_DIR) {
    this.name = `${inner.name}+recording`;
  }

  async geocode(q: AddressQuery): Promise<GeocodeResponse> {
    const out = await this.inner.geocode(q);
    writeRecording(this.dir, 'address', '', queryText(q), JSON.stringify(out));
    return out;
  }

  async reverse(pin: { lat: number; lon: number }): Promise<GeocodeResponse> {
    if (!this.inner.reverse) throw new AddressValidatorError(`${this.inner.name} cannot reverse-geocode`, 'unsupported');
    const out = await this.inner.reverse(pin);
    writeRecording(this.dir, 'address', 'reverse', pinText(pin), JSON.stringify(out));
    return out;
  }
}
