//@ts-check
import ScreenshotTest from '../../screenshot-test-builder';

new ScreenshotTest()
  .forPage('/', 'home')
  .only()
  .test()
  .setPageInteraction(async (page) => {
    await page.getByRole('button', { name: 'Book this room' }).click();
  })
  .test('booking')
  .test('anotherVariant')
  .setPageInteraction(async (page) => {
    await page.getByTestId('ContactName').fill('hihihi');
  })
  .test('newInteraction');
