/**
 * UCP Dashboard Index Page
 * Main dashboard view with statistics and recent activity
 */

const { Component, Mixin } = Shopware;

Component.register('ucp-dashboard-index', {
    template: `
        <sw-page class="ucp-dashboard-index">
            <template #smart-bar-header>
                <h2>{{ $tc('ucp-dashboard.index.title') }}</h2>
            </template>

            <template #smart-bar-actions>
                <sw-button-group>
                    <sw-button
                        :variant="period === 'today' ? 'primary' : 'ghost'"
                        size="small"
                        @click="setPeriod('today')">
                        {{ $tc('ucp-dashboard.index.periodToday') }}
                    </sw-button>
                    <sw-button
                        :variant="period === '7days' ? 'primary' : 'ghost'"
                        size="small"
                        @click="setPeriod('7days')">
                        {{ $tc('ucp-dashboard.index.period7Days') }}
                    </sw-button>
                    <sw-button
                        :variant="period === '30days' ? 'primary' : 'ghost'"
                        size="small"
                        @click="setPeriod('30days')">
                        {{ $tc('ucp-dashboard.index.period30Days') }}
                    </sw-button>
                </sw-button-group>

                <sw-button @click="loadData" :isLoading="isLoading">
                    <sw-icon name="regular-undo" size="16"></sw-icon>
                    {{ $tc('ucp-dashboard.index.refreshButton') }}
                </sw-button>
            </template>

            <template #content>
                <sw-card-view>
                    <!-- Stats Cards Row -->
                    <sw-card :title="$tc('ucp-dashboard.general.title')" :isLoading="isLoading">
                        <div class="ucp-dashboard-stats-grid">
                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.checkoutsCreated')"
                                :value="stats.checkoutsCreated"
                                icon="regular-shopping-cart"
                                color="#3498db">
                            </ucp-stats-card>

                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.checkoutsCompleted')"
                                :value="stats.checkoutsCompleted"
                                icon="regular-check-circle"
                                color="#27ae60">
                            </ucp-stats-card>

                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.conversionRate')"
                                :value="stats.conversionRate + '%'"
                                icon="regular-chart-pie"
                                color="#9b59b6">
                            </ucp-stats-card>

                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.totalRevenue')"
                                :value="formatCurrency(stats.totalRevenue)"
                                icon="regular-euro-sign"
                                color="#f39c12">
                            </ucp-stats-card>
                        </div>
                    </sw-card>

                    <!-- Secondary Stats -->
                    <sw-card :title="$tc('ucp-dashboard.stats.activeHandlers')" :isLoading="isLoading">
                        <div class="ucp-dashboard-stats-grid ucp-dashboard-stats-grid--secondary">
                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.activeHandlers')"
                                :value="stats.activeHandlers"
                                icon="regular-credit-card"
                                color="#1abc9c"
                                size="small">
                            </ucp-stats-card>

                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.webhooksSent')"
                                :value="stats.webhooksSent"
                                icon="regular-arrow-up"
                                color="#3498db"
                                size="small">
                            </ucp-stats-card>

                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.webhooksFailed')"
                                :value="stats.webhooksFailed"
                                icon="regular-times-circle"
                                :color="stats.webhooksFailed > 0 ? '#e74c3c' : '#95a5a6'"
                                size="small">
                            </ucp-stats-card>

                            <ucp-stats-card
                                :label="$tc('ucp-dashboard.stats.averageOrderValue')"
                                :value="formatCurrency(stats.averageOrderValue)"
                                icon="regular-calculator"
                                color="#34495e"
                                size="small">
                            </ucp-stats-card>
                        </div>
                    </sw-card>

                    <!-- Recent Activity -->
                    <sw-card :title="$tc('ucp-dashboard.recentActivity.title')" :isLoading="isLoading">
                        <sw-data-grid
                            v-if="recentSessions.length > 0"
                            :dataSource="recentSessions"
                            :columns="columns"
                            :showSelection="false"
                            :showSettings="false"
                            :showActions="false">

                            <template #column-status="{ item }">
                                <sw-label
                                    :variant="getStatusVariant(item.status)"
                                    size="small"
                                    appearance="pill">
                                    {{ getStatusLabel(item.status) }}
                                </sw-label>
                            </template>

                            <template #column-amount="{ item }">
                                {{ formatCurrency(item.amount) }}
                            </template>

                            <template #column-createdAt="{ item }">
                                {{ formatDate(item.createdAt) }}
                            </template>
                        </sw-data-grid>

                        <sw-empty-state
                            v-else
                            icon="regular-shopping-cart"
                            :title="$tc('ucp-dashboard.recentActivity.title')">
                        </sw-empty-state>
                    </sw-card>
                </sw-card-view>
            </template>
        </sw-page>
    `,

    mixins: [
        Mixin.getByName('notification'),
    ],

    data() {
        return {
            isLoading: false,
            period: '7days',
            stats: {
                checkoutsCreated: 0,
                checkoutsCompleted: 0,
                conversionRate: 0,
                totalRevenue: 0,
                activeHandlers: 0,
                webhooksSent: 0,
                webhooksFailed: 0,
                averageOrderValue: 0,
            },
            recentSessions: [],
        };
    },

    computed: {
        columns() {
            return [
                {
                    property: 'ucpSessionId',
                    label: this.$tc('ucp-dashboard.recentActivity.columnSession'),
                    width: '200px',
                },
                {
                    property: 'status',
                    label: this.$tc('ucp-dashboard.recentActivity.columnStatus'),
                    width: '120px',
                },
                {
                    property: 'platformName',
                    label: this.$tc('ucp-dashboard.recentActivity.columnPlatform'),
                    width: '150px',
                },
                {
                    property: 'amount',
                    label: this.$tc('ucp-dashboard.recentActivity.columnAmount'),
                    width: '120px',
                    align: 'right',
                },
                {
                    property: 'createdAt',
                    label: this.$tc('ucp-dashboard.recentActivity.columnCreated'),
                    width: '180px',
                },
            ];
        },
    },

    created() {
        this.loadData();
    },

    methods: {
        async loadData() {
            this.isLoading = true;

            try {
                // Fetch stats from admin API
                const response = await this.fetchStats();
                this.stats = response.stats;
                this.recentSessions = response.recentSessions;
            } catch (error) {
                this.createNotificationError({
                    message: error.message || 'Failed to load dashboard data',
                });
            } finally {
                this.isLoading = false;
            }
        },

        async fetchStats() {
            // This would normally call the UCP app server admin API
            // For now, return mock data for development
            const shopId = Shopware.Context.api.systemConfig?.shopId || 'default';
            const baseUrl = Shopware.Context.api.systemConfig?.['UcpCommerce.config.serverUrl'] || '';

            if (baseUrl) {
                const response = await fetch(`${baseUrl}/admin/stats?shop_id=${shopId}&period=${this.period}`);
                if (response.ok) {
                    return response.json();
                }
            }

            // Return mock data for development/demo
            return {
                stats: {
                    checkoutsCreated: 156,
                    checkoutsCompleted: 89,
                    conversionRate: 57.1,
                    totalRevenue: 15420.50,
                    activeHandlers: 3,
                    webhooksSent: 178,
                    webhooksFailed: 2,
                    averageOrderValue: 173.26,
                },
                recentSessions: [
                    {
                        id: '1',
                        ucpSessionId: 'ucp-7a8b9c0d-1234',
                        status: 'complete',
                        platformName: 'Google Gemini',
                        amount: 249.99,
                        createdAt: new Date().toISOString(),
                    },
                    {
                        id: '2',
                        ucpSessionId: 'ucp-2b3c4d5e-5678',
                        status: 'incomplete',
                        platformName: 'ChatGPT',
                        amount: 89.50,
                        createdAt: new Date(Date.now() - 3600000).toISOString(),
                    },
                    {
                        id: '3',
                        ucpSessionId: 'ucp-3c4d5e6f-9012',
                        status: 'complete',
                        platformName: 'Microsoft Copilot',
                        amount: 450.00,
                        createdAt: new Date(Date.now() - 7200000).toISOString(),
                    },
                    {
                        id: '4',
                        ucpSessionId: 'ucp-4d5e6f7g-3456',
                        status: 'expired',
                        platformName: 'Google Gemini',
                        amount: 125.00,
                        createdAt: new Date(Date.now() - 86400000).toISOString(),
                    },
                    {
                        id: '5',
                        ucpSessionId: 'ucp-5e6f7g8h-7890',
                        status: 'complete',
                        platformName: 'ChatGPT',
                        amount: 399.99,
                        createdAt: new Date(Date.now() - 172800000).toISOString(),
                    },
                ],
            };
        },

        setPeriod(period) {
            this.period = period;
            this.loadData();
        },

        formatCurrency(value) {
            if (typeof value !== 'number') return '-';
            return new Intl.NumberFormat('en-EU', {
                style: 'currency',
                currency: 'EUR',
            }).format(value);
        },

        formatDate(dateString) {
            if (!dateString) return '-';
            return new Date(dateString).toLocaleString();
        },

        getStatusVariant(status) {
            const variants = {
                complete: 'success',
                incomplete: 'warning',
                failed: 'error',
                expired: 'neutral',
            };
            return variants[status] || 'neutral';
        },

        getStatusLabel(status) {
            const labels = {
                complete: this.$tc('ucp-dashboard.recentActivity.statusComplete'),
                incomplete: this.$tc('ucp-dashboard.recentActivity.statusIncomplete'),
                failed: this.$tc('ucp-dashboard.recentActivity.statusFailed'),
                expired: this.$tc('ucp-dashboard.recentActivity.statusExpired'),
            };
            return labels[status] || status;
        },
    },
});
