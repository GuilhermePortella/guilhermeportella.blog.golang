module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
      startServerCommand: 'python3 -u -m http.server 4173 --bind 127.0.0.1 --directory dist',
      startServerReadyPattern: 'Serving HTTP',
      startServerReadyTimeout: 10000,
      url: [
        'http://127.0.0.1:4173/',
        'http://127.0.0.1:4173/blog/',
        'http://127.0.0.1:4173/blog/um-comeco-sem-pressa/',
        'http://127.0.0.1:4173/projetos/',
      ],
      settings: {
        chromeFlags: '--headless=new --no-sandbox --disable-dev-shm-usage',
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', {minScore: 0.95}],
        'categories:best-practices': ['error', {minScore: 0.95}],
        'categories:seo': ['error', {minScore: 1}],
        'categories:performance': ['warn', {minScore: 0.8}],
        'first-contentful-paint': ['warn', {maxNumericValue: 2200}],
        'largest-contentful-paint': ['warn', {maxNumericValue: 3000}],
        'cumulative-layout-shift': ['error', {maxNumericValue: 0.1}],
        'total-blocking-time': ['warn', {maxNumericValue: 300}],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: 'tmp/lighthouse',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%',
    },
  },
};
