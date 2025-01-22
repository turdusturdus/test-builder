import { test as t, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const resolvedScriptPath = path.resolve(process.argv[1]);

class Builder {
  static __instances = [];

  #pageRoute = null;
  #viewName = null;
  #viewport = ['desktop', 'mobile'];
  #colorSchemes = ['light', 'dark'];
  #viewPortResolution = config.defaultViewPortResolution;
  #customDarkCSS = config.defaultCustomDarkCSS;
  #onlyThis = false;
  #pageInteraction = null;

  #variantsState = {};

  constructor() {
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
        `${apiUrl || config.baseApiUrl}/${endpoint}${customQuery}`,
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
    this.#pageInteraction = null;
  }

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

  getVariantState(variantName) {
    const nameOrDefault = variantName || 'main';
    return this.#variantsState[nameOrDefault] || null;
  }
}

async function getMockDataFor(id) {
  const data = await import(`./mock-api/${id}/${id}.mock.js`);
  return data;
}

export default Builder;