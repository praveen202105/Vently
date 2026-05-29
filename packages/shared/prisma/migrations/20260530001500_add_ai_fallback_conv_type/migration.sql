-- Add an explicit enum value for any future persisted AI fallback sessions.
-- Current AI chats remain ephemeral and do not create Conversation rows.
ALTER TYPE "ConvType" ADD VALUE 'AI_FALLBACK';
