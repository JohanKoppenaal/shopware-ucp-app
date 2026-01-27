/**
 * UCP Payment Handler Card Component
 */

import template from './ucp-payment-handler-card.html.twig';
import './ucp-payment-handler-card.scss';

const { Component } = Shopware;

Component.register('ucp-payment-handler-card', {
    template,

    props: {
        handler: {
            type: Object,
            required: true,
        },
    },

    computed: {
        handlerName() {
            return this.$tc(`ucp-payment-handlers.handlers.${this.handler.id}.name`) || this.handler.name;
        },

        handlerDescription() {
            return this.$tc(`ucp-payment-handlers.handlers.${this.handler.id}.description`) || this.handler.description;
        },

        statusVariant() {
            return this.handler.enabled ? 'success' : 'neutral';
        },

        statusLabel() {
            return this.handler.enabled
                ? this.$tc('ucp-payment-handlers.list.enabled')
                : this.$tc('ucp-payment-handlers.list.disabled');
        },

        configuredVariant() {
            return this.handler.configured ? 'success' : 'warning';
        },

        configuredLabel() {
            return this.handler.configured
                ? this.$tc('ucp-payment-handlers.list.configured')
                : this.$tc('ucp-payment-handlers.list.notConfigured');
        },

        handlerIcon() {
            const icons = {
                'google-pay': 'regular-google-pay',
                'business-tokenizer': 'regular-credit-card',
                mollie: 'regular-bank',
            };
            return icons[this.handler.id] || 'regular-credit-card';
        },
    },

    methods: {
        onConfigure() {
            this.$router.push({
                name: 'ucp.payment.handlers.detail',
                params: { id: this.handler.id },
            });
        },

        onTestConnection() {
            this.$emit('test-connection', this.handler);
        },
    },
});
