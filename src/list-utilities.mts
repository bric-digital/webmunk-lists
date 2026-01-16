/**
 * List Utilities for Webmunk
 *
 * Provides IndexedDB-based domain list management for blocking, allowing,
 * and categorization across webmunk modules.
 */

import psl from 'psl'

// ============================================================================
// Types and Interfaces
// ============================================================================

// Pattern types:
// - domain: matches the registered domain (e.g., "google.com" matches "www.google.com")
// - host: matches the exact hostname (subdomain included), e.g., "health.google.com" only
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
    [key: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export interface SyncResult {
  success: boolean
  listsUpdated: string[]
  errors?: string[]
}

// ============================================================================
// Pattern Validation Helpers
// ============================================================================

function normalizeLeadingWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

/**
 * For pattern_type = 'domain', we ONLY accept a registered domain (eTLD+1), e.g. "google.com".
 *
 * If someone provides a subdomain like "health.google.com", PSL will parse the registered domain
 * as "google.com" — but treating "health.google.com" as a domain-pattern would be misleading
 * and dangerously broad (it would match all of google.com).
 */
function isStrictRegisteredDomain(pattern: string): boolean {
  const candidate = normalizeLeadingWww(pattern.trim())
  // Disallow URLs or host/path strings in 'domain' patterns.
  if (candidate.includes('://') || candidate.includes('/')) return false

  const parsed = psl.parse(candidate)
  if (parsed.error !== undefined) return false
  const domain = (parsed as psl.ParsedDomain).domain
  if (!domain) return false

  // Must equal the registrable domain exactly (no subdomain prefixes).
  return candidate === domain
}

// ============================================================================
// Database Constants
// ============================================================================

const DB_NAME = 'webmunk_lists'
// v2: uniqueness is (list_name, pattern_type, domain). This allows multiple entries
// with the same "domain" string in a list when their semantics differ by pattern_type
// (e.g. 'domain' vs 'host'), and fixes collisions for non-domain patterns.
//
// v3: force upgrade in case a previous v2 build existed with the old unique
// list_name_domain index (Chrome won't rerun onupgradeneeded unless the version changes).
const DB_VERSION = 3
const STORE_NAME = 'list_entries'

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize or open the IndexedDB database for list management
 * Creates the object store and indexes if needed
 */
export async function initializeListDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message}`))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        })
      }

      // Ensure indexes exist / match expected uniqueness.
      // Note: during upgrades, we can safely recreate indexes in-place.
      const transaction = (event.target as IDBOpenDBRequest).transaction
      if (!transaction) return
      const objectStore = transaction.objectStore(STORE_NAME)

      // Basic indexes
      if (!objectStore.indexNames.contains('list_name')) {
        objectStore.createIndex('list_name', 'list_name', { unique: false })
      }
      if (!objectStore.indexNames.contains('domain')) {
        objectStore.createIndex('domain', 'domain', { unique: false })
      }
      if (!objectStore.indexNames.contains('source')) {
        objectStore.createIndex('source', 'source', { unique: false })
      }
      if (!objectStore.indexNames.contains('list_name_source')) {
        objectStore.createIndex('list_name_source', ['list_name', 'source'], { unique: false })
      }

      // Compound indexes:
      // - list_name_domain: non-unique helper index (legacy + convenience queries)
      // - list_name_pattern_type_domain: unique index enforcing per-pattern uniqueness
      if (objectStore.indexNames.contains('list_name_domain')) {
        objectStore.deleteIndex('list_name_domain')
      }
      objectStore.createIndex('list_name_domain', ['list_name', 'domain'], { unique: false })

      if (objectStore.indexNames.contains('list_name_pattern_type_domain')) {
        objectStore.deleteIndex('list_name_pattern_type_domain')
      }
      objectStore.createIndex(
        'list_name_pattern_type_domain',
        ['list_name', 'pattern_type', 'domain'],
        { unique: true }
      )

      console.log('[list-utilities] Ensured object store and indexes')
    }
  })
}

/**
 * Get a database connection
 * Helper function to ensure database is initialized before operations
 */
async function getDatabase(): Promise<IDBDatabase> {
  return initializeListDatabase()
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new list entry
 * Automatically sets created_at and updated_at timestamps
 *
 * @throws Error if entry with same list_name and domain already exists
 */
export async function createListEntry(entry: Omit<ListEntry, 'id'>): Promise<number> {
  if (entry.pattern_type === 'domain' && !isStrictRegisteredDomain(entry.domain)) {
    throw new Error(
      `Invalid 'domain' pattern "${entry.domain}". ` +
      `Use a registered domain like "google.com", or use pattern_type "host"/"regex" for subdomains.`
    )
  }

  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    // Add timestamps
    const entryWithTimestamps = {
      ...entry,
      metadata: {
        ...entry.metadata,
        created_at: entry.metadata.created_at || Date.now(),
        updated_at: Date.now()
      }
    }

    const request = store.add(entryWithTimestamps)

    request.onsuccess = () => {
      resolve(request.result as number)
    }

    request.onerror = () => {
      reject(new Error(`Failed to create entry: ${request.error?.message}`))
    }
  })
}

/**
 * Get all entries for a specific list
 */
export async function getListEntries(listName: string): Promise<ListEntry[]> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('list_name')
    const request = index.getAll(listName)

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(new Error(`Failed to get list entries: ${request.error?.message}`))
    }
  })
}

/**
 * Get entries for a specific list filtered by source
 */
export async function getListEntriesBySource(
  listName: string,
  source: EntrySource
): Promise<ListEntry[]> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('list_name_source')
    const request = index.getAll([listName, source])

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(new Error(`Failed to get list entries by source: ${request.error?.message}`))
    }
  })
}

/**
 * Get all unique list names
 */
export async function getAllLists(): Promise<string[]> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const entries = request.result as ListEntry[]
      const listNames = new Set<string>()

      entries.forEach(entry => {
        listNames.add(entry.list_name)
      })

      resolve(Array.from(listNames).sort())
    }

    request.onerror = () => {
      reject(new Error(`Failed to get all lists: ${request.error?.message}`))
    }
  })
}

/**
 * Update an existing list entry
 * Updates the updated_at timestamp
 */
export async function updateListEntry(id: number, updates: Partial<ListEntry>): Promise<void> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const entry = getRequest.result as ListEntry

      if (!entry) {
        reject(new Error(`Entry with id ${id} not found`))
        return
      }

      const nextDomain = updates.domain ?? entry.domain
      const nextPatternType = updates.pattern_type ?? entry.pattern_type
      if (nextPatternType === 'domain' && !isStrictRegisteredDomain(nextDomain)) {
        reject(
          new Error(
            `Invalid 'domain' pattern "${nextDomain}". ` +
            `Use a registered domain like "google.com", or use pattern_type "host"/"regex" for subdomains.`
          )
        )
        return
      }

      const updatedEntry = {
        ...entry,
        ...updates,
        id, // Ensure ID doesn't change
        metadata: {
          ...entry.metadata,
          ...updates.metadata,
          updated_at: Date.now()
        }
      }

      const putRequest = store.put(updatedEntry)

      putRequest.onsuccess = () => {
        resolve()
      }

      putRequest.onerror = () => {
        reject(new Error(`Failed to update entry: ${putRequest.error?.message}`))
      }
    }

    getRequest.onerror = () => {
      reject(new Error(`Failed to get entry for update: ${getRequest.error?.message}`))
    }
  })
}

/**
 * Delete a list entry by ID
 */
export async function deleteListEntry(id: number): Promise<void> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onerror = () => {
      reject(new Error(`Failed to delete entry (tx): ${transaction.error?.message}`))
    }

    request.onerror = () => {
      reject(new Error(`Failed to delete entry: ${request.error?.message}`))
    }
  })
}

/**
 * Delete all entries in a specific list
 * Optionally filter by source
 */
export async function deleteAllEntriesInList(
  listName: string,
  sourceFilter?: EntrySource
): Promise<void> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onerror = () => {
      reject(new Error(`Failed to delete list entries (tx): ${transaction.error?.message}`))
    }

    if (sourceFilter) {
      // Use compound index to filter by both list_name and source
      const index = store.index('list_name_source')
      const request = index.openCursor(IDBKeyRange.only([listName, sourceFilter]))

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      request.onerror = () => {
        reject(new Error(`Failed to delete list entries: ${request.error?.message}`))
      }
    } else {
      // Delete all entries for this list regardless of source
      const index = store.index('list_name')
      const request = index.openCursor(IDBKeyRange.only(listName))

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      request.onerror = () => {
        reject(new Error(`Failed to delete list entries: ${request.error?.message}`))
      }
    }
  })
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Find a specific entry in a list by domain
 */
export async function findListEntry(listName: string, domain: string): Promise<ListEntry | null> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('list_name_domain')
    const request = index.getAll([listName, domain])

    request.onsuccess = () => {
      const results = request.result
      resolve(Array.isArray(results) && results.length > 0 ? results[0] : null)
    }

    request.onerror = () => {
      reject(new Error(`Failed to find entry: ${request.error?.message}`))
    }
  })
}

/**
 * Find a specific entry in a list by (pattern_type, domain/pattern).
 * This is the schema-level uniqueness key.
 */
export async function findListEntryByPattern(
  listName: string,
  patternType: PatternType,
  domain: string
): Promise<ListEntry | null> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('list_name_pattern_type_domain')
    const request = index.get([listName, patternType, domain])

    request.onsuccess = () => {
      resolve(request.result || null)
    }

    request.onerror = () => {
      reject(new Error(`Failed to find entry: ${request.error?.message}`))
    }
  })
}

/**
 * Match a URL against all entries in a list
 * Returns the first matching entry, or null if no match
 */
export async function matchDomainAgainstList(url: string, listName: string): Promise<ListEntry | null> {
  const entries = await getListEntries(listName)

  console.log(`[webmunk-lists] matchDomainAgainstList`)
  console.log(entries)

  for (const entry of entries) {
    if (matchesPattern(url, entry.domain, entry.pattern_type)) {
      return entry
    }
  }

  return null
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Create multiple list entries in a single transaction
 * Returns array of created IDs
 */
export async function bulkCreateListEntries(entries: Omit<ListEntry, 'id'>[]): Promise<number[]> {
  const db = await getDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const ids: number[] = []
    let completed = 0

    entries.forEach((entry) => {
      const entryWithTimestamps = {
        ...entry,
        metadata: {
          ...entry.metadata,
          created_at: entry.metadata.created_at || Date.now(),
          updated_at: Date.now()
        }
      }

      const request = store.add(entryWithTimestamps)

      request.onsuccess = () => {
        ids.push(request.result as number)
        completed++

        if (completed === entries.length) {
          resolve(ids)
        }
      }

      request.onerror = () => {
        reject(new Error(`Failed to create bulk entry: ${request.error?.message}`))
      }
    })

    // Handle empty array case
    if (entries.length === 0) {
      resolve([])
    }
  })
}

/**
 * Export a list to JSON string
 */
export async function exportList(listName: string): Promise<string> {
  const entries = await getListEntries(listName)

  const exportData = {
    list_name: listName,
    exported_at: Date.now(),
    version: 1,
    entries: entries.map(entry => ({
      domain: entry.domain,
      pattern_type: entry.pattern_type,
      metadata: entry.metadata
    }))
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Import a list from JSON string
 * Clears existing list before importing
 * Returns number of entries imported
 */
export async function importList(listName: string, jsonData: string): Promise<number> {
  try {
    const importData = JSON.parse(jsonData)

    if (!importData.entries || !Array.isArray(importData.entries)) {
      throw new Error('Invalid import data: missing entries array')
    }

    // Clear existing list
    await deleteAllEntriesInList(listName)

    // Import new entries
    const entries: Omit<ListEntry, 'id'>[] = importData.entries.map((entry: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      list_name: listName,
      domain: entry.domain,
      pattern_type: entry.pattern_type,
      metadata: entry.metadata || {}
    }))

    const ids = await bulkCreateListEntries(entries)
    return ids.length
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to import list: ${error.message}`)
    }
    throw new Error('Failed to import list: Unknown error')
  }
}

// ============================================================================
// Configuration Sync (Backend-First)
// ============================================================================

/**
 * Sync lists from backend configuration URL
 * Primary workflow for backend-first architecture
 *
 * @param configUrl - URL to fetch configuration from (AWS Lambda endpoint)
 * @returns SyncResult with success status and updated list names
 */
export async function syncListsFromConfig(configUrl: string): Promise<SyncResult> {
  const errors: string[] = []
  const listsUpdated: string[] = []

  try {
    console.log('[list-utilities] Fetching configuration from:', configUrl)

    // 1. Fetch configuration from backend
    const response = await fetch(configUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch configuration: ${response.status} ${response.statusText}`)
    }

    const config = await response.json()

    // 2. Parse lists section
    if (config.lists && typeof config.lists === 'object') {
      console.log('[list-utilities] Found lists in configuration:', Object.keys(config.lists))
      await parseAndSyncLists(config.lists)
      listsUpdated.push(...Object.keys(config.lists))
    } else {
      console.warn('[list-utilities] No lists section found in configuration')
    }

    return {
      success: true,
      listsUpdated
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[list-utilities] Sync failed:', errorMessage)
    errors.push(errorMessage)

    return {
      success: false,
      listsUpdated,
      errors
    }
  }
}

/**
 * Parse lists configuration and sync each list
 *
 * @param listsConfig - Object with list names as keys and entry arrays as values
 */
export async function parseAndSyncLists(listsConfig: Record<string, any[]>): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const listNames = Object.keys(listsConfig)

  console.log(`[list-utilities] Syncing ${listNames.length} lists`)

  for (const listName of listNames) {
    const entries = listsConfig[listName]

    if (!Array.isArray(entries)) {
      console.warn(`[list-utilities] Invalid entries for list ${listName}, skipping`)
      continue
    }

    try {
      await mergeBackendList(listName, entries)
      console.log(`[list-utilities] Synced list: ${listName} (${entries.length} entries)`)
    } catch (error) {
      console.error(`[list-utilities] Failed to sync list ${listName}:`, error)
    }
  }
}

/**
 * Merge backend entries for a specific list
 * - Deletes all existing 'backend' entries for this list
 * - Inserts new backend entries from configuration
 * - Preserves 'user' and 'generated' entries
 *
 * @param listName - Name of the list to merge
 * @param entries - Array of entry objects from backend configuration
 */
export async function mergeBackendList(listName: string, entries: any[]): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log(`[list-utilities] Merging backend list: ${listName}`)

  // 1. Delete all existing 'backend' entries for this list
  await deleteAllEntriesInList(listName, 'backend')
  console.log(`[list-utilities] Cleared existing backend entries for: ${listName}`)

  // 1b. Ensure uniqueness constraints won't fail when inserting backend entries.
  //
  // Our IndexedDB schema enforces a unique compound index on (list_name, pattern_type, domain) across ALL sources.
  // That means a user-created entry (or a previously imported/generated entry) with the same
  // (pattern_type, domain) would cause backend sync to fail with a uniqueness error.
  //
  // For backend-first sync, we resolve conflicts by removing any existing entry with the same
  // (list_name, pattern_type, domain) before inserting the backend-provided version.
  for (const entry of entries) {
    try {
      const domain = entry?.domain
      const patternType = entry?.pattern_type as PatternType | undefined
      if (typeof domain !== 'string' || domain.length === 0) continue
      if (!patternType) continue

      const existing = await findListEntryByPattern(listName, patternType, domain)
      if (existing?.id !== undefined) {
        await deleteListEntry(existing.id)
        console.log(
          `[list-utilities] Removed conflicting existing entry for ${listName}:${patternType}:${domain} ` +
          `(source=${existing.source ?? 'unknown'})`
        )
      }
    } catch (error) {
      console.error(`[list-utilities] Failed resolving conflict for list ${listName}:`, error)
    }
  }

  // 2. Prepare new backend entries (skip invalid ones, but log loudly)
  const newEntries: Omit<ListEntry, 'id'>[] = []

  for (const entry of entries) {
    const domain = entry?.domain
    const patternType = entry?.pattern_type as PatternType | undefined

    if (typeof domain !== 'string' || domain.length === 0 || !patternType) {
      console.warn(`[list-utilities] Skipping invalid backend list entry (missing domain/pattern_type) for ${listName}:`, entry)
      continue
    }

    if (patternType === 'domain' && !isStrictRegisteredDomain(domain)) {
      console.error(
        `[list-utilities] Invalid backend 'domain' pattern "${domain}" in list "${listName}". ` +
        `This would be misleading/broad. Use a registered domain like "google.com", or pattern_type "host"/"regex" for subdomains. Skipping entry.`
      )
      continue
    }

    newEntries.push({
      list_name: listName,
      domain,
      pattern_type: patternType,
      source: 'backend' as const,
      metadata: {
        ...(entry?.metadata ?? {}),
        sync_timestamp: Date.now()
      }
    })
  }

  // 3. Insert new backend entries
  if (newEntries.length > 0) {
    await bulkCreateListEntries(newEntries)
    console.log(`[list-utilities] Inserted ${newEntries.length} backend entries for: ${listName}`)
  }

  // 4. User-added and generated entries are preserved automatically
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a URL matches a pattern based on pattern type
 * Uses psl library for proper domain parsing (handles complex TLDs)
 */
export function matchesPattern(url: string, pattern: string, patternType: PatternType): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname

    console.log(`[webmunk-lists] matchesPattern("${url}", "${pattern}", "${patternType}")`)

    switch (patternType) {
      case 'domain': {
        // Strict registered-domain match (eTLD+1).
        // If the pattern isn't itself a registered domain, treat it as invalid and do NOT match.
        if (!isStrictRegisteredDomain(pattern)) {
          console.warn(
            `[list-utilities] Invalid 'domain' pattern "${pattern}". ` +
            `Use a registered domain like "google.com", or use pattern_type "host"/"regex" for subdomains.`
          )
          return false
        }

        const urlParsed = psl.parse(hostname)
        if (urlParsed.error !== undefined) return false
        const urlDomain = (urlParsed as psl.ParsedDomain).domain
        if (!urlDomain) return false

        return urlDomain === normalizeLeadingWww(pattern.trim())
      }

      case 'host': {
        // Match exact hostname (including subdomain).
        // Normalize an optional leading "www." to reduce surprises.
        const urlHostNormalized = normalizeLeadingWww(hostname)

        let patternHost = pattern
        // Support patterns provided as full URLs or host/path strings; keep only the host portion.
        if (pattern.includes('://')) {
          patternHost = new URL(pattern).hostname
        } else if (pattern.includes('/')) {
          patternHost = pattern.split('/')[0] ?? ''
        }

        const patternHostNormalized = normalizeLeadingWww(patternHost)
        if (!patternHostNormalized) return false
        return urlHostNormalized === patternHostNormalized
      }

      case 'exact_url': {
        return url === pattern
      }

      case 'host_path_prefix': {
        // Match an anchored host + path prefix, e.g.:
        // - pattern: "google.com/maps" matches "https://www.google.com/maps/..."
        // - pattern: "https://google.com/maps" also supported
        //
        // We normalize an optional leading "www." on both sides for convenience.
        const urlHostNormalized = normalizeLeadingWww(hostname)
        const urlPath = urlObj.pathname

        let patternHost = ''
        let patternPath = ''

        // If pattern is a full URL, use URL parsing. Otherwise treat as "host/path".
        if (pattern.includes('://')) {
          const patternUrl = new URL(pattern)
          patternHost = patternUrl.hostname
          patternPath = patternUrl.pathname
        } else {
          const firstSlashIdx = pattern.indexOf('/')
          if (firstSlashIdx === -1) {
            // No path provided; this pattern type is meant to be host+path.
            return false
          }

          patternHost = pattern.slice(0, firstSlashIdx)
          patternPath = pattern.slice(firstSlashIdx)
        }

        const patternHostNormalized = normalizeLeadingWww(patternHost)
        if (!patternHostNormalized || urlHostNormalized !== patternHostNormalized) {
          return false
        }

        // Ensure patternPath starts with '/' so it aligns with URL.pathname.
        if (!patternPath.startsWith('/')) {
          patternPath = '/' + patternPath
        }

        if (urlPath.startsWith(patternPath)) {
          return true
        }

        // Also allow matching the same path without trailing slash
        // e.g. pattern "/maps/" should match pathname "/maps"
        if (patternPath.endsWith('/')) {
          const withoutTrailingSlash = patternPath.slice(0, -1)
          return urlPath === withoutTrailingSlash
        }

        return false
      }

      case 'regex': {
        try {
          return new RegExp(pattern).test(url)
        } catch (regexError) {
          console.error('[list-utilities] Invalid regex pattern:', pattern, regexError)
          return false
        }
      }

      default:
        console.warn('[list-utilities] Unknown pattern type:', patternType)
        return false
    }
  } catch (error) {
    console.error('[list-utilities] Error matching pattern:', error)
    return false
  }
}
