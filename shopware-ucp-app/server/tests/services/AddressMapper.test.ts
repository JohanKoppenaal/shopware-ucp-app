/**
 * AddressMapper Unit Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AddressMapper, AddressMappingError } from '../../src/services/AddressMapper.js';
import type { Address } from '../../src/types/ucp.js';
import type { Country, CountryState, Salutation } from '../../src/types/shopware.js';

// Mock API client
const createMockClient = () => ({
  getCountryByIso: jest.fn<() => Promise<Country | null>>(),
  getCountryState: jest.fn<() => Promise<CountryState | null>>(),
  getDefaultSalutation: jest.fn<() => Promise<Salutation | null>>(),
  getCountries: jest.fn<() => Promise<Country[]>>(),
});

describe('AddressMapper', () => {
  let addressMapper: AddressMapper;
  let mockClient: ReturnType<typeof createMockClient>;

  const mockCountry: Country = {
    id: 'country-nl-id',
    name: 'Netherlands',
    iso: 'NL',
    active: true,
    position: 1,
    shippingAvailable: true,
    taxFree: false,
    createdAt: '2024-01-01T00:00:00Z',
  };

  const mockCountryState: CountryState = {
    id: 'state-nh-id',
    name: 'North Holland',
    shortCode: 'NH',
    countryId: 'country-nl-id',
    position: 1,
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
  };

  const mockSalutation: Salutation = {
    id: 'salutation-mr-id',
    displayName: 'Mr.',
    letterName: 'Dear Mr.',
    salutationKey: 'mr',
    createdAt: '2024-01-01T00:00:00Z',
  };

  const validAddress: Address = {
    first_name: 'John',
    last_name: 'Doe',
    street_address: '123 Main Street',
    extended_address: 'Apt 4B',
    address_locality: 'Amsterdam',
    address_region: 'NH',
    postal_code: '1012 AB',
    address_country: 'NL',
    phone: '+31612345678',
  };

  beforeEach(() => {
    addressMapper = new AddressMapper();
    mockClient = createMockClient();
  });

  describe('mapToShopware', () => {
    it('should map UCP address to Shopware format with all lookups', async () => {
      mockClient.getCountryByIso.mockResolvedValue(mockCountry);
      mockClient.getCountryState.mockResolvedValue(mockCountryState);
      mockClient.getDefaultSalutation.mockResolvedValue(mockSalutation);

      const result = await addressMapper.mapToShopware(mockClient as any, validAddress);

      expect(result.shopwareAddress).toEqual({
        countryId: 'country-nl-id',
        countryStateId: 'state-nh-id',
        salutationId: 'salutation-mr-id',
        firstName: 'John',
        lastName: 'Doe',
        street: '123 Main Street',
        additionalAddressLine1: 'Apt 4B',
        zipcode: '1012 AB',
        city: 'Amsterdam',
        phoneNumber: '+31612345678',
      });
      expect(result.country).toEqual(mockCountry);
      expect(result.countryState).toEqual(mockCountryState);
      expect(result.salutation).toEqual(mockSalutation);
    });

    it('should handle address without state/region', async () => {
      mockClient.getCountryByIso.mockResolvedValue(mockCountry);
      mockClient.getDefaultSalutation.mockResolvedValue(mockSalutation);

      const addressWithoutRegion = { ...validAddress, address_region: undefined };

      const result = await addressMapper.mapToShopware(mockClient as any, addressWithoutRegion);

      expect(result.shopwareAddress.countryStateId).toBeUndefined();
      expect(result.countryState).toBeUndefined();
      expect(mockClient.getCountryState).not.toHaveBeenCalled();
    });

    it('should continue without state if state lookup fails', async () => {
      mockClient.getCountryByIso.mockResolvedValue(mockCountry);
      mockClient.getCountryState.mockResolvedValue(null);
      mockClient.getDefaultSalutation.mockResolvedValue(mockSalutation);

      const result = await addressMapper.mapToShopware(mockClient as any, validAddress);

      expect(result.shopwareAddress.countryStateId).toBeUndefined();
      expect(result.countryState).toBeUndefined();
    });

    it('should throw AddressMappingError when country not found', async () => {
      mockClient.getCountryByIso.mockResolvedValue(null);

      await expect(addressMapper.mapToShopware(mockClient as any, validAddress)).rejects.toThrow(
        AddressMappingError
      );
      await expect(addressMapper.mapToShopware(mockClient as any, validAddress)).rejects.toMatchObject({
        code: 'COUNTRY_NOT_FOUND',
      });
    });

    it('should throw AddressMappingError when salutation not found', async () => {
      mockClient.getCountryByIso.mockResolvedValue(mockCountry);
      mockClient.getCountryState.mockResolvedValue(mockCountryState);
      mockClient.getDefaultSalutation.mockResolvedValue(null);

      await expect(addressMapper.mapToShopware(mockClient as any, validAddress)).rejects.toThrow(
        AddressMappingError
      );
      await expect(addressMapper.mapToShopware(mockClient as any, validAddress)).rejects.toMatchObject({
        code: 'SALUTATION_NOT_FOUND',
      });
    });

    it('should handle address without optional fields', async () => {
      mockClient.getCountryByIso.mockResolvedValue(mockCountry);
      mockClient.getDefaultSalutation.mockResolvedValue(mockSalutation);

      const minimalAddress: Address = {
        first_name: 'Jane',
        last_name: 'Smith',
        street_address: '456 Oak Ave',
        address_locality: 'Rotterdam',
        postal_code: '3011 AA',
        address_country: 'NL',
      };

      const result = await addressMapper.mapToShopware(mockClient as any, minimalAddress);

      expect(result.shopwareAddress.additionalAddressLine1).toBeUndefined();
      expect(result.shopwareAddress.phoneNumber).toBeUndefined();
      expect(result.shopwareAddress.countryStateId).toBeUndefined();
    });
  });

  describe('mapFromShopware', () => {
    it('should map Shopware address to UCP format', () => {
      const shopwareAddress = {
        countryId: 'country-nl-id',
        countryStateId: 'state-nh-id',
        salutationId: 'salutation-mr-id',
        firstName: 'John',
        lastName: 'Doe',
        street: '123 Main Street',
        additionalAddressLine1: 'Apt 4B',
        zipcode: '1012 AB',
        city: 'Amsterdam',
        phoneNumber: '+31612345678',
      };

      const result = addressMapper.mapFromShopware(shopwareAddress, 'NL', 'NH');

      expect(result).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        street_address: '123 Main Street',
        extended_address: 'Apt 4B',
        address_locality: 'Amsterdam',
        address_region: 'NH',
        postal_code: '1012 AB',
        address_country: 'NL',
        phone: '+31612345678',
      });
    });

    it('should handle missing optional fields', () => {
      const shopwareAddress = {
        countryId: 'country-nl-id',
        salutationId: 'salutation-mr-id',
        firstName: 'Jane',
        lastName: 'Smith',
        street: '456 Oak Ave',
        zipcode: '3011 AA',
        city: 'Rotterdam',
      };

      const result = addressMapper.mapFromShopware(shopwareAddress, 'NL');

      expect(result.extended_address).toBeUndefined();
      expect(result.address_region).toBeUndefined();
      expect(result.phone).toBeUndefined();
    });
  });

  describe('validateAddress', () => {
    it('should return no errors for valid address', () => {
      const errors = addressMapper.validateAddress(validAddress);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing first name', () => {
      const address = { ...validAddress, first_name: '' };
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'first_name',
        code: 'required',
        message: 'First name is required',
      });
    });

    it('should return error for missing last name', () => {
      const address = { ...validAddress, last_name: '  ' }; // whitespace only
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'last_name',
        code: 'required',
        message: 'Last name is required',
      });
    });

    it('should return error for missing street address', () => {
      const address = { ...validAddress, street_address: '' };
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'street_address',
        code: 'required',
        message: 'Street address is required',
      });
    });

    it('should return error for missing city', () => {
      const address = { ...validAddress, address_locality: '' };
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'address_locality',
        code: 'required',
        message: 'City is required',
      });
    });

    it('should return error for missing postal code', () => {
      const address = { ...validAddress, postal_code: '' };
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'postal_code',
        code: 'required',
        message: 'Postal code is required',
      });
    });

    it('should return error for missing country', () => {
      const address = { ...validAddress, address_country: '' };
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'address_country',
        code: 'required',
        message: 'Country is required',
      });
    });

    it('should return error for invalid country code format', () => {
      const address = { ...validAddress, address_country: 'Netherlands' };
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'address_country',
        code: 'invalid_format',
        message: 'Country must be ISO 3166-1 alpha-2 code (e.g., "NL", "DE")',
      });
    });

    it('should return multiple errors when multiple fields are invalid', () => {
      const address: Address = {
        first_name: '',
        last_name: '',
        street_address: '',
        address_locality: '',
        postal_code: '',
        address_country: '',
      };
      const errors = addressMapper.validateAddress(address);

      expect(errors.length).toBe(6);
    });

    it('should handle undefined fields', () => {
      const address = {
        first_name: undefined as unknown as string,
        last_name: 'Doe',
        street_address: '123 Main St',
        address_locality: 'Amsterdam',
        postal_code: '1012 AB',
        address_country: 'NL',
      };
      const errors = addressMapper.validateAddress(address);

      expect(errors).toContainEqual({
        field: 'first_name',
        code: 'required',
        message: 'First name is required',
      });
    });
  });

  describe('isShippingAvailable', () => {
    it('should return true when shipping is available', async () => {
      mockClient.getCountryByIso.mockResolvedValue(mockCountry);

      const result = await addressMapper.isShippingAvailable(mockClient as any, 'NL');

      expect(result).toBe(true);
    });

    it('should return false when shipping is not available', async () => {
      const countryNoShipping = { ...mockCountry, shippingAvailable: false };
      mockClient.getCountryByIso.mockResolvedValue(countryNoShipping);

      const result = await addressMapper.isShippingAvailable(mockClient as any, 'NL');

      expect(result).toBe(false);
    });

    it('should return false when country not found', async () => {
      mockClient.getCountryByIso.mockResolvedValue(null);

      const result = await addressMapper.isShippingAvailable(mockClient as any, 'XX');

      expect(result).toBe(false);
    });
  });

  describe('getShippingCountries', () => {
    it('should return only active countries with shipping available', async () => {
      const countries: Country[] = [
        { ...mockCountry, id: '1', name: 'Netherlands', iso: 'NL', active: true, shippingAvailable: true },
        { ...mockCountry, id: '2', name: 'Germany', iso: 'DE', active: true, shippingAvailable: true },
        { ...mockCountry, id: '3', name: 'France', iso: 'FR', active: false, shippingAvailable: true },
        { ...mockCountry, id: '4', name: 'Spain', iso: 'ES', active: true, shippingAvailable: false },
      ];
      mockClient.getCountries.mockResolvedValue(countries);

      const result = await addressMapper.getShippingCountries(mockClient as any);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.iso)).toEqual(['NL', 'DE']);
    });

    it('should return empty array when no shipping countries available', async () => {
      mockClient.getCountries.mockResolvedValue([]);

      const result = await addressMapper.getShippingCountries(mockClient as any);

      expect(result).toHaveLength(0);
    });
  });
});

describe('AddressMappingError', () => {
  it('should have correct name and code', () => {
    const error = new AddressMappingError('TEST_CODE', 'Test message');

    expect(error.name).toBe('AddressMappingError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
  });
});
