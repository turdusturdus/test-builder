import { test, expect } from "@playwright/test";

class Builder {
  #pageRoute = null;
  #viewName = null;

  forPage(pageRoute, customViewName) {
    this.#pageRoute = pageRoute;
    this.#viewName = customViewName || pageRoute.replace(/\//g, "-");
    return this;
  }

  test(variantName) {
    const testCases = variantName ? [variantName] : [null];

    for (const variant of testCases) {
      test(this.#getTestDescription(variant), async ({ page }) => {
        await page.goto(this.#pageRoute);

        await expect(page).toHaveScreenshot(this.#getReferenceFile(variant));
      
      });
    }

    return this;
  }

  #getTestDescription(variantName) {
    return [
      `Compare screenshot for`,
      this.#viewName,
      variantName && `, @${variantName} variant`
    ].filter(Boolean).join(' ');
  }

  #getReferenceFile(variantName) {
    return [
      this.#viewName,
      variantName ? `${this.#viewName}-${variantName}` : this.#viewName
    ];
  }
}

export default Builder;