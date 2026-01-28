/**
 * UCP Dashboard Module
 * Admin module for UCP statistics and overview
 */

import './page/ucp-dashboard-index';
import './component/ucp-stats-card';

const { Module } = Shopware;

Module.register('ucp-dashboard', {
    type: 'plugin',
    name: 'ucp-dashboard',
    title: 'ucp-dashboard.general.title',
    description: 'ucp-dashboard.general.description',
    color: '#ff6b35',
    icon: 'regular-chart-line',
    favicon: 'icon-module-settings.png',

    snippets: {
        'en-GB': {
            'ucp-dashboard': {
                general: {
                    title: 'UCP Dashboard',
                    description: 'Overview of UCP Commerce activity',
                },
                index: {
                    title: 'UCP Commerce Dashboard',
                    description: 'Monitor your AI-powered commerce activity',
                    refreshButton: 'Refresh',
                    periodToday: 'Today',
                    period7Days: 'Last 7 Days',
                    period30Days: 'Last 30 Days',
                },
                stats: {
                    checkoutsCreated: 'Checkouts Created',
                    checkoutsCompleted: 'Checkouts Completed',
                    conversionRate: 'Conversion Rate',
                    totalRevenue: 'Total Revenue',
                    activeHandlers: 'Active Payment Handlers',
                    webhooksSent: 'Webhooks Sent',
                    webhooksFailed: 'Webhooks Failed',
                    averageOrderValue: 'Average Order Value',
                },
                charts: {
                    checkoutTrend: 'Checkout Trend',
                    revenueByHandler: 'Revenue by Payment Handler',
                },
                recentActivity: {
                    title: 'Recent Checkout Sessions',
                    columnSession: 'Session ID',
                    columnStatus: 'Status',
                    columnPlatform: 'Platform',
                    columnAmount: 'Amount',
                    columnCreated: 'Created',
                    statusIncomplete: 'Incomplete',
                    statusComplete: 'Complete',
                    statusFailed: 'Failed',
                    statusExpired: 'Expired',
                },
            },
        },
        'de-DE': {
            'ucp-dashboard': {
                general: {
                    title: 'UCP Dashboard',
                    description: 'Übersicht der UCP Commerce-Aktivitäten',
                },
                index: {
                    title: 'UCP Commerce Dashboard',
                    description: 'Überwachen Sie Ihre KI-gestützte Commerce-Aktivität',
                    refreshButton: 'Aktualisieren',
                    periodToday: 'Heute',
                    period7Days: 'Letzte 7 Tage',
                    period30Days: 'Letzte 30 Tage',
                },
                stats: {
                    checkoutsCreated: 'Erstellte Checkouts',
                    checkoutsCompleted: 'Abgeschlossene Checkouts',
                    conversionRate: 'Konversionsrate',
                    totalRevenue: 'Gesamtumsatz',
                    activeHandlers: 'Aktive Zahlungsanbieter',
                    webhooksSent: 'Gesendete Webhooks',
                    webhooksFailed: 'Fehlgeschlagene Webhooks',
                    averageOrderValue: 'Durchschnittlicher Bestellwert',
                },
                charts: {
                    checkoutTrend: 'Checkout-Trend',
                    revenueByHandler: 'Umsatz nach Zahlungsanbieter',
                },
                recentActivity: {
                    title: 'Letzte Checkout-Sessions',
                    columnSession: 'Session-ID',
                    columnStatus: 'Status',
                    columnPlatform: 'Plattform',
                    columnAmount: 'Betrag',
                    columnCreated: 'Erstellt',
                    statusIncomplete: 'Unvollständig',
                    statusComplete: 'Abgeschlossen',
                    statusFailed: 'Fehlgeschlagen',
                    statusExpired: 'Abgelaufen',
                },
            },
        },
        'nl-NL': {
            'ucp-dashboard': {
                general: {
                    title: 'UCP Dashboard',
                    description: 'Overzicht van UCP Commerce activiteit',
                },
                index: {
                    title: 'UCP Commerce Dashboard',
                    description: 'Monitor je AI-gestuurde commerce activiteit',
                    refreshButton: 'Vernieuwen',
                    periodToday: 'Vandaag',
                    period7Days: 'Afgelopen 7 dagen',
                    period30Days: 'Afgelopen 30 dagen',
                },
                stats: {
                    checkoutsCreated: 'Aangemaakte Checkouts',
                    checkoutsCompleted: 'Voltooide Checkouts',
                    conversionRate: 'Conversieratio',
                    totalRevenue: 'Totale Omzet',
                    activeHandlers: 'Actieve Betaalmethoden',
                    webhooksSent: 'Verstuurde Webhooks',
                    webhooksFailed: 'Mislukte Webhooks',
                    averageOrderValue: 'Gemiddelde Bestelwaarde',
                },
                charts: {
                    checkoutTrend: 'Checkout Trend',
                    revenueByHandler: 'Omzet per Betaalmethode',
                },
                recentActivity: {
                    title: 'Recente Checkout Sessies',
                    columnSession: 'Sessie ID',
                    columnStatus: 'Status',
                    columnPlatform: 'Platform',
                    columnAmount: 'Bedrag',
                    columnCreated: 'Aangemaakt',
                    statusIncomplete: 'Onvolledig',
                    statusComplete: 'Voltooid',
                    statusFailed: 'Mislukt',
                    statusExpired: 'Verlopen',
                },
            },
        },
    },

    routes: {
        index: {
            component: 'ucp-dashboard-index',
            path: 'index',
            meta: {
                parentPath: 'sw.settings.index',
            },
        },
    },

    settingsItem: {
        group: 'plugins',
        to: 'ucp.dashboard.index',
        icon: 'regular-chart-line',
        privilege: 'system.plugin_maintain',
    },

    navigation: [{
        id: 'ucp-dashboard',
        label: 'ucp-dashboard.general.title',
        color: '#ff6b35',
        path: 'ucp.dashboard.index',
        icon: 'regular-chart-line',
        parent: 'sw-settings',
        position: 90,
    }],
});
