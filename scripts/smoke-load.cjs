const { spawn } = require('node:child_process');
const { once } = require('node:events');

const cwd = process.cwd();
const port = process.env.SMOKE_PORT || '4014';
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
    const staffToken = staffLogin.body.token;

    const products = await request('/api/products', {
      headers: auth(staffToken),
    });
    const product = findByName(products.body || [], 'Cà phê Đen');
    assert(product, 'Thieu san pham seed Ca phe Den', products);

    const beforeInventory = await request('/api/inventory', {
      headers: auth(staffToken),
    });
    const arabicaBefore = findByName(beforeInventory.body || [], 'Cà phê Arabica');
    assert(arabicaBefore, 'Thieu ton kho Arabica truoc load test', beforeInventory);

    const concurrency = Number(process.env.SMOKE_LOAD_CONCURRENCY || 8);
    const subtotal = product.price;
    const vatAmount = Math.round(subtotal * 0.08);
    const total = subtotal + vatAmount;

    const checkouts = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
      const clientRequestId = `smoke-load-${Date.now()}-${index}`;
      return request('/api/orders/checkout', {
        method: 'POST',
        headers: { ...auth(staffToken), 'Idempotency-Key': clientRequestId },
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
          employeeId: staffLogin.body.id,
          clientRequestId,
        }),
      });
    }));

    assert(
      checkouts.every((checkout) => checkout.status === 200 && checkout.body?.orderNumber),
      'Tat ca checkout dong thoi phai thanh cong',
      checkouts
    );

    const orderNumbers = checkouts.map((checkout) => checkout.body.orderNumber);
    assert(
      new Set(orderNumbers).size === orderNumbers.length,
      'Checkout dong thoi khong duoc trung ma hoa don',
      orderNumbers
    );

    const afterInventory = await request('/api/inventory', {
      headers: auth(staffToken),
    });
    const arabicaAfter = findByName(afterInventory.body || [], 'Cà phê Arabica');
    const expectedAfter = arabicaBefore.qty - (0.02 * concurrency);
    assert(
      arabicaAfter && Math.abs(arabicaAfter.qty - expectedAfter) < 0.000001,
      'Load checkout phai tru ton kho dung theo cong thuc',
      { before: arabicaBefore.qty, after: arabicaAfter?.qty, expectedAfter, concurrency }
    );

    console.log('Smoke load test passed.');
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
