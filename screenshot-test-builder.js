import { test as t, expect } from '@playwright/test';

class Builder {
  #pageRoute = null;
  #viewName = null;
  #viewport = ['desktop', 'mobile'];
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

  forPage(pageRoute, customViewName) {
    this.#pageRoute = pageRoute;
    this.#viewName = customViewName || pageRoute.replace(/\//g, "-");
    return this;
  }

  forViewports(viewport) {
    this.#viewport = viewport;
    return this;
  }

  async #setViewportFor(viewPort, page) {
    await page.setViewportSize(this.#viewPortResolution[viewPort]);
  }

  test(variantName) {
    if (!this.#pageRoute) throw new Error('Page route is not set');
    const testCases = variantName ? [variantName] : [null];

    for (const viewPort of this.#viewport) {
      for (const variant of testCases) {
        t(
          this.#getTestDescription(viewPort, variant),
          async ({ page }) => {
            await this.#setViewportFor(viewPort, page);
            await page.goto(this.#pageRoute);
            await expect(page).toHaveScreenshot(
              this.#getReferenceFileFor(viewPort, variant)
            );
          }
        );
      }
    }

    return this;
  }

  #getTestDescription(viewPort, variantName) {
    return [
      this.#viewName,
      ` in @${viewPort} viewport`,
      variantName && `, @${variantName} variant`
    ]
      .filter(Boolean)
      .join('');
  }

  #getReferenceFileFor(viewPort, variantName) {
    return [
      this.#viewName,
      [this.#viewName, viewPort, variantName].filter(Boolean).join('-')
    ];
  }
}

export default Builder;