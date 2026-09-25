<?php

namespace Orbixedge\CrmChatbot\Http;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use Orbixedge\CrmChatbot\Chatbot;
use Orbixedge\CrmChatbot\ChatbotException;

/**
 * JSON contract the widget relies on:
 *   POST message {message, page_url?}                -> 200 {reply, ask_lead, lead_required}
 *   POST lead    {name, email, phone?, service_id?}  -> 200 {ok: true}
 *   POST reset                                       -> 204
 * Errors: 4xx/5xx {error, reason}.
 */
class ChatbotController extends Controller
{
    public function __construct(private readonly Chatbot $bot)
    {
    }

    public function message(Request $request): JsonResponse
    {
        $max = (int) config('crm-chatbot.limits.message_chars', 1000);
        $message = $request->input('message');

        if (! is_string($message) || trim($message) === '' || mb_strlen($message) > $max) {
            return $this->error("Please keep your message under {$max} characters.", 422, 'invalid');
        }

        $pageUrl = $request->input('page_url');
        $pageUrl = is_string($pageUrl) && filter_var($pageUrl, FILTER_VALIDATE_URL) ? mb_substr($pageUrl, 0, 490) : null;

        return $this->attempt(fn () => response()->json($this->bot->reply($request, $message, $pageUrl)));
    }

    public function lead(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:100'],
            'phone' => ['nullable', 'string', 'max:30'],
            'service_id' => ['nullable', 'uuid'],
        ]);

        if ($validator->fails()) {
            return $this->error($validator->errors()->first(), 422, 'invalid');
        }

        return $this->attempt(function () use ($request, $validator) {
            $this->bot->lead($request, $validator->validated());

            return response()->json(['ok' => true]);
        });
    }

    public function reset(Request $request): JsonResponse
    {
        $this->bot->reset($request);

        return response()->json(null, 204);
    }

    private function attempt(callable $callback): JsonResponse
    {
        try {
            return $callback();
        } catch (ChatbotException $e) {
            return $this->error($e->getMessage(), $e->status, $e->reason);
        }
    }

    private function error(string $message, int $status, string $reason): JsonResponse
    {
        return response()->json(['error' => $message, 'reason' => $reason], $status);
    }
}
