// RAG-based Policy Chatbot
// Uses keyword extraction + TF-IDF-like scoring to find relevant policies
// Then generates answers from matched policy content

(function () {
    'use strict';

    var panel = document.getElementById('chat-panel');
    var toggleBtn = document.getElementById('chat-toggle');
    var closeBtn = document.getElementById('chat-close');
    var messagesEl = document.getElementById('chat-messages');
    var inputEl = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');

    // Toggle panel
    toggleBtn.addEventListener('click', function () {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) inputEl.focus();
    });
    closeBtn.addEventListener('click', function () {
        panel.classList.remove('open');
    });

    // Send message
    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendMessage();
    });

    function sendMessage() {
        var q = inputEl.value.trim();
        if (!q) return;
        appendMsg('user', q);
        inputEl.value = '';

        // Simulate thinking delay
        setTimeout(function () {
            var answer = generateAnswer(q);
            appendMsg('bot', answer);
        }, 400);
    }

    function appendMsg(role, text) {
        var div = document.createElement('div');
        div.className = 'chat-msg ' + role;
        div.innerHTML = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // --- RAG Engine ---

    // Stop words to ignore
    var STOP = new Set(['the','a','an','is','are','was','were','be',
        'been','being','have','has','had','do','does','did','will',
        'would','could','should','may','might','shall','can','to',
        'of','in','for','on','with','at','by','from','as','into',
        'through','during','before','after','above','below','between',
        'out','off','over','under','again','further','then','once',
        'here','there','when','where','why','how','all','each','every',
        'both','few','more','most','other','some','such','no','nor',
        'not','only','own','same','so','than','too','very','just',
        'because','about','up','it','its','this','that','these',
        'those','i','me','my','we','our','you','your','he','him',
        'his','she','her','they','them','their','what','which','who',
        'whom','if','or','and','but','while','also','any','get']);

    function tokenize(text) {
        return text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(function (w) { return w.length > 2 && !STOP.has(w); });
    }

    function scoreDocument(queryTokens, doc) {
        var content = (doc.title + ' ' + doc.content + ' ' + doc.id).toLowerCase();
        var contentTokens = tokenize(content);
        var score = 0;
        var matched = [];

        for (var i = 0; i < queryTokens.length; i++) {
            var qt = queryTokens[i];
            // Exact word match
            for (var j = 0; j < contentTokens.length; j++) {
                if (contentTokens[j] === qt) {
                    score += 3;
                } else if (contentTokens[j].indexOf(qt) !== -1 || qt.indexOf(contentTokens[j]) !== -1) {
                    score += 1; // Partial match
                }
            }
            // Title match bonus
            if (doc.title.toLowerCase().indexOf(qt) !== -1) {
                score += 5;
                matched.push(qt);
            }
            // Policy number match bonus
            if (doc.id.toLowerCase().indexOf(qt) !== -1) {
                score += 10;
            }
        }

        // Phrase matching - check if consecutive query words appear near each other
        var queryPhrase = queryTokens.join(' ');
        if (content.indexOf(queryPhrase) !== -1) {
            score += 15;
        }

        return score;
    }

    function retrieve(query, topK) {
        topK = topK || 3;
        var queryTokens = tokenize(query);
        if (queryTokens.length === 0) return [];

        var scored = [];
        for (var i = 0; i < POLICY_CONTENT.length; i++) {
            var s = scoreDocument(queryTokens, POLICY_CONTENT[i]);
            if (s > 0) {
                scored.push({ doc: POLICY_CONTENT[i], score: s });
            }
        }

        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, topK);
    }

    function generateAnswer(query) {
        var results = retrieve(query, 3);

        if (results.length === 0) {
            return "I couldn't find any relevant policies for your question. Try asking about specific topics like admissions, grading, board meetings, harassment, financial aid, or employee travel.";
        }

        var answer = '<div class="rag-answer">';

        // Check if it's a very strong single match
        if (results[0].score > 20 && (results.length === 1 || results[0].score > results[1].score * 2)) {
            var top = results[0].doc;
            answer += '<strong>' + esc(top.id) + ' — ' + esc(top.title) + '</strong><br>';
            answer += '<p>' + esc(top.content) + '</p>';
        } else {
            answer += '<p>Here\'s what I found related to your question:</p>';
            for (var i = 0; i < results.length; i++) {
                var r = results[i].doc;
                answer += '<div class="rag-result">';
                answer += '<strong>' + esc(r.id) + '</strong> — ' + esc(r.title) + '<br>';
                // Show first ~150 chars of content
                var snippet = r.content.length > 150 ? r.content.substring(0, 150) + '...' : r.content;
                answer += '<span class="rag-snippet">' + esc(snippet) + '</span>';
                answer += '</div>';
            }
        }

        answer += '</div>';
        return answer;
    }

    function esc(t) {
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

})();
