document.addEventListener('DOMContentLoaded', function () {
  function getPrecision(numberAsString) {
    const n = numberAsString.toString().split('.');
    return n.length > 1 ? n[1].length : 0;
  }

  // Lazy load orders
  const loadOrdersBtn = document.getElementById('load-orders');
  const refreshOrdersBtn = document.getElementById('refresh-orders');
  const ordersContent = document.getElementById('orders-content');
  const ordersCount = document.getElementById('orders-count');

  function formatPrice(price) {
    if (price === null || price === undefined) return '-';
    return parseFloat(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  }

  async function loadOrders() {
    const profileId = window.location.pathname.split('/')[2];
    const pair = decodeURIComponent(window.location.pathname.split('/')[3]);

    ordersContent.innerHTML = '<div class="p-4 text-gray-500 text-center"><i class="fas fa-spinner fa-spin"></i> Loading orders...</div>';

    try {
      const response = await fetch(`/api/orders/${profileId}/${encodeURIComponent(pair)}`);
      const data = await response.json();

      if (data.error) {
        ordersContent.innerHTML = `<div class="p-4 text-red-500 text-center">${data.error}</div>`;
        return;
      }

      const orders = data.orders || [];

      if (orders.length === 0) {
        ordersContent.innerHTML = '<div class="p-4 text-gray-500 text-center">No open orders for this pair</div>';
        ordersCount.textContent = '(0)';
        return;
      }

      ordersCount.textContent = `(${orders.length})`;

      let html = `
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th class="border border-gray-200 bg-gray-50 font-semibold px-3 py-2">ID</th>
              <th class="border border-gray-200 bg-gray-50 font-semibold px-3 py-2">Type</th>
              <th class="border border-gray-200 bg-gray-50 font-semibold px-3 py-2">Price</th>
              <th class="border border-gray-200 bg-gray-50 font-semibold px-3 py-2">Amount</th>
              <th class="border border-gray-200 bg-gray-50 font-semibold px-3 py-2">Side</th>
              <th class="border border-gray-200 bg-gray-50 font-semibold px-3 py-2">Cancel</th>
            </tr>
          </thead>
          <tbody>
      `;

      orders.forEach(function(order) {
        const sideIcon = order.side === 'buy'
          ? '<i class="fas fa-chevron-circle-up text-green-600"></i>'
          : '<i class="fas fa-chevron-circle-down text-red-600"></i>';

        html += `
          <tr class="hover:bg-gray-100">
            <td class="border border-gray-200 px-3 py-2 font-mono text-xs">${order.id.substring(0, 10)}...</td>
            <td class="border border-gray-200 px-3 py-2">${order.type}</td>
            <td class="border border-gray-200 px-3 py-2">${formatPrice(order.price)}</td>
            <td class="border border-gray-200 px-3 py-2">${order.amount} (${order.filled} filled)</td>
            <td class="border border-gray-200 px-3 py-2">${sideIcon}</td>
            <td class="border border-gray-200 px-3 py-2">
              <a href="/orders/${profileId}/${encodeURIComponent(pair)}/cancel/${encodeURIComponent(order.id)}" class="text-gray-400 hover:text-red-600" title="Cancel">
                <i class="fas fa-window-close"></i>
              </a>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      ordersContent.innerHTML = html;
    } catch (e) {
      ordersContent.innerHTML = `<div class="p-4 text-red-500 text-center">Error loading orders: ${e.message}</div>`;
    }
  }

  if (loadOrdersBtn) {
    loadOrdersBtn.addEventListener('click', loadOrders);
  }

  if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener('click', loadOrders);
  }

  // Auto-load orders on page load (lazy loaded via API)
  if (ordersContent) {
    loadOrders();
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
