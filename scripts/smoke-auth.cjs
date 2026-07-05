const { spawn } = require('node:child_process');
const { once } = require('node:events');

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

    const adminUsers = await request('/api/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminUsers.status === 200 && Array.isArray(adminUsers.body), 'Admin phai xem duoc danh sach nhan su', adminUsers);

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
      backup.body.users.every((user) => user.pin === undefined && user.password === undefined),
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
