//@ts-check
import ScreenshotTest from "../screenshot-test-builder";

new ScreenshotTest()
  .forComponent("component1", "widget3")
  .forClients(["client1", "client2"])
  .withWidgetProps({
    "page-size": "10",
    "profile-url": "/test",
    "self-url": "/test",
    "show-tabs": "1",
    "show-toolbar": "1",
    limit: "10",
  })
  .setPageInteraction(async (page) => {
    await page.type('input[placeholder="szukaj"]', "Some text");
    await page.keyboard.press("Enter");

    await page.waitForSelector("text=znaleziono");

    await new Promise((resolve) => setTimeout(resolve, 2000));
  })
  .test("variant1")
  .setPageInteraction(async (page) => {
    await page.click("text=/zmień datę/i");

    await page.waitForSelector("text=30");
  })
  .test("variant2");
