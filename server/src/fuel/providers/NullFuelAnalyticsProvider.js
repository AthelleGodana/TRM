import { FuelAnalyticsProvider } from './FuelAnalyticsProvider.js';

// Default provider: performs no analysis and reports the run as skipped.
export class NullFuelAnalyticsProvider extends FuelAnalyticsProvider {
  get name() {
    return 'null';
  }

  async analyze() {
    return { modelVersion: null, anomalies: [], skipped: true };
  }
}
