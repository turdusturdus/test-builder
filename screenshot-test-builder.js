import { test as t, expect } from "@playwright/test";

const DEFAULT_API_URL = "https://widgets.api.pl/test/api/equities/widgets";

class Builder {
  #widgetId = null;
  #clients = ["default_client"];
  #viewport = ["desktop", "mobile"];
  #colorSchemes = ["default"];
  #componentName = null;
  #widgetProps = null;
  #apiMocks = [];
  #pageInteraction = null;
  #onlyThis = false;
  #waitFor = [];
  #widgetState = "default";
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

  forWidget(widgetId) {
    this.#widgetId = widgetId;
    this.#elementTestId = null;
    return this;
  }

  forComponent(componentName, widgetId) {
    this.#componentName = componentName;
    this.#widgetId = widgetId;
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

  forClients(clients) {
    this.#clients = clients;
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

  withWidgetProps(newPropsOrCallback) {
    if (typeof newPropsOrCallback === "function") {
      this.#widgetProps = newPropsOrCallback(this.#widgetProps);
    } else {
      this.#widgetProps = newPropsOrCallback;
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

  setWidgetState(widgetState) {
    this.#widgetState = widgetState;
    return this;
  }

  withTitle(title) {
    this.#title = title;
    return this;
  }

  test(variantName) {
    if (!this.#widgetId) throw new Error("Widget ID is not set");
    const playwrightTest = this.#onlyThis ? t.only : t;

    const testState = {
      widgetProps: this.#widgetProps,
      pageInteraction: this.#pageInteraction,
      widgetState: this.#widgetState,
      elementTestId: this.#elementTestId,
      waitFor: this.#waitFor,
    };

    for (const client of this.#clients) {
      for (const viewPort of this.#viewport) {
        for (const colorScheme of this.#colorSchemes) {
          playwrightTest(
            this.#getTestDescriptionFor(
              client,
              viewPort,
              colorScheme,
              testState.widgetState,
              variantName,
              testState.elementTestId,
              this.#title
            ),
            async ({ page }) => {
              await this.#mockCurrentDate(page);

              await this.#mockApiCall(page, testState.widgetState);

              await this.#setViewportFor(viewPort, page);

              await this.#addWidgetToPage(
                client,
                page,
                testState.widgetProps,
                colorScheme
              );
              await this.#loadPage(page, colorScheme, testState.waitFor);

              if (testState.pageInteraction) {
                await testState.pageInteraction(page);
              }

              expect(
                await this.#takeWidgetScreenshot(page, testState.elementTestId)
              ).toMatchSnapshot(
                this.#getReferenceFileFor([
                  client,
                  viewPort,
                  colorScheme !== "default" && colorScheme,
                  testState.widgetState !== "default" && testState.widgetState,
                  testState.elementTestId,
                  variantName,
                ])
              );
            }
          );
        }
      }
    }

    this.#resetState();
    return this;
  }

  #getTestDescriptionFor(
    client,
    viewPort,
    colorScheme,
    widgetState,
    variantName,
    elementTestId,
    title
  ) {
    return [
      `${title ? title : ""}`,
      this.#componentName || this.#widgetId,
      ` for client @${client}`,
      ` in @${viewPort} viewPort`,
      colorScheme !== "default" && `, @${colorScheme} color scheme`,
      widgetState !== "default" && `, @${widgetState} state`,
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

  async #mockApiCall(page, widgetState) {
    if (widgetState === "no-response") return;

    let mockApi;

    try {
      mockApi = await import(`../../mock-api/${this.#widgetId}.mock`);
    } catch (error) {
      return;
    }

    const { mockApiPresets } = mockApi;

    for (const {
      endpoint,
      data,
      contentType,
      customQuery = "",
      apiUrl,
    } of mockApiPresets.e2e[widgetState === "no-data" ? "noData" : "default"]) {
      await page.route(
        `${apiUrl || DEFAULT_API_URL}/${endpoint}${customQuery}*`,
        async (route) => {
          if (widgetState === "loading") {
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
  }

  async #setViewportFor(viewPort, page) {
    await page.setViewportSize(this.#viewPortResolution[viewPort]);
  }

  async #addWidgetToPage(client, page, widgetProps, colorScheme) {
    await page.addInitScript({
      content: `
            window.widget = ${JSON.stringify({
              "widget-id": this.#widgetId,
              "no-animations": "1",
              "dark-mode": colorScheme === "dark" ? "on" : "off",
              ...widgetProps,
            })}; 
            window.CONFIG_CLIENT_ID = ${JSON.stringify(client)};
          `,
    });
  }

  async #loadPage(page, colorScheme, waitFor) {
    await page.goto("./");
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
    if (waitFor.includes("canvas")) {
      await page.waitForSelector("canvas");
    }
    if (waitFor.includes("timeout")) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  async #takeWidgetScreenshot(page, elementTestId) {
    const element = await page
      .locator(
        this.#componentName
          ? `[data-component=${this.#componentName}]`
          : elementTestId
          ? `[data-testid=${elementTestId}]`
          : `[widget-id=${this.#widgetId}]`
      )
      .first();

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
      this.#componentName || this.#widgetId,
      [this.#componentName || this.#widgetId, ...parts.filter(Boolean)].join(
        "-"
      ),
    ];
  }

  #resetState() {
    this.#widgetState = "default";
  }
}

export default Builder;

// STB screenshot test builder v. 1.0
