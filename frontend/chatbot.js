// Foothill Policy Owl — chat frontend
// Calls the FastAPI backend (server.py), which runs the real Bedrock
// Knowledge Base retrieval + Nova Pro answer generation.
// Replaces the old local keyword-matching version that used
// policies-content.js as a fake, hardcoded dataset.

(function () {
    'use strict';

    // Change this if your API runs somewhere other than localhost:8000
    // (e.g. a deployed URL).
    var API_BASE = window.POLICY_API_BASE || 'http://localhost:8000';

    var messagesEl = document.getElementById('chat-messages');
    var inputEl = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');
    var statusEl = document.getElementById('conn-status');

    // Checked once on page load, same as the Streamlit version (which
    // checked once per session rather than on every keystroke).
    checkConnection();

    function checkConnection() {
        if (!statusEl) return;
        fetch(API_BASE + '/api/health')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.ok) {
                    statusEl.textContent = 'Connected to knowledge base ' + data.knowledge_base_id;
                    statusEl.className = 'conn-status ok';
                } else {
                    statusEl.textContent = 'Not connected: ' + data.error;
                    statusEl.className = 'conn-status err';
                }
            })
            .catch(function () {
                statusEl.textContent = "Can't reach the API at " + API_BASE + ' — is server.py running?';
                statusEl.className = 'conn-status err';
            });
    }

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendMessage();
    });

    function sendMessage() {
        var q = inputEl.value.trim();
        if (!q) return;
        appendMsg('user', esc(q));
        inputEl.value = '';
        sendBtn.disabled = true;

        var loadingEl = appendMsg('bot', 'Hooting through the policy documents...');

        fetch(API_BASE + '/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: q })
        })
            .then(function (res) {
                if (!res.ok) throw new Error('Server returned ' + res.status);
                return res.json();
            })
            .then(function (data) {
                loadingEl.innerHTML = renderAnswer(data);
            })
            .catch(function (err) {
                loadingEl.innerHTML = 'Sorry, I couldn\'t reach the policy assistant (' +
                    esc(err.message) + '). Is the API running at ' + esc(API_BASE) + '?';
            })
            .finally(function () {
                sendBtn.disabled = false;
                messagesEl.scrollTop = messagesEl.scrollHeight;
            });
    }

    function renderAnswer(data) {
        var html = '<div class="rag-answer"><p>' + esc(data.answer) + '</p>';
        if (data.sources && data.sources.length) {
            html += '<div class="rag-result"><span class="rag-snippet">Sources: ' +
                data.sources.map(esc).join(', ') + '</span></div>';
        }
        html += '</div>';
        return html;
    }

    function appendMsg(role, html) {
        var div = document.createElement('div');
        div.className = 'chat-msg ' + role;
        div.innerHTML = html;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return div;
    }

    function esc(t) {
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

})();
