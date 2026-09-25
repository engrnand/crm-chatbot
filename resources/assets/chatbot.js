/*!
 * Chat widget. No dependencies, no keys.
 *
 * Drop onto any site with one tag; everything is read from data- attributes:
 *
 *   <link rel="stylesheet" href="/chatbot/assets/chatbot.css">
 *   <script defer src="/chatbot/assets/chatbot.js"
 *       data-endpoint="/chatbot/message"          (required)
 *       data-reset-endpoint="/chatbot/reset"
 *       data-title="..." data-status="Online" data-launcher="Chat with us"
 *       data-greeting="..." data-placeholder="..." data-note="..."
 *       data-theme="dark|light" data-position="right|left"
 *       data-accent="#0f6fb0" data-glow="#3fc8f0"
 *       data-icon="/logo-mark.svg"   (optional, replaces the built-in mark)
 *       data-max-length="800"
 *       data-suggestions='["Question one", "Question two"]'
 *       data-lead-endpoint="/chatbot/lead" data-lead-ask-phone="true"
 *       data-services='[{"id": "uuid", "name": "Web Development"}]'></script>
 *
 * Backend contract: POST {message} as JSON -> {reply} or {error}. The CSRF
 * token comes from data-csrf or <meta name="csrf-token">.
 *
 * Replies are rendered with DOM nodes and textContent only, never innerHTML,
 * so nothing the model says can inject markup into the page.
 */
(function () {
    'use strict';

    var script = document.currentScript;
    if (!script || !script.dataset.endpoint || window.__chatbotWidget) return;
    window.__chatbotWidget = true;

    var ds = script.dataset;
    var meta = document.querySelector('meta[name="csrf-token"]');
    var cfg = {
        endpoint: ds.endpoint,
        resetEndpoint: ds.resetEndpoint || '',
        csrf: ds.csrf || (meta ? meta.content : ''),
        title: ds.title || 'Chat with us',
        status: ds.status || 'Online',
        launcher: ds.launcher || ds.title || 'Chat with us',
        greeting: ds.greeting || 'Hi! How can I help?',
        placeholder: ds.placeholder || 'Type your message',
        note: ds.note || '',
        theme: ds.theme === 'light' ? 'light' : 'dark',
        position: ds.position === 'left' ? 'left' : 'right',
        accent: ds.accent || '',
        glow: ds.glow || '',
        icon: ds.icon || '',
        maxLength: parseInt(ds.maxLength, 10) || 800,
        suggestions: parseList(ds.suggestions),
        leadEndpoint: ds.leadEndpoint || '',
        leadAskPhone: ds.leadAskPhone !== 'false',
        services: parseServices(ds.services),
        leadLabels: {
            title: 'Want the team to follow up? Leave your details.',
            titleRequired: 'Please share your details to continue.',
            name: 'Your name',
            email: 'Email',
            phone: 'Phone (optional)',
            service: 'Interested in',
            submit: 'Send',
            skip: 'Not now',
            invalid: 'Please add your name and a valid email.',
            thanks: 'Thanks, {name}. Someone from the team will be in touch soon. Anything else I can help with meanwhile?',
        },
        storageKey: 'chatbot:' + location.host
    };

    var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // display copy of the conversation; the real history is server-side
    var state = load() || { open: false, messages: [], leadDone: false, leadSkipped: false };
    var busy = false;

    // Orbixedge mark, from assets/images/orbixedge.com/orbixedge-icon.svg
    var ICON_MARK = '<svg viewBox="40 90 432 350" aria-hidden="true"><path fill="currentColor" d="M203.5007 149.1896A24.444 24.444 0 0 1 250.2525 134.8962C278.8406 228.4036 294.956 225.2115 416.4576 171.1155A19.1108 19.1108 0 0 1 432.0037 206.0327C310.5022 260.1287 302.4644 277.5882 380.2417 370.2796A19.1108 19.1108 0 0 1 350.9623 394.848C273.185 302.1566 224.939 305.8432 95.4962 399.8888A14.2 14.2 0 0 1 78.8031 376.9127C208.2459 282.8671 232.0888 242.6971 203.5007 149.1896Z"/></svg>';
    var ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" fill="currentColor"/></svg>';
    var ICON_RESET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* ---------- build ---------- */

    var root = el('div', 'cbw');
    root.setAttribute('data-position', cfg.position);
    root.setAttribute('data-theme', cfg.theme);
    if (cfg.accent) root.style.setProperty('--cbw-accent', cfg.accent);
    if (cfg.glow) root.style.setProperty('--cbw-glow', cfg.glow);

    var panelId = 'cbw-panel-' + Math.random().toString(36).slice(2, 8);

    var launcher = el('button', 'cbw-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-controls', panelId);
    launcher.setAttribute('aria-expanded', 'false');
    launcher.appendChild(orb());
    launcher.appendChild(el('span', '', cfg.launcher));

    var panel = el('section', 'cbw-panel');
    panel.id = panelId;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', cfg.title);

    var head = el('header', 'cbw-head');
    var titles = el('div', 'cbw-titles');
    titles.appendChild(el('strong', 'cbw-title', cfg.title));
    titles.appendChild(el('span', 'cbw-status', cfg.status));
    head.appendChild(orb());
    head.appendChild(titles);

    var resetBtn = iconButton('cbw-icon-btn', 'Start a new chat', ICON_RESET);
    var closeBtn = iconButton('cbw-icon-btn', 'Close chat', ICON_CLOSE);
    head.appendChild(resetBtn);
    head.appendChild(closeBtn);

    var log = el('div', 'cbw-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');

    var chips = el('div', 'cbw-chips');

    var form = el('form', 'cbw-form');
    var input = el('textarea', 'cbw-input');
    input.rows = 1;
    input.maxLength = cfg.maxLength;
    input.placeholder = cfg.placeholder;
    input.setAttribute('aria-label', cfg.placeholder);
    var sendBtn = iconButton('cbw-send', 'Send', ICON_SEND);
    sendBtn.type = 'submit';
    form.appendChild(input);
    form.appendChild(sendBtn);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(chips);
    panel.appendChild(form);
    if (cfg.note) panel.appendChild(el('p', 'cbw-note', cfg.note));

    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);

    renderAll();
    syncSend();
    setOpen(state.open, false);

    /* ---------- events ---------- */

    launcher.addEventListener('click', function () { setOpen(true, true); });
    closeBtn.addEventListener('click', function () { setOpen(false, true); });
    resetBtn.addEventListener('click', reset);

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        send(input.value);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            send(input.value);
        }
    });

    input.addEventListener('input', function () {
        autosize();
        syncSend();
    });

    panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setOpen(false, true);
    });

    /* ---------- behaviour ---------- */

    function setOpen(open, moveFocus) {
        state.open = open;
        root.classList.toggle('is-open', open);
        panel.hidden = !open;
        launcher.setAttribute('aria-expanded', String(open));
        save();

        if (open) {
            scrollDown();
            if (moveFocus) input.focus();
        } else if (moveFocus) {
            launcher.focus();
        }
    }

    function send(text) {
        text = (text || '').trim();
        if (!text || busy) return;

        setBusy(true);
        input.value = '';
        autosize();
        push('user', text);
        var typing = addTyping();

        var ctrl = 'AbortController' in window ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 40000);

        post(cfg.endpoint, { message: text, page_url: location.href }, ctrl)
            .then(function (res) {
                return res.json().catch(function () { return {}; }).then(function (data) {
                    typing.remove();
                    if (res.ok && data.reply) {
                        push('bot', data.reply, true);
                        if (data.ask_lead) offerLeadForm(!!data.lead_required);
                        return;
                    }
                    if (data.reason === 'lead_required') {
                        offerLeadForm(true);
                        return;
                    }
                    showError(errorText(res.status, data));
                });
            })
            .catch(function () {
                typing.remove();
                showError('Could not reach the assistant. Check your connection and try again.');
            })
            .then(function () {
                clearTimeout(timer);
                setBusy(false);
                input.focus();
            });
    }

    function reset() {
        if (busy) return;
        state.messages = [];
        state.leadDone = false;
        state.leadSkipped = false;
        closeLeadForm();
        save();
        renderAll();
        input.focus();
        if (cfg.resetEndpoint) post(cfg.resetEndpoint, {}).catch(function () {});
    }

    function setBusy(on) {
        busy = on;
        root.classList.toggle('is-busy', on);
        syncSend();
    }

    function syncSend() {
        sendBtn.disabled = busy || leadLock || !input.value.trim();
    }

    function post(url, body, ctrl) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': cfg.csrf
            },
            body: JSON.stringify(body),
            signal: ctrl ? ctrl.signal : undefined
        });
    }

    function errorText(status, data) {
        if (status === 419 || /csrf/i.test(data.message || '')) {
            return 'This page has been open a while. Refresh it and ask again.';
        }
        return data.error || 'Something went wrong. Please try again.';
    }

    /* ---------- lead form ---------- */

    var leadForm = null;
    var leadLock = false;

    // Shown when the CRM says so (ask_lead) or insists (lead_required).
    // Asked once per chat; "required" pauses the chat until it is sent.
    function offerLeadForm(required) {
        if (!cfg.leadEndpoint || state.leadDone || leadForm) return;
        if (state.leadSkipped && !required) return;

        var labels = cfg.leadLabels;
        leadForm = el('form', 'cbw-lead');
        leadForm.noValidate = true;
        leadForm.appendChild(el('p', 'cbw-lead-title', required ? labels.titleRequired : labels.title));

        var name = field('text', 'name', labels.name, true, 'name');
        var email = field('email', 'email', labels.email, true, 'email');
        var phone = cfg.leadAskPhone ? field('tel', 'phone', labels.phone, false, 'tel') : null;
        var service = null;

        if (cfg.services.length) {
            service = el('select', 'cbw-lead-input');
            service.name = 'service_id';
            service.setAttribute('aria-label', labels.service);
            service.appendChild(new Option(labels.service, ''));
            cfg.services.forEach(function (s) { service.appendChild(new Option(s.name, s.id)); });
            leadForm.appendChild(service);
        }

        var error = el('p', 'cbw-lead-error');
        error.hidden = true;
        leadForm.appendChild(error);

        var actions = el('div', 'cbw-lead-actions');
        var submit = el('button', 'cbw-lead-submit', labels.submit);
        submit.type = 'submit';
        actions.appendChild(submit);

        if (!required) {
            var skip = el('button', 'cbw-lead-skip', labels.skip);
            skip.type = 'button';
            skip.addEventListener('click', function () {
                state.leadSkipped = true;
                save();
                closeLeadForm();
            });
            actions.appendChild(skip);
        }
        leadForm.appendChild(actions);

        leadForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var body = {
                name: name.value.trim(),
                email: email.value.trim(),
                phone: phone ? phone.value.trim() : '',
                service_id: service ? service.value : '',
            };

            if (!body.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
                showLeadError(error, labels.invalid);
                return;
            }

            submit.disabled = true;
            post(cfg.leadEndpoint, body)
                .then(function (res) {
                    return res.json().catch(function () { return {}; }).then(function (data) {
                        if (!res.ok) {
                            submit.disabled = false;
                            showLeadError(error, errorText(res.status, data));
                            return;
                        }
                        state.leadDone = true;
                        save();
                        closeLeadForm();
                        push('bot', labels.thanks.replace('{name}', body.name.split(/\s+/)[0]));
                    });
                })
                .catch(function () {
                    submit.disabled = false;
                    showLeadError(error, 'Could not send. Check your connection and try again.');
                });
        });

        log.appendChild(leadForm);
        leadLock = required;
        input.disabled = required;
        syncSend();
        scrollDown();
        name.focus();

        function field(type, fieldName, label, isRequired, autocomplete) {
            var node = el('input', 'cbw-lead-input');
            node.type = type;
            node.name = fieldName;
            node.placeholder = label + (isRequired ? ' *' : '');
            node.setAttribute('aria-label', label);
            node.autocomplete = autocomplete;
            node.required = isRequired;
            node.maxLength = 100;
            leadForm.appendChild(node);
            return node;
        }
    }

    function closeLeadForm() {
        if (leadForm) leadForm.remove();
        leadForm = null;
        leadLock = false;
        input.disabled = false;
        syncSend();
    }

    function showLeadError(node, text) {
        node.textContent = text;
        node.hidden = false;
    }

    /* ---------- rendering ---------- */

    function renderAll() {
        log.textContent = '';
        log.appendChild(bubble('bot', cfg.greeting));
        state.messages.forEach(function (m) { log.appendChild(bubble(m.role, m.text)); });
        renderChips();
        scrollDown();
    }

    function renderChips() {
        chips.textContent = '';
        var fresh = !state.messages.some(function (m) { return m.role === 'user'; });
        chips.hidden = !fresh || !cfg.suggestions.length;
        if (chips.hidden) return;

        cfg.suggestions.forEach(function (q) {
            var b = el('button', 'cbw-chip', q);
            b.type = 'button';
            b.addEventListener('click', function () { send(q); });
            chips.appendChild(b);
        });
    }

    function push(role, text, animate) {
        state.messages.push({ role: role, text: text });
        state.messages = state.messages.slice(-40);
        save();
        renderChips();

        if (animate && !reduceMotion) {
            reveal(text);
        } else {
            log.appendChild(bubble(role, text));
            scrollDown();
        }
    }

    // types the reply out word by word; the text is already final, this is
    // only pacing so a long answer does not land as one block
    function reveal(text) {
        var b = el('div', 'cbw-msg cbw-msg--bot');
        log.appendChild(b);

        var words = text.split(/(\s+)/);
        var step = Math.max(1, Math.round(words.length / 60));
        var shown = 0;

        (function tick() {
            // background tabs throttle timers to about once a second
            shown = document.hidden ? words.length : Math.min(words.length, shown + step * 2);
            b.textContent = '';
            rich(b, words.slice(0, shown).join(''));
            scrollDown();
            if (shown < words.length) setTimeout(tick, 18);
        })();
    }

    function showError(text) {
        log.appendChild(bubble('error', text));
        scrollDown();
    }

    function addTyping() {
        var t = el('div', 'cbw-msg cbw-msg--bot cbw-typing');
        t.setAttribute('aria-label', 'Assistant is typing');
        t.appendChild(el('span'));
        t.appendChild(el('span'));
        t.appendChild(el('span'));
        log.appendChild(t);
        scrollDown();
        return t;
    }

    function bubble(role, text) {
        var b = el('div', 'cbw-msg cbw-msg--' + role);
        rich(b, text);
        return b;
    }

    // Blank lines split paragraphs, lines starting "- " become a list,
    // **bold** and bare http(s) URLs become <strong> and <a>.
    function rich(parent, text) {
        var block = null;

        text.split('\n').forEach(function (line) {
            var item = /^\s*[-*•]\s+(.*)$/.exec(line);

            if (item) {
                if (!block || block.nodeName !== 'UL') block = parent.appendChild(el('ul'));
                inline(block.appendChild(el('li')), item[1]);
            } else if (!line.trim()) {
                block = null;
            } else {
                if (block && block.nodeName === 'P') block.appendChild(el('br'));
                else block = parent.appendChild(el('p'));
                inline(block, line);
            }
        });
    }

    function inline(parent, line) {
        var pattern = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s<>"'()]+[^\s<>"'().,!?;:])/g;
        var last = 0;

        line.replace(pattern, function (match, _t, offset) {
            if (offset > last) parent.appendChild(document.createTextNode(line.slice(last, offset)));

            if (match.charAt(0) === '*') {
                parent.appendChild(el('strong', '', match.slice(2, -2)));
            } else {
                var a = el('a', '', match.replace(/^https?:\/\/(www\.)?/, ''));
                a.href = match;
                if (a.host !== location.host) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                }
                parent.appendChild(a);
            }

            last = offset + match.length;
            return match;
        });

        if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
    }

    /* ---------- utilities ---------- */

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    // the brand mark on a tile, with a dot orbiting it (see .cbw-orb-ring);
    // data-icon swaps the built-in mark for another site's logo
    function orb() {
        var tile = el('span', 'cbw-orb-tile');

        if (cfg.icon) {
            var img = el('img');
            img.src = cfg.icon;
            img.alt = '';
            img.style.cssText = 'width:70%;height:70%;object-fit:contain';
            tile.appendChild(img);
        } else {
            tile.innerHTML = ICON_MARK; // static markup from this file only
        }

        var wrap = el('span', 'cbw-orb');
        wrap.setAttribute('aria-hidden', 'true');
        wrap.appendChild(tile);
        wrap.appendChild(el('span', 'cbw-orb-ring'));
        return wrap;
    }

    function iconButton(cls, label, svg) {
        var b = el('button', cls);
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.title = label;
        b.innerHTML = svg; // static markup from this file only
        return b;
    }

    function autosize() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight + 2, 120) + 'px';
        input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden';
    }

    function scrollDown() {
        log.scrollTop = log.scrollHeight;
    }

    function parseServices(raw) {
        try {
            var v = JSON.parse(raw || '[]');
            return Array.isArray(v)
                ? v.filter(function (s) { return s && typeof s.id === 'string' && typeof s.name === 'string'; })
                : [];
        } catch (e) {
            return [];
        }
    }

    function parseList(raw) {
        try {
            var v = JSON.parse(raw || '[]');
            return Array.isArray(v) ? v.filter(function (s) { return typeof s === 'string'; }) : [];
        } catch (e) {
            return [];
        }
    }

    function load() {
        try {
            var v = JSON.parse(sessionStorage.getItem(cfg.storageKey));
            return v && Array.isArray(v.messages) ? v : null;
        } catch (e) {
            return null;
        }
    }

    function save() {
        try {
            sessionStorage.setItem(cfg.storageKey, JSON.stringify(state));
        } catch (e) { /* private mode or storage full: the chat still works */ }
    }
})();
