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
function fmtCurrency(amount, currency = 'GH₵') {
    return currency + ' ' + (amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusChip(status, map) {
    const cfg = map[status] || { label: status, color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)' };
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${cfg.bg};color:${cfg.color};">${cfg.label}</span>`;
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
        <div class="empty-state__icon"><iconify-icon icon="${icon}"></iconify-icon></div>
        <div class="empty-state__title">${title}</div>
        ${desc ? `<div class="empty-state__desc">${desc}</div>` : ''}
    </div>`;
}

function renderTable(cols, rows) {
    if (!rows.length) return '';
    const head = cols.map(c => `<th>${c}</th>`).join('');
    return `<div style="overflow-x:auto;">
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
        <td><div style="font-weight:600;font-size:13px;">${o.buyer_name}</div><div style="font-size:12px;color:rgba(255,255,255,0.4);">${o.buyer_email}</div></td>
        <td style="font-size:12px;color:rgba(255,255,255,0.5);">${o.event_title || '—'}</td>
        <td>${o.items ? o.items.map(i => `${i.quantity}× ${i.tier_name}`).join('<br>') : '—'}</td>
        <td class="td-value">${fmtCurrency(o.total_amount, o.currency)}</td>
        <td>${statusChip(o.status, ORDER_STATUS)}</td>
        <td style="font-size:12px;color:rgba(255,255,255,0.4);">${fmtDate(o.created_at)}</td>
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
            <div style="font-weight:600;font-size:13px;">${o.buyer_name}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.4);">${o.buyer_email}</div>
        </td>
        <td style="font-size:12px;color:rgba(255,255,255,0.5);">${o.event_title || '—'}</td>
        <td>${o.items ? o.items.map(i => `<div style="font-size:12px;">${i.quantity}× <strong>${i.tier_name}</strong></div>`).join('') : '—'}</td>
        <td style="font-size:12px;color:rgba(255,255,255,0.4);">${o.buyer_phone || '—'}</td>
        <td>${statusChip(o.status, ORDER_STATUS)}</td>
        <td style="font-size:12px;color:rgba(255,255,255,0.4);">${fmtDate(o.created_at)}</td>
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
                return `<div style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:13px;font-weight:600;">${ev.title}</span>
                        <span style="font-size:13px;font-weight:700;color:#8b5cf6;">${fmtCurrency(ev.revenue)}</span>
                    </div>
                    <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;">
                        <div style="height:4px;border-radius:2px;background:linear-gradient(90deg,#8b5cf6,#ec4899);width:${pct}%;"></div>
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">${ev.orders} orders</div>
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
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (i / 4) * chartH;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        const val = (maxRev * i / 4 / 100).toFixed(0);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('GH₵' + val, pad.left - 6, y + 4);
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
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
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
        const payouts = await window.ConvexDB.listPayoutsByOrg(_orgId);
        if (!payouts || !payouts.length) {
            container.innerHTML = emptyState('hugeicons:money-send-02', 'No payouts yet', 'Submit a payout request to receive your earnings.');
            return;
        }
        const rows = payouts.map(p => `<tr>
            <td class="td-value">${fmtCurrency(p.amount, p.currency)}</td>
            <td style="font-size:12px;">${p.method === 'momo' ? 'Mobile Money' : p.method === 'bank' ? 'Bank Transfer' : 'USSD'}</td>
            <td style="font-size:12px;">${p.account_details.provider || ''} · ${p.account_details.number}<br><span style="color:rgba(255,255,255,0.4);">${p.account_details.name}</span></td>
            <td>${statusChip(p.status, PAYOUT_STATUS)}</td>
            <td style="font-size:12px;color:rgba(255,255,255,0.4);">${p.reference || '—'}</td>
            <td style="font-size:12px;color:rgba(255,255,255,0.4);">${fmtDate(p.requested_at)}</td>
        </tr>`);
        container.innerHTML = renderTable(['Amount', 'Method', 'Account', 'Status', 'Reference', 'Requested'], rows);
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:money-send-02', 'Could not load payouts', '');
    }
}

async function submitPayoutRequest() {
    if (!window.ConvexDB || !_orgId) return window.TA?.toast('Not connected.', 'error');
    const amount = parseInt(document.getElementById('po-amount')?.value || '0');
    const number = document.getElementById('po-number')?.value?.trim();
    const name = document.getElementById('po-name')?.value?.trim();
    if (!amount || amount < 100) return window.TA?.toast('Enter a valid amount (min 100).', 'error');
    if (!number || !name) return window.TA?.toast('Account number and name are required.', 'error');
    try {
        await window.ConvexDB.requestPayout({
            org_id: _orgId,
            amount,
            currency: 'GH₵',
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

window.loadPayouts = loadPayouts;
window.submitPayoutRequest = submitPayoutRequest;

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
            <td><span style="font-family:monospace;font-size:14px;font-weight:700;color:#8b5cf6;letter-spacing:0.08em;">${p.code}</span></td>
            <td style="font-size:13px;">${p.discount_type === 'percent' ? p.discount_value + '%' : fmtCurrency(p.discount_value)} off</td>
            <td style="font-size:12px;color:rgba(255,255,255,0.5);">${p.event_title}</td>
            <td style="font-size:13px;">${p.uses}${p.max_uses ? ' / ' + p.max_uses : ' / ∞'}</td>
            <td>${p.expires_at ? fmtDate(p.expires_at) : 'Never'}</td>
            <td>${p.active ? '<span style="color:#22c55e;font-size:11px;font-weight:700;">ACTIVE</span>' : '<span style="color:#ef4444;font-size:11px;font-weight:700;">OFF</span>'}</td>
            <td style="white-space:nowrap;">
                ${p.active ? `<button onclick="deactivatePromo('${p._id}')" style="font-size:11px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:4px 10px;color:#f59e0b;cursor:pointer;margin-right:4px;">Deactivate</button>` : ''}
                <button onclick="deletePromo('${p._id}')" style="font-size:11px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:4px 10px;color:#ef4444;cursor:pointer;">Delete</button>
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
        container.innerHTML = msgs.map(m => `<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                <div style="font-size:13px;font-weight:700;">${m.subject}</div>
                <span style="font-size:11px;background:rgba(139,92,246,0.12);color:#8b5cf6;padding:2px 8px;border-radius:12px;text-transform:uppercase;font-weight:700;">${m.channel}</span>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:8px;line-height:1.5;">${m.body.substring(0, 120)}${m.body.length > 120 ? '…' : ''}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.3);">Sent to <strong>${m.sent_to}</strong> attendees · ${fmtDate(m.sent_at)} · ${m.event_title}</div>
        </div>`).join('');
    } catch (e) {
        container.innerHTML = emptyState('hugeicons:notification-03', 'Could not load messages', '');
    }
}

async function sendMessage() {
    if (!window.ConvexDB || !_orgId) return window.TA?.toast('Not connected.', 'error');
    const subject = document.getElementById('msg-subject')?.value?.trim();
    const body = document.getElementById('msg-body')?.value?.trim();
    const eventId = document.getElementById('msg-event')?.value || undefined;
    if (!subject) return window.TA?.toast('Enter a subject.', 'error');
    if (!body) return window.TA?.toast('Enter message body.', 'error');

    // Count recipients from orders
    let sentTo = 0;
    try {
        const orders = eventId
            ? await window.ConvexDB.listOrdersByEvent(eventId)
            : await window.ConvexDB.listOrdersByOrg(_orgId);
        sentTo = (orders || []).filter(o => o.status === 'paid').length;
    } catch { }

    try {
        await window.ConvexDB.sendAttendeeMessage({
            org_id: _orgId,
            event_id: eventId || undefined,
            subject,
            body,
            channel: document.getElementById('msg-channel').value,
            sent_to: sentTo,
        });
        window.TA?.toast(`Message sent to ${sentTo} attendees!`, 'success');
        document.getElementById('msg-subject').value = '';
        document.getElementById('msg-body').value = '';
        loadMessages();
    } catch (e) {
        window.TA?.toast('Failed: ' + (e.message || 'Unknown error'), 'error');
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
            <td><div style="font-weight:600;font-size:13px;">${s.name}</div><div style="font-size:12px;color:rgba(255,255,255,0.4);">${s.invited_email}</div></td>
            <td style="font-size:13px;">${ROLE_LABELS[s.role] || s.role}</td>
            <td style="font-size:12px;color:rgba(255,255,255,0.5);">${s.event_title || 'All Events'}</td>
            <td>${statusChip(s.status, STAFF_STATUS)}</td>
            <td style="font-size:12px;color:rgba(255,255,255,0.4);">${fmtDate(s.invited_at)}</td>
            <td style="white-space:nowrap;">
                ${s.status !== 'revoked' ? `<button onclick="revokeStaffMember('${s._id}')" style="font-size:11px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:4px 10px;color:#f59e0b;cursor:pointer;margin-right:6px;">Revoke</button>` : ''}
                <button onclick="removeStaffMember('${s._id}')" style="font-size:11px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:4px 10px;color:#ef4444;cursor:pointer;">Remove</button>
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
    input.className = 'poll-option-input';
    input.placeholder = `Option ${container.children.length + 1}`;
    input.style.cssText = "width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:#f0f0f5;font-size:13px;outline:none;";
    container.appendChild(input);
}

const POLL_STATUS = {
    draft: { label: 'Draft', color: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.05)' },
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
            <td><div style="font-weight:600;font-size:13px;">${p.title}</div><div style="font-size:12px;color:rgba(255,255,255,0.4);">${p.description.substring(0, 50)}...</div></td>
            <td>${statusChip(p.status, POLL_STATUS)}</td>
            <td style="font-size:12px;color:rgba(255,255,255,0.4);">${fmtDate(p.start_date)} - ${fmtDate(p.end_date)}</td>
            <td style="white-space:nowrap;">
                ${p.status === 'draft' ? `<button onclick="setPollStatus('${p._id}', 'active')" style="font-size:11px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:4px 10px;color:#22c55e;cursor:pointer;margin-right:6px;">Activate</button>` : ''}
                ${p.status === 'active' ? `<button onclick="setPollStatus('${p._id}', 'completed')" style="font-size:11px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:6px;padding:4px 10px;color:#8b5cf6;cursor:pointer;margin-right:6px;">Complete</button>` : ''}
                <button onclick="handleDeletePoll('${p._id}')" style="font-size:11px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:4px 10px;color:#ef4444;cursor:pointer;">Delete</button>
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

// Patch showSection to trigger loaders
const _origShowSection = window.showSection;
window.showSection = function (name, linkEl) {
    if (_origShowSection) _origShowSection(name, linkEl);
    if (_sectionLoaders[name]) _sectionLoaders[name]();
};
