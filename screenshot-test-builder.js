// screenshot-test-builder.js

import { test as t, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

// Determine the current file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolvedScriptPath = path.resolve(process.argv[1]);

const customDarkCSS = `
    body {
        background: grey;
    }
`;

class Builder {
  // We'll keep track of all Builder instances so we can inspect them later from CLI:
  static __instances = [];

  #pageRoute = null;
  #viewName = null;
  #viewport = ['desktop', 'mobile'];
  #colorSchemes = ['light', 'dark'];
  #viewPortResolution = {
    desktop: {
      width: 1396,
      height: 480,
    },
    mobile: {
      width: 600,
      height: 480,
    },
  };
  #customDarkCSS = customDarkCSS;
  #onlyThis = false;
  #pageInteraction = null;

  // Keep the state used for each test variant
  #variantsState = {};

  constructor() {
    // Push this instance into the static array
    Builder.__instances.push(this);
  }

  only() {
    this.#onlyThis = true;
    return this;
  }

  forPage(pageRoute, customViewName) {
    this.#pageRoute = pageRoute;
    this.#viewName = customViewName || pageRoute.replace(/\//g, '-');
    return this;
  }

  forViewports(viewport) {
    this.#viewport = viewport;
    return this;
  }

  forColorSchemes(colorSchemes) {
    this.#colorSchemes = colorSchemes;
    return this;
  }

  setPageInteraction(pageInteraction) {
    this.#pageInteraction = pageInteraction;
    return this;
  }

  async #setColorScheme(colorScheme, page) {
    await page.emulateMedia({ colorScheme });

    if (colorScheme === 'dark' && this.#customDarkCSS) {
      page.on('load', async () => {
        await page.addStyleTag({ content: this.#customDarkCSS });
      });
    }
  }

  async #setViewportFor(viewPort, page) {
    await page.setViewportSize(this.#viewPortResolution[viewPort]);
  }

  async #mockApiCall(page) {
    const mockApi = await getMockDataFor(this.#viewName);
    const { mockApiPresets } = mockApi;

    for (const {
      endpoint,
      data,
      contentType,
      customQuery = '',
      apiUrl,
    } of mockApiPresets.default) {
      await page.route(
        `${apiUrl || 'https://automationintesting.online'}/${endpoint}${customQuery}`,
        async (route) => {
          if (contentType === 'text/html') {
            await route.fulfill({
              contentType: 'text/html',
              body: data,
            });
          } else if (contentType?.startsWith('image/')) {
            await route.fulfill({
              contentType: contentType,
              body: data,
            });
          } else {
            await route.fulfill({ json: data });
          }
        }
      );
    }
  }

  test(variantName) {
    if (!this.#pageRoute) throw new Error('Page route is not set');

    const isCli = process.env.SCREENSHOT_TEST_BUILDER_CLI === 'true';

    if (!isCli) {
      const testFunction = this.#onlyThis ? t.only : t;

      const testCases = variantName ? [variantName] : [null];
      const testState = {
        pageInteraction: this.#pageInteraction,
      };

      for (const viewPort of this.#viewport) {
        for (const colorScheme of this.#colorSchemes) {
          for (const variant of testCases) {
            testFunction(
              this.#getTestDescription(viewPort, colorScheme, variant),
              async ({ page }) => {
                await this.#mockApiCall(page);
                await this.#setViewportFor(viewPort, page);
                await this.#setColorScheme(colorScheme, page);
                await page.goto(this.#pageRoute);
                await testState.pageInteraction?.(page);

                await expect(page).toHaveScreenshot(
                  this.#getReferenceFileFor(viewPort, colorScheme, variant),
                  { fullPage: true }
                );
              }
            );
          }
        }
      }
    }

    // Always collect the state regardless of mode
    const usedVariantName = variantName || 'main';
    this.#variantsState[usedVariantName] = this.exportState();

    this.#resetState();
    return this;
  }

  #getTestDescription(viewPort, colorScheme, variantName) {
    return [
      this.#viewName,
      ` in @${viewPort} viewport`,
      ` with @${colorScheme} color scheme`,
      variantName && `, @${variantName} variant`,
    ]
      .filter(Boolean)
      .join('');
  }

  #getReferenceFileFor(viewPort, colorScheme, variantName) {
    return [
      this.#viewName,
      [this.#viewName, viewPort, colorScheme, variantName]
        .filter(Boolean)
        .join('-'),
    ];
  }

  #resetState() {
    // This is part of the existing logic. We do not remove or alter it.
    this.#pageInteraction = null;
  }

  // Exports a snapshot of the current fields, stringifying any functions
  exportState() {
    return {
      pageRoute: this.#pageRoute,
      viewName: this.#viewName,
      viewport: this.#viewport,
      colorSchemes: this.#colorSchemes,
      viewPortResolution: this.#viewPortResolution,
      customDarkCSS: this.#customDarkCSS,
      onlyThis: this.#onlyThis,
      pageInteraction: this.#pageInteraction
        ? this.#pageInteraction.toString()
        : null,
    };
  }

  // For external code (CLI block), get the variant’s final saved state
  getVariantState(variantName) {
    const nameOrDefault = variantName || 'main';
    return this.#variantsState[nameOrDefault] || null;
  }
}

// Simulate the original function that loads mock data
async function getMockDataFor(id) {
  const data = await import(`./mock-api/${id}/${id}.mock.js`);
  return data;
}

export default Builder;

/**
 * CLI usage:
 *   node screenshot-test-builder.js path/to/spec.js someVariant --state
 *
 * This will:
 *   - Import the spec file, which creates and configures the builder(s).
 *   - Then look for a builder that has the named variant’s state and print it.
 */
if (__filename === resolvedScriptPath) {
  (async () => {
    const [, , specFile, variantArg, maybeStateFlag] = process.argv;

    // We expect something like:
    //   node screenshot-test-builder.js tests/home/home.spec.js bookings --state

    if (maybeStateFlag === '--state') {
      if (!specFile) {
        console.error('No spec file provided.');
        process.exit(1);
      }

      // Set environment variable before importing the spec file
      process.env.SCREENSHOT_TEST_BUILDER_CLI = 'true';

      try {
        // Dynamically import the test spec so it runs all builder code
        await import(path.resolve(specFile));
      } catch (err) {
        console.error('Failed to import spec file:', err);
        process.exit(1);
      }

      // Now that the spec file has run, we can see if any builder had the variant
      let found = null;
      for (const instance of Builder.__instances) {
        const s = instance.getVariantState(variantArg);
        if (s) {
          found = s;
          break;
        }
      }

      if (!found) {
        console.error(
          `No state found for variant "${
            variantArg || 'main'
          }" in file: ${specFile}`
        );
        process.exit(1);
      }

      // Print it nicely
      console.log(JSON.stringify(found, null, 2));
      process.exit(0);
    }
  })();
}
