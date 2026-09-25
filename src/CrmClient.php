<?php

namespace Orbixedge\CrmChatbot;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Calls the CRM chat API (front-offices/brands/chat/*) server to server, with
 * the brand access token and origin from config('crm-chatbot.crm'). The visitor's IP
 * and user agent go along in headers for the CRM's rate limits and records.
 */
class CrmClient
{
    /**
     * @return array<string, mixed> the CRM's `data`
     *
     * @throws ChatbotException
     */
    public function get(string $endpoint, ?Request $visitor = null, ?int $timeout = null): array
    {
        return $this->send('get', $endpoint, [], $visitor, $timeout);
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed> the CRM's `data`
     *
     * @throws ChatbotException
     */
    public function post(string $endpoint, array $body, ?Request $visitor = null): array
    {
        return $this->send('post', $endpoint, $body, $visitor);
    }

    public function isConfigured(): bool
    {
        return config('crm-chatbot.crm.base_url') && config('crm-chatbot.crm.access_token');
    }

    private function send(string $method, string $endpoint, array $body, ?Request $visitor, ?int $timeout = null): array
    {
        if (! $this->isConfigured()) {
            throw new ChatbotException('The assistant is not available right now.', 503, 'not_configured');
        }

        $url = rtrim((string) config('crm-chatbot.crm.base_url'), '/')
            . '/' . trim((string) config('crm-chatbot.crm.chat_path'), '/')
            . '/' . $endpoint;

        $origin = (string) config('crm-chatbot.crm.brand_domain') ?: (string) ($visitor?->getHost() ?? '');

        try {
            $response = Http::acceptJson()
                ->connectTimeout(5)
                ->timeout($timeout ?? (int) config('crm-chatbot.timeout', 40))
                ->withHeaders(array_filter([
                    'X-Access-Token' => (string) config('crm-chatbot.crm.access_token'),
                    'X-Origin' => $origin ?: null,
                    'X-Visitor-Ip' => $visitor?->ip(),
                    'X-Visitor-Agent' => $visitor ? Str::limit((string) $visitor->userAgent(), 250, '') : null,
                ]))
                ->{$method}($url, $body);
        } catch (ConnectionException $e) {
            Log::warning('crm-chatbot: CRM unreachable', ['endpoint' => $endpoint, 'error' => $e->getMessage()]);

            throw new ChatbotException('The assistant is not responding right now. Please try again in a moment.');
        }

        if ($response->successful() && $response->json('success') === true) {
            return (array) ($response->json('data') ?? []);
        }

        $reason = (string) ($response->json('data.reason') ?? '');

        // the CRM's own chatbot errors (with a reason) are written for visitors;
        // anything else (bad token, 5xx, an HTML page) stays in the log
        if ($reason !== '' && is_string($response->json('message'))) {
            throw new ChatbotException($response->json('message'), $response->status(), $reason);
        }

        Log::error('crm-chatbot: CRM call failed', [
            'endpoint' => $endpoint,
            'status' => $response->status(),
            'body' => Str::limit($response->body(), 300),
        ]);

        throw new ChatbotException('The assistant is not available right now. Please use the contact form and we will reply by email.');
    }
}
