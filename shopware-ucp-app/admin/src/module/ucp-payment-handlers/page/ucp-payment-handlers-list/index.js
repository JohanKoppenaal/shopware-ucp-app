/**
 * UCP Payment Handlers List Page
 */

import template from './ucp-payment-handlers-list.html.twig';
import './ucp-payment-handlers-list.scss';

const { Component, Mixin } = Shopware;

Component.register('ucp-payment-handlers-list', {
    template,

    mixins: [
        Mixin.getByName('notification'),
    ],

    inject: ['repositoryFactory'],

    data() {
        return {
            isLoading: true,
            handlers: [],
            columns: [
                {
                    property: 'name',
                    label: this.$tc('ucp-payment-handlers.list.columnHandler'),
                    routerLink: 'ucp.payment.handlers.detail',
                    primary: true,
                },
                {
                    property: 'enabled',
                    label: this.$tc('ucp-payment-handlers.list.columnStatus'),
                },
                {
                    property: 'configured',
                    label: this.$tc('ucp-payment-handlers.list.columnConfigured'),
                },
            ],
        };
    },

    computed: {
        ucpServerUrl() {
            // In production, this would come from system config
            return process.env.VUE_APP_UCP_SERVER_URL || 'http://localhost:3000';
        },
    },

    created() {
        this.loadHandlers();
    },

    methods: {
        async loadHandlers() {
            this.isLoading = true;

            try {
                const response = await fetch(`${this.ucpServerUrl}/api/admin/payment-handlers`, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to load handlers');
                }

                const data = await response.json();
                this.handlers = data.handlers.map((handler) => ({
                    id: handler.id,
                    name: this.$tc(`ucp-payment-handlers.handlers.${handler.id}.name`) || handler.name,
                    description: this.$tc(`ucp-payment-handlers.handlers.${handler.id}.description`) || handler.description,
                    enabled: handler.enabled ?? false,
                    configured: handler.configured ?? false,
                }));
            } catch (error) {
                this.createNotificationError({
                    title: 'Error',
                    message: error.message,
                });

                // Fallback to static list for demo
                this.handlers = [
                    {
                        id: 'google-pay',
                        name: this.$tc('ucp-payment-handlers.handlers.google-pay.name'),
                        description: this.$tc('ucp-payment-handlers.handlers.google-pay.description'),
                        enabled: false,
                        configured: false,
                    },
                    {
                        id: 'business-tokenizer',
                        name: this.$tc('ucp-payment-handlers.handlers.business-tokenizer.name'),
                        description: this.$tc('ucp-payment-handlers.handlers.business-tokenizer.description'),
                        enabled: true,
                        configured: true,
                    },
                    {
                        id: 'mollie',
                        name: this.$tc('ucp-payment-handlers.handlers.mollie.name'),
                        description: this.$tc('ucp-payment-handlers.handlers.mollie.description'),
                        enabled: false,
                        configured: false,
                    },
                ];
            } finally {
                this.isLoading = false;
            }
        },

        async testConnection(handler) {
            try {
                const response = await fetch(`${this.ucpServerUrl}/api/admin/payment-handlers/${handler.id}/test`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                const result = await response.json();

                if (result.success) {
                    this.createNotificationSuccess({
                        title: handler.name,
                        message: this.$tc('ucp-payment-handlers.detail.testSuccess'),
                    });
                } else {
                    this.createNotificationError({
                        title: handler.name,
                        message: result.message || this.$tc('ucp-payment-handlers.detail.testFailed'),
                    });
                }
            } catch (error) {
                this.createNotificationError({
                    title: handler.name,
                    message: this.$tc('ucp-payment-handlers.detail.testFailed'),
                });
            }
        },

        getStatusVariant(enabled) {
            return enabled ? 'success' : 'neutral';
        },

        getConfiguredVariant(configured) {
            return configured ? 'success' : 'warning';
        },
    },
});
