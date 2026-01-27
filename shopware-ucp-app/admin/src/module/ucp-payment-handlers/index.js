/**
 * UCP Payment Handlers Module
 * Admin module for configuring payment handlers
 */

import './page/ucp-payment-handlers-list';
import './page/ucp-payment-handlers-detail';
import './component/ucp-payment-handler-card';

const { Module } = Shopware;

Module.register('ucp-payment-handlers', {
    type: 'plugin',
    name: 'ucp-payment-handlers',
    title: 'ucp-payment-handlers.general.title',
    description: 'ucp-payment-handlers.general.description',
    color: '#ff6b35',
    icon: 'regular-credit-card',
    favicon: 'icon-module-settings.png',

    snippets: {
        'en-GB': {
            'ucp-payment-handlers': {
                general: {
                    title: 'UCP Payment Handlers',
                    description: 'Configure payment handlers for Universal Commerce Protocol',
                },
                list: {
                    title: 'Payment Handlers',
                    description: 'Manage payment handlers for your shop',
                    columnHandler: 'Handler',
                    columnStatus: 'Status',
                    columnConfigured: 'Configured',
                    buttonTest: 'Test Connection',
                    enabled: 'Enabled',
                    disabled: 'Disabled',
                    configured: 'Configured',
                    notConfigured: 'Not Configured',
                },
                detail: {
                    title: 'Handler Configuration',
                    generalTab: 'General',
                    configTab: 'Configuration',
                    enabledLabel: 'Enable this handler',
                    enabledHelpText: 'When enabled, this payment handler will be available in checkout',
                    saveButton: 'Save',
                    testButton: 'Test Connection',
                    testSuccess: 'Connection successful!',
                    testFailed: 'Connection test failed',
                },
                handlers: {
                    'google-pay': {
                        name: 'Google Pay',
                        description: 'Accept payments via Google Pay wallet',
                    },
                    'business-tokenizer': {
                        name: 'Business Tokenizer',
                        description: 'Process pre-tokenized card payments via PSP',
                    },
                    mollie: {
                        name: 'Mollie Payments',
                        description: 'Accept payments via Mollie (iDEAL, Cards, Bancontact, etc.)',
                    },
                },
            },
        },
        'de-DE': {
            'ucp-payment-handlers': {
                general: {
                    title: 'UCP Zahlungsanbieter',
                    description: 'Zahlungsanbieter für das Universal Commerce Protocol konfigurieren',
                },
                list: {
                    title: 'Zahlungsanbieter',
                    description: 'Verwalten Sie Zahlungsanbieter für Ihren Shop',
                    columnHandler: 'Anbieter',
                    columnStatus: 'Status',
                    columnConfigured: 'Konfiguriert',
                    buttonTest: 'Verbindung testen',
                    enabled: 'Aktiviert',
                    disabled: 'Deaktiviert',
                    configured: 'Konfiguriert',
                    notConfigured: 'Nicht konfiguriert',
                },
                detail: {
                    title: 'Anbieter-Konfiguration',
                    generalTab: 'Allgemein',
                    configTab: 'Konfiguration',
                    enabledLabel: 'Diesen Anbieter aktivieren',
                    enabledHelpText: 'Wenn aktiviert, ist dieser Zahlungsanbieter im Checkout verfügbar',
                    saveButton: 'Speichern',
                    testButton: 'Verbindung testen',
                    testSuccess: 'Verbindung erfolgreich!',
                    testFailed: 'Verbindungstest fehlgeschlagen',
                },
                handlers: {
                    'google-pay': {
                        name: 'Google Pay',
                        description: 'Zahlungen über Google Pay Wallet akzeptieren',
                    },
                    'business-tokenizer': {
                        name: 'Business Tokenizer',
                        description: 'Verarbeiten Sie vorher tokenisierte Kartenzahlungen über PSP',
                    },
                    mollie: {
                        name: 'Mollie Payments',
                        description: 'Zahlungen über Mollie akzeptieren (iDEAL, Karten, Bancontact, etc.)',
                    },
                },
            },
        },
        'nl-NL': {
            'ucp-payment-handlers': {
                general: {
                    title: 'UCP Betaalmethoden',
                    description: 'Configureer betaalmethoden voor Universal Commerce Protocol',
                },
                list: {
                    title: 'Betaalmethoden',
                    description: 'Beheer betaalmethoden voor je winkel',
                    columnHandler: 'Provider',
                    columnStatus: 'Status',
                    columnConfigured: 'Geconfigureerd',
                    buttonTest: 'Test Verbinding',
                    enabled: 'Ingeschakeld',
                    disabled: 'Uitgeschakeld',
                    configured: 'Geconfigureerd',
                    notConfigured: 'Niet geconfigureerd',
                },
                detail: {
                    title: 'Provider Configuratie',
                    generalTab: 'Algemeen',
                    configTab: 'Configuratie',
                    enabledLabel: 'Deze provider inschakelen',
                    enabledHelpText: 'Indien ingeschakeld is deze betaalmethode beschikbaar in de checkout',
                    saveButton: 'Opslaan',
                    testButton: 'Test Verbinding',
                    testSuccess: 'Verbinding succesvol!',
                    testFailed: 'Verbindingstest mislukt',
                },
                handlers: {
                    'google-pay': {
                        name: 'Google Pay',
                        description: 'Accepteer betalingen via Google Pay wallet',
                    },
                    'business-tokenizer': {
                        name: 'Business Tokenizer',
                        description: 'Verwerk vooraf getokeniseerde kaartbetalingen via PSP',
                    },
                    mollie: {
                        name: 'Mollie Betalingen',
                        description: 'Accepteer betalingen via Mollie (iDEAL, Kaarten, Bancontact, etc.)',
                    },
                },
            },
        },
    },

    routes: {
        list: {
            component: 'ucp-payment-handlers-list',
            path: 'list',
            meta: {
                parentPath: 'sw.settings.index',
            },
        },
        detail: {
            component: 'ucp-payment-handlers-detail',
            path: 'detail/:id',
            meta: {
                parentPath: 'ucp.payment.handlers.list',
            },
        },
    },

    settingsItem: {
        group: 'plugins',
        to: 'ucp.payment.handlers.list',
        icon: 'regular-credit-card',
        privilege: 'system.plugin_maintain',
    },

    navigation: [{
        id: 'ucp-payment-handlers',
        label: 'ucp-payment-handlers.general.title',
        color: '#ff6b35',
        path: 'ucp.payment.handlers.list',
        icon: 'regular-credit-card',
        parent: 'sw-settings',
        position: 100,
    }],
});
