<?php

namespace Orbixedge\CrmChatbot;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * The site side of the chatbot. The CRM holds the conversation; this site
 * keeps only the CRM's visitor token in the visitor's session, so the browser
 * never sees it and cannot swap in another visitor's chat.
 */
class Chatbot
{
    private const TOKEN_KEY = 'crm-chatbot.token';
    private const CONFIG_CACHE_KEY = 'crm-chatbot:config';

    public function __construct(private readonly CrmClient $crm)
    {
    }

    /**
     * Widget settings from the CRM, cached. Null when the chatbot is off in
     * the CRM or the CRM cannot be reached; a failure is remembered for a
     * minute so a CRM outage does not slow every page render.
     *
     * @return array<string, mixed>|null
     */
    public function widgetConfig(): ?array
    {
        if (! config('crm-chatbot.enabled') || ! $this->crm->isConfigured()) {
            return null;
        }

        $cached = Cache::get(self::CONFIG_CACHE_KEY);

        if ($cached !== null) {
            return $cached ?: null;
        }

        try {
            $settings = $this->crm->get('config', null, (int) config('crm-chatbot.config_timeout', 5));
            Cache::put(self::CONFIG_CACHE_KEY, $settings, (int) config('crm-chatbot.config_ttl', 600));

            return $settings;
        } catch (Throwable) {
            Cache::put(self::CONFIG_CACHE_KEY, [], 60);

            return null;
        }
    }

    /**
     * @return array{reply: string, ask_lead: bool, lead_required: bool}
     */
    public function reply(Request $request, string $message, ?string $pageUrl): array
    {
        $session = $request->session();

        $data = $this->crm->post('messages', array_filter([
            'message' => $message,
            'visitor_token' => $session->get(self::TOKEN_KEY),
            'page_url' => $pageUrl,
            // where the visitor came from, if the site records it in the session
            'referrer_url' => ($key = config('crm-chatbot.referrer_session_key')) ? $session->get($key) : null,
        ]), $request);

        if (! empty($data['visitor_token'])) {
            $session->put(self::TOKEN_KEY, $data['visitor_token']);
        }

        return [
            'reply' => (string) ($data['reply'] ?? ''),
            'ask_lead' => (bool) ($data['ask_lead'] ?? false),
            'lead_required' => (bool) ($data['lead_required'] ?? false),
        ];
    }

    /**
     * @param  array{name: string, email: string, phone?: ?string, service_id?: ?string}  $lead
     */
    public function lead(Request $request, array $lead): void
    {
        $token = $request->session()->get(self::TOKEN_KEY);

        if (! $token) {
            throw new ChatbotException('Please send a message first.', 422, 'no_conversation');
        }

        $this->crm->post('lead', array_filter($lead + ['visitor_token' => $token]), $request);
    }

    public function reset(Request $request): void
    {
        $token = $request->session()->pull(self::TOKEN_KEY);

        if ($token) {
            try {
                $this->crm->post('reset', ['visitor_token' => $token], $request);
            } catch (ChatbotException) {
                // the local token is gone either way; the next message starts a new chat
            }
        }
    }
}
