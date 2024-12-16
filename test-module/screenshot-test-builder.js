import { test as t, expect } from "@playwright/test";

const DEFAULT_API_URL = "https://widgets.api.pl/test/api/equities/widgets";

class Builder {
  #pageRoute = null;
  #viewName = null;
  #viewport = ["desktop", "mobile"];
  #colorSchemes = ["default"];
  #pageQuery = null;
  #apiMocks = [];
  #pageInteraction = null;
  #onlyThis = false;
  #waitFor = [];
  #pageState = "default";
  #elementTestId = null;
  #title = null;
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

  forPage(pageRoute, customViewName = null) {
    this.#pageRoute = pageRoute;
    this.#viewName = customViewName
      || pageRoute.replace(/\//g, "-");
    this.#elementTestId = null;
    return this;
  }

  forElement(elementTestId) {
    this.#elementTestId = elementTestId;
    return this;
  }

  only() {
    this.#onlyThis = true;
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

  withPageQuery(newQueryOrCallback) {
    if (typeof newQueryOrCallback === "function") {
      this.#pageQuery = newQueryOrCallback(this.#pageQuery);
    } else {
      this.#pageQuery = newQueryOrCallback;
    }
    return this;
  }

  withRouteMock(affix, data, contentType) {
    this.#apiMocks = this.#apiMocks.filter((mock) => mock.endpoint !== affix);
    this.#apiMocks = [
      ...this.#apiMocks,
      {
        endpoint: affix,
        mockData: data,
        contentType: contentType,
      },
    ];
    return this;
  }

  withWaitFor(waitFor) {
    this.#waitFor = waitFor;
    return this;
  }

  setPageInteraction(pageInteraction) {
    this.#pageInteraction = pageInteraction;
    return this;
  }

  setPageState(pageState) {
    this.#pageState = pageState;
    return this;
  }

  withTitle(title) {
    this.#title = title;
    return this;
  }

  test(variantName) {
    if (!this.#pageRoute) throw new Error("Page route is not set");
    const playwrightTest = this.#onlyThis ? t.only : t;

    const testState = {
      pageQuery: this.#pageQuery,
      pageInteraction: this.#pageInteraction,
      pageState: this.#pageState,
      elementTestId: this.#elementTestId,
      waitFor: this.#waitFor,
    };

    for (const viewPort of this.#viewport) {
      for (const colorScheme of this.#colorSchemes) {
        playwrightTest(
          this.#getTestDescriptionFor(
            viewPort,
            colorScheme,
            testState.pageState,
            variantName,
            testState.elementTestId,
            this.#title
          ),
          async ({ page }) => {
            await this.#mockCurrentDate(page);

            await this.#mockApiCall(page, testState.pageState);

            await this.#setViewportFor(viewPort, page);

            await this.#loadPage(page, colorScheme, testState);

            if (testState.pageInteraction) {
              await testState.pageInteraction(page);
            }

            expect(
              await this.#takePageScreenshot(page, testState.elementTestId)
            ).toMatchSnapshot(
              this.#getReferenceFileFor([
                viewPort,
                colorScheme !== "default" && colorScheme,
                testState.pageState !== "default" && testState.pageState,
                testState.elementTestId,
                variantName,
              ])
            );
          }
        );
      }
    }

    this.#resetState();
    return this;
  }

  #getTestDescriptionFor(
    viewPort,
    colorScheme,
    pageState,
    variantName,
    elementTestId,
    title
  ) {
    return [
      `${title ? title : ""}`,
      this.#viewName,
      ` in @${viewPort} viewport`,
      colorScheme !== "default" && `, @${colorScheme} color scheme`,
      pageState !== "default" && `, @${pageState} state`,
      variantName && `, @${variantName} variant`,
      elementTestId && `, @${elementTestId} element`,
    ]
      .filter(Boolean)
      .join("");
  }

  async #mockCurrentDate(page) {
    const mockDate = new Date(Date.UTC(2023, 7, 4)).valueOf();
    await page.addInitScript(`{
              Date = class extends Date {
                constructor(...args) {
                  if (args.length === 0) {
                    super(${mockDate});
                  } else {
                    super(...args);
                  }
                }
              }
              const __DateNowOffset = ${mockDate} - Date.now();
              const __DateNow = Date.now;
              Date.now = () => __DateNow() + __DateNowOffset;
            }`);
  }

  async #mockApiCall(page, pageState) {
    if (pageState === "no-response") return;

    let mockApi;

    try {
      mockApi = await import(`../../mock-api/${this.#viewName}.mock`);
    } catch (error) {
      // If no mock file found, just skip
      return;
    }

    const { mockApiPresets } = mockApi;

    // Use "noData" or "default" scenario from mock file
    const scenario = pageState === "no-data" ? "noData" : "default";

    for (const {
      endpoint,
      data,
      contentType,
      customQuery = "",
      apiUrl,
    } of mockApiPresets.e2e[scenario]) {
      await page.route(
        `${apiUrl || DEFAULT_API_URL}/${endpoint}${customQuery}*`,
        async (route) => {
          if (pageState === "loading") {
            return;
          } else if (contentType === "text/html") {
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

    // Additional mocks from `withRouteMock`
    for (const { endpoint, mockData, contentType } of this.#apiMocks) {
      await page.route(`${DEFAULT_API_URL}/${endpoint}*`, async (route) => {
        if (contentType === "text/html") {
          await route.fulfill({
            contentType: "text/html",
            body: mockData,
          });
        } else {
          await route.fulfill({ json: mockData });
        }
      });
    }
  }

  async #setViewportFor(viewPort, page) {
    await page.setViewportSize(this.#viewPortResolution[viewPort]);
  }

  #formatQueryParams(queryObj) {
    if (!queryObj) return "";
    const params = new URLSearchParams(queryObj);
    return `?${params.toString()}`;
  }

  async #loadPage(page, colorScheme, testState) {
    const queryString = this.#formatQueryParams(testState.pageQuery);
    await page.goto(`./${this.#pageRoute}${queryString}`);

    if (colorScheme === "dark") {
      await page.addStyleTag({
        content: `
              body {
                background-color: #1f2124 !important;
              }
            `,
      });
    }

    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("load");

    if (testState.waitFor.includes("canvas")) {
      await page.waitForSelector("canvas");
    }
    if (testState.waitFor.includes("timeout")) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  async #takePageScreenshot(page, elementTestId) {
    const selector = elementTestId ? `[data-testid=${elementTestId}]` : "body";

    const element = await page.locator(selector).first();

    if (elementTestId) {
      const boundingBox = await element.boundingBox();
      const padding = 10;
      const screenshotOptions = {
        clip: {
          x: boundingBox.x - padding,
          y: boundingBox.y - padding,
          width: boundingBox.width + 2 * padding,
          height: boundingBox.height + 2 * padding,
        },
      };
      return await page.screenshot(screenshotOptions);
    } else {
      return await element.screenshot();
    }
  }

  #getReferenceFileFor(parts) {
    return [
      this.#viewName,
      [this.#viewName, ...parts.filter(Boolean)].join("-"),
    ];
  }

  #resetState() {
    this.#pageState = "default";
  }
}

export default Builder;

// STB screenshot test builder (page view version)
