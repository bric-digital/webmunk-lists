import { test, expect } from '@playwright/test';

/**
 * Comprehensive test suite for webmunk-core list utilities
 * Tests IndexedDB operations, CRUD, pattern matching, and bulk operations
 */

test.describe('List Utilities - Database Initialization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);

    // Clear database before each test
    await page.evaluate(() => window.clearDatabase());
    await page.waitForTimeout(100); // Give time for DB to clear
  });

  test('should initialize database successfully', async ({ page }) => {
    const dbName = await page.evaluate(async () => {
      const db = await window.ListUtilities.initializeListDatabase();
      return db.name;
    });

    expect(dbName).toBe('webmunk_lists');
  });

  test('should create object store with correct indexes', async ({ page }) => {
    const storeInfo = await page.evaluate(async () => {
      const db = await window.ListUtilities.initializeListDatabase();
      const store = db.transaction('list_entries', 'readonly').objectStore('list_entries');

      return {
        hasListNameIndex: store.indexNames.contains('list_name'),
        hasDomainIndex: store.indexNames.contains('domain'),
        hasCompoundIndex: store.indexNames.contains('list_name_domain'),
        hasUniquePatternIndex: store.indexNames.contains('list_name_pattern_type_domain'),
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement
      };
    });

    expect(storeInfo.hasListNameIndex).toBe(true);
    expect(storeInfo.hasDomainIndex).toBe(true);
    expect(storeInfo.hasCompoundIndex).toBe(true);
    expect(storeInfo.hasUniquePatternIndex).toBe(true);
    expect(storeInfo.keyPath).toBe('id');
    expect(storeInfo.autoIncrement).toBe(true);
  });
});

test.describe('List Utilities - CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);
    await page.evaluate(() => window.clearDatabase());
    await page.waitForTimeout(100);
  });

  test('should create a list entry', async ({ page }) => {
    const entryId = await page.evaluate(async () => {
      return await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: {
          category: 'test',
          description: 'Test domain'
        }
      });
    });

    expect(entryId).toBeGreaterThan(0);
  });

  test('should retrieve list entries', async ({ page }) => {
    // Create entries
    await page.evaluate(async () => {
      await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: { category: 'test' }
      });
      await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'test.com',
        pattern_type: 'domain',
        metadata: { category: 'test' }
      });
    });

    const entries = await page.evaluate(async () => {
      return await window.ListUtilities.getListEntries('test-list');
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].domain).toBeTruthy();
    expect(entries[0].metadata.created_at).toBeTruthy();
    expect(entries[0].metadata.updated_at).toBeTruthy();
  });

  test('should update a list entry', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const id = await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: { category: 'original' }
      });

      await window.ListUtilities.updateListEntry(id, {
        metadata: { category: 'updated', description: 'Updated entry' }
      });

      const entries = await window.ListUtilities.getListEntries('test-list');
      return entries[0];
    });

    expect(result.metadata.category).toBe('updated');
    expect(result.metadata.description).toBe('Updated entry');
  });

  test('should delete a list entry', async ({ page }) => {
    const entriesCount = await page.evaluate(async () => {
      const id = await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: {}
      });

      await window.ListUtilities.deleteListEntry(id);
      const entries = await window.ListUtilities.getListEntries('test-list');
      return entries.length;
    });

    expect(entriesCount).toBe(0);
  });

  test('should delete all entries in a list', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Create multiple entries
      await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'example1.com',
        pattern_type: 'domain',
        metadata: {}
      });
      await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'example2.com',
        pattern_type: 'domain',
        metadata: {}
      });
      await window.ListUtilities.createListEntry({
        list_name: 'other-list',
        domain: 'other.com',
        pattern_type: 'domain',
        metadata: {}
      });

      await window.ListUtilities.deleteAllEntriesInList('test-list');

      return {
        testListCount: (await window.ListUtilities.getListEntries('test-list')).length,
        otherListCount: (await window.ListUtilities.getListEntries('other-list')).length
      };
    });

    expect(result.testListCount).toBe(0);
    expect(result.otherListCount).toBe(1);
  });
});

test.describe('List Utilities - Query Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);
    await page.evaluate(() => window.clearDatabase());
    await page.waitForTimeout(100);
  });

  test('should find a specific list entry', async ({ page }) => {
    const found = await page.evaluate(async () => {
      await window.ListUtilities.createListEntry({
        list_name: 'test-list',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: { category: 'findme' }
      });

      return await window.ListUtilities.findListEntry('test-list', 'example.com');
    });

    expect(found).toBeTruthy();
    expect(found.domain).toBe('example.com');
    expect(found.metadata.category).toBe('findme');
  });

  test('should return null for non-existent entry', async ({ page }) => {
    const found = await page.evaluate(async () => {
      return await window.ListUtilities.findListEntry('test-list', 'nonexistent.com');
    });

    expect(found).toBeNull();
  });

  test('should match domain against list', async ({ page }) => {
    const match = await page.evaluate(async () => {
      await window.ListUtilities.createListEntry({
        list_name: 'blocked-sites',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: { category: 'blocked' }
      });

      return await window.ListUtilities.matchDomainAgainstList(
        'https://www.example.com/page',
        'blocked-sites'
      );
    });

    expect(match).toBeTruthy();
    expect(match.domain).toBe('example.com');
  });

  test('should get all unique list names', async ({ page }) => {
    const lists = await page.evaluate(async () => {
      await window.ListUtilities.createListEntry({
        list_name: 'list-a',
        domain: 'a.com',
        pattern_type: 'domain',
        metadata: {}
      });
      await window.ListUtilities.createListEntry({
        list_name: 'list-b',
        domain: 'b.com',
        pattern_type: 'domain',
        metadata: {}
      });
      await window.ListUtilities.createListEntry({
        list_name: 'list-a',
        domain: 'a2.com',
        pattern_type: 'domain',
        metadata: {}
      });

      return await window.ListUtilities.getAllLists();
    });

    expect(lists).toContain('list-a');
    expect(lists).toContain('list-b');
    expect(lists.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('List Utilities - Pattern Matching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);
  });

  test('should match domain pattern correctly', async ({ page }) => {
    const results = await page.evaluate(() => {
      return {
        exactMatch: window.ListUtilities.matchesPattern('https://google.com', 'google.com', 'domain'),
        wwwMatch: window.ListUtilities.matchesPattern('https://www.google.com', 'google.com', 'domain'),
        subdomainMatch: window.ListUtilities.matchesPattern('https://mail.google.com', 'google.com', 'domain'),
        noMatch: window.ListUtilities.matchesPattern('https://facebook.com', 'google.com', 'domain')
      };
    });

    expect(results.exactMatch).toBe(true);
    expect(results.wwwMatch).toBe(true);
    expect(results.subdomainMatch).toBe(true);
    expect(results.noMatch).toBe(false);
  });

  test('should match subdomain wildcard pattern', async ({ page }) => {
    const results = await page.evaluate(() => {
      return {
        exactMatch: window.ListUtilities.matchesPattern('https://google.com', '^https?://([a-z0-9-]+\\.)*google\\.com(/|$)', 'regex'),
        subdomainMatch: window.ListUtilities.matchesPattern('https://mail.google.com', '^https?://([a-z0-9-]+\\.)*google\\.com(/|$)', 'regex'),
        noMatch: window.ListUtilities.matchesPattern('https://facebook.com', '^https?://([a-z0-9-]+\\.)*google\\.com(/|$)', 'regex')
      };
    });

    expect(results.exactMatch).toBe(true);
    expect(results.subdomainMatch).toBe(true);
    expect(results.noMatch).toBe(false);
  });

  test('should match exact URL pattern', async ({ page }) => {
    const results = await page.evaluate(() => {
      return {
        exactMatch: window.ListUtilities.matchesPattern('https://example.com/test', 'https://example.com/test', 'exact_url'),
        noMatch: window.ListUtilities.matchesPattern('https://example.com/other', 'https://example.com/test', 'exact_url')
      };
    });

    expect(results.exactMatch).toBe(true);
    expect(results.noMatch).toBe(false);
  });

  test('should match regex pattern', async ({ page }) => {
    const results = await page.evaluate(() => {
      return {
        match1: window.ListUtilities.matchesPattern('https://test.example.com', '.*\\.example\\.com', 'regex'),
        match2: window.ListUtilities.matchesPattern('https://example.com/admin', '.*/admin', 'regex'),
        noMatch: window.ListUtilities.matchesPattern('https://other.com', '.*\\.example\\.com', 'regex')
      };
    });

    expect(results.match1).toBe(true);
    expect(results.match2).toBe(true);
    expect(results.noMatch).toBe(false);
  });

  test('should handle complex TLDs correctly', async ({ page }) => {
    const results = await page.evaluate(() => {
      return {
        coUk: window.ListUtilities.matchesPattern('https://www.example.co.uk', 'example.co.uk', 'domain'),
        comAu: window.ListUtilities.matchesPattern('https://www.example.com.au', 'example.com.au', 'domain')
      };
    });

    expect(results.coUk).toBe(true);
    expect(results.comAu).toBe(true);
  });
});

test.describe('List Utilities - Bulk Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);
    await page.evaluate(() => window.clearDatabase());
    await page.waitForTimeout(100);
  });

  test('should bulk create entries', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const entries = [
        { list_name: 'bulk-test', domain: 'site1.com', pattern_type: 'domain', metadata: {} },
        { list_name: 'bulk-test', domain: 'site2.com', pattern_type: 'domain', metadata: {} },
        { list_name: 'bulk-test', domain: 'site3.com', pattern_type: 'domain', metadata: {} }
      ];

      const ids = await window.ListUtilities.bulkCreateListEntries(entries);
      const retrieved = await window.ListUtilities.getListEntries('bulk-test');

      return { idsCount: ids.length, entriesCount: retrieved.length };
    });

    expect(result.idsCount).toBe(3);
    expect(result.entriesCount).toBe(3);
  });

  test('should export list to JSON', async ({ page }) => {
    const exported = await page.evaluate(async () => {
      await window.ListUtilities.createListEntry({
        list_name: 'export-test',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: { category: 'test' }
      });

      return await window.ListUtilities.exportList('export-test');
    });

    const data = JSON.parse(exported);
    expect(data.list_name).toBe('export-test');
    expect(data.version).toBe(1);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].domain).toBe('example.com');
    expect(data.exported_at).toBeTruthy();
  });

  test('should import list from JSON', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const importData = {
        list_name: 'import-test',
        version: 1,
        entries: [
          { domain: 'imported1.com', pattern_type: 'domain', metadata: { source: 'import' } },
          { domain: 'imported2.com', pattern_type: 'domain', metadata: { source: 'import' } }
        ]
      };

      const count = await window.ListUtilities.importList('import-test', JSON.stringify(importData));
      const entries = await window.ListUtilities.getListEntries('import-test');

      return { importCount: count, entriesCount: entries.length, firstEntry: entries[0] };
    });

    expect(result.importCount).toBe(2);
    expect(result.entriesCount).toBe(2);
    expect(result.firstEntry.metadata.source).toBe('import');
  });

  test('should replace existing entries on import', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Create initial entries
      await window.ListUtilities.createListEntry({
        list_name: 'replace-test',
        domain: 'old.com',
        pattern_type: 'domain',
        metadata: {}
      });

      // Import new data (should replace)
      const importData = {
        list_name: 'replace-test',
        version: 1,
        entries: [
          { domain: 'new.com', pattern_type: 'domain', metadata: {} }
        ]
      };

      await window.ListUtilities.importList('replace-test', JSON.stringify(importData));
      const entries = await window.ListUtilities.getListEntries('replace-test');

      return { count: entries.length, domain: entries[0].domain };
    });

    expect(result.count).toBe(1);
    expect(result.domain).toBe('new.com');
  });
});

test.describe('List Utilities - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);
    await page.evaluate(() => window.clearDatabase());
    await page.waitForTimeout(100);
  });

  test('should reject duplicate entries', async ({ page }) => {
    const error = await page.evaluate(async () => {
      try {
        await window.ListUtilities.createListEntry({
          list_name: 'dup-test',
          domain: 'duplicate.com',
          pattern_type: 'domain',
          metadata: {}
        });
        await window.ListUtilities.createListEntry({
          list_name: 'dup-test',
          domain: 'duplicate.com',
          pattern_type: 'domain',
          metadata: {}
        });
        return null;
      } catch (err) {
        return err.message;
      }
    });

    expect(error).toBeTruthy();
    expect(error).toContain('Failed to create entry');
  });

  test('should allow same domain string with different pattern types', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.ListUtilities.createListEntry({
        list_name: 'mixed-patterns',
        domain: 'example.com',
        pattern_type: 'domain',
        metadata: {}
      });

      await window.ListUtilities.createListEntry({
        list_name: 'mixed-patterns',
        domain: 'example.com',
        pattern_type: 'host',
        metadata: {}
      });

      const entries = await window.ListUtilities.getListEntries('mixed-patterns');
      return entries.map(e => e.pattern_type).sort();
    });

    expect(result).toEqual(['domain', 'host']);
  });

  test('should allow multiple regex patterns in the same list', async ({ page }) => {
    const count = await page.evaluate(async () => {
      await window.ListUtilities.createListEntry({
        list_name: 'regex-list',
        domain: '.*(tiktok|snapchat).*',
        pattern_type: 'regex',
        metadata: {}
      });

      await window.ListUtilities.createListEntry({
        list_name: 'regex-list',
        domain: '^https?://([a-z0-9-]+\\\\.)*(porn|pron|xxx)(/|$)',
        pattern_type: 'regex',
        metadata: {}
      });

      return (await window.ListUtilities.getListEntries('regex-list')).length;
    });

    expect(count).toBe(2);
  });

  test('should handle invalid regex patterns gracefully', async ({ page }) => {
    const result = await page.evaluate(() => {
      return window.ListUtilities.matchesPattern('https://test.com', '[invalid(regex', 'regex');
    });

    expect(result).toBe(false);
  });

  test('should handle invalid URLs gracefully', async ({ page }) => {
    const result = await page.evaluate(() => {
      return window.ListUtilities.matchesPattern('not-a-url', 'example.com', 'domain');
    });

    expect(result).toBe(false);
  });

  test('should handle update of non-existent entry', async ({ page }) => {
    const error = await page.evaluate(async () => {
      try {
        await window.ListUtilities.updateListEntry(999999, { domain: 'new.com' });
        return null;
      } catch (err) {
        return err.message;
      }
    });

    expect(error).toBeTruthy();
    expect(error).toContain('not found');
  });
});

test.describe('List Utilities - Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-page.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);
    await page.evaluate(() => window.clearDatabase());
    await page.waitForTimeout(100);
  });

  test('should handle 100 entries efficiently', async ({ page }) => {
    const duration = await page.evaluate(async () => {
      const entries = [];
      for (let i = 0; i < 100; i++) {
        entries.push({
          list_name: 'perf-test',
          domain: `domain${i}.com`,
          pattern_type: 'domain',
          metadata: { index: i }
        });
      }

      const start = performance.now();
      await window.ListUtilities.bulkCreateListEntries(entries);
      const end = performance.now();

      return end - start;
    });

    // Should complete in reasonable time (< 1 second)
    expect(duration).toBeLessThan(1000);
  });

  test('should retrieve entries efficiently', async ({ page }) => {
    const duration = await page.evaluate(async () => {
      const entries = [];
      for (let i = 0; i < 100; i++) {
        entries.push({
          list_name: 'retrieve-test',
          domain: `domain${i}.com`,
          pattern_type: 'domain',
          metadata: {}
        });
      }

      await window.ListUtilities.bulkCreateListEntries(entries);

      const start = performance.now();
      await window.ListUtilities.getListEntries('retrieve-test');
      const end = performance.now();

      return end - start;
    });

    // Should retrieve in reasonable time (< 100ms)
    expect(duration).toBeLessThan(100);
  });
});
