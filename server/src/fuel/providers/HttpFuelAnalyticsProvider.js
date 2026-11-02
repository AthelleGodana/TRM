import { FuelAnalyticsProvider } from './FuelAnalyticsProvider.js';

// Calls the internal ai-fuel-service (POST /v1/analyze), authenticated with
// the shared service secret. The service only ever sees the request body:
// one organisation's vehicles and fuel records.
export class HttpFuelAnalyticsProvider extends FuelAnalyticsProvider {
  constructor({ url, secret, timeoutMs = 30000, fetchImpl = fetch }) {
    super();
    if (!url || !secret) throw new Error('HttpFuelAnalyticsProvider needs a URL and a service secret.');
    this.url = url.replace(/\/+$/, '');
    this.secret = secret;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  get name() {
    return 'http';
  }

  async analyze(request) {
    const res = await this.fetch(`${this.url}/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Secret': this.secret },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`ai-fuel-service responded ${res.status}`);
    return res.json();
  }
}
