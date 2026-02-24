document.addEventListener('DOMContentLoaded', function () {
  // Strategy change handler
  const strategySelect = document.querySelector('form.backtest-form #form-strategies');
  if (strategySelect) {
    strategySelect.addEventListener('change', function () {
      const selectedOption = this.options[this.selectedIndex];
      if (!selectedOption) return;

      const options = selectedOption.getAttribute('data-options');

      if (options) {
        const form = this.closest('form');
        const optionsInput = form.querySelector('#form-options');
        if (optionsInput) {
          optionsInput.value = options;
        }
      }
    });
  }

  // Note: Slim Select for pair is handled centrally by slim-select.js
  // Use data-slim-select data-slim-change="form-candle-period" on the select element
});
