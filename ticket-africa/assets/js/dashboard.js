(function () {
  const TA = window.AbontenTickets;
  const events = TA.getStored(TA.STORAGE_KEYS.events, []);
  const orders = TA.allOrders();

  function totals() {
    const revenue = orders.reduce((sum, order) => sum + Number(order.totalPaid || 0), 0);
    const fees = orders.reduce((sum, order) => sum + Number(order.serviceFee || 0), 0);
    return {
      totalEvents: events.length,
      approvedEvents: events.filter((event) => event.status === "approved").length,
      organizers: new Set(events.map((event) => event.organizer)).size,
      ticketsSold: orders.reduce((sum, order) => sum + Number(order.quantity || 1), 0),
      revenue,
      fees,
      payout: revenue - fees
    };
  }

  function metric(label, value, hint) {
    return `<div class="col-sm-6 col-xl-3"><div class="metric-card p-3 h-100"><div class="text-muted small">${label}</div><div class="metric-value">${value}</div><div class="small text-muted">${hint || ""}</div></div></div>`;
  }

  function renderOrganizerDashboard() {
    const slot = document.querySelector("[data-organizer-dashboard]");
    if (!slot) return;
    const t = totals();
    slot.innerHTML = `
      <div class="row g-3 mb-4">
        ${metric("Total events", t.totalEvents, "Created locally")}
        ${metric("Tickets sold", t.ticketsSold, "Mock orders")}
        ${metric("Revenue", TA.money(t.revenue), "Gross paid")}
        ${metric("Upcoming", t.approvedEvents, "Approved events")}
      </div>
      <div class="panel bg-white p-3">
        <h2 class="h5 mb-3">Upcoming events</h2>
        <div class="table-responsive">${eventsTable(events.slice(0, 5), false)}</div>
      </div>`;
  }

  function eventsTable(rows, withActions) {
    return `
      <table class="table align-middle">
        <thead><tr><th>Event</th><th>Date</th><th>Location</th><th>Status</th>${withActions ? "<th>Actions</th>" : ""}</tr></thead>
        <tbody>
          ${rows.map((event) => `
            <tr>
              <td class="fw-semibold">${event.title}</td>
              <td>${TA.dateLabel(event.date)}</td>
              <td>${event.location}</td>
              <td>${TA.statusBadge(event.status)}</td>
              ${withActions ? `<td><div class="btn-group btn-group-sm"><a class="btn btn-outline-success" href="event-sales.html?id=${event.id}">View Sales</a><button class="btn btn-outline-secondary" data-edit="${event.id}">Edit</button><button class="btn btn-outline-danger" data-delete="${event.id}">Delete</button></div></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  function renderManageEvents() {
    const slot = document.querySelector("[data-manage-events]");
    if (!slot) return;
    slot.innerHTML = eventsTable(events, true);
    slot.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = events.filter((event) => event.id !== button.dataset.delete);
        TA.setStored(TA.STORAGE_KEYS.events, next);
        window.location.reload();
      });
    });
    slot.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const modalEl = document.querySelector("#editEventModal");
        if (modalEl && window.bootstrap) {
          bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
      });
    });
  }

  function initCreateEvent() {
    const form = document.querySelector("#createEventForm");
    const rows = document.querySelector("#ticketTypeRows");
    const addButton = document.querySelector("#addTicketType");
    if (!form || !rows || !addButton) return;

    function row(type = "", price = "", quantity = "") {
      rows.insertAdjacentHTML("beforeend", `
        <div class="row g-2 ticket-row mb-2">
          <div class="col-md-4"><input class="form-control" name="ticketType" placeholder="Regular" value="${type}" required></div>
          <div class="col-md-4"><input class="form-control" name="ticketPrice" type="number" min="1" placeholder="Price" value="${price}" required></div>
          <div class="col-md-3"><input class="form-control" name="ticketQuantity" type="number" min="1" placeholder="Quantity" value="${quantity}" required></div>
          <div class="col-md-1 d-grid"><button class="btn btn-outline-danger" type="button" data-remove-ticket>&times;</button></div>
        </div>`);
    }

    addButton.addEventListener("click", () => row());
    rows.addEventListener("click", (event) => {
      if (event.target.matches("[data-remove-ticket]") && rows.children.length > 1) {
        event.target.closest(".ticket-row").remove();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const types = data.getAll("ticketType");
      const prices = data.getAll("ticketPrice");
      const quantities = data.getAll("ticketQuantity");
      const newEvent = {
        id: data.get("title").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + `-${Date.now().toString(36)}`,
        title: data.get("title"),
        description: data.get("description"),
        image: data.get("image"),
        location: data.get("location"),
        category: data.get("category"),
        date: data.get("date"),
        startTime: data.get("startTime"),
        endTime: data.get("endTime"),
        organizer: "Demo Organizer",
        status: "pending",
        tickets: types.map((type, index) => ({ type, price: Number(prices[index]), quantity: Number(quantities[index]) }))
      };
      TA.setStored(TA.STORAGE_KEYS.events, [newEvent, ...events]);
      document.querySelector("[data-create-alert]").innerHTML = `<div class="alert alert-success">Event saved as pending approval.</div>`;
      setTimeout(() => { window.location.href = "manage-events.html"; }, 700);
    });

    row("Regular", 80, 200);
    row("VIP", 180, 80);
  }

  function renderSales() {
    const slot = document.querySelector("[data-sales]");
    if (!slot) return;
    const event = TA.eventById(TA.getQuery("id")) || events[0];
    const eventOrders = orders.filter((order) => order.eventId === event.id);
    const revenue = eventOrders.reduce((sum, order) => sum + Number(order.totalPaid || 0), 0);
    slot.innerHTML = `
      <h1 class="h3 mb-4">${event.title} Sales</h1>
      <div class="row g-3 mb-4">
        ${metric("Orders", eventOrders.length, "Paid")}
        ${metric("Tickets sold", eventOrders.reduce((s, o) => s + Number(o.quantity || 1), 0), "Across types")}
        ${metric("Gross revenue", TA.money(revenue), "Includes fees")}
        ${metric("Service fees", TA.money(eventOrders.reduce((s, o) => s + Number(o.serviceFee || 0), 0)), "Abonten Tickets")}
      </div>
      <div class="panel bg-white p-3"><h2 class="h5">Ticket type breakdown</h2>${ticketBreakdown(eventOrders)}</div>`;
  }

  function ticketBreakdown(rows) {
    const grouped = {};
    rows.forEach((order) => {
      grouped[order.ticketType] = grouped[order.ticketType] || { count: 0, revenue: 0 };
      grouped[order.ticketType].count += Number(order.quantity || 1);
      grouped[order.ticketType].revenue += Number(order.totalPaid || 0);
    });
    const entries = Object.entries(grouped);
    if (!entries.length) return `<p class="text-muted mb-0">No sales yet.</p>`;
    return `<div class="table-responsive"><table class="table"><thead><tr><th>Ticket</th><th>Sold</th><th>Revenue</th></tr></thead><tbody>${entries.map(([type, data]) => `<tr><td>${type}</td><td>${data.count}</td><td>${TA.money(data.revenue)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderAttendees() {
    const slot = document.querySelector("[data-attendees]");
    if (!slot) return;
    slot.innerHTML = orders.length ? `
      <div class="table-responsive"><table class="table align-middle">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Ticket</th><th>Payment</th><th>Check-in</th></tr></thead>
        <tbody>${orders.map((order) => `<tr><td>${order.buyerName}</td><td>${order.buyerEmail}</td><td>${order.buyerPhone}</td><td>${order.ticketType}</td><td>${TA.statusBadge(order.paymentStatus)}</td><td>${TA.statusBadge(order.ticketStatus)}</td></tr>`).join("")}</tbody>
      </table></div>` : `<div class="alert alert-info">No attendees yet.</div>`;
  }

  function renderAdminDashboard() {
    const slot = document.querySelector("[data-admin-dashboard]");
    if (!slot) return;
    const t = totals();
    slot.innerHTML = `
      <div class="row g-3">
        ${metric("Platform revenue", TA.money(t.revenue), "Gross customer payments")}
        ${metric("Tickets sold", t.ticketsSold, "All events")}
        ${metric("Events", t.totalEvents, `${t.approvedEvents} approved`)}
        ${metric("Organizers", t.organizers, "Mock accounts")}
        ${metric("Service fee income", TA.money(t.fees), "Estimate")}
        ${metric("Organizer payouts", TA.money(t.payout), "Estimate")}
      </div>`;
  }

  function renderAdminEvents() {
    const slot = document.querySelector("[data-admin-events]");
    if (!slot) return;
    slot.innerHTML = `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Event</th><th>Organizer</th><th>Date</th><th>Status</th><th>Review</th></tr></thead><tbody>${events.map((event) => `<tr><td>${event.title}</td><td>${event.organizer}</td><td>${TA.dateLabel(event.date)}</td><td>${TA.statusBadge(event.status)}</td><td><div class="btn-group btn-group-sm"><button class="btn btn-outline-success" data-status="${event.id}:approved">Approve</button><button class="btn btn-outline-danger" data-status="${event.id}:rejected">Reject</button></div></td></tr>`).join("")}</tbody></table></div>`;
    slot.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", () => {
        const [id, status] = button.dataset.status.split(":");
        TA.setStored(TA.STORAGE_KEYS.events, events.map((event) => event.id === id ? { ...event, status } : event));
        window.location.reload();
      });
    });
  }

  function renderAdminSimple(type) {
    const slot = document.querySelector(`[data-admin-${type}]`);
    if (!slot) return;
    if (type === "organizers") {
      const organizers = [...new Set(events.map((event) => event.organizer))];
      slot.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Organizer</th><th>Events</th><th>Status</th></tr></thead><tbody>${organizers.map((name) => `<tr><td>${name}</td><td>${events.filter((event) => event.organizer === name).length}</td><td><span class="badge text-bg-success">Active</span></td></tr>`).join("")}</tbody></table></div>`;
    }
    if (type === "users") {
      slot.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${order.buyerName}</td><td>${order.buyerEmail}</td><td>${order.buyerPhone}</td><td>1</td></tr>`).join("") || `<tr><td colspan="4">No customers yet.</td></tr>`}</tbody></table></div>`;
    }
    if (type === "orders") {
      slot.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Order</th><th>Event</th><th>Reference</th><th>Payment</th><th>Ticket</th><th>Total</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${order.id}</td><td>${order.eventTitle}</td><td>${order.paystackReference}</td><td>${TA.statusBadge(order.paymentStatus)}</td><td>${TA.statusBadge(order.ticketStatus)}</td><td>${TA.money(order.totalPaid)}</td></tr>`).join("") || `<tr><td colspan="6">No orders yet.</td></tr>`}</tbody></table></div>`;
    }
    if (type === "revenue") {
      const t = totals();
      slot.innerHTML = `<div class="row g-3">${metric("Gross revenue", TA.money(t.revenue), "Total paid")}${metric("Service fees", TA.money(t.fees), "Platform income")}${metric("Payout estimate", TA.money(t.payout), "Organizer share")}${metric("Orders", orders.length, "Paid orders")}</div>`;
    }
  }

  renderOrganizerDashboard();
  renderManageEvents();
  initCreateEvent();
  renderSales();
  renderAttendees();
  renderAdminDashboard();
  renderAdminEvents();
  ["organizers", "users", "orders", "revenue"].forEach(renderAdminSimple);
})();
