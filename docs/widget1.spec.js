//@ts-check
import ScreenshotTest from "../screenshot-test-builder";

new ScreenshotTest()
  .forWidget("widget1")
  .withWidgetProps({
    "bond-name": "WS0447",
  })
  .forViewports(["desktop"])
  .setPageInteraction(async (page) => {
    await page.getByTestId("icon-plus").click();
  })
  .test()
  .forViewports(["mobile"])
  .setPageInteraction(async (page) => {
    await page.getByText("dodaj").click();
  })
  .test()
  .setPageInteraction()
  .forViewports(["desktop", "mobile"])
  .setWidgetState("no-data")
  .test()
  .setWidgetState("loading")
  .test();
