/**
 * UCP Logs Webhooks Page
 * View webhook delivery history and retry failed deliveries
 */

const { Component, Mixin } = Shopware;

Component.register('ucp-logs-webhooks', {
    template: `
        <sw-page class="ucp-logs-webhooks">
            <template #smart-bar-header>
                <h2>{{ $tc('ucp-logs.webhooks.title') }}</h2>
            </template>

            <template #smart-bar-actions>
                <sw-single-select
                    :options="statusOptions"
                    v-model="statusFilter"
                    :placeholder="$tc('ucp-logs.webhooks.filterStatus')"
                    size="small"
                    @change="loadData">
                </sw-single-select>

                <sw-button @click="loadData" :isLoading="isLoading">
                    <sw-icon name="regular-undo" size="16"></sw-icon>
                    Refresh
                </sw-button>
            </template>

            <template #content>
                <sw-card-view>
                    <sw-card :isLoading="isLoading">
                        <sw-data-grid
                            v-if="webhooks.length > 0"
                            :dataSource="webhooks"
                            :columns="columns"
                            :showSelection="false"
                            :showSettings="true"
                            :showActions="true">

                            <template #column-event="{ item }">
                                <sw-label
                                    :variant="getEventVariant(item.event)"
                                    size="small"
                                    appearance="pill">
                                    {{ item.event }}
                                </sw-label>
                            </template>

                            <template #column-targetUrl="{ item }">
                                <code class="ucp-url">{{ truncateUrl(item.targetUrl) }}</code>
                            </template>

                            <template #column-status="{ item }">
                                <sw-label
                                    :variant="getStatusVariant(item.status)"
                                    size="small"
                                    appearance="pill">
                                    {{ getStatusLabel(item.status) }}
                                </sw-label>
                            </template>

                            <template #column-attempts="{ item }">
                                <span :class="{ 'ucp-text-danger': item.attempts >= 5 }">
                                    {{ item.attempts }}
                                </span>
                            </template>

                            <template #column-lastError="{ item }">
                                <span v-if="item.lastError" class="ucp-error-message" :title="item.lastError">
                                    {{ truncateError(item.lastError) }}
                                </span>
                                <span v-else class="ucp-text-muted">-</span>
                            </template>

                            <template #column-createdAt="{ item }">
                                {{ formatDate(item.createdAt) }}
                            </template>

                            <template #column-deliveredAt="{ item }">
                                <span v-if="item.deliveredAt">{{ formatDate(item.deliveredAt) }}</span>
                                <span v-else class="ucp-text-muted">-</span>
                            </template>

                            <template #actions="{ item }">
                                <sw-context-menu-item
                                    v-if="item.status === 'failed'"
                                    @click="retryWebhook(item)"
                                    :disabled="isRetrying">
                                    <sw-icon name="regular-undo" size="16"></sw-icon>
                                    {{ $tc('ucp-logs.webhooks.retryButton') }}
                                </sw-context-menu-item>
                            </template>
                        </sw-data-grid>

                        <sw-empty-state
                            v-else
                            icon="regular-arrow-up"
                            :title="$tc('ucp-logs.webhooks.noData')">
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
            isRetrying: false,
            webhooks: [],
            statusFilter: null,
        };
    },

    computed: {
        columns() {
            return [
                {
                    property: 'event',
                    label: this.$tc('ucp-logs.webhooks.columnEvent'),
                    width: '150px',
                },
                {
                    property: 'targetUrl',
                    label: this.$tc('ucp-logs.webhooks.columnTarget'),
                    width: '250px',
                },
                {
                    property: 'status',
                    label: this.$tc('ucp-logs.webhooks.columnStatus'),
                    width: '100px',
                },
                {
                    property: 'attempts',
                    label: this.$tc('ucp-logs.webhooks.columnAttempts'),
                    width: '80px',
                    align: 'center',
                },
                {
                    property: 'lastError',
                    label: this.$tc('ucp-logs.webhooks.columnLastError'),
                    width: '200px',
                },
                {
                    property: 'createdAt',
                    label: this.$tc('ucp-logs.webhooks.columnCreated'),
                    width: '160px',
                },
                {
                    property: 'deliveredAt',
                    label: this.$tc('ucp-logs.webhooks.columnDelivered'),
                    width: '160px',
                },
            ];
        },

        statusOptions() {
            return [
                { value: null, label: this.$tc('ucp-logs.webhooks.filterAll') },
                { value: 'pending', label: this.$tc('ucp-logs.webhooks.statusPending') },
                { value: 'sent', label: this.$tc('ucp-logs.webhooks.statusSent') },
                { value: 'failed', label: this.$tc('ucp-logs.webhooks.statusFailed') },
                { value: 'retrying', label: this.$tc('ucp-logs.webhooks.statusRetrying') },
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
                const response = await this.fetchWebhooks();
                this.webhooks = response.deliveries;
            } catch (error) {
                this.createNotificationError({
                    message: error.message || 'Failed to load webhooks',
                });
            } finally {
                this.isLoading = false;
            }
        },

        async fetchWebhooks() {
            const shopId = Shopware.Context.api.systemConfig?.shopId || 'default';
            const baseUrl = Shopware.Context.api.systemConfig?.['UcpCommerce.config.serverUrl'] || '';

            if (baseUrl) {
                const params = new URLSearchParams({
                    shop_id: shopId,
                    limit: '50',
                });
                if (this.statusFilter) {
                    params.append('status', this.statusFilter);
                }

                const response = await fetch(`${baseUrl}/webhooks/deliveries?${params}`);
                if (response.ok) {
                    return response.json();
                }
            }

            // Return mock data for development
            return {
                deliveries: [
                    {
                        id: '1',
                        event: 'order.updated',
                        targetUrl: 'https://platform.example.com/webhooks/order/updated',
                        status: 'sent',
                        attempts: 1,
                        lastError: null,
                        createdAt: new Date().toISOString(),
                        deliveredAt: new Date().toISOString(),
                    },
                    {
                        id: '2',
                        event: 'order.shipped',
                        targetUrl: 'https://platform.example.com/webhooks/order/shipped',
                        status: 'sent',
                        attempts: 1,
                        lastError: null,
                        createdAt: new Date(Date.now() - 3600000).toISOString(),
                        deliveredAt: new Date(Date.now() - 3595000).toISOString(),
                    },
                    {
                        id: '3',
                        event: 'order.updated',
                        targetUrl: 'https://platform.example.com/webhooks/order/updated',
                        status: 'failed',
                        attempts: 5,
                        lastError: 'Connection timeout after 30000ms',
                        createdAt: new Date(Date.now() - 86400000).toISOString(),
                        deliveredAt: null,
                    },
                    {
                        id: '4',
                        event: 'order.delivered',
                        targetUrl: 'https://platform.example.com/webhooks/order/delivered',
                        status: 'retrying',
                        attempts: 2,
                        lastError: 'HTTP 503 Service Unavailable',
                        createdAt: new Date(Date.now() - 7200000).toISOString(),
                        deliveredAt: null,
                    },
                    {
                        id: '5',
                        event: 'order.updated',
                        targetUrl: 'https://platform.example.com/webhooks/order/updated',
                        status: 'pending',
                        attempts: 0,
                        lastError: null,
                        createdAt: new Date(Date.now() - 60000).toISOString(),
                        deliveredAt: null,
                    },
                ],
            };
        },

        async retryWebhook(webhook) {
            this.isRetrying = true;

            try {
                const baseUrl = Shopware.Context.api.systemConfig?.['UcpCommerce.config.serverUrl'] || '';

                if (baseUrl) {
                    const response = await fetch(`${baseUrl}/webhooks/deliveries/${webhook.id}/retry`, {
                        method: 'POST',
                    });

                    if (response.ok) {
                        this.createNotificationSuccess({
                            message: this.$tc('ucp-logs.webhooks.retrySuccess'),
                        });
                        await this.loadData();
                    } else {
                        throw new Error(this.$tc('ucp-logs.webhooks.retryFailed'));
                    }
                } else {
                    // Mock success for development
                    this.createNotificationSuccess({
                        message: this.$tc('ucp-logs.webhooks.retrySuccess'),
                    });
                }
            } catch (error) {
                this.createNotificationError({
                    message: error.message || this.$tc('ucp-logs.webhooks.retryFailed'),
                });
            } finally {
                this.isRetrying = false;
            }
        },

        formatDate(dateString) {
            if (!dateString) return '-';
            return new Date(dateString).toLocaleString();
        },

        truncateUrl(url) {
            if (!url) return '-';
            if (url.length <= 50) return url;
            return url.substring(0, 47) + '...';
        },

        truncateError(error) {
            if (!error) return '-';
            if (error.length <= 40) return error;
            return error.substring(0, 37) + '...';
        },

        getStatusVariant(status) {
            const variants = {
                sent: 'success',
                pending: 'info',
                failed: 'error',
                retrying: 'warning',
            };
            return variants[status] || 'neutral';
        },

        getStatusLabel(status) {
            const labels = {
                sent: this.$tc('ucp-logs.webhooks.statusSent'),
                pending: this.$tc('ucp-logs.webhooks.statusPending'),
                failed: this.$tc('ucp-logs.webhooks.statusFailed'),
                retrying: this.$tc('ucp-logs.webhooks.statusRetrying'),
            };
            return labels[status] || status;
        },

        getEventVariant(event) {
            const variants = {
                'order.updated': 'info',
                'order.shipped': 'success',
                'order.delivered': 'success',
            };
            return variants[event] || 'neutral';
        },
    },
});
