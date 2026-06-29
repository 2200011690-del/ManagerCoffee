const { spawn } = require('node:child_process');
const { once } = require('node:events');

const cwd = process.cwd();
const port = process.env.SMOKE_PORT || '4013';
const baseUrl = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: port,
  JWT_SECRET: process.env.JWT_SECRET || 'smoke-test-secret',
};

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
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

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `\n${JSON.stringify(details, null, 2)}` : ''}`);
  }
}

async function waitForServer(child) {
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (buf) => { stdout += buf.toString(); });
  child.stderr.on('data', (buf) => { stderr += buf.toString(); });

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

function findByName(items, name) {
  return items.find((item) => item.name === name);
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

    const staffLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ storeCode: 'espresso-lab', pin: '2222' }),
    });
    assert(staffLogin.status === 200 && staffLogin.body?.token, 'Dang nhap staff that bai', staffLogin);

    const adminLogin = await request('/api/auth/login-admin', {
      method: 'POST',
      body: JSON.stringify({
        storeCode: 'espresso-lab',
        email: 'admin@espresso-lab.vn',
        password: 'admin123456',
      }),
    });
    assert(adminLogin.status === 200 && adminLogin.body?.token, 'Dang nhap admin that bai', adminLogin);

    const staffToken = staffLogin.body.token;
    const adminToken = adminLogin.body.token;
    const staffUser = staffLogin.body;
    const adminUser = adminLogin.body;

    const staffCannotViewAdminShift = await request(`/api/shifts/active/${adminUser.id}`, {
      headers: auth(staffToken),
    });
    assert(staffCannotViewAdminShift.status === 403, 'Staff khong duoc xem ca cua admin', staffCannotViewAdminShift);

    const staffCannotOpenAdminShift = await request('/api/shifts/open', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({ userId: adminUser.id, openingCash: 100000 }),
    });
    assert(staffCannotOpenAdminShift.status === 403, 'Staff khong duoc mo ca cho admin/nguoi khac', staffCannotOpenAdminShift);

    const existingActive = await request(`/api/shifts/active/${staffUser.id}`, {
      headers: auth(adminToken),
    });
    if (existingActive.status === 200 && existingActive.body?.id) {
      await request('/api/shifts/close', {
        method: 'POST',
        headers: auth(adminToken),
        body: JSON.stringify({
          shiftId: existingActive.body.id,
          actualCash: existingActive.body.expectedCash,
          notes: 'Smoke cleanup',
        }),
      });
    }

    const openingCash = 100000;
    const opened = await request('/api/shifts/open', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({ userId: staffUser.id, openingCash }),
    });
    assert(opened.status === 200 && opened.body?.status === 'open', 'Staff phai mo duoc ca cua minh', opened);

    const products = await request('/api/products', {
      headers: auth(staffToken),
    });
    const product = findByName(products.body || [], 'Cà phê Đen');
    assert(product, 'Thieu san pham seed Ca phe Den', products);

    const subtotal = product.price;
    const vatAmount = Math.round(subtotal * 0.08);
    const total = subtotal + vatAmount;
    const checkout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        tableId: null,
        tableName: 'Mang về',
        cart: [{
          id: product.id,
          name: product.name,
          price: product.price,
          qty: 1,
          sugar: '100%',
          ice: 'Nhiều đá',
          note: '',
        }],
        subtotal,
        vatAmount,
        total,
        paymentMethod: 'cash',
        employeeId: staffUser.id,
      }),
    });
    assert(checkout.status === 200 && checkout.body?.status === 'paid', 'Checkout tien mat trong ca phai thanh cong', checkout);

    const activeAfterSale = await request(`/api/shifts/active/${staffUser.id}`, {
      headers: auth(staffToken),
    });
    assert(activeAfterSale.status === 200 && activeAfterSale.body?.id === opened.body.id, 'Phai lay duoc ca dang mo sau ban hang', activeAfterSale);
    assert(
      activeAfterSale.body.cashSales === total && activeAfterSale.body.expectedCash === openingCash + total,
      'Doanh thu tien mat va tien ky vong phai tang dung sau checkout cash',
      { total, shift: activeAfterSale.body }
    );

    const closed = await request('/api/shifts/close', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        shiftId: opened.body.id,
        actualCash: openingCash + total,
        notes: 'Smoke close',
      }),
    });
    assert(closed.status === 200 && closed.body?.status === 'closed' && closed.body?.discrepancy === 0, 'Dong ca dung tien phai chenh lech 0', closed);

    const closeAgain = await request('/api/shifts/close', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        shiftId: opened.body.id,
        actualCash: openingCash + total,
      }),
    });
    assert(closeAgain.status === 400, 'Ca da dong khong duoc dong lan 2', closeAgain);

    const logsAsStaff = await request('/api/shifts/logs', {
      headers: auth(staffToken),
    });
    assert(logsAsStaff.status === 403, 'Staff khong duoc xem log ban giao ca tong hop', logsAsStaff);

    const logsAsAdmin = await request('/api/shifts/logs', {
      headers: auth(adminToken),
    });
    assert(logsAsAdmin.status === 200 && Array.isArray(logsAsAdmin.body), 'Admin phai xem duoc log ban giao ca', logsAsAdmin);

    console.log('Smoke shifts test passed.');
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
