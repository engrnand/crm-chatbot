<?php

/*
|--------------------------------------------------------------------------
| Orbixedge CRM chatbot
|--------------------------------------------------------------------------
|
| The chatbot runs in the CRM: its model, API key, knowledge, widget copy,
| lead form and limits are set per brand under AI Chatbot there. This site
| only proxies: the widget posts to /chatbot/*, and the package forwards to
| the CRM with the brand's access token. No AI key lives on this site.
|
| Everything is read from .env, so publishing this file is optional:
|   php artisan vendor:publish --tag=crm-chatbot-config
|
*/

return [

    'enabled' => (bool) env('CHATBOT_ENABLED', true),

    /*
    | The CRM this brand is registered in. The same variables a brand site's
    | lead forwarding uses, so they are set once.
    |
    | brand_domain is this site's own domain as registered on the brand in the
    | CRM; it defaults to APP_URL's host, so it is only needed where the two
    | differ (local, staging). CRM_ORIGIN is its old name.
    */
    'crm' => [
        'base_url' => env('CRM_API_BASE_URL'),
        'access_token' => env('CRM_ACCESS_TOKEN'),
        'brand_domain' => env('CRM_BRAND_DOMAIN')
            ?: env('CRM_ORIGIN')
            ?: parse_url((string) env('APP_URL'), PHP_URL_HOST),
        // the CRM's chat endpoints, under the base URL
        'chat_path' => env('CHATBOT_CRM_PATH', '/v1/front-offices/brands/chat'),
    ],

    // the widget's routes on this site: /chatbot/message, /chatbot/lead, ...
    'route_prefix' => env('CHATBOT_ROUTE_PREFIX', 'chatbot'),

    // seconds to cache the widget settings fetched from the CRM
    'config_ttl' => (int) env('CHATBOT_CONFIG_TTL', 600),

    // a reply can take a while; fetching the settings must not slow a page
    'timeout' => (int) env('CHATBOT_TIMEOUT', 40),
    'config_timeout' => 5,

    // a light local throttle before the CRM, which enforces the real limits
    'limits' => [
        'per_minute' => 15,
        'message_chars' => 1000,
    ],

    /*
    | Session key where the site stores the visitor's original referrer, if it
    | does; it is passed to the CRM with the conversation. Null to skip.
    */
    'referrer_session_key' => 'refer_url',

];
