import OpenAI from 'openai'

let _client: OpenAI | null = null

/**
 * Lazy-initialized OpenAI client. Reads OPENAI_API_KEY at first use so that
 * importing this module in environments without the key (build time, tests)
 * doesn't crash.
 */
export function getOpenAI(): OpenAI {
  if (_client) return _client

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  _client = new OpenAI({ apiKey })
  return _client
}

export const CHAT_MODEL = 'gpt-4o-mini'
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536
