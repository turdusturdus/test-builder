import { test, expect } from "@playwright/test";

class Builder {
  forPage(pageRoute, customViewName) {
    this.pageRoute = pageRoute;
    this.viewName = customViewName || pageRoute.replace(/\//g, "-");
    return this;
  }

  test() {
    test(`Compare screenshot for ${this.viewName}`, async ({ page }) => {
      await page.goto(this.pageRoute);

      await expect(page).toHaveScreenshot([this.viewName, this.viewName]);
    });
  }
}

export default Builder;