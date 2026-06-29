const { spawn } = require('node:child_process');
const { once } = require('node:events');

const cwd = process.cwd();
const port = process.env.SMOKE_PORT || '4012';
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

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `\n${JSON.stringify(details, null, 2)}` : ''}`);
  }
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
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

    const products = await request('/api/products', {
      headers: auth(staffToken),
    });
    assert(products.status === 200 && Array.isArray(products.body), 'Khong lay duoc menu san pham', products);

    const product = findByName(products.body, 'Cà phê Đen');
    assert(product, 'Thieu san pham seed "Ca phe Den"', products.body);

    const beforeInventory = await request('/api/inventory', {
      headers: auth(staffToken),
    });
    assert(beforeInventory.status === 200 && Array.isArray(beforeInventory.body), 'Khong lay duoc ton kho truoc checkout', beforeInventory);

    const arabicaBefore = findByName(beforeInventory.body, 'Cà phê Arabica');
    assert(arabicaBefore, 'Thieu ton kho seed "Ca phe Arabica"', beforeInventory.body);

    const subtotal = product.price;
    const vatAmount = Math.round(subtotal * 0.08);
    const total = subtotal + vatAmount;

    const emptyCheckout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        tableId: null,
        tableName: 'Mang về',
        cart: [],
        subtotal: 0,
        vatAmount: 0,
        total: 0,
        paymentMethod: 'cash',
        employeeId: staffUser.id,
      }),
    });
    assert(emptyCheckout.status === 400, 'Checkout gio hang rong phai bi chan', emptyCheckout);

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
    assert(checkout.status === 200 && checkout.body?.status === 'paid', 'Checkout tien mat phai tao hoa don paid', checkout);
    assert(Array.isArray(checkout.body?.items) && checkout.body.items.length === 1, 'Hoa don phai co 1 dong san pham', checkout);

    const orders = await request('/api/orders', {
      headers: auth(staffToken),
    });
    assert(
      orders.status === 200 && Array.isArray(orders.body) && orders.body.some((order) => order.id === checkout.body.id),
      'Hoa don vua tao phai nam trong lich su don hang',
      orders
    );

    const afterInventory = await request('/api/inventory', {
      headers: auth(staffToken),
    });
    const arabicaAfter = findByName(afterInventory.body || [], 'Cà phê Arabica');
    assert(arabicaAfter, 'Khong lay duoc ton kho Arabica sau checkout', afterInventory);

    const expectedAfter = arabicaBefore.qty - 0.02;
    assert(
      Math.abs(arabicaAfter.qty - expectedAfter) < 0.000001,
      'Checkout Ca phe Den phai tru 0.02kg Arabica theo cong thuc',
      { before: arabicaBefore.qty, after: arabicaAfter.qty, expectedAfter }
    );

    const staffImportBlocked = await request('/api/inventory/import', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        inventoryId: arabicaAfter.id,
        qty: 1,
        cost: 1000,
      }),
    });
    assert(staffImportBlocked.status === 403, 'Staff khong duoc nhap kho', staffImportBlocked);

    const adminImportInvalidSupplier = await request('/api/inventory/import', {
      method: 'POST',
      headers: auth(adminToken),
      body: JSON.stringify({
        inventoryId: arabicaAfter.id,
        qty: 1,
        cost: 1000,
        supplierId: 'not-a-real-supplier',
      }),
    });
    assert(adminImportInvalidSupplier.status === 400, 'Nhap kho voi supplier khong thuoc cua hang phai bi chan', adminImportInvalidSupplier);

    const overReturn = await request(`/api/orders/${checkout.body.id}/return`, {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        employeeId: staffUser.id,
        refundMethod: 'cash',
        reason: 'Smoke test over return',
        items: [{
          orderItemName: product.name,
          price: product.price,
          qty: 2,
        }],
      }),
    });
    assert(overReturn.status === 400, 'Tra hang vuot qua so luong da mua phai bi chan', overReturn);

    const returnOrder = await request(`/api/orders/${checkout.body.id}/return`, {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        employeeId: staffUser.id,
        refundMethod: 'cash',
        reason: 'Smoke test return',
        items: [{
          orderItemName: product.name,
          price: product.price,
          qty: 1,
        }],
      }),
    });
    assert(returnOrder.status === 200 && returnOrder.body?.returnNumber, 'Tra hang hop le phai tao phieu tra', returnOrder);

    const returnedOrderSearch = await request(`/api/orders/search/${encodeURIComponent(checkout.body.orderNumber)}`, {
      headers: auth(staffToken),
    });
    assert(
      returnedOrderSearch.status === 200 && returnedOrderSearch.body?.items?.[0]?.returnedQty === 1,
      'Hoa don goc phai ghi nhan so luong da tra',
      returnedOrderSearch
    );

    const inventoryAfterReturn = await request('/api/inventory', {
      headers: auth(staffToken),
    });
    const arabicaAfterReturn = findByName(inventoryAfterReturn.body || [], 'Cà phê Arabica');
    assert(
      arabicaAfterReturn && Math.abs(arabicaAfterReturn.qty - arabicaBefore.qty) < 0.000001,
      'Tra hang Ca phe Den phai hoan lai 0.02kg Arabica',
      { before: arabicaBefore.qty, after: arabicaAfterReturn?.qty }
    );

    const pendingSubtotal = product.price * 2;
    const pendingVatAmount = Math.round(pendingSubtotal * 0.08);
    const pendingTotal = pendingSubtotal + pendingVatAmount;
    const pendingCheckout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        tableId: null,
        tableName: 'Mang về',
        cart: [{
          id: product.id,
          name: product.name,
          price: product.price,
          qty: 2,
          sugar: '100%',
          ice: 'Nhiều đá',
          note: '',
        }],
        subtotal: pendingSubtotal,
        vatAmount: pendingVatAmount,
        total: pendingTotal,
        paymentMethod: 'card',
        employeeId: staffUser.id,
        status: 'pending',
      }),
    });
    assert(pendingCheckout.status === 200 && pendingCheckout.body?.status === 'pending', 'Checkout QR phai tao hoa don pending', pendingCheckout);

    const inventoryAfterPending = await request('/api/inventory', {
      headers: auth(staffToken),
    });
    const arabicaAfterPending = findByName(inventoryAfterPending.body || [], 'Cà phê Arabica');
    assert(
      arabicaAfterPending && Math.abs(arabicaAfterPending.qty - arabicaBefore.qty) < 0.000001,
      'Hoa don pending chua duoc tru kho truoc khi xac nhan thanh toan',
      { before: arabicaBefore.qty, afterPending: arabicaAfterPending?.qty }
    );

    const payPending = await request(`/api/orders/${pendingCheckout.body.id}/pay`, {
      method: 'PUT',
      headers: auth(staffToken),
    });
    assert(payPending.status === 200 && payPending.body?.status === 'paid', 'Xac nhan thanh toan pending phai chuyen sang paid', payPending);

    const payPendingAgain = await request(`/api/orders/${pendingCheckout.body.id}/pay`, {
      method: 'PUT',
      headers: auth(staffToken),
    });
    assert(payPendingAgain.status === 404, 'Hoa don pending da paid khong duoc xac nhan lai lan 2', payPendingAgain);

    const inventoryAfterPay = await request('/api/inventory', {
      headers: auth(staffToken),
    });
    const arabicaAfterPay = findByName(inventoryAfterPay.body || [], 'Cà phê Arabica');
    const expectedAfterPay = arabicaBefore.qty - 0.04;
    assert(
      arabicaAfterPay && Math.abs(arabicaAfterPay.qty - expectedAfterPay) < 0.000001,
      'Xac nhan QR paid phai tru kho theo so luong pending',
      { before: arabicaBefore.qty, afterPay: arabicaAfterPay?.qty, expectedAfterPay }
    );

    console.log('Smoke sales test passed.');
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
