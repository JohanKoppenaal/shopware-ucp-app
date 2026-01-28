/**
 * UCP Stats Card Component
 * Displays a single statistic with icon and label
 */

const { Component } = Shopware;

Component.register('ucp-stats-card', {
    template: `
        <div class="ucp-stats-card" :class="'ucp-stats-card--' + size">
            <div class="ucp-stats-card__icon" :style="{ backgroundColor: color + '20', color: color }">
                <sw-icon :name="icon" :size="size === 'small' ? '20' : '28'"></sw-icon>
            </div>
            <div class="ucp-stats-card__content">
                <div class="ucp-stats-card__value">{{ value }}</div>
                <div class="ucp-stats-card__label">{{ label }}</div>
            </div>
        </div>
    `,

    props: {
        label: {
            type: String,
            required: true,
        },
        value: {
            type: [String, Number],
            required: true,
        },
        icon: {
            type: String,
            default: 'regular-chart-line',
        },
        color: {
            type: String,
            default: '#3498db',
        },
        size: {
            type: String,
            default: 'default',
            validator(value) {
                return ['small', 'default', 'large'].includes(value);
            },
        },
    },
});
