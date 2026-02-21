document.addEventListener('DOMContentLoaded', function () {
  function getPrecision(numberAsString) {
    const n = numberAsString.toString().split('.');
    return n.length > 1 ? n[1].length : 0;
  }

  // Order type toggle (limit/market)
  const orderTypeSelect = document.getElementById('order_type');
  const priceGroup = document.getElementById('price-group');

  if (orderTypeSelect && priceGroup) {
    orderTypeSelect.addEventListener('change', function () {
      if (this.value === 'market') {
        priceGroup.classList.add('hidden');
      } else {
        priceGroup.classList.remove('hidden');
      }
    });
  }

  // Percent input group buttons
  document.querySelectorAll('.percent-input-group').forEach(function (group) {
    group.addEventListener('click', function (e) {
      if (e.target.tagName === 'BUTTON') {
        e.preventDefault();

        const button = e.target;
        const form = button.closest('form');
        const input = form.querySelector('#price');

        const percentageChange = parseFloat(button.value);
        const price = parseFloat(input.value);

        if (!isNaN(price)) {
          input.value = (price + (price * percentageChange) / 100).toFixed(getPrecision(price));
        }
      }
    });
  });

  // Amount input fields - auto-calculate
  const amountInput = document.getElementById('amount');
  const amountTypeSelect = document.getElementById('amount_type');
  const priceInput = document.getElementById('price');

  function updateAmountDisplay() {
    const amountValue = parseFloat(amountInput.value);
    const priceValue = parseFloat(priceInput.value);
    const amountType = amountTypeSelect.value;

    if (!amountValue || isNaN(amountValue) || !priceValue || isNaN(priceValue)) {
      return;
    }

    // Just update a helper text if needed
    // The conversion is now handled server-side with isQuoteCurrency flag
  }

  if (amountInput) {
    amountInput.addEventListener('keyup', updateAmountDisplay);
  }
  if (priceInput) {
    priceInput.addEventListener('keyup', updateAmountDisplay);
  }

  // Filter pairs/recent items
  const filterInput = document.getElementById('filter-pairs');
  if (filterInput) {
    filterInput.addEventListener('keyup', function () {
      const filter = this.value.toLowerCase();
      document.querySelectorAll('.pair-link').forEach(function (link) {
        const pair = link.dataset.pair;
        if (pair.includes(filter)) {
          link.style.display = 'block';
        } else {
          link.style.display = 'none';
        }
      });
    });
  }
});
