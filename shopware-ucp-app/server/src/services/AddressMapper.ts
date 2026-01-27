/**
 * Address Mapper Service
 * Handles mapping between UCP address format and Shopware address format
 * Including country/state lookups and validation
 */

import type { Address } from '../types/ucp.js';
import type {
  ShopwareAddress,
  Country,
  CountryState,
  Salutation,
} from '../types/shopware.js';
import type { ShopwareApiClient } from './ShopwareApiClient.js';
import type { MockShopwareApiClient } from './MockShopwareApiClient.js';
import { logger } from '../utils/logger.js';

type ApiClient = ShopwareApiClient | MockShopwareApiClient;

export interface AddressMappingResult {
  shopwareAddress: ShopwareAddress;
  country: Country;
  countryState?: CountryState;
  salutation: Salutation;
}

export interface AddressValidationError {
  field: string;
  code: string;
  message: string;
}

export class AddressMapper {
  /**
   * Map UCP address to Shopware address with all required lookups
   */
  async mapToShopware(
    client: ApiClient,
    address: Address
  ): Promise<AddressMappingResult> {
    // Lookup country by ISO code
    const country = await client.getCountryByIso(address.address_country);
    if (!country) {
      throw new AddressMappingError('COUNTRY_NOT_FOUND', `Country not found: ${address.address_country}`);
    }

    // Lookup country state if region provided
    let countryState: CountryState | undefined;
    if (address.address_region) {
      countryState = await client.getCountryState(country.id, address.address_region) ?? undefined;
      // State is optional, log warning if not found but don't fail
      if (!countryState) {
        logger.warn(
          { countryId: country.id, region: address.address_region },
          'Country state not found, continuing without state'
        );
      }
    }

    // Get default salutation
    const salutation = await client.getDefaultSalutation();
    if (!salutation) {
      throw new AddressMappingError('SALUTATION_NOT_FOUND', 'Default salutation not found');
    }

    const shopwareAddress: ShopwareAddress = {
      countryId: country.id,
      countryStateId: countryState?.id,
      salutationId: salutation.id,
      firstName: address.first_name,
      lastName: address.last_name,
      street: address.street_address,
      additionalAddressLine1: address.extended_address,
      zipcode: address.postal_code,
      city: address.address_locality,
      phoneNumber: address.phone,
    };

    return {
      shopwareAddress,
      country,
      countryState,
      salutation,
    };
  }

  /**
   * Map Shopware address back to UCP format
   */
  mapFromShopware(
    address: ShopwareAddress,
    countryIso: string,
    stateCode?: string
  ): Address {
    return {
      first_name: address.firstName,
      last_name: address.lastName,
      street_address: address.street,
      extended_address: address.additionalAddressLine1,
      address_locality: address.city,
      address_region: stateCode,
      postal_code: address.zipcode,
      address_country: countryIso,
      phone: address.phoneNumber,
    };
  }

  /**
   * Validate UCP address fields
   */
  validateAddress(address: Address): AddressValidationError[] {
    const errors: AddressValidationError[] = [];

    if (!address.first_name?.trim()) {
      errors.push({
        field: 'first_name',
        code: 'required',
        message: 'First name is required',
      });
    }

    if (!address.last_name?.trim()) {
      errors.push({
        field: 'last_name',
        code: 'required',
        message: 'Last name is required',
      });
    }

    if (!address.street_address?.trim()) {
      errors.push({
        field: 'street_address',
        code: 'required',
        message: 'Street address is required',
      });
    }

    if (!address.address_locality?.trim()) {
      errors.push({
        field: 'address_locality',
        code: 'required',
        message: 'City is required',
      });
    }

    if (!address.postal_code?.trim()) {
      errors.push({
        field: 'postal_code',
        code: 'required',
        message: 'Postal code is required',
      });
    }

    if (!address.address_country?.trim()) {
      errors.push({
        field: 'address_country',
        code: 'required',
        message: 'Country is required',
      });
    } else if (address.address_country.length !== 2) {
      errors.push({
        field: 'address_country',
        code: 'invalid_format',
        message: 'Country must be ISO 3166-1 alpha-2 code (e.g., "NL", "DE")',
      });
    }

    return errors;
  }

  /**
   * Check if shipping is available for a country
   */
  async isShippingAvailable(client: ApiClient, countryIso: string): Promise<boolean> {
    const country = await client.getCountryByIso(countryIso);
    return country?.shippingAvailable ?? false;
  }

  /**
   * Get list of supported countries for shipping
   */
  async getShippingCountries(client: ApiClient): Promise<Country[]> {
    const countries = await client.getCountries();
    return countries.filter((c) => c.active && c.shippingAvailable);
  }
}

export class AddressMappingError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AddressMappingError';
  }
}

export const addressMapper = new AddressMapper();
