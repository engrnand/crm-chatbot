<?php

namespace Orbixedge\CrmChatbot\Http;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Serves the widget's JS and CSS straight from the package, so a brand site
 * has nothing to publish and gets the new files on `composer update`. The
 * view adds ?v=<file date>, which lets browsers cache them for a year.
 */
class AssetController
{
    private const TYPES = [
        'js' => 'application/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
    ];

    public function __invoke(string $file): BinaryFileResponse
    {
        $path = self::path($file);

        abort_unless($path !== null, 404);

        return response()->file($path, [
            'Content-Type' => self::TYPES[pathinfo($file, PATHINFO_EXTENSION)],
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    /**
     * Absolute path of a widget file, or null for anything else. The route
     * already limits {file} to chatbot.js and chatbot.css; this checks again.
     */
    public static function path(string $file): ?string
    {
        if (! in_array($file, ['chatbot.js', 'chatbot.css'], true)) {
            return null;
        }

        $path = dirname(__DIR__, 2) . '/resources/assets/' . $file;

        return is_file($path) ? $path : null;
    }
}
