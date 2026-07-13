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

    const checkoutClientRequestId = `smoke-checkout-${Date.now()}`;
    const checkoutPayload = {
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
      clientRequestId: checkoutClientRequestId,
    };

    const checkout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: { ...auth(staffToken), 'Idempotency-Key': checkoutClientRequestId },
      body: JSON.stringify(checkoutPayload),
    });
    assert(checkout.status === 200 && checkout.body?.status === 'paid', 'Checkout tien mat phai tao hoa don paid', checkout);
    assert(Array.isArray(checkout.body?.items) && checkout.body.items.length === 1, 'Hoa don phai co 1 dong san pham', checkout);

    const duplicateCheckout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: { ...auth(staffToken), 'Idempotency-Key': checkoutClientRequestId },
      body: JSON.stringify(checkoutPayload),
    });
    assert(
      duplicateCheckout.status === 200 && duplicateCheckout.body?.id === checkout.body.id,
      'Checkout lap lai cung clientRequestId phai tra ve hoa don cu, khong tao hoa don moi',
      duplicateCheckout
    );

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
    assert(returnOrder.body.refundAmount === checkout.body.total, 'Tra hang phai hoan theo tien da thanh toan tren hoa don, khong chi theo gia client gui', returnOrder);

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

    const concurrentPayments = await Promise.all([
      request(`/api/orders/${pendingCheckout.body.id}/pay`, {
        method: 'PUT',
        headers: auth(staffToken),
      }),
      request(`/api/orders/${pendingCheckout.body.id}/pay`, {
        method: 'PUT',
        headers: auth(staffToken),
      }),
    ]);
    assert(
      concurrentPayments.filter((result) => result.status === 200 && result.body?.status === 'paid').length === 1
        && concurrentPayments.filter((result) => result.status === 404).length === 1,
      'Hai xac nhan thanh toan dong thoi chi duoc mot yeu cau thanh cong',
      concurrentPayments
    );

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

    const badSplitPayment = await request('/api/orders/checkout', {
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
        paymentMethod: 'mixed',
        payments: [{ method: 'cash', amount: 1 }],
        employeeId: staffUser.id,
      }),
    });
    assert(badSplitPayment.status === 400, 'Thanh toan tach nhieu phuong thuc sai tong tien phai bi chan', badSplitPayment);

    const tamperedCheckout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        tableId: null,
        tableName: 'Mang về',
        cart: [{
          id: product.id,
          name: product.name,
          price: 1,
          qty: 1,
          sugar: '100%',
          ice: 'Nhiều đá',
          note: '',
        }],
        subtotal: 1,
        vatAmount: 0,
        total: 1,
        paymentMethod: 'cash',
        employeeId: staffUser.id,
      }),
    });
    assert(tamperedCheckout.status === 200, 'Checkout client sua gia van phai duoc server tinh lai neu san pham hop le', tamperedCheckout);
    const authoritativeLine = tamperedCheckout.body?.items?.[0];
    const authoritativeSubtotal = authoritativeLine
      ? authoritativeLine.price * authoritativeLine.qty - (authoritativeLine.discount || 0)
      : null;
    assert(
      authoritativeLine?.price === product.price
        && tamperedCheckout.body?.subtotal === authoritativeSubtotal
        && tamperedCheckout.body?.total === tamperedCheckout.body?.subtotal + tamperedCheckout.body?.vatAmount,
      'Server phai bo qua gia/subtotal/total do client gui va tinh theo gia DB',
      tamperedCheckout
    );
    assert(
      tamperedCheckout.body?.employee
        && tamperedCheckout.body.employee.pin === undefined
        && tamperedCheckout.body.employee.pinHash === undefined
        && tamperedCheckout.body.employee.password === undefined,
      'Response hoa don khong duoc lo PIN, PIN hash hoac password nhan vien',
      tamperedCheckout.body?.employee
    );

    const returnPayload = {
      employeeId: staffUser.id,
      refundMethod: 'cash',
      reason: 'Smoke test tampered return price',
      items: [{
        orderItemId: tamperedCheckout.body.items[0].id,
        orderItemName: product.name,
        price: 1,
        qty: 1,
      }],
    };
    const concurrentReturns = await Promise.all([
      request(`/api/orders/${tamperedCheckout.body.id}/return`, {
        method: 'POST',
        headers: auth(staffToken),
        body: JSON.stringify(returnPayload),
      }),
      request(`/api/orders/${tamperedCheckout.body.id}/return`, {
        method: 'POST',
        headers: auth(staffToken),
        body: JSON.stringify(returnPayload),
      }),
    ]);
    const successfulReturn = concurrentReturns.find((result) => result.status === 200);
    assert(
      successfulReturn && concurrentReturns.filter((result) => result.status === 400).length === 1,
      'Hai yeu cau tra cung mot dong hoa don chi duoc mot yeu cau thanh cong',
      concurrentReturns
    );
    assert(
      successfulReturn.body?.refundAmount === tamperedCheckout.body.total,
      'Server phai bo qua so tien hoan do client gui va tinh theo hoa don goc',
      successfulReturn
    );

    const limitedVoucherCode = `LIMIT${String(Date.now()).slice(-8)}`;
    const limitedVoucher = await request('/api/vouchers', {
      method: 'POST',
      headers: auth(adminToken),
      body: JSON.stringify({
        code: limitedVoucherCode,
        type: 'FIXED',
        value: 1000,
        minOrderValue: 0,
        maxUses: 1,
        isActive: true,
      }),
    });
    assert(limitedVoucher.status === 200 && limitedVoucher.body?.maxUses === 1, 'Tao voucher gioi han that bai', limitedVoucher);
    const limitedPayload = (suffix) => ({
      tableId: null,
      tableName: 'Mang về',
      cart: [{ id: product.id, name: product.name, price: product.price, qty: 1 }],
      paymentMethod: 'cash',
      employeeId: adminLogin.body.id,
      voucherCode: limitedVoucherCode,
      clientRequestId: `limited-voucher-${suffix}-${Date.now()}`,
    });
    const [limitedA, limitedB] = await Promise.all([
      request('/api/orders/checkout', { method: 'POST', headers: auth(adminToken), body: JSON.stringify(limitedPayload('a')) }),
      request('/api/orders/checkout', { method: 'POST', headers: auth(adminToken), body: JSON.stringify(limitedPayload('b')) }),
    ]);
    const limitedStatuses = [limitedA.status, limitedB.status].sort((a, b) => a - b);
    assert(limitedStatuses[0] === 200 && limitedStatuses[1] === 409, 'Voucher gioi han 1 luot bi dung qua han khi checkout dong thoi', { limitedA, limitedB });
    const limitedVoucherAfter = await request('/api/vouchers', { headers: auth(adminToken) });
    const limitedRow = limitedVoucherAfter.body.find((voucher) => voucher.id === limitedVoucher.body.id);
    assert(limitedRow?.usedCount === 1, 'Bo dem voucher khong tang dung mot lan', limitedRow);
    const deleteLimitedVoucher = await request(`/api/vouchers/${limitedVoucher.body.id}`, { method: 'DELETE', headers: auth(adminToken) });
    assert(deleteLimitedVoucher.status === 200, 'Khong xoa duoc voucher da co lich su su dung', deleteLimitedVoucher);

    const voucherQty = Math.max(1, Math.ceil(50000 / product.price));
    const voucherDiscount = 10000;
    const voucherCheckout = await request('/api/orders/checkout', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({
        tableId: null,
        tableName: 'Mang về',
        cart: [{
          id: product.id,
          name: product.name,
          price: product.price,
          qty: voucherQty,
          sugar: '100%',
          ice: 'Nhiều đá',
          note: '',
        }],
        voucherCode: 'GIAM10K',
        paymentMethod: 'cash',
        employeeId: staffUser.id,
      }),
    });
    assert(voucherCheckout.status === 200, 'Checkout co voucher that bai', voucherCheckout);
    const authoritativeVoucherSubtotal = voucherCheckout.body?.subtotal;
    const voucherVat = Math.round((authoritativeVoucherSubtotal - voucherDiscount) * 0.08);
    assert(
      authoritativeVoucherSubtotal > voucherDiscount
        && voucherCheckout.body?.discountAmount === voucherDiscount
        && voucherCheckout.body?.vatRate === 0.08
        && voucherCheckout.body?.vatAmount === voucherVat
        && voucherCheckout.body?.total === authoritativeVoucherSubtotal - voucherDiscount + voucherVat,
      'VAT phai tinh tren gia sau chiet khau',
      voucherCheckout
    );

    const tables = await request('/api/tables', { headers: auth(adminToken) });
    const splitTable = tables.body?.[0];
    assert(tables.status === 200 && splitTable, 'Khong co ban de kiem thu tach don', tables);
    const splitCartItemId = `split-${Date.now()}`;
    const splitPayload = {
      tableId: splitTable.id,
      tableName: splitTable.name,
      cart: [{
        id: product.id,
        cartItemId: splitCartItemId,
        name: product.name,
        price: product.price,
        qty: 1,
        sugar: '100%',
        ice: 'Nhiều đá',
        note: '',
      }],
      paymentMethod: 'cash',
      employeeId: staffUser.id,
    };
    const fullSplitCart = [{ ...splitPayload.cart[0], qty: 2 }];
    const persistSplitCart = await request(`/api/carts/${splitTable.id}`, {
      method: 'PUT',
      headers: auth(staffToken),
      body: JSON.stringify({ cart: fullSplitCart }),
    });
    assert(persistSplitCart.status === 200, 'Khong luu duoc gio nguon cho don tach', persistSplitCart);
    const partialSplit = await request('/api/orders/checkout', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({ ...splitPayload, splitCartKey: splitTable.id }),
    });
    assert(
      partialSplit.status === 200 && partialSplit.body?.splitCheckout === true && partialSplit.body?.keptTableOpen === true,
      'Thanh toan mot phan cua don tach that bai',
      partialSplit
    );
    const cartsAfterPartial = await request('/api/carts', { headers: auth(staffToken) });
    assert(cartsAfterPartial.body?.[splitTable.id]?.[0]?.qty === 1, 'Server khong tru dung gio sau lan tach dau', cartsAfterPartial);
    const tableAfterPartial = await request('/api/tables', { headers: auth(adminToken) });
    assert(
      tableAfterPartial.body?.find((table) => table.id === splitTable.id)?.status === 'occupied',
      'Ban phai con dang phuc vu sau khi moi thanh toan mot phan',
      tableAfterPartial
    );
    const finalSplit = await request('/api/orders/checkout', {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({ ...splitPayload, splitCartKey: splitTable.id }),
    });
    assert(
      finalSplit.status === 200 && finalSplit.body?.splitCheckout === true && finalSplit.body?.keptTableOpen === false,
      'Thanh toan phan cuoi cua don tach that bai',
      finalSplit
    );
    const cartsAfterFinal = await request('/api/carts', { headers: auth(staffToken) });
    assert(cartsAfterFinal.body?.[splitTable.id]?.length === 0, 'Gio server phai rong sau lan tach cuoi', cartsAfterFinal);
    const tableAfterFinal = await request('/api/tables', { headers: auth(adminToken) });
    assert(
      tableAfterFinal.body?.find((table) => table.id === splitTable.id)?.status === 'dirty',
      'Ban phai chuyen sang cho don sau khi thanh toan phan cuoi',
      tableAfterFinal
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
