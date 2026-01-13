# @bric/webmunk-lists

Domain list management for Webmunk extensions. Provides IndexedDB-based storage and matching for blocking, allowing, and categorization of domains.

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

- **domain**: Matches registered domain (e.g., "google.com" matches "www.google.com", "mail.google.com")
- **host**: Matches exact hostname including subdomain (e.g., "mail.google.com" only)
- **exact_url**: Matches the complete URL exactly
- **host_path_prefix**: Matches host and path prefix (e.g., "google.com/maps")
- **regex**: Matches using regular expression

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
