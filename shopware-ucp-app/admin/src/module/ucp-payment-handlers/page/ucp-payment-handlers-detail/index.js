/**
 * UCP Payment Handlers Detail Page
 */

import template from './ucp-payment-handlers-detail.html.twig';
import './ucp-payment-handlers-detail.scss';

const { Component, Mixin } = Shopware;

Component.register('ucp-payment-handlers-detail', {
    template,

    mixins: [
        Mixin.getByName('notification'),
    ],

    data() {
        return {
            isLoading: true,
            isSaving: false,
            isTesting: false,
            handler: null,
            handlerConfig: {},
            configFields: [],
        };
    },

    computed: {
        handlerId() {
            return this.$route.params.id;
        },

        ucpServerUrl() {
            return process.env.VUE_APP_UCP_SERVER_URL || 'http://localhost:3000';
        },

        handlerName() {
            if (!this.handler) return '';
            return this.$tc(`ucp-payment-handlers.handlers.${this.handlerId}.name`) || this.handler.name;
        },

        handlerDescription() {
            if (!this.handler) return '';
            return this.$tc(`ucp-payment-handlers.handlers.${this.handlerId}.description`) || this.handler.description;
        },
    },

    created() {
        this.loadHandler();
    },

    methods: {
        async loadHandler() {
            this.isLoading = true;

            try {
                const response = await fetch(`${this.ucpServerUrl}/api/admin/payment-handlers/${this.handlerId}`, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to load handler');
                }

                const data = await response.json();
                this.handler = data.handler;
                this.handlerConfig = data.config || {};
                this.configFields = this.getConfigFields();
            } catch (error) {
                // Fallback to mock data for development
                this.handler = this.getMockHandler();
                this.handlerConfig = {};
                this.configFields = this.getConfigFields();
            } finally {
                this.isLoading = false;
            }
        },

        getMockHandler() {
            const handlers = {
                'google-pay': {
                    id: 'google-pay',
                    name: 'Google Pay',
                    enabled: false,
                    configured: false,
                    configSchema: {
                        merchant_id: { type: 'string', label: 'Merchant ID', required: true },
                        merchant_name: { type: 'string', label: 'Merchant Name', required: true },
                        environment: { type: 'select', label: 'Environment', options: ['TEST', 'PRODUCTION'] },
                    },
                },
                'business-tokenizer': {
                    id: 'business-tokenizer',
                    name: 'Business Tokenizer',
                    enabled: true,
                    configured: true,
                    configSchema: {
                        psp_type: { type: 'select', label: 'PSP Type', options: ['mollie', 'stripe', 'adyen', 'mock'] },
                        public_key: { type: 'string', label: 'Public Key' },
                    },
                },
                mollie: {
                    id: 'mollie',
                    name: 'Mollie Payments',
                    enabled: false,
                    configured: false,
                    configSchema: {
                        api_key: { type: 'password', label: 'API Key', required: true },
                        profile_id: { type: 'string', label: 'Profile ID' },
                        test_mode: { type: 'boolean', label: 'Test Mode' },
                    },
                },
            };

            return handlers[this.handlerId] || {
                id: this.handlerId,
                name: this.handlerId,
                enabled: false,
                configured: false,
                configSchema: {},
            };
        },

        getConfigFields() {
            if (!this.handler?.configSchema) return [];

            return Object.entries(this.handler.configSchema).map(([key, schema]) => ({
                name: key,
                type: schema.type || 'string',
                label: schema.label || key,
                required: schema.required || false,
                options: schema.options || [],
                helpText: schema.helpText || '',
            }));
        },

        async saveHandler() {
            this.isSaving = true;

            try {
                const response = await fetch(`${this.ucpServerUrl}/api/admin/payment-handlers/${this.handlerId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        enabled: this.handler.enabled,
                        config: this.handlerConfig,
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to save handler configuration');
                }

                this.createNotificationSuccess({
                    title: this.handlerName,
                    message: 'Configuration saved successfully',
                });
            } catch (error) {
                this.createNotificationError({
                    title: this.handlerName,
                    message: error.message,
                });
            } finally {
                this.isSaving = false;
            }
        },

        async testConnection() {
            this.isTesting = true;

            try {
                const response = await fetch(`${this.ucpServerUrl}/api/admin/payment-handlers/${this.handlerId}/test`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        config: this.handlerConfig,
                    }),
                });

                const result = await response.json();

                if (result.success) {
                    this.createNotificationSuccess({
                        title: this.handlerName,
                        message: this.$tc('ucp-payment-handlers.detail.testSuccess'),
                    });
                } else {
                    this.createNotificationError({
                        title: this.handlerName,
                        message: result.message || this.$tc('ucp-payment-handlers.detail.testFailed'),
                    });
                }
            } catch (error) {
                this.createNotificationError({
                    title: this.handlerName,
                    message: this.$tc('ucp-payment-handlers.detail.testFailed'),
                });
            } finally {
                this.isTesting = false;
            }
        },
    },
});
