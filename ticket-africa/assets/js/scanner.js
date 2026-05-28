(function () {
  const TA = window.TicketAfrica;
  let activeOrder = null;

  function renderResult(message, type) {
    const slot = document.querySelector("[data-scan-result]");
    slot.className = `status-box p-3 alert alert-${type}`;
    slot.innerHTML = message;
  }

  function initScanner() {
    const form = document.querySelector("#scanForm");
    const markUsed = document.querySelector("#markUsedBtn");
    if (!form || !markUsed) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const code = document.querySelector("#ticketCodeInput").value.trim().toUpperCase();
      activeOrder = TA.allOrders().find((order) => order.ticketCode.toUpperCase() === code);
      markUsed.classList.add("d-none");

      if (!activeOrder) {
        renderResult("<strong>Invalid ticket.</strong> No matching Ticket Africa code was found.", "danger");
        return;
      }
      if (activeOrder.ticketStatus === "used") {
        renderResult(`<strong>Already used.</strong><br>${activeOrder.buyerName} checked in for ${activeOrder.eventTitle}.`, "warning");
        return;
      }
      renderResult(`<strong>Valid ticket.</strong><br>${activeOrder.buyerName} - ${activeOrder.eventTitle} - ${activeOrder.ticketType}`, "success");
      markUsed.classList.remove("d-none");
    });

    markUsed.addEventListener("click", () => {
      if (!activeOrder) return;
      activeOrder = TA.updateOrder(activeOrder.id, (order) => ({ ...order, ticketStatus: "used" }));
      renderResult(`<strong>Marked as used.</strong><br>${activeOrder.ticketCode} has been checked in.`, "secondary");
      markUsed.classList.add("d-none");
    });
  }

  initScanner();
})();
