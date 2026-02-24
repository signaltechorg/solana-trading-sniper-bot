/**
 * Auto-initialize Slim Select on elements with data-slim-select attribute
 *
 * Usage:
 *   <select data-slim-select>...</select>                           // Single select
 *   <select data-slim-select data-slim-placeholder="Search...">...  // Custom placeholder
 *   <select data-slim-select multiple>...</select>                  // Multi-select
 */
document.addEventListener('DOMContentLoaded', function () {
    if (typeof SlimSelect === 'undefined') {
        return;
    }

    document.querySelectorAll('[data-slim-select]').forEach(function (select) {
        const isMultiple = select.hasAttribute('multiple');
        const placeholder = select.dataset.slimPlaceholder || select.dataset.placeholder || 'Select...';

        const options = {
            select: select,
            settings: {
                placeholder: placeholder,
                closeOnSelect: !isMultiple,
                openPosition: 'down'
            }
        };

        // Handle data-slim-change callback for candle period updates (backtest-form pattern)
        if (select.dataset.slimChange) {
            options.events = {
                afterChange: function (newVal) {
                    if (newVal && newVal.length > 0) {
                        const lastValue = newVal[newVal.length - 1].value;
                        const option = select.querySelector('option[value="' + lastValue + '"]');
                        if (option) {
                            const optionsData = option.getAttribute('data-options');
                            if (optionsData) {
                                const form = select.closest('form');
                                const targetId = select.dataset.slimChange;
                                const targetEl = form ? form.querySelector('#' + targetId) : null;
                                if (targetEl) {
                                    targetEl.innerHTML = '';
                                    const periods = JSON.parse(optionsData);
                                    periods.forEach(function (period) {
                                        const opt = document.createElement('option');
                                        opt.value = period;
                                        opt.textContent = period;
                                        targetEl.appendChild(opt);
                                    });
                                }
                            }
                        }
                    }
                }
            };
        }

        new SlimSelect(options);
    });
});
