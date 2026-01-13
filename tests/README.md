# Webmunk List Utilities Test Suite

Comprehensive automated and manual tests for the @bric/webmunk-lists module.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Run tests
npm test
```

## Test Structure

- `specs/list-utilities.spec.js` - Playwright test suite (60+ tests)
- `src/test-page.html` - Test HTML page for manual testing
- `scripts/build-test-bundle.js` - Bundles list-utilities for browser testing

## Available Scripts

- `npm test` - Run all tests in headless mode
- `npm run test:headed` - Run tests with browser visible
- `npm run test:ui` - Open Playwright UI mode for interactive testing
- `npm run test:debug` - Run tests in debug mode

## Test Coverage

The test suite covers:

- **Database Initialization** (2 tests)
- **CRUD Operations** (5 tests)
- **Query Operations** (4 tests)
- **Pattern Matching** (4 tests) - domain, host, exact_url, regex
- **Bulk Operations** (4 tests)
- **Error Handling** (4 tests)
- **Performance** (2 tests)

## Manual Testing

Open `tests/src/test-page.html` in a browser for interactive manual testing of list utilities functionality.

## CI/CD Integration

Tests are configured to run in CircleCI. The configuration in `.circleci/config.yml` will:

1. Install dependencies
2. Install Chromium
3. Build test bundle
4. Run Playwright tests

## Requirements

- Node.js 18+
- Python 3 (for local web server during tests)
