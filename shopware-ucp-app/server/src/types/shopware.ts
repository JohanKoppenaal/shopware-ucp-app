/**
 * Shopware API Type Definitions
 * Based on Shopware 6.5+ Store API and Admin API
 */

// ============================================================================
// Common Types
// ============================================================================

export interface ShopwareEntity {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ShopwarePaginatedResponse<T> {
  total: number;
  data: T[];
  aggregations?: Record<string, unknown>;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface ShopwareOAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

export interface ShopCredentials {
  shopId: string;
  shopUrl: string;
  apiKey: string;
  secretKey: string;
  accessToken?: string;
  accessTokenExpiresAt?: Date;
}

// ============================================================================
// Cart Types
// ============================================================================

export interface ShopwareCart {
  token: string;
  name: string;
  price: CartPrice;
  lineItems: ShopwareLineItem[];
  deliveries: CartDelivery[];
  errors?: CartError[];
  transactions?: CartTransaction[];
  customerComment?: string;
  affiliateCode?: string;
  campaignCode?: string;
}

export interface CartPrice {
  netPrice: number;
  totalPrice: number;
  calculatedTaxes: CalculatedTax[];
  taxRules: TaxRule[];
  positionPrice: number;
  taxStatus: 'gross' | 'net';
  rawTotal: number;
}

export interface CalculatedTax {
  tax: number;
  taxRate: number;
  price: number;
}

export interface TaxRule {
  taxRate: number;
  percentage: number;
}

export interface ShopwareLineItem {
  id: string;
  referencedId?: string;
  label: string;
  quantity: number;
  type: 'product' | 'promotion' | 'custom' | 'credit';
  good: boolean;
  description?: string;
  cover?: ShopwareMedia;
  price?: LineItemPrice;
  children?: ShopwareLineItem[];
  payload?: Record<string, unknown>;
  priceDefinition?: LineItemPriceDefinition;
  stackable: boolean;
  removable: boolean;
  quantityInformation?: QuantityInformation;
}

export interface LineItemPrice {
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  calculatedTaxes: CalculatedTax[];
  taxRules: TaxRule[];
  referencePrice?: ReferencePrice;
  listPrice?: ListPrice;
}

export interface LineItemPriceDefinition {
  type: string;
  price: number;
  quantity: number;
  isCalculated: boolean;
  referencePriceDefinition?: ReferencePriceDefinition;
  listPrice?: number;
  percentage?: number;
}

export interface QuantityInformation {
  minPurchase: number;
  maxPurchase?: number;
  purchaseSteps: number;
}

export interface ReferencePrice {
  price: number;
  purchaseUnit: number;
  referenceUnit: number;
  unitName: string;
}

export interface ReferencePriceDefinition {
  price: number;
  purchaseUnit: number;
  referenceUnit: number;
  unitName: string;
}

export interface ListPrice {
  price: number;
  discount: number;
  percentage: number;
}

export interface CartDelivery {
  deliveryDate: DeliveryDate;
  shippingMethod: ShippingMethod;
  shippingCosts: CartPrice;
  positions: DeliveryPosition[];
  location: DeliveryLocation;
}

export interface DeliveryDate {
  earliest: string;
  latest: string;
}

export interface DeliveryPosition {
  identifier: string;
  quantity: number;
  price: LineItemPrice;
  lineItem: ShopwareLineItem;
}

export interface DeliveryLocation {
  address: ShopwareAddress;
  country?: Country;
  state?: CountryState;
}

export interface CartTransaction {
  paymentMethodId: string;
  amount: CartPrice;
}

export interface CartError {
  id: string;
  message: string;
  level: number;
  messageKey: string;
}

// ============================================================================
// Product Types
// ============================================================================

export interface ShopwareProduct extends ShopwareEntity {
  productNumber: string;
  name: string;
  description?: string;
  stock: number;
  availableStock: number;
  active: boolean;
  price: ProductPrice[];
  cover?: ShopwareMedia;
  media?: ShopwareMedia[];
  parentId?: string;
  children?: ShopwareProduct[];
  options?: ProductOption[];
  manufacturerId?: string;
  manufacturer?: ProductManufacturer;
  calculatedPrice?: CalculatedPrice;
  calculatedPrices?: CalculatedPrice[];
  isCloseout: boolean;
  minPurchase?: number;
  maxPurchase?: number;
  purchaseSteps: number;
  seoUrls?: SeoUrl[];
}

export interface ProductPrice {
  currencyId: string;
  net: number;
  gross: number;
  linked: boolean;
  listPrice?: ListPrice;
}

export interface CalculatedPrice {
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  calculatedTaxes: CalculatedTax[];
  taxRules: TaxRule[];
  referencePrice?: ReferencePrice;
  listPrice?: ListPrice;
}

export interface ProductOption {
  id: string;
  groupId: string;
  name: string;
  group?: ProductOptionGroup;
}

export interface ProductOptionGroup {
  id: string;
  name: string;
  description?: string;
  displayType: string;
  sortingType: string;
}

export interface ProductManufacturer extends ShopwareEntity {
  name: string;
  description?: string;
  media?: ShopwareMedia;
  link?: string;
}

export interface SeoUrl {
  id: string;
  salesChannelId?: string;
  languageId: string;
  routeName: string;
  foreignKey: string;
  pathInfo: string;
  seoPathInfo: string;
  isCanonical: boolean;
  isModified: boolean;
  isDeleted: boolean;
}

// ============================================================================
// Media Types
// ============================================================================

export interface ShopwareMedia extends ShopwareEntity {
  url: string;
  mimeType?: string;
  fileExtension?: string;
  fileName?: string;
  title?: string;
  alt?: string;
  thumbnails?: MediaThumbnail[];
}

export interface MediaThumbnail {
  id: string;
  width: number;
  height: number;
  url: string;
}

// ============================================================================
// Address Types
// ============================================================================

export interface ShopwareAddress {
  id?: string;
  countryId: string;
  countryStateId?: string;
  salutationId: string;
  firstName: string;
  lastName: string;
  street: string;
  zipcode: string;
  city: string;
  company?: string;
  department?: string;
  title?: string;
  phoneNumber?: string;
  additionalAddressLine1?: string;
  additionalAddressLine2?: string;
}

// ============================================================================
// Customer Types
// ============================================================================

export interface ShopwareCustomer extends ShopwareEntity {
  email: string;
  salutationId: string;
  firstName: string;
  lastName: string;
  customerNumber: string;
  guest: boolean;
  active: boolean;
  defaultBillingAddressId?: string;
  defaultShippingAddressId?: string;
  defaultBillingAddress?: ShopwareAddress;
  defaultShippingAddress?: ShopwareAddress;
  addresses?: ShopwareAddress[];
  salesChannelId: string;
  languageId: string;
  groupId: string;
  defaultPaymentMethodId?: string;
  company?: string;
  title?: string;
}

// ============================================================================
// Order Types
// ============================================================================

export interface ShopwareOrder extends ShopwareEntity {
  orderNumber: string;
  currencyId: string;
  currencyFactor: number;
  salesChannelId: string;
  billingAddressId: string;
  orderDateTime: string;
  orderDate: string;
  price: OrderPrice;
  amountTotal: number;
  amountNet: number;
  positionPrice: number;
  taxStatus: string;
  shippingCosts: OrderShippingCosts;
  shippingTotal: number;
  orderCustomer: OrderCustomer;
  currency?: Currency;
  languageId: string;
  language?: Language;
  addresses?: OrderAddress[];
  billingAddress?: OrderAddress;
  deliveries?: OrderDelivery[];
  lineItems?: OrderLineItem[];
  transactions?: OrderTransaction[];
  stateMachineState?: StateMachineState;
  customFields?: Record<string, unknown>;
}

export interface OrderPrice {
  netPrice: number;
  totalPrice: number;
  calculatedTaxes: CalculatedTax[];
  taxRules: TaxRule[];
  positionPrice: number;
  taxStatus: string;
  rawTotal: number;
}

export interface OrderShippingCosts {
  unitPrice: number;
  totalPrice: number;
  quantity: number;
  calculatedTaxes: CalculatedTax[];
  taxRules: TaxRule[];
}

export interface OrderCustomer {
  customerId?: string;
  email: string;
  salutationId: string;
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  customerNumber?: string;
}

export interface OrderAddress extends ShopwareEntity {
  orderId: string;
  countryId: string;
  countryStateId?: string;
  salutationId: string;
  firstName: string;
  lastName: string;
  street: string;
  zipcode: string;
  city: string;
  company?: string;
  department?: string;
  title?: string;
  phoneNumber?: string;
  additionalAddressLine1?: string;
  additionalAddressLine2?: string;
  country?: Country;
  countryState?: CountryState;
}

export interface OrderDelivery extends ShopwareEntity {
  orderId: string;
  shippingOrderAddressId: string;
  shippingMethodId: string;
  trackingCodes: string[];
  shippingDateEarliest: string;
  shippingDateLatest: string;
  shippingCosts: OrderShippingCosts;
  shippingOrderAddress?: OrderAddress;
  shippingMethod?: ShippingMethod;
  stateMachineState?: StateMachineState;
  positions?: OrderDeliveryPosition[];
}

export interface OrderDeliveryPosition extends ShopwareEntity {
  orderDeliveryId: string;
  orderLineItemId: string;
  price: LineItemPrice;
  quantity: number;
}

export interface OrderLineItem extends ShopwareEntity {
  orderId: string;
  identifier: string;
  referencedId?: string;
  productId?: string;
  quantity: number;
  label: string;
  type: string;
  payload?: Record<string, unknown>;
  good: boolean;
  price: LineItemPrice;
  priceDefinition?: LineItemPriceDefinition;
  unitPrice: number;
  totalPrice: number;
  description?: string;
  cover?: ShopwareMedia;
  position: number;
  product?: ShopwareProduct;
  parentId?: string;
  customFields?: Record<string, unknown>;
}

export interface OrderTransaction extends ShopwareEntity {
  orderId: string;
  paymentMethodId: string;
  amount: OrderTransactionAmount;
  paymentMethod?: PaymentMethod;
  stateMachineState?: StateMachineState;
  customFields?: Record<string, unknown>;
}

export interface OrderTransactionAmount {
  unitPrice: number;
  totalPrice: number;
  quantity: number;
  calculatedTaxes: CalculatedTax[];
  taxRules: TaxRule[];
}

// ============================================================================
// Shipping Method Types
// ============================================================================

export interface ShippingMethod extends ShopwareEntity {
  name: string;
  active: boolean;
  description?: string;
  trackingUrl?: string;
  deliveryTimeId?: string;
  deliveryTime?: DeliveryTime;
  taxType: string;
  taxId?: string;
  media?: ShopwareMedia;
  prices?: ShippingMethodPrice[];
  translated?: {
    name?: string;
    description?: string;
  };
}

export interface ShippingMethodPrice extends ShopwareEntity {
  shippingMethodId: string;
  ruleId?: string;
  calculation?: number;
  calculationRuleId?: string;
  quantityStart?: number;
  quantityEnd?: number;
  currencyPrice?: ShippingMethodCurrencyPrice[];
}

export interface ShippingMethodCurrencyPrice {
  currencyId: string;
  net: number;
  gross: number;
  linked: boolean;
}

export interface DeliveryTime extends ShopwareEntity {
  name: string;
  min: number;
  max: number;
  unit: 'day' | 'week' | 'month' | 'year';
  translated?: {
    name?: string;
  };
}

// ============================================================================
// Payment Method Types
// ============================================================================

export interface PaymentMethod extends ShopwareEntity {
  name: string;
  description?: string;
  active: boolean;
  afterOrderEnabled: boolean;
  plugin?: unknown;
  handlerIdentifier?: string;
  media?: ShopwareMedia;
  translated?: {
    name?: string;
    description?: string;
  };
}

// ============================================================================
// Country Types
// ============================================================================

export interface Country extends ShopwareEntity {
  name: string;
  iso: string;
  iso3?: string;
  active: boolean;
  position: number;
  shippingAvailable: boolean;
  taxFree: boolean;
  states?: CountryState[];
  translated?: {
    name?: string;
  };
}

export interface CountryState extends ShopwareEntity {
  countryId: string;
  shortCode: string;
  name: string;
  position: number;
  active: boolean;
  translated?: {
    name?: string;
  };
}

// ============================================================================
// Currency Types
// ============================================================================

export interface Currency extends ShopwareEntity {
  isoCode: string;
  factor: number;
  symbol: string;
  shortName: string;
  name: string;
  position: number;
  isSystemDefault: boolean;
  translated?: {
    name?: string;
    shortName?: string;
  };
}

// ============================================================================
// Language Types
// ============================================================================

export interface Language extends ShopwareEntity {
  name: string;
  locale?: Locale;
  localeId: string;
  parentId?: string;
  translationCodeId?: string;
  translationCode?: Locale;
}

export interface Locale extends ShopwareEntity {
  code: string;
  name: string;
  territory: string;
}

// ============================================================================
// Salutation Types
// ============================================================================

export interface Salutation extends ShopwareEntity {
  salutationKey: string;
  displayName: string;
  letterName: string;
  translated?: {
    displayName?: string;
    letterName?: string;
  };
}

// ============================================================================
// State Machine Types
// ============================================================================

export interface StateMachineState extends ShopwareEntity {
  name: string;
  technicalName: string;
  stateMachineId: string;
  translated?: {
    name?: string;
  };
}

// ============================================================================
// Promotion Types
// ============================================================================

export interface Promotion extends ShopwareEntity {
  name: string;
  active: boolean;
  validFrom?: string;
  validUntil?: string;
  maxRedemptionsGlobal?: number;
  maxRedemptionsPerCustomer?: number;
  exclusive: boolean;
  useCodes: boolean;
  useSetGroups: boolean;
  customerRestriction: boolean;
  code?: string;
  discounts?: PromotionDiscount[];
  translated?: {
    name?: string;
  };
}

export interface PromotionDiscount extends ShopwareEntity {
  promotionId: string;
  scope: string;
  type: string;
  value: number;
  considerAdvancedRules: boolean;
  maxValue?: number;
  sorterKey?: string;
  applierKey?: string;
  usageKey?: string;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

export interface ShopwareWebhookPayload {
  data: {
    payload: Record<string, unknown>[];
    event: string;
  };
  source: {
    url: string;
    appVersion: string;
    shopId: string;
  };
  timestamp: number;
}
