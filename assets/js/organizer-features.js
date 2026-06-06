/**
 * organizer-features.js
 * Powers all organizer dashboard feature sections:
 * Orders, Attendees, Analytics, Payouts, Promo Codes,
 * Attendee Messages, Staff Management
 */

/* ── Shared state ─────────────────────────────────────── */
let _orgId = null;
let _allOrders = [];
let _allEvents = [];

window.__setOrgId = function (id) { _orgId = id; if (id) _pendingOrgResolvers.forEach(r => r()); _pendingOrgResolvers = []; };
window.__setEvents = function (evs) {
    _allEvents = evs || [];
    populateEventSelectors();
};

// Wait up to 10s for _orgId to be set, then resolve
let _pendingOrgResolvers = [];
function waitForOrgId() {
    if (_orgId) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Org not loaded')), 10000);
        _pendingOrgResolvers.push(() => { clearTimeout(timer); resolve(); });
    });
}

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function escAttr(value) {
    return esc(value).replace(/`/g, '&#96;');
}

function populateEventSelectors() {
    const selectors = [
        'orders-event-filter', 'attendees-event-filter',
        'msg-event', 'sf-event'
    ];
    selectors.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        // Keep first option, replace rest
        while (el.options.length > 1) el.remove(1);
        _allEvents.forEach(ev => {
            const opt = document.createElement('option');
            opt.value = ev._id;
            opt.textContent = ev.title;
            el.appendChild(opt);
        });
        el.value = current;
    });
}

/* ── Helper: format currency ──────────────────────────── */
function fmtCurrency(amount, currency = 'GHS') {
    return currency + ' ' + (amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusChip(status, map) {
    const cfg = map[status] || { label: status, color: 'var(--color-text-secondary)', bg: 'var(--color-bg-elevated)' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${cfg.bg};color:${cfg.color};">${esc(cfg.label)}</span>`;
}

const ORDER_STATUS = {
    paid: { label: 'Paid', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    refunded: { label: 'Refunded', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    failed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};
const PAYOUT_STATUS = {
    pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    processing: { label: 'Processing', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
    completed: { label: 'Completed', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    failed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};
const STAFF_STATUS = {
    pending: { label: 'Invited', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    active: { label: 'Active', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    revoked: { label: 'Revoked', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

function emptyState(icon, title, desc) {
    return `<div class="empty-state">
        <div class="empty-state__icon"><iconify-icon icon="${escAttr(icon)}"></iconify-icon></div>
        <div class="empty-state__title">${esc(title)}</div>
        ${desc ? `<div class="empty-state__desc">${esc(desc)}</div>` : ''}
    </div>`;
}

function renderTable(cols, rows) {
    if (!rows.length) return '';
    const head = cols.map(c => `<th>${esc(c)}</th>`).join('');
    return `<div class="table-shell">
        <table class="events-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows.join('')}</tbody>
        </table>
    </div>`;
}

/* ── ORDERS ───────────────────────────────────────────── */
async function loadOrders() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    const container = document.getElementById('orders-container');
    try {
        const orders = await window.ConvexDB.listOrdersByOrg(_orgId);
        _allOrders = orders || [];
        renderOrders(_allOrders);
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:package-delivered', 'No orders yet', 'Orders will appear here once attendees purchase tickets.');
    }
}

function renderOrders(orders) {
    const container = document.getElementById('orders-container');
    if (!orders.length) {
        container.innerHTML = emptyState('hugeicons:package-delivered', 'No orders yet', 'Orders will appear here once attendees purchase tickets.');
        return;
    }
    const rows = orders.map(o => `<tr>
        <td><div class="td-title">${esc(o.buyer_name)}</div><div class="td-meta">${esc(o.buyer_email)}</div></td>
        <td class="td-meta">${esc(o.event_title || '-')}</td>
        <td>${o.items ? o.items.map(i => `${esc(i.quantity)}x ${esc(i.tier_name)}`).join('<br>') : '-'}</td>
        <td class="td-value">${fmtCurrency(o.total_amount, o.currency)}</td>
        <td>${statusChip(o.status, ORDER_STATUS)}</td>
        <td class="td-meta">${fmtDate(o.created_at)}</td>
    </tr>`);
    container.innerHTML = renderTable(['Buyer', 'Event', 'Tickets', 'Amount', 'Status', 'Date'], rows);
}

function filterOrders() {
    const q = (document.getElementById('orders-search')?.value || '').toLowerCase();
    const filtered = _allOrders.filter(o =>
        o.buyer_name.toLowerCase().includes(q) || o.buyer_email.toLowerCase().includes(q)
    );
    renderOrders(filtered);
}

window.loadOrders = loadOrders;
window.filterOrders = filterOrders;

/* ── ATTENDEES ────────────────────────────────────────── */
async function loadAttendees() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    const container = document.getElementById('attendees-container');
    const eventId = document.getElementById('attendees-event-filter')?.value || null;
    try {
        let orders;
        if (eventId) {
            orders = await window.ConvexDB.listOrdersByEvent(eventId);
        } else {
            orders = await window.ConvexDB.listOrdersByOrg(_orgId);
        }
        orders = orders || [];
        _attendeeData = orders;
        renderAttendees(orders);
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:user-multiple-02', 'No attendees yet', 'Ticket buyers will appear here.');
    }
}

let _attendeeData = [];
function renderAttendees(orders) {
    const container = document.getElementById('attendees-container');
    if (!orders.length) {
        container.innerHTML = emptyState('hugeicons:user-multiple-02', 'No attendees yet', 'Ticket buyers will appear here.');
        return;
    }
    const rows = orders.map(o => `<tr>
        <td>
            <div class="td-title">${esc(o.buyer_name)}</div>
            <div class="td-meta">${esc(o.buyer_email)}</div>
        </td>
        <td class="td-meta">${esc(o.event_title || '-')}</td>
        <td>${o.items ? o.items.map(i => `<div class="td-meta">${esc(i.quantity)}x <strong>${esc(i.tier_name)}</strong></div>`).join('') : '-'}</td>
        <td class="td-meta">${esc(o.buyer_phone || '-')}</td>
        <td>${statusChip(o.status, ORDER_STATUS)}</td>
        <td class="td-meta">${fmtDate(o.created_at)}</td>
    </tr>`);
    container.innerHTML = renderTable(['Name', 'Event', 'Tickets', 'Phone', 'Status', 'Date'], rows);
}

function filterAttendees() {
    const q = (document.getElementById('attendees-search')?.value || '').toLowerCase();
    const filtered = _attendeeData.filter(o =>
        o.buyer_name.toLowerCase().includes(q) ||
        o.buyer_email.toLowerCase().includes(q) ||
        (o.buyer_phone || '').includes(q)
    );
    renderAttendees(filtered);
}

window.loadAttendees = loadAttendees;
window.filterAttendees = filterAttendees;

/* ── ANALYTICS ────────────────────────────────────────── */
async function loadAnalytics() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    try {
        const data = await window.ConvexDB.getOrgAnalytics(_orgId);
        document.getElementById('a-revenue').textContent = fmtCurrency(data.totalRevenue);
        document.getElementById('a-tickets').textContent = data.totalTickets.toLocaleString();
        document.getElementById('a-orders').textContent = data.totalOrders.toLocaleString();
        document.getElementById('a-events').textContent = data.activeEvents;

        // Draw bar chart with Canvas
        drawRevenueChart(data.dailyRevenue);

        // Revenue by event list
        const list = document.getElementById('event-revenue-list');
        if (data.revenueByEvent.length) {
            const maxRev = Math.max(...data.revenueByEvent.map(e => e.revenue), 1);
            list.innerHTML = data.revenueByEvent.map(ev => {
                const pct = Math.round((ev.revenue / maxRev) * 100);
                return `<div style="padding:12px 20px;border-bottom:1px solid var(--color-border);">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:13px;font-weight:600;color:var(--color-text-primary);">${esc(ev.title)}</span>
                        <span style="font-size:13px;font-weight:700;color:#8b5cf6;">${fmtCurrency(ev.revenue)}</span>
                    </div>
                    <div style="height:4px;background:var(--color-bg-elevated);border-radius:2px;">
                        <div style="height:4px;border-radius:2px;background:linear-gradient(90deg,#8b5cf6,#ec4899);width:${pct}%;"></div>
                    </div>
                    <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">${ev.orders} orders</div>
                </div>`;
            }).join('');
        } else {
            list.innerHTML = emptyState('hugeicons:chart-increase', 'No revenue data yet', 'Start selling tickets to see analytics.');
        }
    } catch (e) { console.error('Analytics error', e); }
}

function drawRevenueChart(dailyData) {
    const canvas = document.getElementById('revenue-chart');
    if (!canvas) return;
    canvas.width = canvas.offsetWidth || 500;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const maxRev = Math.max(...dailyData.map(d => d.revenue), 1);
    const pad = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const barW = Math.floor(chartW / dailyData.length * 0.6);
    const barGap = Math.floor(chartW / dailyData.length);

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.strokeStyle = isLight ? 'rgba(25,25,25,0.1)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (i / 4) * chartH;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        const val = (maxRev * i / 4 / 100).toFixed(0);
        ctx.fillStyle = isLight ? 'rgba(25,25,25,0.5)' : 'rgba(255,255,255,0.3)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('GHS' + val, pad.left - 6, y + 4);
    }

    // Bars
    dailyData.forEach((d, i) => {
        const x = pad.left + i * barGap + (barGap - barW) / 2;
        const barH = d.revenue > 0 ? Math.max(4, (d.revenue / maxRev) * chartH) : 0;
        const y = pad.top + chartH - barH;

        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, '#8b5cf6');
        grad.addColorStop(1, 'rgba(139,92,246,0.3)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
        ctx.fill();

        // Label
        const label = d.date.slice(5); // MM-DD
        ctx.fillStyle = isLight ? 'rgba(25,25,25,0.55)' : 'rgba(255,255,255,0.4)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + barW / 2, H - 8);
    });
}

window.loadAnalytics = loadAnalytics;

/* ── PAYOUTS ──────────────────────────────────────────── */
async function loadPayouts() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    const container = document.getElementById('payouts-container');
    try {
        const [payouts, balance, ledger] = await Promise.all([
            window.ConvexDB.listPayoutsByOrg(_orgId),
            window.ConvexDB.getPayoutBalance ? window.ConvexDB.getPayoutBalance(_orgId) : Promise.resolve(null),
            window.ConvexDB.listLedgerByOrg ? window.ConvexDB.listLedgerByOrg(_orgId, 12) : Promise.resolve([]),
        ]);
        const payoutBalanceEl = document.getElementById('payout-balance');
        if (payoutBalanceEl && balance) {
            payoutBalanceEl.textContent = fmtCurrency(balance.available, balance.currency || 'GHS');
        }
        const amountInput = document.getElementById('po-amount');
        if (amountInput && balance) {
            amountInput.max = String(balance.available);
            amountInput.placeholder = `Available: ${balance.available} minor units`;
        }
        const ledgerRows = (ledger || []).map(entry => `<tr>
            <td class="td-meta">${esc(entry.type.replace(/_/g, ' '))}</td>
            <td>${entry.direction === 'credit' ? '+' : '-'}${fmtCurrency(entry.amount, entry.currency)}</td>
            <td class="td-meta">${esc(entry.account)}</td>
            <td class="td-meta">${fmtDate(entry.created_at)}</td>
        </tr>`);
        const ledgerHtml = ledgerRows.length
            ? `<div class="panel__body"><div class="dash-label" style="margin-bottom:10px;">Settlement Ledger</div>${renderTable(['Entry', 'Amount', 'Account', 'Date'], ledgerRows)}</div>`
            : '';
        if (!payouts || !payouts.length) {
            container.innerHTML = ledgerHtml + emptyState('hugeicons:money-send-02', 'No payouts yet', 'Submit a payout request to receive your earnings.');
            return;
        }
        const rows = payouts.map(p => `<tr>
            <td class="td-value">${fmtCurrency(p.amount, p.currency)}</td>
            <td class="td-meta">${p.payout_fee ? fmtCurrency(p.payout_fee, p.currency) : 'No fee'}</td>
            <td class="td-meta">${esc(p.method === 'momo' ? 'Mobile Money' : p.method === 'bank' ? 'Bank Transfer' : 'USSD')}</td>
            <td class="td-meta">${esc(p.account_details.provider || '')} - ${esc(p.account_details.number)}<br>${esc(p.account_details.name)}</td>
            <td>${statusChip(p.status, PAYOUT_STATUS)}</td>
            <td class="td-meta">${esc(p.reference || '-')}</td>
            <td class="td-meta">${fmtDate(p.requested_at)}</td>
            <td>${p.status === 'pending' ? `<button class="dash-mini-button" onclick="processPayout('${escAttr(p._id)}')">Send</button>` : ''}</td>
        </tr>`);
        container.innerHTML = ledgerHtml + renderTable(['Net Amount', 'Fee', 'Method', 'Account', 'Status', 'Reference', 'Requested', 'Action'], rows);
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:money-send-02', 'Could not load payouts', '');
    }
}

async function submitPayoutRequest() {
    if (!window.ConvexDB || !_orgId) return window.TA?.toast('Not connected.', 'error');
    const amount = parseInt(document.getElementById('po-amount')?.value || '0');
    const number = document.getElementById('po-number')?.value?.trim();
    const name = document.getElementById('po-name')?.value?.trim();
    if (!amount || amount < 100) return window.TA?.toast('Enter a valid amount in minor units (min 100).', 'error');
    if (!number || !name) return window.TA?.toast('Account number and name are required.', 'error');
    try {
        await window.ConvexDB.requestPayout({
            org_id: _orgId,
            amount,
            currency: 'GHS',
            method: document.getElementById('po-method').value,
            account_details: {
                provider: document.getElementById('po-provider').value,
                number,
                name,
            },
        });
        window.TA?.toast('Payout request submitted! We\'ll process it within 2 business days.', 'success');
        document.getElementById('payout-form-wrap').style.display = 'none';
        loadPayouts();
    } catch (e) {
        window.TA?.toast('Failed: ' + (e.message || 'Unknown error'), 'error');
    }
}

async function processPayout(payoutId) {
    if (!window.ConvexDB?.processMoolrePayout) return window.TA?.toast('Payout processor is not connected.', 'error');
    try {
        const result = await window.ConvexDB.processMoolrePayout(payoutId);
        window.TA?.toast(result?.message || 'Payout sent through Moolre.', 'success');
        loadPayouts();
    } catch (e) {
        window.TA?.toast('Payout failed: ' + (e.message || 'Unknown error'), 'error');
        loadPayouts();
    }
}

window.loadPayouts = loadPayouts;
window.submitPayoutRequest = submitPayoutRequest;
window.processPayout = processPayout;

/* ── PROMO CODES ──────────────────────────────────────── */
function togglePromoForm() {
    const w = document.getElementById('promo-form-wrap');
    const isShowing = w.style.display === 'none';
    w.style.display = isShowing ? 'block' : 'none';
    
    if (isShowing && typeof window.getNowMin === 'function') {
        const expiresIn = document.getElementById('pc-expires');
        if (expiresIn) expiresIn.min = window.getNowMin();
    }
}

async function loadPromos() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    const container = document.getElementById('promos-container');
    try {
        const promos = await window.ConvexDB.listPromosByOrg(_orgId);
        if (!promos || !promos.length) {
            container.innerHTML = emptyState('hugeicons:discount-tag-01', 'No promo codes yet', 'Create a discount code to boost ticket sales.');
            return;
        }
        const rows = promos.map(p => `<tr>
            <td><span class="code-chip">${esc(p.code)}</span></td>
            <td>${p.discount_type === 'percent' ? p.discount_value + '%' : fmtCurrency(p.discount_value)} off</td>
            <td class="td-meta">${esc(p.event_title || 'All Events')}</td>
            <td>${p.uses}${p.max_uses ? ' / ' + p.max_uses : ' / unlimited'}</td>
            <td>${p.expires_at ? fmtDate(p.expires_at) : 'Never'}</td>
            <td>${statusChip(p.active ? 'active' : 'off', { active: { label: 'Active', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }, off: { label: 'Off', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' } })}</td>
            <td>
                <div class="inline-actions">
                    ${p.active ? `<button onclick="deactivatePromo('${escAttr(p._id)}')" class="dash-mini-button dash-mini-button--warn">Deactivate</button>` : ''}
                    <button onclick="deletePromo('${escAttr(p._id)}')" class="dash-mini-button dash-mini-button--danger">Delete</button>
                </div>
            </td>
        </tr>`);
        container.innerHTML = renderTable(['Code', 'Discount', 'Event', 'Uses', 'Expires', 'Status', ''], rows);
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:discount-tag-01', 'Could not load promo codes', '');
    }
}

async function submitPromoCode() {
    if (!window.ConvexDB || !_orgId) return window.TA?.toast('Not connected.', 'error');
    const code = document.getElementById('pc-code')?.value?.trim().toUpperCase();
    const value = parseFloat(document.getElementById('pc-value')?.value || '0');
    if (!code) return window.TA?.toast('Enter a promo code.', 'error');
    if (!value || value <= 0) return window.TA?.toast('Enter a valid discount value.', 'error');
    const maxUsesRaw = document.getElementById('pc-max')?.value;
    const expiresRaw = document.getElementById('pc-expires')?.value;
    try {
        await window.ConvexDB.createPromoCode({
            org_id: _orgId,
            code,
            discount_type: document.getElementById('pc-type').value,
            discount_value: value,
            description: document.getElementById('pc-desc')?.value?.trim() || undefined,
            max_uses: maxUsesRaw ? parseInt(maxUsesRaw) : undefined,
            expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : undefined,
        });
        window.TA?.toast(`Code "${code}" created!`, 'success');
        document.getElementById('promo-form-wrap').style.display = 'none';
        document.getElementById('pc-code').value = '';
        document.getElementById('pc-value').value = '';
        loadPromos();
    } catch (e) {
        window.TA?.toast('Failed: ' + (e.message || 'Unknown error'), 'error');
    }
}

async function deactivatePromo(id) {
    await window.ConvexDB.deactivatePromoCode(id);
    window.TA?.toast('Promo code deactivated.', 'info');
    loadPromos();
}

async function deletePromo(id) {
    if (!confirm('Delete this promo code permanently?')) return;
    await window.ConvexDB.deletePromoCode(id);
    window.TA?.toast('Promo code deleted.', 'info');
    loadPromos();
}

window.togglePromoForm = togglePromoForm;
window.loadPromos = loadPromos;
window.submitPromoCode = submitPromoCode;
window.deactivatePromo = deactivatePromo;
window.deletePromo = deletePromo;

/* ── ATTENDEE MESSAGES ────────────────────────────────── */
async function loadMessages() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    const container = document.getElementById('messages-container');
    try {
        const msgs = await window.ConvexDB.listMessagesByOrg(_orgId);
        if (!msgs || !msgs.length) {
            container.innerHTML = emptyState('hugeicons:notification-03', 'No messages sent yet', 'Send your first message to attendees.');
            return;
        }
        container.innerHTML = msgs.map(m => `<div class="message-card">
            <div class="message-card__head">
                <div class="message-card__subject">${esc(m.subject)}</div>
                ${statusChip(m.channel, { email: { label: 'Email', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' }, sms: { label: 'SMS', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }, both: { label: 'Email + SMS', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' } })}
            </div>
            <div class="message-card__body">${esc(m.body.substring(0, 140))}${m.body.length > 140 ? '...' : ''}</div>
            <div class="message-card__meta">Sent to <strong>${esc(m.sent_to)}</strong> attendees - ${fmtDate(m.sent_at)} - ${esc(m.event_title || 'All Events')}</div>
        </div>`).join('');
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:notification-03', 'Could not load messages', '');
    }
}

async function sendMessage() {
    if (!window.ConvexDB || !_orgId) return window.TA?.toast('Not connected.', 'error');
    const subject = document.getElementById('msg-subject')?.value?.trim();
    const body = document.getElementById('msg-body')?.value?.trim();
    const channel = document.getElementById('msg-channel').value;
    const eventId = document.getElementById('msg-event')?.value || undefined;
    if (!subject) return window.TA?.toast('Enter a subject.', 'error');
    if (!body) return window.TA?.toast('Enter message body.', 'error');

    // Disable the button while sending
    const sendBtn = document.querySelector('[onclick="sendMessage()"]');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending...'; }

    // Collect recipients from orders
    let orders = [];
    try {
        orders = eventId
            ? await window.ConvexDB.listOrdersByEvent(eventId)
            : await window.ConvexDB.listOrdersByOrg(_orgId);
        orders = (orders || []).filter(o => o.status === 'paid');
    } catch { }

    const sentTo = orders.length;
    try {
        const messageResult = await window.ConvexDB.sendAttendeeMessage({
            org_id: _orgId,
            event_id: eventId || undefined,
            subject,
            body,
            channel,
            sent_to: sentTo,
        });

        if ((channel === 'email' || channel === 'both') && sentTo > 0) {
            try {
                const delivery = await window.ConvexDB.deliverQueuedMessages(Math.max(sentTo, 25));
                window.TA?.toast(`Message queued to ${messageResult.sent_to || sentTo} attendees. Brevo sent ${delivery.sent}/${delivery.processed}.`, delivery.failed ? 'warning' : 'success');
            } catch (deliveryErr) {
                console.warn('[TA] Brevo delivery error:', deliveryErr);
                window.TA?.toast(`Message queued to ${messageResult.sent_to || sentTo} attendees. Configure Brevo to send emails.`, 'warning');
            }
        } else if (channel === 'sms') {
            window.TA?.toast(`Message logged to ${messageResult.sent_to || sentTo} attendees. SMS provider is not configured yet.`, 'warning');
        } else {
            window.TA?.toast(`Message logged to ${messageResult.sent_to || sentTo} attendees.`, 'success');
        }

        document.getElementById('msg-subject').value = '';
        document.getElementById('msg-body').value = '';
        loadMessages();
    } catch (e) {
        window.TA?.toast('Failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send Message'; }
    }
}

window.loadMessages = loadMessages;
window.sendMessage = sendMessage;

/* ── STAFF ────────────────────────────────────────────── */
function toggleStaffForm() {
    const w = document.getElementById('staff-form-wrap');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
}

const ROLE_LABELS = { scanner: 'QR Scanner', co_organizer: 'Co-Organizer', support: 'Support' };

async function loadStaff() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    const container = document.getElementById('staff-container');
    try {
        const staff = await window.ConvexDB.listStaffByOrg(_orgId);
        if (!staff || !staff.length) {
            container.innerHTML = emptyState('hugeicons:user-shield-01', 'No team members yet', 'Invite scanners, co-hosts, and support staff to help manage your events.');
            return;
        }
        const rows = staff.map(s => `<tr>
            <td><div class="td-title">${esc(s.name)}</div><div class="td-meta">${esc(s.invited_email)}</div></td>
            <td>${esc(ROLE_LABELS[s.role] || s.role)}</td>
            <td class="td-meta">${esc(s.event_title || 'All Events')}</td>
            <td>${statusChip(s.status, STAFF_STATUS)}</td>
            <td class="td-meta">${fmtDate(s.invited_at)}</td>
            <td>
                <div class="inline-actions">
                    ${s.status !== 'revoked' ? `<button onclick="revokeStaffMember('${escAttr(s._id)}')" class="dash-mini-button dash-mini-button--warn">Revoke</button>` : ''}
                    <button onclick="removeStaffMember('${escAttr(s._id)}')" class="dash-mini-button dash-mini-button--danger">Remove</button>
                </div>
            </td>
        </tr>`);
        container.innerHTML = renderTable(['Member', 'Role', 'Event', 'Status', 'Invited', ''], rows);
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:user-shield-01', 'Could not load staff', '');
    }
}

async function submitStaffInvite() {
    if (!window.ConvexDB || !_orgId) return window.TA?.toast('Not connected.', 'error');
    const name = document.getElementById('sf-name')?.value?.trim();
    const email = document.getElementById('sf-email')?.value?.trim();
    if (!name || !email) return window.TA?.toast('Name and email are required.', 'error');
    const eventIdRaw = document.getElementById('sf-event')?.value;
    try {
        await window.ConvexDB.inviteStaff({
            org_id: _orgId,
            invited_email: email,
            name,
            role: document.getElementById('sf-role').value,
            event_id: eventIdRaw || undefined,
        });
        window.TA?.toast(`Invite sent to ${email}!`, 'success');
        document.getElementById('staff-form-wrap').style.display = 'none';
        document.getElementById('sf-name').value = '';
        document.getElementById('sf-email').value = '';
        loadStaff();
    } catch (e) {
        window.TA?.toast('Failed: ' + (e.message || 'Unknown error'), 'error');
    }
}

async function revokeStaffMember(id) {
    if (!confirm('Revoke access for this team member?')) return;
    await window.ConvexDB.revokeStaff(id);
    window.TA?.toast('Access revoked.', 'info');
    loadStaff();
}

async function removeStaffMember(id) {
    if (!confirm('Remove this team member permanently?')) return;
    await window.ConvexDB.removeStaff(id);
    window.TA?.toast('Team member removed.', 'info');
    loadStaff();
}

window.toggleStaffForm = toggleStaffForm;
window.loadStaff = loadStaff;
window.submitStaffInvite = submitStaffInvite;
window.revokeStaffMember = revokeStaffMember;
window.removeStaffMember = removeStaffMember;

/* ── VOTING & POLLS ──────────────────────────────────── */
function togglePollForm() {
    const w = document.getElementById('poll-form-wrap');
    const isShowing = w.style.display === 'none';
    w.style.display = isShowing ? 'block' : 'none';

    if (isShowing && typeof window.getNowMin === 'function') {
        const nowMin = window.getNowMin();
        const pollStart = document.getElementById('poll-start');
        const pollEnd = document.getElementById('poll-end');
        if (pollStart) pollStart.min = nowMin;
        if (pollEnd) pollEnd.min = nowMin;
    }
}

function addPollOptionRow() {
    const container = document.getElementById('poll-options-list');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-option-input dash-input';
    input.placeholder = `Option ${container.children.length + 1}`;
    container.appendChild(input);
}

const POLL_STATUS = {
    draft: { label: 'Draft', color: 'var(--color-text-secondary)', bg: 'var(--color-bg-elevated)' },
    active: { label: 'Active', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    completed: { label: 'Completed', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
};

async function loadPolls() {
    try { await waitForOrgId(); } catch { return; }
    if (!window.ConvexDB) return;
    const container = document.getElementById('polls-container');
    try {
        const polls = await window.ConvexDB.listPollsByOrg(_orgId);
        if (!polls || !polls.length) {
            container.innerHTML = emptyState('hugeicons:square-lock-02', 'No polls yet', 'Create a poll to engage your audience.');
            return;
        }
        const rows = polls.map(p => `<tr>
            <td><div class="td-title">${esc(p.title)}</div><div class="td-meta">${esc(p.description.substring(0, 64))}${p.description.length > 64 ? '...' : ''}</div></td>
            <td>${statusChip(p.status, POLL_STATUS)}</td>
            <td class="td-meta">${fmtDate(p.start_date)} - ${fmtDate(p.end_date)}</td>
            <td>
                <div class="inline-actions">
                    ${p.status === 'draft' ? `<button onclick="setPollStatus('${escAttr(p._id)}', 'active')" class="dash-mini-button dash-mini-button--success">Activate</button>` : ''}
                    ${p.status === 'active' ? `<button onclick="setPollStatus('${escAttr(p._id)}', 'completed')" class="dash-mini-button">Complete</button>` : ''}
                    <button onclick="handleDeletePoll('${escAttr(p._id)}')" class="dash-mini-button dash-mini-button--danger">Delete</button>
                </div>
            </td>
        </tr>`);
        container.innerHTML = renderTable(['Poll', 'Status', 'Duration', 'Actions'], rows);
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:square-lock-02', 'Could not load polls', '');
    }
}

async function submitPoll() {
    if (!window.ConvexDB || !_orgId) return window.TA?.toast('Not connected.', 'error');
    const title = document.getElementById('poll-title')?.value?.trim();
    const desc = document.getElementById('poll-desc')?.value?.trim();
    const start = document.getElementById('poll-start')?.value;
    const end = document.getElementById('poll-end')?.value;
    const optionEls = document.querySelectorAll('.poll-option-input');
    const options = Array.from(optionEls).map(el => el.value.trim()).filter(v => v);

    if (!title || !desc || !start || !end) return window.TA?.toast('All fields are required.', 'error');
    if (options.length < 2) return window.TA?.toast('At least 2 options are required.', 'error');

    try {
        await window.ConvexDB.createPoll({
            org_id: _orgId,
            title,
            description: desc,
            start_date: new Date(start).toISOString(),
            end_date: new Date(end).toISOString(),
            options,
        });
        window.TA?.toast('Poll created as draft!', 'success');
        document.getElementById('poll-form-wrap').style.display = 'none';
        document.getElementById('poll-title').value = '';
        document.getElementById('poll-desc').value = '';
        loadPolls();
    } catch (e) {
        window.TA?.toast('Failed: ' + (e.message || 'Unknown error'), 'error');
    }
}

async function setPollStatus(id, status) {
    await window.ConvexDB.updatePollStatus({ poll_id: id, status });
    window.TA?.toast(`Poll marked as ${status}.`, 'info');
    loadPolls();
}

async function handleDeletePoll(id) {
    if (!confirm('Delete this poll and all its votes?')) return;
    await window.ConvexDB.deletePoll({ poll_id: id });
    window.TA?.toast('Poll deleted.', 'info');
    loadPolls();
}

window.togglePollForm = togglePollForm;
window.addPollOptionRow = addPollOptionRow;
window.loadPolls = loadPolls;
window.submitPoll = submitPoll;
window.setPollStatus = setPollStatus;
window.handleDeletePoll = handleDeletePoll;

/* ── Section-switch hook: lazy-load data ─────────────── */
const _sectionLoaders = {
    orders: loadOrders,
    attendees: loadAttendees,
    analytics: loadAnalytics,
    payouts: loadPayouts,
    promos: loadPromos,
    updates: loadMessages,
    voting: loadPolls,
    staff: loadStaff,
};

// Patch showSection - lazy-capture the original so it works regardless
// of script load order (organizer-features.js loads before the inline script
// that defines showSection, so we must not capture it at module parse time).
let _origShowSection = null;
window.showSection = function (name, linkEl) {
    // Lazy-grab the real showSection if it was defined after us
    if (!_origShowSection && window._showSectionBase) {
        _origShowSection = window._showSectionBase;
    }
    if (_origShowSection) _origShowSection(name, linkEl);
    if (_sectionLoaders[name]) _sectionLoaders[name]();
};
