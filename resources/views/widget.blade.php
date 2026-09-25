{{--
    Chat widget: @include('crm-chatbot::widget') before </body>.

    Its settings (copy, colours, lead form, services) come from the CRM,
    cached; the widget stays out when the CRM has no active chatbot for this
    brand or cannot be reached. No key or token reaches the page.

    Endpoints are relative on purpose: the widget must call the host the page
    was opened on. An absolute URL built from APP_URL breaks the chat for
    visitors on the www host: the browser treats it as a cross-site request.
--}}
@if (config('crm-chatbot.enabled') && Route::has('crm-chatbot.message') && ($bot = app(\Orbixedge\CrmChatbot\Chatbot::class)->widgetConfig()))
    @php
        $widget = $bot['widget'] ?? [];
        $lead = $bot['lead'] ?? [];
        // cache-busted by the file's own date, so an update is picked up at once
        $chatbotAsset = fn (string $file) => route('crm-chatbot.asset', ['file' => $file, 'v' => @filemtime(\Orbixedge\CrmChatbot\Http\AssetController::path($file))], false);
    @endphp
    <link rel="stylesheet" href="{{ $chatbotAsset('chatbot.css') }}">
    <script defer src="{{ $chatbotAsset('chatbot.js') }}"
        data-endpoint="{{ route('crm-chatbot.message', [], false) }}"
        data-reset-endpoint="{{ route('crm-chatbot.reset', [], false) }}"
        data-lead-endpoint="{{ route('crm-chatbot.lead', [], false) }}"
        data-title="{{ $widget['title'] ?? $bot['name'] }}"
        data-status="{{ $widget['status'] ?? '' }}"
        data-launcher="{{ $widget['launcher'] ?? ('Chat with ' . $bot['name']) }}"
        data-greeting="{{ $widget['greeting'] ?? '' }}"
        data-placeholder="{{ $widget['placeholder'] ?? '' }}"
        data-note="{{ $widget['note'] ?? '' }}"
        data-theme="{{ $widget['theme'] ?? 'dark' }}"
        data-accent="{{ $widget['accent'] ?? '' }}"
        data-glow="{{ $widget['glow'] ?? '' }}"
        data-position="{{ $widget['position'] ?? 'right' }}"
        data-max-length="{{ config('crm-chatbot.limits.message_chars') }}"
        data-suggestions='@json($widget['suggestions'] ?? [])'
        data-lead-ask-phone="{{ ($lead['ask_phone'] ?? true) ? 'true' : 'false' }}"
        data-services='@json($bot['services'] ?? [])'></script>
@endif
