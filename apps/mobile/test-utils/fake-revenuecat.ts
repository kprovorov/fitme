/**
 * The fake RevenueCat customer: a stand-in for `react-native-purchases`, the
 * source `useIsProQuery` and `useCustomerInfoQuery` (`~/hooks/revenueCat`)
 * read, for the screens that show the Subscription (the Profile card, the
 * Subscription screen, the delete flow's billing warning).
 *
 * A test file stands the module in with it:
 *
 * ```ts
 * jest.mock("react-native-purchases", () =>
 *   jest.requireActual<typeof import("~/test-utils/fake-revenuecat")>(
 *     "~/test-utils/fake-revenuecat"
 *   ).purchasesModule
 * );
 * ```
 *
 * `fakeRevenueCat` is the customer behind it, free until a test says
 * otherwise: `setPro(state, overrides?)` makes it a Fitme Pro customer that
 * is `renewing`, on a `trial`, `cancelled` but still active, `lifetime` or
 * `promotional` (a grant of a year, which no store sells), each with its
 * product's billing period (`getProducts`
 * answers the product's `subscriptionPeriod`), store, expiry date and
 * `managementURL`; `setFree()` takes it back; `failReads()` fails every
 * `getCustomerInfo` with RevenueCat's network error until the customer is
 * set again. `holdReads()` holds every read until the function it returns is
 * called. `restorePurchases` answers the customer and counts in
 * `restores`, and `failNextRestore()` fails the next one. Every change tells
 * the `addCustomerInfoUpdateListener` listeners, as the SDK does.
 * `after-each.ts` resets it.
 *
 * Only the members the app uses are implemented: a new one is missing rather
 * than a silent no-op, so a new call site fails its test.
 */
import { proEntitlement } from "@fitme/core";
import type {
  CustomerInfo,
  PeriodType,
  PurchasesEntitlementInfo,
  PurchasesStoreProduct,
  Store,
} from "react-native-purchases";

/** Where a Fitme Pro customer's Subscription stands. */
export type ProState =
  | "cancelled"
  | "lifetime"
  | "promotional"
  | "renewing"
  | "trial";

/** What a Pro state carries; `setPro`'s overrides replace any of it. */
export interface ProCustomer {
  /** The product's ISO 8601 billing period (`P1M`, `P1Y`), `null` for none. */
  readonly billingPeriod: string | null;
  /** When access ends, `null` for lifetime. */
  readonly expiresAt: string | null;
  readonly managementURL: string | null;
  readonly store: Store;
}

/** RevenueCat's error as the SDK rejects with it (`PurchasesError`). */
export interface FakePurchasesError extends Error {
  readonly code: string;
  readonly readableErrorCode: string;
  readonly underlyingErrorMessage: string;
  readonly userCancelled: boolean | null;
}

/**
 * `VERIFICATION_RESULT.NOT_REQUESTED`. The enum lives in the SDK this module
 * stands in for, so importing it would import the stand-in itself.
 */
/* oxlint-disable typescript/no-unsafe-enum-assignment -- The enum's own value, see above. */
const NOT_REQUESTED =
  "NOT_REQUESTED" as PurchasesEntitlementInfo["verification"];
/* oxlint-enable typescript/no-unsafe-enum-assignment */

const DAY_MS = 24 * 60 * 60 * 1000;

/** An instant `days` from now, so an active entitlement never lies in the past. */
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString();

const APP_STORE_MANAGEMENT_URL = "https://apps.apple.com/account/subscriptions";

/**
 * Each state's details as of now: a subscription bought 300 days ago that
 * renews (or ends) in 65 days, a trial that ends in 5, and a promotional
 * grant of a year (its `billingPeriod`, the grant's duration, which no store
 * sells as a product).
 */
const proDefaults = (state: ProState): ProCustomer => {
  switch (state) {
    case "lifetime": {
      return {
        billingPeriod: null,
        expiresAt: null,
        managementURL: null,
        store: "APP_STORE",
      };
    }

    case "promotional": {
      return {
        billingPeriod: "P1Y",
        expiresAt: daysFromNow(65),
        managementURL: null,
        store: "PROMOTIONAL",
      };
    }

    case "trial": {
      return {
        billingPeriod: "P1Y",
        expiresAt: daysFromNow(5),
        managementURL: APP_STORE_MANAGEMENT_URL,
        store: "APP_STORE",
      };
    }

    case "cancelled":
    case "renewing": {
      return {
        billingPeriod: "P1Y",
        expiresAt: daysFromNow(65),
        managementURL: APP_STORE_MANAGEMENT_URL,
        store: "APP_STORE",
      };
    }
  }
};

/** The product id a subscription of that billing period is bought as. */
const productFor = (state: ProState, billingPeriod: string | null) => {
  if (state === "lifetime") {
    return "fitme_pro_lifetime";
  }

  const period = billingPeriod === "P1M" ? "monthly" : "yearly";

  return state === "promotional"
    ? `rc_promo_fitme_pro_${period}`
    : `fitme_pro_${period}`;
};

type Customer =
  | { readonly kind: "failing" }
  | { readonly kind: "free" }
  | {
      readonly kind: "pro";
      readonly pro: ProCustomer;
      readonly productIdentifier: string;
      readonly purchasedAt: string;
      readonly state: ProState;
    };

const millis = (iso: string | null) =>
  iso === null ? null : new Date(iso).getTime();

const purchasesError = (): FakePurchasesError =>
  Object.assign(new Error("Error performing request."), {
    code: "10",
    readableErrorCode: "NETWORK_ERROR",
    underlyingErrorMessage: "The Internet connection appears to be offline.",
    userCancelled: null,
  });

const entitlementOf = (
  customer: Extract<Customer, { kind: "pro" }>
): PurchasesEntitlementInfo => {
  const { pro, productIdentifier, state } = customer;
  const periodType: PeriodType = state === "trial" ? "TRIAL" : "NORMAL";

  const unsubscribedAt =
    state === "cancelled" ? "2026-10-01T08:00:00.000Z" : null;

  return {
    billingIssueDetectedAt: null,
    billingIssueDetectedAtMillis: null,
    expirationDate: pro.expiresAt,
    expirationDateMillis: millis(pro.expiresAt),
    identifier: proEntitlement,
    isActive: true,
    isSandbox: false,
    latestPurchaseDate: customer.purchasedAt,
    latestPurchaseDateMillis: new Date(customer.purchasedAt).getTime(),
    originalPurchaseDate: customer.purchasedAt,
    originalPurchaseDateMillis: new Date(customer.purchasedAt).getTime(),
    ownershipType: "PURCHASED",
    periodType,
    productIdentifier,
    productPlanIdentifier: null,
    store: pro.store,
    unsubscribeDetectedAt: unsubscribedAt,
    unsubscribeDetectedAtMillis: millis(unsubscribedAt),
    verification: NOT_REQUESTED,
    willRenew: state === "renewing" || state === "trial",
  };
};

/** The customer as `getCustomerInfo` answers it. */
const customerInfoOf = (
  customer: Exclude<Customer, { kind: "failing" }>
): CustomerInfo => {
  const entitlement = customer.kind === "pro" ? entitlementOf(customer) : null;
  const product = entitlement?.productIdentifier;

  // A promotional grant is no store subscription, whatever its duration.
  const isSubscription =
    customer.kind === "pro" &&
    customer.pro.billingPeriod !== null &&
    customer.pro.store !== "PROMOTIONAL";

  return {
    activeSubscriptions: isSubscription && product ? [product] : [],
    allExpirationDates: product
      ? { [product]: entitlement.expirationDate }
      : {},
    allPurchaseDates:
      product && customer.kind === "pro"
        ? { [product]: customer.purchasedAt }
        : {},
    allPurchasedProductIdentifiers: product ? [product] : [],
    entitlements: {
      active: entitlement ? { [proEntitlement]: entitlement } : {},
      all: entitlement ? { [proEntitlement]: entitlement } : {},
      verification: NOT_REQUESTED,
    },
    firstSeen: "2025-03-14T12:00:00.000Z",
    latestExpirationDate: entitlement?.expirationDate ?? null,
    managementURL: customer.kind === "pro" ? customer.pro.managementURL : null,
    nonSubscriptionTransactions: [],
    originalAppUserId: "$RCAnonymousID:fake",
    originalApplicationVersion: null,
    originalPurchaseDate: null,
    requestDate: new Date().toISOString(),
    subscriptionsByProductIdentifier: {},
  };
};

let customer: Customer = { kind: "free" };
let restores = 0;
let restoreFailures = 0;
const listeners = new Set<(info: CustomerInfo) => void>();

const setCustomer = (next: Customer) => {
  customer = next;

  if (next.kind === "failing") {
    return;
  }

  const info = customerInfoOf(next);

  for (const listener of listeners) {
    listener(info);
  }
};

/** The customer as it stands, a failing one answered as free. */
const customerInfoNow = (): CustomerInfo =>
  customerInfoOf(customer.kind === "failing" ? { kind: "free" } : customer);

let heldReads: (() => void)[] | null = null;

const answerRead = (): Promise<CustomerInfo> =>
  customer.kind === "failing"
    ? Promise.reject(purchasesError())
    : Promise.resolve(customerInfoOf(customer));

/** A customer read, answered once any hold on reads is released. */
const readCustomer = (): Promise<CustomerInfo> => {
  const held = heldReads;

  if (held === null) {
    return answerRead();
  }

  return new Promise<void>((resolve) => {
    held.push(resolve);
  }).then(answerRead);
};

/** Each product's price by its billing period (`lifetime` for none). */
const PRICES: Readonly<Record<string, number>> = {
  lifetime: 149.99,
  P1M: 9.99,
  P1Y: 59.99,
};

/** One product as `getProducts` answers it: only what the app reads is real. */
const productOf = (
  identifier: string,
  billingPeriod: string | null
): PurchasesStoreProduct =>
  ({
    currencyCode: "USD",
    description: "Fitme Pro",
    identifier,
    price: PRICES[billingPeriod ?? "lifetime"] ?? 0,
    priceString: `$${PRICES[billingPeriod ?? "lifetime"] ?? 0}`,
    subscriptionPeriod: billingPeriod,
    title: "Fitme Pro",
  }) as PurchasesStoreProduct;

/**
 * The billing period of a product the store sells, `undefined` for an id it
 * doesn't (a promotional grant's included).
 */
const productPeriod = (identifier: string): string | null | undefined => {
  if (identifier.startsWith("rc_promo_")) {
    return undefined;
  }

  if (customer.kind === "pro" && customer.productIdentifier === identifier) {
    return customer.pro.billingPeriod;
  }

  if (identifier.endsWith("_monthly")) {
    return "P1M";
  }

  if (identifier.endsWith("_yearly")) {
    return "P1Y";
  }

  return identifier === "fitme_pro_lifetime" ? null : undefined;
};

const Purchases = {
  addCustomerInfoUpdateListener: (listener: (info: CustomerInfo) => void) => {
    listeners.add(listener);
  },
  configure: () => {
    // Nothing to set up: the customer is the fake's.
  },
  getCustomerInfo: readCustomer,
  getProducts: (identifiers: string[]): Promise<PurchasesStoreProduct[]> =>
    Promise.resolve(
      identifiers.flatMap((identifier) => {
        const period = productPeriod(identifier);

        return period === undefined ? [] : [productOf(identifier, period)];
      })
    ),
  invalidateCustomerInfoCache: () => Promise.resolve(),
  // Signing in and out never fail on `failReads()`, which fails the reads.
  logIn: () =>
    Promise.resolve({ created: false, customerInfo: customerInfoNow() }),
  logOut: () => Promise.resolve(customerInfoNow()),
  removeCustomerInfoUpdateListener: (
    listener: (info: CustomerInfo) => void
  ) => {
    listeners.delete(listener);

    return true;
  },
  restorePurchases: (): Promise<CustomerInfo> => {
    restores += 1;

    if (restoreFailures > 0) {
      restoreFailures -= 1;

      return Promise.reject(purchasesError());
    }

    return readCustomer();
  },
  setDisplayName: () => Promise.resolve(),
  setEmail: () => Promise.resolve(),
};

/** The module a test file hands `jest.mock("react-native-purchases", …)`. */
export const purchasesModule = { __esModule: true, default: Purchases };

export const fakeRevenueCat = {
  /** Fails every customer read until the customer is set again. */
  failReads: () => {
    setCustomer({ kind: "failing" });
  },
  /**
   * Holds every customer read until the function it returns is called,
   * which answers them with the customer as it stands then.
   */
  holdReads: () => {
    const held: (() => void)[] = [];
    heldReads = held;

    return () => {
      if (heldReads === held) {
        heldReads = null;
      }

      for (const release of held) {
        release();
      }
    };
  },
  /** Fails the next `restorePurchases`; each call queues one more. */
  failNextRestore: () => {
    restoreFailures += 1;
  },
  reset: () => {
    customer = { kind: "free" };
    heldReads = null;
    restores = 0;
    restoreFailures = 0;
    listeners.clear();
  },
  /** How many times `restorePurchases` was called, failed ones included. */
  get restores() {
    return restores;
  },
  setFree: () => {
    setCustomer({ kind: "free" });
  },
  /** Makes the customer Fitme Pro in `state`, its details overridden. */
  setPro: (state: ProState, overrides: Partial<ProCustomer> = {}) => {
    const pro = { ...proDefaults(state), ...overrides };
    setCustomer({
      kind: "pro",
      pro,
      productIdentifier: productFor(state, pro.billingPeriod),
      purchasedAt: daysFromNow(-300),
      state,
    });
  },
};
