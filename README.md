# @bric/webmunk-lists

Domain list management for Webmunk extensions. Provides IndexedDB-based storage and matching for blocking, allowing, and categorization of URLs.

Note: This moduel is currently optimized for lists related to the webmunk-history module, however, the plan for the future is for this to be a more general module for managing lists.

## Features

- **Multiple Pattern Types**: Supports domain, host, exact URL, host+path prefix, and regex patterns
- **IndexedDB Storage**: Persistent, browser-native storage for list entries
- **Backend Sync**: Pull list configurations from remote servers
- **Source Tracking**: Distinguish between backend, user-added, and generated entries
- **Pattern Matching**: Efficient URL matching with PSL (Public Suffix List) support
- **Bulk Operations**: Import/export and batch create/update entries

## Installation

```bash
npm install
```

## Usage

### Importing

```typescript
import {
  initializeListDatabase,
  createListEntry,
  getListEntries,
  matchDomainAgainstList,
  syncListsFromConfig
} from '@bric/webmunk-lists'
```

### Pattern Types

All patterns are matched against a full URL string e.g., `https://www.google.com/maps?q=1`. The parts of a url are protocol://subdomain.second-level-domain.top-level-domain/path?query-string. In the example the protocol is https, the subdomain is www and so on.

Note: the field is named `domain`, but for non-`domain` types it stores the pattern (regex) string.

- **domain**: Matches the registrable domain (eTLD+1). Subdomains are not allowed in the pattern.
  - Pattern must be just a domain (no scheme or path).
  - Example pattern: `google.com`
  - Matches: `https://www.google.com/maps`, `http://mail.google.com/inbox`
  - Does not match: `https://google.co.uk`, `https://example.com`
  - Note: a pattern like `mail.google.com` is invalid for `domain` and should use `host` instead.
- **host**: Matches the exact hostname (subdomain included). Leading `www.` is normalized away.
  - Pattern can be `mail.google.com`, `mail.google.com/anything`, or `https://mail.google.com/anything` (host is extracted).
  - Example pattern: `mail.google.com`
  - Matches: `https://mail.google.com/inbox`
  - Does not match: `https://www.google.com`, `https://google.com`
- **exact_url**: Matches the full URL string exactly (scheme, host, path, query, fragment).
  - Example pattern: `https://example.com/login?next=/home`
  - Matches only that exact URL string.
- **host_path_prefix**: Matches host + path prefix (query string is ignored).
  - Pattern can be `example.com/maps` or `https://example.com/maps`.
  - Example pattern: `example.com/maps`
  - Matches: `https://www.example.com/maps`, `https://example.com/maps/dir`
  - Does not match: `https://example.com/map` (prefix mismatch)
- **regex**: JavaScript regular expression applied to the full URL string.
  - Example pattern: `^https://(www\.)?example\.com/.*`
  - Matches any `https://example.com/...` or `https://www.example.com/...`

### Config Format (Backend Sync)

`syncListsFromConfig()` expects a JSON object with a top-level `lists` field. Each key is a list
name, and each value is an array of entries. Each entry must include `domain` (the pattern string)
and `pattern_type`. `metadata` is optional and can include any extra fields.

Example configuration:

```json
{
  "lists": {
    "blocklist": [
      {
        "domain": "example.com",
        "pattern_type": "domain",
        "metadata": { "category": "blocked", "description": "All of example.com" }
      },
      {
        "domain": "mail.example.com",
        "pattern_type": "host",
        "metadata": { "category": "blocked" }
      },
      {
        "domain": "https://example.com/login",
        "pattern_type": "exact_url"
      },
      {
        "domain": "example.com/maps",
        "pattern_type": "host_path_prefix"
      },
      {
        "domain": "^https://(www\\.)?example\\.com/.*",
        "pattern_type": "regex"
      }
    ],
    "allowlist": [
      {
        "domain": "docs.example.com",
        "pattern_type": "host",
        "metadata": { "category": "allowed" }
      }
    ]
  }
}
```

### Basic Operations

```typescript
// Initialize database
await initializeListDatabase()

// Create a list entry
await createListEntry({
  list_name: 'my_blocklist',
  domain: 'example.com',
  pattern_type: 'domain',
  source: 'user',
  metadata: {
    category: 'blocked',
    description: 'Example domain'
  }
})

// Get all entries for a list
const entries = await getListEntries('my_blocklist')

// Check if URL matches any entry in list
const match = await matchDomainAgainstList('https://www.example.com/page', 'my_blocklist')
if (match) {
  console.log('URL matches:', match)
}
```

### Backend Sync

```typescript
// Sync lists from backend configuration
const result = await syncListsFromConfig('https://api.example.com/config')
if (result.success) {
  console.log('Lists updated:', result.listsUpdated)
}
```

## API Reference

### Database Functions

- `initializeListDatabase()`: Initialize or open the IndexedDB database
- `getDatabase()`: Get a database connection (internal helper)

### CRUD Operations

- `createListEntry(entry)`: Create a new list entry
- `getListEntries(listName)`: Get all entries for a list
- `getListEntriesBySource(listName, source)`: Get entries filtered by source
- `getAllLists()`: Get all unique list names
- `updateListEntry(id, updates)`: Update an existing entry
- `deleteListEntry(id)`: Delete a single entry
- `deleteAllEntriesInList(listName, sourceFilter?)`: Delete all entries in a list

### Query Operations

- `findListEntry(listName, domain)`: Find entry by domain (legacy)
- `findListEntryByPattern(listName, patternType, domain)`: Find entry by pattern type and domain
- `matchDomainAgainstList(url, listName)`: Match URL against list entries

### Bulk Operations

- `bulkCreateListEntries(entries)`: Create multiple entries in one transaction
- `exportList(listName)`: Export list to JSON string
- `importList(listName, jsonData)`: Import list from JSON string

### Backend Sync

- `syncListsFromConfig(configUrl)`: Fetch and sync lists from backend
- `parseAndSyncLists(listsConfig)`: Parse and sync list configuration object
- `mergeBackendList(listName, entries)`: Merge backend entries for a specific list

### Pattern Matching

- `matchesPattern(url, pattern, patternType)`: Check if URL matches a pattern

## Types

```typescript
export type PatternType = 'domain' | 'host' | 'exact_url' | 'host_path_prefix' | 'regex'
export type EntrySource = 'backend' | 'user' | 'generated'

export interface ListEntry {
  id?: number
  list_name: string
  domain: string
  pattern_type: PatternType
  source: EntrySource
  metadata: {
    category?: string
    description?: string
    tags?: string[]
    created_at?: number
    updated_at?: number
    sync_version?: number
    sync_timestamp?: number
    [key: string]: any
  }
}

export interface SyncResult {
  success: boolean
  listsUpdated: string[]
  errors?: string[]
}
```

## Development

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## License

Apache 2.0

## Author

Behavioral Research Innovation Center
