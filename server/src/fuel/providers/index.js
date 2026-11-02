import { env } from '../../config/env.js';
import { NullFuelAnalyticsProvider } from './NullFuelAnalyticsProvider.js';
import { HttpFuelAnalyticsProvider } from './HttpFuelAnalyticsProvider.js';

// Chooses the provider for one organisation. The HTTP (AI) provider is used
// only when it is configured platform-wide (FUEL_ANALYTICS_PROVIDER=http plus
// the service URL and secret) AND the organisation has both Fuel Hub and AI
// fuel analytics enabled. Everything else gets the null provider.
export function getFuelAnalyticsProvider(org, config = env.fuel) {
  const useHttp = config.provider === 'http'
    && config.serviceUrl && config.serviceSecret
    && org?.fuelHubEnabled && org?.aiFuelAnalyticsEnabled;
  if (!useHttp) return new NullFuelAnalyticsProvider();
  return new HttpFuelAnalyticsProvider({
    url: config.serviceUrl,
    secret: config.serviceSecret,
    timeoutMs: config.timeoutMs,
  });
}

export { NullFuelAnalyticsProvider, HttpFuelAnalyticsProvider };
