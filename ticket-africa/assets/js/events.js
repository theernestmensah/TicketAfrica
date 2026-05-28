(function () {
  const TA = window.TicketAfrica;
  const events = TA.getStored(TA.STORAGE_KEYS.events, []);

  function approvedEvents() {
    return events.filter((event) => event.status === "approved");
  }

  function renderHome() {
    const featured = document.querySelector("[data-featured-events]");
    const upcoming = document.querySelector("[data-upcoming-events]");
    if (featured) featured.innerHTML = approvedEvents().slice(0, 3).map(TA.eventCard).join("");
    if (upcoming) upcoming.innerHTML = approvedEvents().slice(1, 4).map(TA.eventCard).join("");
  }

  function renderFilters() {
    const category = document.querySelector("#categoryFilter");
    const location = document.querySelector("#locationFilter");
    if (!category || !location) return;

    [...new Set(events.map((event) => event.category))].sort().forEach((value) => {
      category.insertAdjacentHTML("beforeend", `<option value="${value}">${value}</option>`);
    });
    [...new Set(events.map((event) => event.location))].sort().forEach((value) => {
      location.insertAdjacentHTML("beforeend", `<option value="${value}">${value}</option>`);
    });
  }

  function renderEventsList() {
    const list = document.querySelector("[data-events-list]");
    if (!list) return;
    const category = document.querySelector("#categoryFilter")?.value || "";
    const location = document.querySelector("#locationFilter")?.value || "";
    const date = document.querySelector("#dateFilter")?.value || "";
    const search = (document.querySelector("#searchInput")?.value || "").toLowerCase();

    const filtered = approvedEvents().filter((event) => {
      const matchesSearch = !search || `${event.title} ${event.location} ${event.category}`.toLowerCase().includes(search);
      return matchesSearch &&
        (!category || event.category === category) &&
        (!location || event.location === location) &&
        (!date || event.date === date);
    });

    list.innerHTML = filtered.length
      ? filtered.map(TA.eventCard).join("")
      : `<div class="col-12"><div class="alert alert-warning">No events match your filters yet.</div></div>`;
  }

  function renderDetails() {
    const details = document.querySelector("[data-event-details]");
    if (!details) return;
    const event = TA.eventById(TA.getQuery("id")) || approvedEvents()[0];
    if (!event) {
      details.innerHTML = `<div class="alert alert-danger">Event not found.</div>`;
      return;
    }

    details.innerHTML = `
      <div class="row g-4 align-items-start">
        <div class="col-lg-7">
          <img class="img-fluid rounded-3 mb-4 w-100" src="${event.image}" alt="${event.title}">
          <span class="badge text-bg-warning mb-3">${event.category}</span>
          <h1 class="display-6 fw-bold">${event.title}</h1>
          <p class="lead text-muted">${event.description}</p>
          <div class="row g-3 mt-2">
            <div class="col-sm-6"><div class="panel bg-white p-3"><strong>Date</strong><br>${TA.dateLabel(event.date)}</div></div>
            <div class="col-sm-6"><div class="panel bg-white p-3"><strong>Time</strong><br>${event.startTime} - ${event.endTime}</div></div>
            <div class="col-sm-6"><div class="panel bg-white p-3"><strong>Location</strong><br>${event.location}</div></div>
            <div class="col-sm-6"><div class="panel bg-white p-3"><strong>Organizer</strong><br>${event.organizer}</div></div>
          </div>
        </div>
        <div class="col-lg-5">
          <form id="ticketSelectForm" class="panel bg-white p-4 sticky-lg-top" style="top: 96px;">
            <h2 class="h4 mb-3">Choose Tickets</h2>
            <label class="form-label" for="ticketType">Ticket type</label>
            <select id="ticketType" class="form-select mb-3"></select>
            <label class="form-label" for="quantity">Quantity</label>
            <input id="quantity" class="form-control mb-3" type="number" min="1" max="10" value="1">
            <div class="price-box p-3 mb-3" data-price-summary></div>
            <button class="btn btn-brand w-100" type="submit">Proceed to Checkout</button>
          </form>
        </div>
      </div>`;

    const ticketSelect = document.querySelector("#ticketType");
    const quantity = document.querySelector("#quantity");
    const summary = document.querySelector("[data-price-summary]");
    ticketSelect.innerHTML = event.tickets.map((ticket) => `<option value="${ticket.type}">${ticket.type} - ${TA.money(ticket.price)}</option>`).join("");

    function selectedTicket() {
      return event.tickets.find((ticket) => ticket.type === ticketSelect.value) || event.tickets[0];
    }

    function updateSummary() {
      const ticket = selectedTicket();
      const totals = TA.totalFor(ticket.price, quantity.value);
      summary.innerHTML = `
        <div class="d-flex justify-content-between"><span>Ticket price</span><strong>${TA.money(ticket.price)}</strong></div>
        <div class="d-flex justify-content-between"><span>Service fee</span><strong>${TA.money(TA.serviceFee(ticket.price))}</strong></div>
        <hr>
        <div class="d-flex justify-content-between"><span>Total</span><strong>${TA.money(totals.total)}</strong></div>`;
    }

    ticketSelect.addEventListener("change", updateSummary);
    quantity.addEventListener("input", updateSummary);
    document.querySelector("#ticketSelectForm").addEventListener("submit", (eventSubmit) => {
      eventSubmit.preventDefault();
      const ticket = selectedTicket();
      TA.saveSelection({
        eventId: event.id,
        ticketType: ticket.type,
        price: ticket.price,
        quantity: Number(quantity.value || 1)
      });
      window.location.href = "checkout.html";
    });
    updateSummary();
  }

  renderHome();
  renderFilters();
  renderEventsList();
  renderDetails();
  document.querySelectorAll("#categoryFilter,#locationFilter,#dateFilter,#searchInput").forEach((input) => {
    input.addEventListener("input", renderEventsList);
  });
})();
