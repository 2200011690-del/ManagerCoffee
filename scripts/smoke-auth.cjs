const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { io } = require('socket.io-client');

const cwd = process.cwd();
const port = process.env.SMOKE_PORT || '4011';
const baseUrl = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: port,
  JWT_SECRET: process.env.JWT_SECRET || 'smoke-test-secret',
};

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => { stdout += buf.toString(); });
    child.stderr.on('data', (buf) => { stderr += buf.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed: node ${args.join(' ')}\n${stdout}\n${stderr}`));
      }
    });
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}

  return { status: response.status, body };
}

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `\n${JSON.stringify(details, null, 2)}` : ''}`);
  }
}

function waitForSocketEvent(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for socket event ${eventName}`));
    }, timeoutMs);
    const onEvent = (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    };
    socket.once(eventName, onEvent);
  });
}

async function waitForServer(child) {
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (buf) => {
    stdout += buf.toString();
  });
  child.stderr.on('data', (buf) => {
    stderr += buf.toString();
  });

  const start = Date.now();
  while (!stdout.includes(`Server running on port ${port}`)) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early.\n${stdout}\n${stderr}`);
    }
    if (Date.now() - start > 20000) {
      throw new Error(`Timed out waiting for API server.\n${stdout}\n${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function main() {
  if (process.env.SMOKE_SKIP_SEED !== '1') {
    await runNode(['server/seed.cjs']);
  }

  const server = spawn(process.execPath, ['server/index.js'], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(server);

    const health = await request('/api/health');
    assert(health.status === 200 && health.body?.ok === true, 'Health endpoint public phai hoat dong', health);

    const ready = await request('/api/ready');
    assert(ready.status === 200 && ready.body?.ok === true, 'Ready endpoint public phai kiem tra duoc database', ready);

    const platformLogin = await request('/api/platform/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: process.env.PLATFORM_ADMIN_EMAIL || 'platform@managercoffee.local',
        password: process.env.PLATFORM_ADMIN_PASSWORD || 'platform123456',
      }),
    });
    assert(platformLogin.status === 200 && platformLogin.body?.token, 'Dang nhap platform admin phai hoat dong', platformLogin);
    const platformToken = platformLogin.body.token;

    const platformOverview = await request('/api/platform/overview', {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    assert(platformOverview.status === 200 && platformOverview.body?.counts?.totalStores >= 1, 'Platform overview phai co so lieu store', platformOverview);

    const platformStores = await request('/api/platform/stores', {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    const demoStore = Array.isArray(platformStores.body)
      ? platformStores.body.find((store) => store.code === 'espresso-lab')
      : null;
    assert(platformStores.status === 200 && demoStore, 'Platform admin phai xem duoc danh sach store', platformStores);

    const platformUpdate = await request(`/api/platform/stores/${demoStore.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${platformToken}` },
      body: JSON.stringify({
        plan: 'trial',
        subscriptionStatus: 'trial',
        isActive: true,
        platformNotes: 'Smoke test verified platform admin controls',
      }),
    });
    assert(platformUpdate.status === 200 && platformUpdate.body?.code === 'espresso-lab', 'Platform admin phai cap nhat duoc store', platformUpdate);

    const noAuthUsers = await request('/api/users');
    assert(noAuthUsers.status === 401, 'API quan tri phai chan request khong token', noAuthUsers);

    const staffLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ storeCode: 'espresso-lab', pin: '2222' }),
    });
    assert(staffLogin.status === 200 && staffLogin.body?.token, 'Dang nhap staff bang PIN that bai', staffLogin);

    const adminLogin = await request('/api/auth/login-admin', {
      method: 'POST',
      body: JSON.stringify({
        storeCode: 'espresso-lab',
        email: 'admin@espresso-lab.vn',
        password: 'admin123456',
      }),
    });
    assert(adminLogin.status === 200 && adminLogin.body?.token, 'Dang nhap admin demo that bai', adminLogin);

    const staffToken = staffLogin.body.token;
    const adminToken = adminLogin.body.token;

    const unauthorizedSocket = io(baseUrl, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });
    const unauthorizedErrorPromise = waitForSocketEvent(unauthorizedSocket, 'connect_error');
    unauthorizedSocket.connect();
    const unauthorizedError = await unauthorizedErrorPromise;
    unauthorizedSocket.close();
    assert(
      ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(unauthorizedError?.message),
      'WebSocket khong token phai bi tu choi',
      { message: unauthorizedError?.message }
    );

    const staffSocket = io(baseUrl, {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
      auth: { token: staffToken },
    });
    const connectedPromise = waitForSocketEvent(staffSocket, 'connect');
    staffSocket.connect();
    await connectedPromise;
    const authorizationErrorPromise = waitForSocketEvent(staffSocket, 'authorizationError');
    staffSocket.emit('joinStore', 'store-khong-thuoc-token');
    const authorizationError = await authorizationErrorPromise;
    staffSocket.close();
    assert(
      authorizationError?.error,
      'WebSocket khong duoc tham gia store khac voi store trong token',
      authorizationError
    );

    const staffUsersBlocked = await request('/api/users', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffUsersBlocked.status === 403, 'Staff khong duoc xem danh sach nhan su', staffUsersBlocked);

    const staffReportBlocked = await request('/api/dashboard?range=today', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(staffReportBlocked.status === 403, 'Staff khong co quyen bao cao phai bi chan dashboard', staffReportBlocked);

    const tables = await request('/api/tables', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(tables.status === 200 && Array.isArray(tables.body) && tables.body.length > 0, 'Khong lay duoc danh sach ban', tables);

    const tableId = tables.body[0].id;
    const staffTableStatus = await request(`/api/tables/${tableId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ status: 'occupied' }),
    });
    assert(staffTableStatus.status === 200 && staffTableStatus.body?.status === 'occupied', 'Staff phai duoc cap nhat trang thai ban', staffTableStatus);

    const staffTableConfigBlocked = await request(`/api/tables/${tableId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ name: 'B01-updated' }),
    });
    assert(staffTableConfigBlocked.status === 403, 'Staff khong duoc sua cau hinh ban', staffTableConfigBlocked);

    const persistedCart = await request(`/api/carts/${tableId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ cart: [{ id: 'smoke-cart-item', name: 'Smoke cart', qty: 1 }] }),
    });
    assert(persistedCart.status === 200, 'Gio hang realtime phai luu duoc vao database', persistedCart);
    const carts = await request('/api/carts', { headers: { Authorization: `Bearer ${staffToken}` } });
    assert(Array.isArray(carts.body?.[tableId]) && carts.body[tableId].length === 1, 'Gio hang da luu phai doc lai duoc', carts);
    await request(`/api/carts/${tableId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    const adminUsers = await request('/api/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminUsers.status === 200 && Array.isArray(adminUsers.body), 'Admin phai xem duoc danh sach nhan su', adminUsers);
    assert(
      adminUsers.body.every((user) => user.pin === undefined && user.pinHash === undefined && user.password === undefined),
      'API nhan su khong duoc tra PIN, PIN hash hoac password',
      adminUsers.body
    );

    const systemStatus = await request('/api/system/status', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(systemStatus.status === 200 && systemStatus.body?.ok === true, 'Admin phai xem duoc system status', systemStatus);

    const integrationsStatus = await request('/api/integrations/status', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      integrationsStatus.status === 200 && integrationsStatus.body?.payments?.vietQr,
      'Admin phai xem duoc trang thai tich hop',
      integrationsStatus
    );

    const integrationSettings = await request('/api/integrations/settings', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      integrationSettings.status === 200 && integrationSettings.body?.integrations?.payos,
      'Admin phai xem duoc cau hinh tich hop theo store',
      integrationSettings
    );

    const updatePayos = await request('/api/integrations/settings/payos', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        isEnabled: true,
        config: {
          mode: 'sandbox',
          webhookUrl: 'https://example.com/api/payments/payos-webhook',
        },
        secrets: {
          clientId: 'smoke-client-id',
          apiKey: 'smoke-api-key',
          checksumKey: 'smoke-checksum-key',
          webhookSecret: 'smoke-webhook-secret',
        },
      }),
    });
    assert(
      updatePayos.status === 200 &&
        updatePayos.body?.integration?.secretsConfigured?.clientId === true &&
        updatePayos.body?.integration?.secretsConfigured?.webhookSecret === true &&
        updatePayos.body?.integration?.secrets === undefined,
      'Luu payOS theo store phai thanh cong va khong tra secret thuan',
      updatePayos
    );

    const integrationsStatusAfterSave = await request('/api/integrations/status', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      integrationsStatusAfterSave.status === 200 && integrationsStatusAfterSave.body?.payments?.webhook?.protected === true,
      'Webhook payment phai bao protected sau khi luu secret theo store',
      integrationsStatusAfterSave
    );

    const auditLogsAsStaff = await request('/api/audit-logs', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(auditLogsAsStaff.status === 403, 'Staff khong duoc xem audit log', auditLogsAsStaff);

    const auditLogs = await request('/api/audit-logs', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(auditLogs.status === 200 && Array.isArray(auditLogs.body), 'Admin phai xem duoc audit log', auditLogs);

    const backup = await request('/api/backup/export', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(backup.status === 200 && backup.body?.store && Array.isArray(backup.body?.users), 'Admin phai export duoc backup', backup);
    assert(
      backup.body.users.every((user) => user.pin === undefined && user.pinHash === undefined && user.password === undefined),
      'Backup khong duoc lo PIN/password nhan vien',
      backup.body.users
    );

    const restoreDryRun = await request('/api/backup/restore-catalog', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        backup: backup.body,
        confirmStoreCode: backup.body.store.code,
        dryRun: true,
      }),
    });
    assert(restoreDryRun.status === 200 && restoreDryRun.body?.dryRun === true, 'Restore catalog dry-run phai hoat dong', restoreDryRun);

    const branchCode = `smoke-branch-${Date.now()}`;
    const createdBranch = await request('/api/branches', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Smoke Branch', code: branchCode, copyCatalog: false }),
    });
    assert(createdBranch.status === 200 && createdBranch.body?.id, 'Admin phai tao duoc chi nhanh rong', createdBranch);
    const switchedBranch = await request(`/api/branches/${createdBranch.body.id}/switch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(switchedBranch.status === 200 && switchedBranch.body?.token, 'Admin phai chuyen duoc sang chi nhanh cung to chuc', switchedBranch);
    const emptyBranchProducts = await request('/api/products', {
      headers: { Authorization: `Bearer ${switchedBranch.body.token}` },
    });
    assert(emptyBranchProducts.status === 200 && emptyBranchProducts.body.length === 0, 'Chi nhanh moi khong sao chep catalog phai rong', emptyBranchProducts);
    const emptyBranchInventory = await request('/api/inventory', {
      headers: { Authorization: `Bearer ${switchedBranch.body.token}` },
    });
    assert(emptyBranchInventory.status === 200 && emptyBranchInventory.body.length === 0, 'Chi nhanh moi khong duoc thay nguyen lieu store cu', emptyBranchInventory);
    const emptyBranchTransactions = await request('/api/inventory/transactions', {
      headers: { Authorization: `Bearer ${switchedBranch.body.token}` },
    });
    assert(emptyBranchTransactions.status === 200 && emptyBranchTransactions.body.length === 0, 'Chi nhanh moi khong duoc thay giao dich kho store cu', emptyBranchTransactions);
    const emptyBranchProfit = await request('/api/reports/profit-loss', {
      headers: { Authorization: `Bearer ${switchedBranch.body.token}` },
    });
    assert(
      emptyBranchProfit.status === 200 && emptyBranchProfit.body?.revenue === 0 && emptyBranchProfit.body?.ingredients?.length === 0,
      'Bao cao nguyen lieu chi nhanh moi phai rong',
      emptyBranchProfit
    );
    const deletedBranch = await request(`/api/branches/${createdBranch.body.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(deletedBranch.status === 200, 'Chi nhanh chua co giao dich phai xoa duoc', deletedBranch);

    const permissionUpdate = await request(`/api/users/${staffLogin.body.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ canViewReports: true }),
    });
    assert(permissionUpdate.status === 200, 'Admin phai cap nhat duoc quyen nhan vien', permissionUpdate);
    const revokedStaffToken = await request('/api/tables', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(revokedStaffToken.status === 401, 'Token cu phai bi thu hoi sau khi doi quyen', revokedStaffToken);
    await request(`/api/users/${staffLogin.body.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ canViewReports: false }),
    });

    const failedLogins = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      failedLogins.push(await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ storeCode: 'smoke-rate-limit', pin: '0000' }),
      }));
    }
    assert(
      failedLogins.every((result) => result.status === 401),
      'Nam lan dang nhap sai dau tien phai bi tu choi nhu thong tin dang nhap khong hop le',
      failedLogins
    );
    const blockedLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ storeCode: 'smoke-rate-limit', pin: '0000' }),
    });
    assert(
      blockedLogin.status === 429 && Number(blockedLogin.body?.retryAfterSec) > 0,
      'Dang nhap sai qua nguong phai bi khoa tam thoi',
      blockedLogin
    );

    console.log('Smoke auth test passed.');
  } finally {
    server.kill('SIGTERM');
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
