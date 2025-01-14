import { test as t, expect } from "@playwright/test";

const customDarkCSS = `
    body {
        background: grey;
    }
`;

class Builder {
  #pageRoute = null;
  #viewName = null;
  #viewport = ["desktop", "mobile"];
  #colorSchemes = ["light", "dark"];
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

  only() {
    this.#onlyThis = true;
    return this;
  }

  forPage(pageRoute, customViewName) {
    this.#pageRoute = pageRoute;
    this.#viewName = customViewName || pageRoute.replace(/\//g, "-");
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

  async #setColorScheme(colorScheme, page) {
    await page.emulateMedia({ colorScheme });

    if (colorScheme === "dark" && this.#customDarkCSS) {
      page.on("load", async () => {
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
      customQuery = "",
      apiUrl,
    } of mockApiPresets.default) {
      await page.route(
        `${
          apiUrl || "https://automationintesting.online"
        }/${endpoint}${customQuery}`,
        async (route) => {
          if (contentType === "text/html") {
            await route.fulfill({
              contentType: "text/html",
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
    if (!this.#pageRoute) throw new Error("Page route is not set");
    const testFunction = this.#onlyThis ? t.only : t;
    const testCases = variantName ? [variantName] : [null];

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
              await expect(page).toHaveScreenshot(
                this.#getReferenceFileFor(viewPort, colorScheme, variant),
                { fullPage: true }
              );
            }
          );
        }
      }
    }

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
      .join("");
  }

  #getReferenceFileFor(viewPort, colorScheme, variantName) {
    return [
      this.#viewName,
      [this.#viewName, viewPort, colorScheme, variantName]
        .filter(Boolean)
        .join("-"),
    ];
  }
}

async function getMockDataFor(id) {
  const data = await import(`./mock-api/${id}/${id}.mock.js`);
  return data;
}

export default Builder;
