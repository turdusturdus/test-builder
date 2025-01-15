//@ts-check
import ScreenshotTest from '../../screenshot-test-builder';

new ScreenshotTest()
  .forPage('/', 'home')
  .test()
  .setPageInteraction(async (page) => {
    await page.getByRole('button', { name: 'Book this room' }).click();
  })
  .test('booking');
