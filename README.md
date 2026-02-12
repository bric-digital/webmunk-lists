# webmunk-lists

Core list storage and URL matching utilities for Webmunk browser extensions.

## Overview

**webmunk-lists** provides:

- IndexedDB-backed storage for domain/URL pattern lists
- URL matching against multiple pattern types
- List management API (add, remove, query entries)
- Support for backend-synced and user-defined entries

This module is the storage/matching layer. For the UI and sync functionality, see [webmunk-lists-front-end](https://github.com/bric-digital/webmunk-lists-front-end).

## Configuration

This module reads from the `lists` section of the backend config.

### Schema

The `lists` object contains named lists, where each list is an array of pattern entries:

```
{
  "lists": {
    "<list_name>": [ <entry>, <entry>, ... ],
    "<list_name>": [ ... ]
  }
}
```

### Entry Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain` | string | Yes | The pattern to match (despite the name, stores any pattern type) |
| `pattern_type` | string | Yes | One of: `domain`, `host`, `exact_url`, `host_path_prefix`, `regex` |
| `metadata` | object | No | Arbitrary metadata (e.g., `category`, `name`, `description`) |

### Pattern Types

| Pattern Type | Description | Example Pattern | Matches |
|--------------|-------------|-----------------|---------|
| `domain` | Registered domain only (eTLD+1). Uses Public Suffix List. | `google.com` | `https://www.google.com/maps`, `https://mail.google.com` |
| `host` | Exact hostname match. Leading `www.` is normalized. | `mail.google.com` | `https://mail.google.com/inbox` |
| `exact_url` | Full URL must match exactly. | `https://example.com/login` | Only that exact URL |
| `host_path_prefix` | Hostname + path prefix. Query string ignored. | `example.com/maps` | `https://example.com/maps/directions` |
| `regex` | JavaScript regex applied to full URL. | `^https://(www\.)?example\.com/.*` | `https://example.com/anything` |

### Example

```json
{
  "lists": {
    "serp": [
      {
        "domain": "google.com/search",
        "pattern_type": "host_path_prefix",
        "metadata": { "name": "Google Search", "category": "serp" }
      },
      {
        "domain": "bing.com/search",
        "pattern_type": "host_path_prefix",
        "metadata": { "name": "Bing Search", "category": "serp" }
      },
      {
        "domain": "^https?://(www\\.)?duckduckgo\\.com/.*[?&]q=",
        "pattern_type": "regex",
        "metadata": { "name": "DuckDuckGo Search", "category": "serp" }
      }
    ],
    "news-sites": [
      {
        "domain": "nytimes.com",
        "pattern_type": "domain",
        "metadata": { "name": "New York Times", "category": "news" }
      },
      {
        "domain": "cnn.com",
        "pattern_type": "domain",
        "metadata": { "name": "CNN", "category": "news" }
      }
    ],
    "ai-chatbots": [
      {
        "domain": "chatgpt.com",
        "pattern_type": "domain",
        "metadata": { "name": "ChatGPT", "category": "AI Chatbot" }
      },
      {
        "domain": "perplexity.ai",
        "pattern_type": "domain",
        "metadata": { "name": "Perplexity", "category": "AI Chatbot" }
      },
      {
        "domain": "claude.ai",
        "pattern_type": "domain",
        "metadata": { "name": "Claude", "category": "AI Chatbot" }
      }
    ],
    "history-filter": [
      {
        "domain": "msn.com/en-us/play",
        "pattern_type": "host_path_prefix",
        "metadata": { "category": "entertainment" }
      }
    ]
  }
}
```

### How Lists Are Used

Lists are referenced by name in other module configurations:

- **webmunk-history**: Uses `allow_lists`, `filter_lists`, `category_lists` to control what history is collected
- **webmunk-lists-front-end**: Displays and manages list entries

### Entry Sources

Each entry has a `source` field (set automatically):

| Source | Description |
|--------|-------------|
| `backend` | Synced from server configuration |
| `user` | Added manually by the user via UI |
| `generated` | Created programmatically (e.g., top domains) |

Backend sync replaces only `backend` entries, preserving `user` and `generated` entries.

## Data Storage

- **Database**: IndexedDB database `webmunk_lists`
- **Store**: `list_entries`
- **Uniqueness**: Entries are unique on `(list_name, pattern_type, domain)`

## Installation

Add to your extension's `package.json` dependencies:

```json
{
  "dependencies": {
    "@bric/webmunk-lists": "github:bric-digital/webmunk-lists#main"
  }
}
```

Then run `npm install`.

## API

```typescript
import { matchUrl, getListEntries, addEntry } from '@bric/webmunk-lists'

// Check if URL matches any entry in a list
const match = await matchUrl('https://www.google.com/search?q=test', 'serp')

// Get all entries for a list
const entries = await getListEntries('news-sites')

// Add a user entry
await addEntry({
  list_name: 'news-sites',
  domain: 'example-news.com',
  pattern_type: 'domain',
  source: 'user',
  metadata: { name: 'Example News' }
})
```

## License

Apache 2.0
