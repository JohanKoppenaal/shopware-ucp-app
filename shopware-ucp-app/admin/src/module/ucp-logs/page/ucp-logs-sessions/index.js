/**
 * UCP Logs Sessions Page
 * View checkout session history and details
 */

const { Component, Mixin } = Shopware;

Component.register('ucp-logs-sessions', {
    template: `
        <sw-page class="ucp-logs-sessions">
            <template #smart-bar-header>
                <h2>{{ $tc('ucp-logs.sessions.title') }}</h2>
            </template>

            <template #smart-bar-actions>
                <sw-single-select
                    :options="statusOptions"
                    v-model="statusFilter"
                    :placeholder="$tc('ucp-logs.sessions.filterStatus')"
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
                            v-if="sessions.length > 0"
                            :dataSource="sessions"
                            :columns="columns"
                            :showSelection="false"
                            :showSettings="true"
                            :showActions="true"
                            @inline-edit-save="onInlineEditSave"
                            @column-sort="onColumnSort">

                            <template #column-ucpSessionId="{ item }">
                                <code class="ucp-session-id">{{ item.ucpSessionId }}</code>
                            </template>

                            <template #column-status="{ item }">
                                <sw-label
                                    :variant="getStatusVariant(item.status)"
                                    size="small"
                                    appearance="pill">
                                    {{ getStatusLabel(item.status) }}
                                </sw-label>
                            </template>

                            <template #column-platformName="{ item }">
                                <span v-if="item.platformName">{{ item.platformName }}</span>
                                <span v-else class="ucp-text-muted">-</span>
                            </template>

                            <template #column-orderNumber="{ item }">
                                <router-link
                                    v-if="item.orderNumber"
                                    :to="{ name: 'sw.order.detail', params: { id: item.orderId } }">
                                    {{ item.orderNumber }}
                                </router-link>
                                <span v-else class="ucp-text-muted">-</span>
                            </template>

                            <template #column-createdAt="{ item }">
                                {{ formatDate(item.createdAt) }}
                            </template>

                            <template #column-expiresAt="{ item }">
                                <span :class="{ 'ucp-text-danger': isExpired(item) }">
                                    {{ formatDate(item.expiresAt) }}
                                </span>
                            </template>

                            <template #actions="{ item }">
                                <sw-context-menu-item @click="showDetail(item)">
                                    <sw-icon name="regular-eye" size="16"></sw-icon>
                                    View Details
                                </sw-context-menu-item>
                            </template>
                        </sw-data-grid>

                        <sw-empty-state
                            v-else
                            icon="regular-shopping-cart"
                            :title="$tc('ucp-logs.sessions.noData')">
                        </sw-empty-state>
                    </sw-card>

                    <!-- Session Detail Modal -->
                    <sw-modal
                        v-if="showDetailModal"
                        :title="$tc('ucp-logs.sessions.detailTitle')"
                        @modal-close="showDetailModal = false"
                        size="large">

                        <sw-tabs v-if="selectedSession">
                            <template #default="{ active }">
                                <sw-tabs-item
                                    :active-tab="active"
                                    name="general">
                                    {{ $tc('ucp-logs.sessions.detailGeneral') }}
                                </sw-tabs-item>
                                <sw-tabs-item
                                    :active-tab="active"
                                    name="cart">
                                    {{ $tc('ucp-logs.sessions.detailCart') }}
                                </sw-tabs-item>
                                <sw-tabs-item
                                    :active-tab="active"
                                    name="payment">
                                    {{ $tc('ucp-logs.sessions.detailPayment') }}
                                </sw-tabs-item>
                                <sw-tabs-item
                                    :active-tab="active"
                                    name="addresses">
                                    {{ $tc('ucp-logs.sessions.detailAddresses') }}
                                </sw-tabs-item>
                            </template>

                            <template #content="{ active }">
                                <div v-if="active === 'general'" class="ucp-detail-content">
                                    <dl class="ucp-detail-list">
                                        <dt>Session ID</dt>
                                        <dd><code>{{ selectedSession.ucpSessionId }}</code></dd>

                                        <dt>Status</dt>
                                        <dd>
                                            <sw-label :variant="getStatusVariant(selectedSession.status)" size="small">
                                                {{ selectedSession.status }}
                                            </sw-label>
                                        </dd>

                                        <dt>Shop ID</dt>
                                        <dd>{{ selectedSession.shopId }}</dd>

                                        <dt>Platform</dt>
                                        <dd>{{ selectedSession.platformName || '-' }}</dd>

                                        <dt>Created</dt>
                                        <dd>{{ formatDate(selectedSession.createdAt) }}</dd>

                                        <dt>Expires</dt>
                                        <dd>{{ formatDate(selectedSession.expiresAt) }}</dd>

                                        <dt>Completed</dt>
                                        <dd>{{ selectedSession.completedAt ? formatDate(selectedSession.completedAt) : '-' }}</dd>
                                    </dl>
                                </div>

                                <div v-if="active === 'cart'" class="ucp-detail-content">
                                    <pre class="ucp-json-view">{{ formatJson(selectedSession.cartData) }}</pre>
                                </div>

                                <div v-if="active === 'payment'" class="ucp-detail-content">
                                    <dl class="ucp-detail-list" v-if="selectedSession.paymentHandlerId">
                                        <dt>Payment Handler</dt>
                                        <dd>{{ selectedSession.paymentHandlerId }}</dd>

                                        <dt>Transaction ID</dt>
                                        <dd><code>{{ selectedSession.paymentTransactionId || '-' }}</code></dd>
                                    </dl>
                                    <p v-else class="ucp-text-muted">No payment data available</p>
                                </div>

                                <div v-if="active === 'addresses'" class="ucp-detail-content">
                                    <div v-if="selectedSession.shippingAddress">
                                        <h4>Shipping Address</h4>
                                        <pre class="ucp-json-view">{{ formatJson(selectedSession.shippingAddress) }}</pre>
                                    </div>
                                    <div v-if="selectedSession.billingAddress">
                                        <h4>Billing Address</h4>
                                        <pre class="ucp-json-view">{{ formatJson(selectedSession.billingAddress) }}</pre>
                                    </div>
                                    <p v-if="!selectedSession.shippingAddress && !selectedSession.billingAddress" class="ucp-text-muted">
                                        No address data available
                                    </p>
                                </div>
                            </template>
                        </sw-tabs>

                        <template #modal-footer>
                            <sw-button @click="showDetailModal = false">
                                Close
                            </sw-button>
                        </template>
                    </sw-modal>
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
            sessions: [],
            statusFilter: null,
            showDetailModal: false,
            selectedSession: null,
            sortBy: 'createdAt',
            sortDirection: 'DESC',
        };
    },

    computed: {
        columns() {
            return [
                {
                    property: 'ucpSessionId',
                    label: this.$tc('ucp-logs.sessions.columnSession'),
                    width: '220px',
                },
                {
                    property: 'status',
                    label: this.$tc('ucp-logs.sessions.columnStatus'),
                    width: '120px',
                },
                {
                    property: 'platformName',
                    label: this.$tc('ucp-logs.sessions.columnPlatform'),
                    width: '150px',
                },
                {
                    property: 'orderNumber',
                    label: this.$tc('ucp-logs.sessions.columnOrder'),
                    width: '130px',
                },
                {
                    property: 'createdAt',
                    label: this.$tc('ucp-logs.sessions.columnCreated'),
                    width: '180px',
                    sortable: true,
                },
                {
                    property: 'expiresAt',
                    label: this.$tc('ucp-logs.sessions.columnExpires'),
                    width: '180px',
                },
            ];
        },

        statusOptions() {
            return [
                { value: null, label: this.$tc('ucp-logs.sessions.filterAll') },
                { value: 'incomplete', label: this.$tc('ucp-logs.sessions.statusIncomplete') },
                { value: 'complete', label: this.$tc('ucp-logs.sessions.statusComplete') },
                { value: 'failed', label: this.$tc('ucp-logs.sessions.statusFailed') },
                { value: 'expired', label: this.$tc('ucp-logs.sessions.statusExpired') },
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
                const response = await this.fetchSessions();
                this.sessions = response.sessions;
            } catch (error) {
                this.createNotificationError({
                    message: error.message || 'Failed to load sessions',
                });
            } finally {
                this.isLoading = false;
            }
        },

        async fetchSessions() {
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

                const response = await fetch(`${baseUrl}/admin/sessions?${params}`);
                if (response.ok) {
                    return response.json();
                }
            }

            // Return mock data for development
            return {
                sessions: [
                    {
                        id: '1',
                        ucpSessionId: 'ucp-7a8b9c0d-1e2f-3g4h-5i6j-7k8l9m0n1o2p',
                        shopId: 'default',
                        status: 'complete',
                        platformName: 'Google Gemini',
                        orderNumber: 'ORD-10001',
                        orderId: 'order-123',
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 3600000).toISOString(),
                        completedAt: new Date().toISOString(),
                        paymentHandlerId: 'google-pay',
                        paymentTransactionId: 'txn_abc123',
                        shippingAddress: { city: 'Amsterdam', country: 'NL' },
                        billingAddress: { city: 'Amsterdam', country: 'NL' },
                        cartData: { items: 2, total: 249.99 },
                    },
                    {
                        id: '2',
                        ucpSessionId: 'ucp-2b3c4d5e-6f7g-8h9i-0j1k-2l3m4n5o6p7q',
                        shopId: 'default',
                        status: 'incomplete',
                        platformName: 'ChatGPT',
                        orderNumber: null,
                        orderId: null,
                        createdAt: new Date(Date.now() - 3600000).toISOString(),
                        expiresAt: new Date(Date.now() + 7200000).toISOString(),
                        completedAt: null,
                        paymentHandlerId: null,
                        paymentTransactionId: null,
                        shippingAddress: null,
                        billingAddress: null,
                        cartData: { items: 1, total: 89.50 },
                    },
                    {
                        id: '3',
                        ucpSessionId: 'ucp-3c4d5e6f-7g8h-9i0j-1k2l-3m4n5o6p7q8r',
                        shopId: 'default',
                        status: 'expired',
                        platformName: 'Microsoft Copilot',
                        orderNumber: null,
                        orderId: null,
                        createdAt: new Date(Date.now() - 86400000).toISOString(),
                        expiresAt: new Date(Date.now() - 82800000).toISOString(),
                        completedAt: null,
                        paymentHandlerId: null,
                        paymentTransactionId: null,
                        shippingAddress: null,
                        billingAddress: null,
                        cartData: { items: 3, total: 125.00 },
                    },
                ],
            };
        },

        showDetail(session) {
            this.selectedSession = session;
            this.showDetailModal = true;
        },

        onColumnSort(column) {
            this.sortBy = column.property;
            this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
            this.loadData();
        },

        formatDate(dateString) {
            if (!dateString) return '-';
            return new Date(dateString).toLocaleString();
        },

        formatJson(obj) {
            if (!obj) return 'null';
            return JSON.stringify(obj, null, 2);
        },

        isExpired(session) {
            return session.status === 'expired' || new Date(session.expiresAt) < new Date();
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
                complete: this.$tc('ucp-logs.sessions.statusComplete'),
                incomplete: this.$tc('ucp-logs.sessions.statusIncomplete'),
                failed: this.$tc('ucp-logs.sessions.statusFailed'),
                expired: this.$tc('ucp-logs.sessions.statusExpired'),
            };
            return labels[status] || status;
        },
    },
});
