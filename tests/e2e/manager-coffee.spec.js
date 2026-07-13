import { expect, test } from '@playwright/test';

const API_URL = 'http://127.0.0.1:5000/api';

async function loginAsDemoAdmin(page) {
  await page.addInitScript(() => {
    localStorage.setItem('manager_coffee_store_code', 'espresso-lab');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Đăng nhập quản trị bằng email' }).click();
  await page.getByLabel('Email quản trị').fill('admin@espresso-lab.vn');
  await page.getByLabel('Mật khẩu').fill('admin123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Manager Coffee', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Thêm Cà phê Đen vào giỏ/ }).first()).toBeVisible();
}

async function openMobileNavigationIfNeeded(page) {
  if ((page.viewportSize()?.width || 1280) < 1024) {
    await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
  }
}

async function authHeaders(page) {
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('manager_coffee_auth_session'))?.token);
  return { Authorization: `Bearer ${token}` };
}

test('đăng nhập và điều hướng các màn hình cốt lõi', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await loginAsDemoAdmin(page);
  await openMobileNavigationIfNeeded(page);
  await page.getByRole('button', { name: /Sơ đồ bàn/ }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý bàn' })).toBeVisible();

  await openMobileNavigationIfNeeded(page);
  await page.getByRole('button', { name: /Báo cáo/ }).click();
  await expect(page.getByRole('heading', { name: 'Báo cáo & thống kê' })).toBeVisible();

  await openMobileNavigationIfNeeded(page);
  await page.getByRole('button', { name: /Cung ứng/ }).click();
  await expect(page.getByRole('heading', { name: 'Cung ứng và kho' })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
  expect(pageErrors).toEqual([]);
});

test('giỏ bán mang về được đồng bộ sau khi tải lại', async ({ page, request }) => {
  await loginAsDemoAdmin(page);
  const headers = await authHeaders(page);
  await request.delete(`${API_URL}/carts/__takeaway__`, { headers });
  await page.reload();

  const addButton = page.getByRole('button', { name: /Thêm Cà phê Đen vào giỏ/ }).first();
  await expect(addButton).toBeVisible();
  const cartSync = page.waitForResponse((response) => response.url().includes('/api/carts/__takeaway__') && response.request().method() === 'PUT');
  await addButton.click();
  await cartSync;
  await page.reload();

  if ((page.viewportSize()?.width || 1280) < 1024) {
    await page.getByRole('button', { name: /Xem giỏ hàng/ }).click();
  }
  await expect(page.getByText('Cà phê Đen', { exact: true }).last()).toBeVisible();
  await request.delete(`${API_URL}/carts/__takeaway__`, { headers });
});
