//@ts-check
import ScreenshotTest from "../screenshot-test-builder";

new ScreenshotTest()
  .forWidget("widget2")
  .withWidgetProps({
    id: "PLZBMZC00019",
  })
  .setWidgetState("loading")
  .test()
  .setPageInteraction(async (page) => {
    await page
      .getByRole("row", { name: "Nazwa spółki" })
      .getByTestId("dropdown-menu")
      .click();
  })
  .test()
  .forElement("element1")
  .setPageInteraction(async (page) => {
    await page;
    await page
      .getByRole("row", { name: "Cena zakupu jednej akcji" })
      .getByRole("textbox")
      .fill("abc");
  })
  .test();
