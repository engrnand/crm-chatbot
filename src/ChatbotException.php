<?php

namespace Orbixedge\CrmChatbot;

use RuntimeException;

/**
 * A failure the visitor is allowed to see. The message is shown in the chat
 * as-is. $reason is the CRM's machine code (lead_required, limit_minute, ...)
 * so the widget can react to it.
 */
class ChatbotException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 503, public readonly string $reason = 'unavailable')
    {
        parent::__construct($message);
    }
}
