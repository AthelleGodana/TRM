// The plug-in point for fuel analytics. A provider receives ONE tenant's
// data and returns anomalies; it never touches the database itself.
//
//   analyze(request) -> Promise<{ modelVersion, anomalies: Anomaly[], skipped? }>
//
// The request/response shapes are documented in docs/ai-fuel-contract.md
// and must stay in step with ai-fuel-service/app/contract.py.
export const CONTRACT_VERSION = '1.0';
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export class FuelAnalyticsProvider {
  get name() {
    throw new Error('Provider must define a name.');
  }

  async analyze(_request) {
    throw new Error('Provider must implement analyze().');
  }
}

// Validates a provider response against the request it answers. Anything
// referring to another organisation or to ids that were not in the request
// is rejected, so a misbehaving service cannot attach anomalies to data it
// was never given.
export function validateAnalysisResponse(request, response) {
  if (!response || response.organizationId !== request.organizationId) {
    throw new Error('Analysis response is for a different organisation.');
  }
  if (!Array.isArray(response.anomalies)) throw new Error('Analysis response has no anomalies list.');

  const vehicleIds = new Set(request.vehicles.map((v) => v.id));
  const recordIds = new Set(request.fuelRecords.map((r) => r.id));
  return response.anomalies.map((a, i) => {
    const where = `anomalies[${i}]`;
    if (typeof a.type !== 'string' || !a.type) throw new Error(`${where}.type is required.`);
    if (!SEVERITIES.includes(a.severity)) throw new Error(`${where}.severity is invalid.`);
    if (typeof a.score !== 'number' || a.score < 0 || a.score > 1) throw new Error(`${where}.score must be 0..1.`);
    if (!a.explanation || typeof a.explanation.summary !== 'string') {
      throw new Error(`${where}.explanation.summary is required.`);
    }
    if (a.vehicleId != null && !vehicleIds.has(a.vehicleId)) throw new Error(`${where}.vehicleId was not in the request.`);
    if (a.fuelRecordId != null && !recordIds.has(a.fuelRecordId)) throw new Error(`${where}.fuelRecordId was not in the request.`);
    return {
      type: a.type.slice(0, 100),
      severity: a.severity,
      score: a.score,
      busId: a.vehicleId ?? null,
      fuelRecordId: a.fuelRecordId ?? null,
      explanation: a.explanation,
    };
  });
}
