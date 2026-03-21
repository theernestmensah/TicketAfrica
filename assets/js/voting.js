/**
 * voting.js
 * Frontend logic for browse and participation in polls.
 */

/* ─── Global State ─── */
let _selectedOption = null;
let _currentPollId = null;

/* ─── Load Polls ─── */
async function loadAllPolls() {
    const list = document.getElementById('polls-list');
    try {
        const polls = await window.ConvexDB.query("events:listPublicPolls");
        if (!polls || !polls.length) {
            list.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:100px 0;"><p style="color:rgba(255,255,255,0.4);">No active polls at the moment.</p></div>`;
            return;
        }
        list.innerHTML = polls.map(p => `
            <div class="poll-card">
                <span class="poll-card__status status--${p.status}">${p.status}</span>
                <div class="poll-card__title">${p.title}</div>
                <div class="poll-card__desc">${p.description}</div>
                <div class="poll-card__meta">
                    <span><iconify-icon icon="hugeicons:calendar-01"></iconify-icon> Ends ${new Date(p.end_date).toLocaleDateString()}</span>
                </div>
                <button class="btn btn--primary" onclick="openVoteModal('${p._id}')">
                    ${p.status === 'active' ? 'Cast Your Vote' : 'View Results'}
                </button>
            </div>
        `).join('');
    } catch (e) {
        console.error("Polls load error", e);
        list.innerHTML = `<p>Error loading polls.</p>`;
    }
}

/* ─── Modal & Voting ─── */
async function openVoteModal(pollId) {
    _currentPollId = pollId;
    _selectedOption = null;
    const modal = document.getElementById('vote-modal');
    const content = document.getElementById('v-modal-content');
    
    modal.classList.add('active');
    content.innerHTML = `<div style="text-align:center;padding:40px;"><iconify-icon icon="hugeicons:loading-03" style="font-size:32px;"></iconify-icon></div>`;

    try {
        const poll = await window.ConvexDB.query("events:getPollDetails", { poll_id: pollId });
        renderPollDetails(poll);
    } catch (e) {
        content.innerHTML = `<p>Error loading poll details.</p>`;
    }
}

function renderPollDetails(poll) {
    const content = document.getElementById('v-modal-content');
    const isActive = poll.status === 'active';
    
    let optionsHtml = '';
    if (isActive) {
        optionsHtml = poll.options.map(opt => `
            <div class="v-option" onclick="selectOption('${opt._id}', this)">
                <span class="v-option__label">${opt.label}</span>
                <div class="v-option__radio"></div>
            </div>
        `).join('');
    } else {
        // Results view
        const totalVotes = poll.options.reduce((sum, o) => sum + o.votes_count, 0) || 1;
        optionsHtml = poll.options.map(opt => {
            const pct = Math.round((opt.votes_count / totalVotes) * 100);
            return `
                <div style="margin-bottom:24px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;">
                        <span style="font-weight:600;">${opt.label}</span>
                        <span style="font-weight:700;color:var(--color-primary);">${pct}% (${opt.votes_count})</span>
                    </div>
                    <div class="results-bar-wrap">
                        <div class="results-bar" style="width:${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    content.innerHTML = `
        <h2 style="font-size:24px;margin-bottom:12px;">${poll.title}</h2>
        <p style="color:var(--color-text-secondary);font-size:14px;margin-bottom:30px;">${poll.description}</p>
        
        <div id="v-options-container" style="margin-bottom:30px;">
            ${optionsHtml}
        </div>

        ${isActive ? `
            <button id="cast-vote-btn" class="btn btn--primary btn--full" onclick="handleCastVote()" disabled>Cast Vote</button>
        ` : `
            <p style="text-align:center;font-size:13px;color:var(--color-text-muted);">This poll has ended.</p>
        `}
    `;
}

function selectOption(id, el) {
    _selectedOption = id;
    document.querySelectorAll('.v-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('cast-vote-btn').disabled = false;
}

async function handleCastVote() {
    if (!window.Clerk.user) {
        alert("Please sign in to vote.");
        window.Clerk.openSignIn();
        return;
    }

    try {
        const btn = document.getElementById('cast-vote-btn');
        btn.disabled = true;
        btn.innerText = "Voting...";

        // Step 1: Ensure user is in Convex
        // We'll need a way to get the internal user ID
        // For now, let's assume we have a helper
        const user = await syncUserWithConvex();
        
        await window.ConvexDB.mutation("events:castVote", {
            poll_id: _currentPollId,
            option_id: _selectedOption,
            user_id: user._id
        });

        // Success! Reload poll as results
        const poll = await window.ConvexDB.query("events:getPollDetails", { poll_id: _currentPollId });
        renderPollDetails({ ...poll, status: 'completed' }); // Show results even if it's still active
        alert("Thank you! Your vote has been counted.");
        
    } catch (e) {
        alert(e.message || "Failed to cast vote.");
        document.getElementById('cast-vote-btn').disabled = false;
        document.getElementById('cast-vote-btn').innerText = "Cast Vote";
    }
}

async function syncUserWithConvex() {
    const user = window.Clerk.user;
    if (!user) throw new Error("Not signed in");
    
    return await window.ConvexDB.mutation("users:upsertUser", {
        clerk_id: user.id,
        email: user.primaryEmailAddress.emailAddress,
        first_name: user.firstName,
        last_name: user.lastName,
    });
}

function closeVoteModal() {
    document.getElementById('vote-modal').classList.remove('active');
}

window.openVoteModal = openVoteModal;
window.closeVoteModal = closeVoteModal;
window.selectOption = selectOption;
window.handleCastVote = handleCastVote;
window.loadAllPolls = loadAllPolls;
