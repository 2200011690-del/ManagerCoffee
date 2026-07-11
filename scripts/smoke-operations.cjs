const { spawn } = require('node:child_process');
const { once } = require('node:events');

const cwd = process.cwd();
const port = process.env.SMOKE_PORT || '4015';
const baseUrl = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PORT: port,
  JWT_SECRET: process.env.JWT_SECRET || 'smoke-test-secret',
};

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => { stdout += buf.toString(); });
    child.stderr.on('data', (buf) => { stderr += buf.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`Command failed: node ${args.join(' ')}\n${stdout}\n${stderr}`)));
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, body };
}

function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}${details ? `\n${JSON.stringify(details, null, 2)}` : ''}`);
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
    if (child.exitCode !== null) throw new Error(`API server exited early.\n${stdout}\n${stderr}`);
    if (Date.now() - start > 20000) throw new Error(`Timed out waiting for API server.\n${stdout}\n${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function main() {
  if (process.env.SMOKE_SKIP_SEED !== '1') await runNode(['server/seed.cjs']);
  const server = spawn(process.execPath, ['server/index.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitForServer(server);
    const login = await request('/api/auth/login-admin', {
      method: 'POST',
      body: JSON.stringify({ storeCode: 'espresso-lab', email: 'admin@espresso-lab.vn', password: 'admin123456' }),
    });
    assert(login.status === 200 && login.body?.token, 'Dang nhap admin that bai', login);
    const token = login.body.token;

    const customerPhone = `09${String(Date.now()).slice(-8)}`;
    const customer = await request('/api/customers', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ name: 'Khach allowlist', phone: customerPhone, points: 999999, tier: 'DIAMOND', storeId: 'store-khac' }),
    });
    assert(customer.status === 201, 'Tao khach hang that bai', customer);
    assert(customer.body.storeId === login.body.storeId && customer.body.points === 0 && customer.body.tier === 'SILVER', 'Customer API cho phep mass assignment', customer.body);
    const loyaltyUpdate = await request(`/api/customers/${customer.body.id}`, {
      method: 'PUT', headers: auth(token), body: JSON.stringify({ points: 25, tier: 'GOLD' }),
    });
    assert(loyaltyUpdate.status === 200 && loyaltyUpdate.body.points === 25, 'Cap nhat diem khach hang that bai', loyaltyUpdate);
    const nameOnlyUpdate = await request(`/api/customers/${customer.body.id}`, {
      method: 'PUT', headers: auth(token), body: JSON.stringify({ name: 'Khach doi ten' }),
    });
    assert(nameOnlyUpdate.status === 200 && nameOnlyUpdate.body.points === 25, 'Cap nhat thieu truong da reset diem ve 0', nameOnlyUpdate);
    const customerDelete = await request(`/api/customers/${customer.body.id}`, { method: 'DELETE', headers: auth(token) });
    assert(customerDelete.status === 200, 'Khong xoa duoc khach test chua co giao dich', customerDelete);

    const [tablesResponse, productsResponse] = await Promise.all([
      request('/api/tables', { headers: auth(token) }),
      request('/api/products', { headers: auth(token) }),
    ]);
    assert(tablesResponse.status === 200 && tablesResponse.body?.length > 0, 'Khong co ban de test QR', tablesResponse);
    assert(productsResponse.status === 200 && productsResponse.body?.length > 0, 'Khong co san pham de test QR', productsResponse);
    const table = tablesResponse.body[0];
    const product = productsResponse.body.find((item) => !item.hidden) || productsResponse.body[0];
    assert(table.orderToken, 'Ban chua co orderToken', table);

    const publicMenu = await request(`/api/public/tables/${table.orderToken}/menu`);
    assert(publicMenu.status === 200 && publicMenu.body?.table?.id === table.id, 'QR menu cong khai khong hoat dong', publicMenu);
    assert(!('bankAccountNo' in publicMenu.body.store), 'Public menu lam lo thong tin ngan hang', publicMenu.body.store);

    const clientRequestId = `guest-smoke-${Date.now()}`;
    const guestPayload = {
      clientRequestId,
      guestName: 'Khach smoke',
      note: 'Ghi chu QR smoke',
      items: [{ productId: product.id, qty: 1, note: 'It da' }],
    };
    const createdGuest = await request(`/api/public/tables/${table.orderToken}/orders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': clientRequestId },
      body: JSON.stringify(guestPayload),
    });
    assert(createdGuest.status === 201 && createdGuest.body?.status === 'pending', 'Khong tao duoc guest order', createdGuest);

    const duplicateGuest = await request(`/api/public/tables/${table.orderToken}/orders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': clientRequestId },
      body: JSON.stringify(guestPayload),
    });
    assert(duplicateGuest.status === 200 && duplicateGuest.body?.id === createdGuest.body.id, 'Guest order idempotency that bai', duplicateGuest);

    const pending = await request('/api/guest-orders?status=pending', { headers: auth(token) });
    assert(pending.status === 200 && pending.body.some((item) => item.id === createdGuest.body.id), 'Hang cho guest order bi thieu', pending);

    const [acceptA, acceptB] = await Promise.all([
      request(`/api/guest-orders/${createdGuest.body.id}/accept`, { method: 'POST', headers: auth(token), body: '{}' }),
      request(`/api/guest-orders/${createdGuest.body.id}/accept`, { method: 'POST', headers: auth(token), body: '{}' }),
    ]);
    assert(acceptA.status === 200 && acceptB.status === 200, 'Nhan guest order dong thoi that bai', { acceptA, acceptB });
    assert(acceptA.body.id === acceptB.body.id, 'Nhan dong thoi da tao trung hoa don', { acceptA: acceptA.body.id, acceptB: acceptB.body.id });
    assert(acceptA.body.note === guestPayload.note, 'Ghi chu QR khong vao dung truong order.note', acceptA.body);
    assert(!acceptA.body.employee?.pin && !acceptA.body.employee?.password, 'Order lam lo thong tin nhay cam nhan vien', acceptA.body.employee);

    const guestStatus = await request(`/api/public/guest-orders/${createdGuest.body.id}/status?token=${table.orderToken}`);
    assert(guestStatus.status === 200 && guestStatus.body?.status === 'accepted', 'Khach khong xem duoc trang thai da nhan', guestStatus);
    assert(guestStatus.body?.order?.orderNumber, 'Trang thai guest order thieu ma hoa don', guestStatus);

    const paidGuestOrder = await request(`/api/orders/${acceptA.body.id}/pay`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({
        paymentMethod: 'transfer',
        payments: [{ method: 'transfer', amount: acceptA.body.total, reference: 'SMOKE-QR' }],
      }),
    });
    assert(paidGuestOrder.status === 200 && paidGuestOrder.body?.status === 'paid', 'Thanh toan don QR that bai', paidGuestOrder);
    assert(paidGuestOrder.body?.paymentMethod === 'transfer', 'Don QR ghi sai phuong thuc thanh toan', paidGuestOrder.body);
    const duplicatePayment = await request(`/api/orders/${acceptA.body.id}/pay`, { method: 'PUT', headers: auth(token), body: '{}' });
    assert(duplicatePayment.status === 404, 'Don QR bi thanh toan hai lan', duplicatePayment);
    const paidGuestStatus = await request(`/api/public/guest-orders/${createdGuest.body.id}/status?token=${table.orderToken}`);
    assert(paidGuestStatus.status === 200 && paidGuestStatus.body?.order?.status === 'paid', 'Khach khong thay trang thai da thanh toan', paidGuestStatus);

    const rotate = await request(`/api/tables/${table.id}/rotate-order-token`, { method: 'POST', headers: auth(token), body: '{}' });
    assert(rotate.status === 200 && rotate.body?.orderToken && rotate.body.orderToken !== table.orderToken, 'Doi QR token that bai', rotate);
    const oldMenu = await request(`/api/public/tables/${table.orderToken}/menu`);
    assert(oldMenu.status === 404, 'QR token cu van con hoat dong', oldMenu);
    const newMenu = await request(`/api/public/tables/${rotate.body.orderToken}/menu`);
    assert(newMenu.status === 200, 'QR token moi khong hoat dong', newMenu);

    const startAt = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 10000000));
    startAt.setUTCSeconds(0, 0);
    const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
    const reservationPayload = {
      tableId: table.id,
      customerName: 'Khach dat ban smoke',
      phone: '0901234567',
      guestCount: Math.min(2, table.capacity),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      depositAmount: 100000,
      depositStatus: 'paid',
      note: 'Test dat ban',
    };
    const reservation = await request('/api/reservations', { method: 'POST', headers: auth(token), body: JSON.stringify(reservationPayload) });
    assert(reservation.status === 201 && reservation.body?.depositAmount === 100000, 'Tao dat ban that bai', reservation);

    const conflict = await request('/api/reservations', { method: 'POST', headers: auth(token), body: JSON.stringify({ ...reservationPayload, customerName: 'Khach trung lich', phone: '0912345678' }) });
    assert(conflict.status === 409, 'Dat trung ban/trung gio phai bi chan', conflict);

    const availability = await request(`/api/reservations/availability?startAt=${encodeURIComponent(startAt.toISOString())}&endAt=${encodeURIComponent(endAt.toISOString())}&guestCount=1`, { headers: auth(token) });
    assert(availability.status === 200 && !availability.body.some((item) => item.id === table.id), 'Ban da dat van xuat hien trong danh sach trong', availability);

    const seated = await request(`/api/reservations/${reservation.body.id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify({ status: 'seated' }) });
    assert(seated.status === 200 && seated.body?.status === 'seated', 'Nhan ban that bai', seated);
    const completed = await request(`/api/reservations/${reservation.body.id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify({ status: 'completed' }) });
    assert(completed.status === 200 && completed.body?.status === 'completed', 'Hoan tat dat ban that bai', completed);
    await request(`/api/tables/${table.id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify({ status: 'available', occupiedSince: null }) });

    console.log('Operations smoke tests passed.');
  } finally {
    server.kill('SIGTERM');
    if (server.exitCode === null) await once(server, 'exit').catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
