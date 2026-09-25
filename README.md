# orbixedge/crm-chatbot

Adds the Orbixedge CRM's AI chatbot to a Laravel brand website. The chatbot
itself runs in the CRM (model, API key, knowledge, widget copy, lead form,
limits, chat history). The brand site only shows the widget and passes
messages through.

```
visitor's browser ──/chatbot/*──▶ brand site (session, CSRF, light throttle)
                                     │  brand access token
                                     ▼
                                   CRM /api/v1/front-offices/brands/chat/*  ──▶ OpenAI / Claude / Vapi
```

- No AI key on the brand site. The browser never sees the brand token either.
- Chats and the leads they produce land in the CRM (AI Chatbot > Conversations, Leads).
- If the brand has no active chatbot, or the CRM can't be reached, the widget
  simply doesn't appear. The site never breaks.

**Requirements:** PHP 8.2+, Laravel 10 to 13, the `web` middleware group with
sessions (default in every Laravel app).

---

## Part A: set up the brand in the CRM

Do this first; the widget only appears once the chatbot is active.

1. **Brand** (CRM > Brands): the brand exists and its **Domain** is the site's
   live domain without `www` (e.g. `orbixedge.com`). Tick its **Services**
   on the brand form; they fill the lead form's "Interested in" dropdown.
2. **Services** (CRM > Services): add any that are missing.
3. **Brand access token** (CRM > Brand Access Tokens): create one for the
   brand. If the site already sends leads to the CRM, reuse that token.
4. **API connection** (AI Chatbot > API Connections): usually exists already;
   one key can serve every brand.
5. **Chatbot** (AI Chatbot > Chatbots > Add): pick the brand, the connection
   and a model, fill Knowledge (services, process, FAQs, links) and
   Instructions, set the widget copy, then tick **Active** and save.

---

## Part B: install on the brand site

**B1. Install the package.** The repository is private, so tell Composer
where it is, once per site:

```bash
composer config repositories.crm-chatbot vcs https://github.com/engrnand/crm-chatbot.git
```

```bash
composer require orbixedge/crm-chatbot:^1.0
```

The server needs read access to the repository: a GitHub deploy key on the
server, or `composer config --global github-oauth.github.com <token>` with a
read-only fine-grained token. The service provider is auto-discovered.

**B2. Add the widget to the main layout** (e.g. `resources/views/layouts/app.blade.php`):

```blade
<head>
    ...
    <meta name="csrf-token" content="{{ csrf_token() }}">
</head>
<body>
    ...
    @include('crm-chatbot::widget')
</body>
```

Skip the meta tag if the layout already has it.

**B3. Set `.env`.** Sites that already forward leads to the CRM have these:

```dotenv
CRM_API_BASE_URL=https://crm-backoffice.orbixedge.com/api
CRM_ACCESS_TOKEN=<the brand's token from step A3>
# only when the site's APP_URL host differs from the brand's domain in the CRM
CRM_BRAND_DOMAIN=
```

`CRM_API_BASE_URL` is the CRM **API** address, ending in `/api`. The CRM's
admin frontend lives on the same host, and any other path returns its web page
instead of JSON (see Troubleshooting).

**B4. Clear caches** on the server after deploying:

```bash
php artisan optimize:clear
```

Run `php artisan optimize` afterwards if the site normally caches config and routes.

**B5. One host.** If the site answers on both `www.` and the bare domain,
redirect one to the other. Otherwise visitors on the other host can't chat.
In `public/.htaccess`, after `RewriteEngine On`:

```apache
RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]
```

### Hosts without Composer

If the server can't run Composer (some shared hosting), run `composer install`
locally and upload the `vendor/` folder with the rest of the site.

---

## Check it works

1. Open the site: the "Chat with …" button appears bottom right.
2. View the page source: `data-endpoint="/chatbot/message"` (a relative path)
   and the script loads from `/chatbot/assets/chatbot.js`.
3. Send two messages: replies arrive, and after the number of messages set on
   the chatbot the lead form appears.
4. CRM > AI Chatbot > Conversations: the chat is there with its cost.

---

## Updating

```bash
composer update orbixedge/crm-chatbot
```

Then clear caches (step B4). The widget's CSS and JS are served from the
package and versioned by file date, so visitors get the new files straight away.

---

## Troubleshooting

Look in the brand site's log (`storage/logs`) for lines starting
`crm-chatbot:` and in the CRM's log for `ai-chatbot:`.

| What you see | Cause | Fix |
|---|---|---|
| No chat button at all | Chatbot not active, or no connection/model, in the CRM | Step A5 |
| No chat button and nothing in the site log | `CRM_API_BASE_URL` or `CRM_ACCESS_TOKEN` is empty, so the package stays off without calling the CRM | Step B3, then step B4 |
| No chat button; site log `CRM call failed` with an HTML body (`<!doctype html>`) | `CRM_API_BASE_URL` points at the CRM frontend, not the API | Use the API address ending in `/api` |
| No chat button; `CRM call failed` with status 401 or 403 | Wrong token, or the brand domain doesn't match | Check `CRM_ACCESS_TOKEN`; set `CRM_BRAND_DOMAIN` to the brand's domain in the CRM |
| Button only appears a minute after fixing the above | A failed settings fetch is remembered for 60 s; settings are cached 10 min | Wait, or `php artisan cache:clear` |
| Chat button unstyled, or 404 on `/chatbot/assets/…` | The site's web server serves that path itself, or routes are cached from before install | `php artisan route:clear`; check no `public/chatbot` folder exists |
| "Could not reach the assistant. Check your connection" for some visitors | The site answers on both `www.` and the bare domain (step B5), or an ad blocker blocks the request | Redirect to one host |
| "The assistant is not available right now…" | The AI provider refused; the CRM log `ai-chatbot: provider error` says why | e.g. the model needs a verified OpenAI organization: pick another model |
| "This page has been open a while. Refresh it and ask again." | Session/CSRF token expired | Normal after a long idle; refresh |
| "You are sending messages quickly…" or "today's message limit" | Rate limits | Adjust under the chatbot's Limits in the CRM |

---

## Local development

Run the CRM locally and the brand site on port 8001:

```bash
php artisan serve --port=8001
```

Create a brand token for the brand in the local CRM and set
`CRM_BRAND_DOMAIN=localhost:8001`. The CRM ignores the port when comparing.
For Orbixedge, the CRM's `OrbixedgeChatbotSeeder` does this and prints the
three `.env` lines.

To work on the package itself from a brand site, point Composer at a local
checkout instead of GitHub:

```bash
composer config repositories.crm-chatbot path ../crm-chatbot
```

---

## Settings

Everything reads from `.env`. To change the rest, publish the config:

```bash
php artisan vendor:publish --tag=crm-chatbot-config
```

| Key (`config/crm-chatbot.php`) | Default | Meaning |
|---|---|---|
| `enabled` | `CHATBOT_ENABLED`, true | Switch the widget off on this site |
| `crm.base_url`, `crm.access_token`, `crm.brand_domain` | from `CRM_*` | CRM connection |
| `crm.chat_path` | `/v1/front-offices/brands/chat` | CRM chat endpoints under the base URL |
| `route_prefix` | `CHATBOT_ROUTE_PREFIX`, `chatbot` | Where the widget's routes live on this site |
| `config_ttl` | 600 s | How long widget settings are cached |
| `timeout` | 40 s | Longest wait for a reply |
| `limits.per_minute` | 15 | Local throttle per visitor IP (the CRM enforces the real limits) |
| `limits.message_chars` | 1000 | Longest message accepted |
| `referrer_session_key` | `refer_url` | Session key holding the visitor's original referrer, if the site stores one |

To change the markup, publish the view: `php artisan vendor:publish --tag=crm-chatbot-views`.

## Routes (this site)

| Route | Body | Returns |
|---|---|---|
| `POST /chatbot/message` | `message`, `page_url?` | `{reply, ask_lead, lead_required}` |
| `POST /chatbot/lead` | `name`, `email`, `phone?`, `service_id?` | `{ok: true}` |
| `POST /chatbot/reset` | | `204` |
| `GET /chatbot/assets/chatbot.js`, `chatbot.css` | | The widget files |

Errors are `{error, reason}`; `reason: lead_required` makes the widget show the lead form.
