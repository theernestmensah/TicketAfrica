(function () {
  const TA = window.AbontenTickets;

  function selectionPayload() {
    const selection = TA.getSelection();
    if (selection) return selection;
    const first = TA.getStored(TA.STORAGE_KEYS.events, [])[0];
    return { eventId: first.id, ticketType: first.tickets[0].type, price: first.tickets[0].price, quantity: 1 };
  }

  function renderCheckout() {
    const form = document.querySelector("#checkoutForm");
    const summary = document.querySelector("[data-checkout-summary]");
    if (!form || !summary) return;
    const selection = selectionPayload();
    const event = TA.eventById(selection.eventId);
    const totals = TA.totalFor(selection.price, selection.quantity);

    summary.innerHTML = `
      <h2 class="h5">${event.title}</h2>
      <p class="text-muted mb-3">${TA.dateLabel(event.date)} at ${event.location}</p>
      <div class="d-flex justify-content-between"><span>${selection.ticketType} x ${selection.quantity}</span><strong>${TA.money(totals.subtotal)}</strong></div>
      <div class="d-flex justify-content-between"><span>Abonten Tickets service fee</span><strong>${TA.money(totals.fee)}</strong></div>
      <hr>
      <div class="d-flex justify-content-between fs-5"><span>Total paid</span><strong>${TA.money(totals.total)}</strong></div>`;

    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      const data = new FormData(form);
      const order = {
        id: `order-${Date.now()}`,
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
        buyerName: data.get("fullName"),
        buyerEmail: data.get("email"),
        buyerPhone: data.get("phone"),
        ticketType: selection.ticketType,
        quantity: selection.quantity,
        ticketPrice: selection.price,
        serviceFee: totals.fee,
        totalPaid: totals.total,
        paymentStatus: "paid",
        ticketStatus: "valid",
        ticketCode: TA.ticketCode(),
        paystackReference: `PSK-MOCK-${Date.now()}`,
        createdAt: new Date().toISOString()
      };

      // Later: replace this mock success block with Paystack InlineJS initialization and callback handling.
      TA.saveOrder(order);
      window.location.href = "payment-success.html";
    });
  }

  function renderSuccess() {
    const slot = document.querySelector("[data-success-summary]");
    if (!slot) return;
    const order = TA.lastOrder();
    if (!order) {
      slot.innerHTML = `<div class="alert alert-warning">No successful payment found yet.</div>`;
      return;
    }
    slot.innerHTML = `
      <div class="alert alert-success">Payment successful. Your ticket is ready.</div>
      <dl class="row mb-0">
        <dt class="col-5">Event</dt><dd class="col-7">${order.eventTitle}</dd>
        <dt class="col-5">Buyer</dt><dd class="col-7">${order.buyerName}</dd>
        <dt class="col-5">Ticket</dt><dd class="col-7">${order.ticketType} x ${order.quantity}</dd>
        <dt class="col-5">Total</dt><dd class="col-7">${TA.money(order.totalPaid)}</dd>
        <dt class="col-5">Reference</dt><dd class="col-7">${order.paystackReference}</dd>
      </dl>
      <a class="btn btn-brand w-100 mt-4" href="ticket.html?order=${order.id}">View Ticket</a>`;
  }

  renderCheckout();
  renderSuccess();
})();
