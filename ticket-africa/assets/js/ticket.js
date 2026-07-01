(function () {
  const TA = window.AbontenTickets;

  function findOrder() {
    const id = TA.getQuery("order");
    return TA.allOrders().find((order) => order.id === id) || TA.lastOrder();
  }

  function renderTicket() {
    const slot = document.querySelector("[data-ticket]");
    if (!slot) return;
    const order = findOrder();
    if (!order) {
      slot.innerHTML = `<div class="alert alert-warning">No ticket found. Buy a ticket first to generate a QR code.</div>`;
      return;
    }

    slot.innerHTML = `
      <div class="ticket-shell">
        <div class="ticket-top p-4">
          <div class="d-flex justify-content-between gap-3">
            <div>
              <p class="eyebrow mb-1">Abonten Tickets Pass</p>
              <h1 class="h3 mb-0">${order.eventTitle}</h1>
            </div>
            <div>${TA.statusBadge(order.ticketStatus)}</div>
          </div>
        </div>
        <div class="p-4">
          <div class="row g-4 align-items-center">
            <div class="col-md-7">
              <dl class="row mb-0">
                <dt class="col-5">Buyer</dt><dd class="col-7">${order.buyerName}</dd>
                <dt class="col-5">Ticket type</dt><dd class="col-7">${order.ticketType}</dd>
                <dt class="col-5">Date</dt><dd class="col-7">${TA.dateLabel(order.eventDate)}</dd>
                <dt class="col-5">Location</dt><dd class="col-7">${order.eventLocation}</dd>
                <dt class="col-5">Ticket code</dt><dd class="col-7 fw-bold">${order.ticketCode}</dd>
              </dl>
            </div>
            <div class="col-md-5">
              <div id="qrcode" class="qr-box"></div>
            </div>
          </div>
        </div>
      </div>`;

    if (window.QRCode) {
      new QRCode(document.getElementById("qrcode"), {
        text: order.ticketCode,
        width: 172,
        height: 172,
        colorDark: "#064f3b",
        colorLight: "#ffffff"
      });
    }
  }

  renderTicket();
})();
