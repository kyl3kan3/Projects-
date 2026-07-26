// RevenueCat wrapper: entitlement cache in settings so an outage never locks out a payer.
// Free-tier gates per README: 10 core symptoms, 30-day history, 1 medication;
// Plus gates: report, insights, health import, custom symptoms, unlimited meds.
import Purchases from 'react-native-purchases';
import { meds, settings, symptoms } from '@/lib/repositories';

const ENTITLEMENT = 'plus';
const CACHE_KEY = 'entitlement.plus';

export function isPlusCached(): boolean {
  return settings.get(CACHE_KEY) === '1';
}

export async function refreshEntitlement(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    const active = info.entitlements.active[ENTITLEMENT] !== undefined;
    settings.set(CACHE_KEY, active ? '1' : '0');
    return active;
  } catch {
    // Offline or RevenueCat outage: degrade to the cached value — never lock out a payer.
    return isPlusCached();
  }
}

export async function purchase(packageToBuy: import('react-native-purchases').PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
  const active = customerInfo.entitlements.active[ENTITLEMENT] !== undefined;
  settings.set(CACHE_KEY, active ? '1' : '0');
  return active;
}

export async function restore(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  const active = info.entitlements.active[ENTITLEMENT] !== undefined;
  settings.set(CACHE_KEY, active ? '1' : '0');
  return active;
}

export type Gate = 'symptom-11' | 'med-2' | 'report' | 'insights' | 'health-import' | 'history-31';

/** Returns null when allowed, or the gate that requires Plus. */
export function checkGate(gate: Gate): Gate | null {
  if (isPlusCached()) return null;
  switch (gate) {
    case 'symptom-11':
      return symptoms.active().length >= 10 ? gate : null;
    case 'med-2':
      return meds.active().length >= 1 ? gate : null;
    default:
      return gate;
  }
}
