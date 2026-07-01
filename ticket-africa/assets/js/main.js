(function () {
  const STORAGE_KEYS = {
    events: "ta_events",
    orders: "ta_orders",
    currentSelection: "ta_current_selection",
    lastOrder: "ta_last_order"
  };

  const seedEvents = [
    {
      id: "accra-night-live",
      title: "Accra Night Live",
      description: "A high-energy night of Afrobeats, amapiano, food vendors, and live DJ sets in the heart of Osu.",
      image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=80",
      location: "Osu, Accra",
      category: "Music",
      date: "2026-07-18",
      startTime: "19:00",
      endTime: "02:00",
      status: "approved",
      organizer: "Gold Coast Events",
      tickets: [
        { type: "Regular", price: 80, quantity: 350 },
        { type: "VIP", price: 180, quantity: 120 },
        { type: "VVIP", price: 350, quantity: 40 }
      ]
    },
    {
      id: "kumasi-tech-summit",
      title: "Kumasi Tech Summit",
      description: "Founders, designers, developers, and investors gather for practical talks on building African technology companies.",
      image: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80",
      location: "KNUST, Kumasi",
      category: "Conference",
      date: "2026-08-05",
      startTime: "09:00",
      endTime: "17:00",
      status: "approved",
      organizer: "Ashanti Innovation Hub",
      tickets: [
        { type: "Student", price: 45, quantity: 200 },
        { type: "Professional", price: 120, quantity: 260 },
        { type: "Startup Booth", price: 500, quantity: 30 }
      ]
    },
    {
      id: "cape-coast-food-fair",
      title: "Cape Coast Food Fair",
      description: "Taste Ghanaian coastal dishes, live palmwine music, chef demos, and family games by the beach.",
      image: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80",
      location: "Cape Coast",
      category: "Food",
      date: "2026-07-26",
      startTime: "12:00",
      endTime: "21:00",
      status: "approved",
      organizer: "Central Eats",
      tickets: [
        { type: "Regular", price: 35, quantity: 500 },
        { type: "Family Pack", price: 150, quantity: 80 }
      ]
    },
    {
      id: "tamale-creative-market",
      title: "Tamale Creative Market",
      description: "Fashion, art, photography, poetry, and independent makers from Northern Ghana.",
      image: "https://images.unsplash.com/photo-1528605105345-5344ea20e269?auto=format&fit=crop&w=1200&q=80",
      location: "Tamale",
      category: "Arts",
      date: "2026-09-12",
      startTime: "10:00",
      endTime: "20:00",
      status: "pending",
      organizer: "Savanna Creatives",
      tickets: [
        { type: "Regular", price: 25, quantity: 300 },
        { type: "Supporter", price: 100, quantity: 100 }
      ]
    }
  ];

  function getStored(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function setStored(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function ensureSeedData() {
    const existing = getStored(STORAGE_KEYS.events, null);
    if (!existing || !Array.isArray(existing) || existing.length === 0) {
      setStored(STORAGE_KEYS.events, seedEvents);
    }
    if (!getStored(STORAGE_KEYS.orders, null)) {
      setStored(STORAGE_KEYS.orders, []);
    }
  }

  function money(amount) {
    return `GHS ${Number(amount || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function serviceFee(price) {
    const value = Number(price || 0);
    if (value <= 50) return 3;
    if (value <= 100) return 5;
    if (value <= 300) return 7;
    return 10;
  }

  function totalFor(price, quantity) {
    const qty = Number(quantity || 1);
    return {
      subtotal: Number(price || 0) * qty,
      fee: serviceFee(price) * qty,
      total: (Number(price || 0) + serviceFee(price)) * qty
    };
  }

  function ticketCode() {
    return `TA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  function dateLabel(date) {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-GH", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function eventById(id) {
    return getStored(STORAGE_KEYS.events, []).find((event) => event.id === id);
  }

  function allOrders() {
    return getStored(STORAGE_KEYS.orders, []);
  }

  function saveOrder(order) {
    const orders = allOrders();
    orders.unshift(order);
    setStored(STORAGE_KEYS.orders, orders);
    setStored(STORAGE_KEYS.lastOrder, order.id);
  }

  function updateOrder(orderId, updater) {
    const orders = allOrders().map((order) => (order.id === orderId ? updater(order) : order));
    setStored(STORAGE_KEYS.orders, orders);
    return orders.find((order) => order.id === orderId);
  }

  function saveSelection(selection) {
    setStored(STORAGE_KEYS.currentSelection, selection);
  }

  function getSelection() {
    return getStored(STORAGE_KEYS.currentSelection, null);
  }

  function lastOrder() {
    const id = getStored(STORAGE_KEYS.lastOrder, null);
    return allOrders().find((order) => order.id === id) || allOrders()[0] || null;
  }

  function statusBadge(status) {
    const map = {
      approved: "success",
      pending: "warning",
      rejected: "danger",
      paid: "success",
      valid: "success",
      used: "secondary"
    };
    return `<span class="badge text-bg-${map[status] || "secondary"} text-capitalize">${status}</span>`;
  }

  function eventCard(event) {
    const starting = Math.min(...event.tickets.map((ticket) => Number(ticket.price)));
    return `
      <div class="col">
        <article class="card event-card h-100 overflow-hidden">
          <img src="${event.image}" class="card-img-top" alt="${event.title}">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between gap-2 mb-2">
              <span class="badge text-bg-light text-brand">${event.category}</span>
              ${statusBadge(event.status)}
            </div>
            <h3 class="h5">${event.title}</h3>
            <p class="text-muted small mb-2">${event.location}</p>
            <p class="text-muted small mb-3">${dateLabel(event.date)} at ${event.startTime}</p>
            <div class="mt-auto d-flex align-items-center justify-content-between gap-3">
              <strong>From ${money(starting)}</strong>
              <a class="btn btn-sm btn-brand" href="event-details.html?id=${event.id}">View Details</a>
            </div>
          </div>
        </article>
      </div>`;
  }

  function renderNav() {
    const slot = document.querySelector("[data-nav]");
    if (!slot) return;
    slot.innerHTML = `
      <nav class="navbar navbar-expand-lg bg-white sticky-top">
        <div class="container">
          <a class="navbar-brand d-flex align-items-center gap-2 fw-bold text-brand" href="index.html">
            <span class="brand-mark"><img src="/assets/img/abonten-mark.jpeg" alt="" /></span><span>Abonten Tickets</span>
          </a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div id="mainNav" class="collapse navbar-collapse">
            <ul class="navbar-nav ms-auto align-items-lg-center gap-lg-2">
              <li class="nav-item"><a class="nav-link" href="events.html">Events</a></li>
              <li class="nav-item"><a class="nav-link" href="organizer-dashboard.html">Organizer</a></li>
              <li class="nav-item"><a class="nav-link" href="admin-dashboard.html">Admin</a></li>
              <li class="nav-item"><a class="btn btn-outline-success btn-sm" href="login.html">Login</a></li>
              <li class="nav-item"><a class="btn btn-brand btn-sm" href="organizer-register.html">Sell Tickets</a></li>
            </ul>
          </div>
        </div>
      </nav>`;
  }

  function renderFooter() {
    const slot = document.querySelector("[data-footer]");
    if (!slot) return;
    slot.innerHTML = `
      <footer class="py-4 mt-5">
        <div class="container d-flex flex-column flex-md-row justify-content-between gap-2">
          <span class="fw-bold">Abonten Tickets</span>
          <span class="small">Mock frontend MVP for Ghana-focused event ticketing.</span>
        </div>
      </footer>`;
  }

  function getQuery(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  ensureSeedData();
  renderNav();
  renderFooter();

  window.AbontenTickets = {
    STORAGE_KEYS,
    getStored,
    setStored,
    ensureSeedData,
    money,
    serviceFee,
    totalFor,
    ticketCode,
    dateLabel,
    eventById,
    allOrders,
    saveOrder,
    updateOrder,
    saveSelection,
    getSelection,
    lastOrder,
    statusBadge,
    eventCard,
    getQuery
  };
})();
