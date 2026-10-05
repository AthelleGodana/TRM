// Tier hierarchy: higher rank can access all pickup points at or below its rank.
export const TIER_RANK = { TOWN: 1, LAVINGTON: 2, ADAMS: 3 };

export function canAccessPickupPoint(studentTier, pickupPointTier) {
  return TIER_RANK[studentTier] >= TIER_RANK[pickupPointTier];
}
