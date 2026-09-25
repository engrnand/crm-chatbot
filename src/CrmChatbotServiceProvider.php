<?php

namespace Orbixedge\CrmChatbot;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Orbixedge\CrmChatbot\Http\AssetController;
use Orbixedge\CrmChatbot\Http\ChatbotController;

/**
 * Auto-discovered by Laravel, so a brand site only needs the package, its
 * .env values and @include('crm-chatbot::widget') in the layout.
 *
 * Routes (prefix "chatbot" by default):
 *   POST message, lead, reset   in the 'web' group: the session holds the CRM
 *                                visitor token and CSRF stops other sites from
 *                                posting through a visitor's browser
 *   GET  assets/{file}          the widget's JS and CSS, served from the package
 */
class CrmChatbotServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/crm-chatbot.php', 'crm-chatbot');

        $this->app->singleton(Chatbot::class, fn () => new Chatbot(new CrmClient()));
    }

    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'crm-chatbot');

        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/../config/crm-chatbot.php' => config_path('crm-chatbot.php'),
            ], 'crm-chatbot-config');

            $this->publishes([
                __DIR__ . '/../resources/views' => resource_path('views/vendor/crm-chatbot'),
            ], 'crm-chatbot-views');
        }

        RateLimiter::for('crm-chatbot', fn (Request $request) => Limit::perMinute((int) config('crm-chatbot.limits.per_minute', 15))
            ->by('crm-chatbot:' . $request->ip())
            ->response(fn () => response()->json([
                'error' => 'You are sending messages quickly. Please wait a minute and try again.',
                'reason' => 'limit_minute',
            ], 429)));

        if ($this->app->routesAreCached() || ! config('crm-chatbot.enabled')) {
            return;
        }

        $prefix = config('crm-chatbot.route_prefix', 'chatbot');

        Route::middleware(['web', 'throttle:crm-chatbot'])
            ->prefix($prefix)
            ->name('crm-chatbot.')
            ->group(function () {
                Route::post('message', [ChatbotController::class, 'message'])->name('message');
                Route::post('lead', [ChatbotController::class, 'lead'])->name('lead');
                Route::post('reset', [ChatbotController::class, 'reset'])->name('reset');
            });

        // static files: no session, no CSRF, no throttle
        Route::get($prefix . '/assets/{file}', AssetController::class)
            ->where('file', 'chatbot\.(js|css)')
            ->name('crm-chatbot.asset');
    }
}
