//@ts-check
import ScreenshotTest from '../../screenshotTestBuilder.js';
new ScreenshotTest()
  .forPage('/', 'home')
  .test()
  .setPageInteraction(async (page) => {
    await page
      .getByRole('button', {
        name: 'Book this room',
      })
      .nth(1)
      .click();
    await page.getByPlaceholder('Firstname').click();
    await page.getByPlaceholder('Firstname').fill('kk');
  })
  .test('booking')
  .test('anotherVariant')
  .setPageInteraction(async (page) => {
    await page.getByTestId('ContactName').fill('hihihi');
  })
  .test('newInteraction');
