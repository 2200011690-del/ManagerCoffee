const { spawn } = require('node:child_process');
const { once } = require('node:events');

const cwd = process.cwd();
const port = process.env.SMOKE_PORT || '4017';
const baseUrl = `http://127.0.0.1:${port}`;
const env = { ...process.env, PORT: port, JWT_SECRET: process.env.JWT_SECRET || 'smoke-test-secret' };

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
  let demoToken = null;
  let branch = null;
  let demoInventoryId = null;
  let demoInventoryQty = null;
  let transferReceived = false;

  try {
    await waitForServer(server);
    const login = await request('/api/auth/login-admin', {
      method: 'POST',
      body: JSON.stringify({ storeCode: 'espresso-lab', email: 'admin@espresso-lab.vn', password: 'admin123456' }),
    });
    assert(login.status === 200 && login.body?.token, 'Dang nhap admin that bai', login);
    demoToken = login.body.token;

    const demoInventory = await request('/api/inventory', { headers: auth(demoToken) });
    assert(demoInventory.status === 200 && demoInventory.body?.length > 0, 'Kho demo khong co nguyen lieu', demoInventory);
    const demoIngredient = demoInventory.body.find((item) => item.name === 'Cà phê Arabica') || demoInventory.body[0];
    demoInventoryId = demoIngredient.id;
    demoInventoryQty = demoIngredient.qty;

    const suffix = `${Date.now()}`.slice(-10);
    const createdBranch = await request('/api/branches', {
      method: 'POST',
      headers: auth(demoToken),
      body: JSON.stringify({ name: `Kho smoke ${suffix}`, code: `kho-smoke-${suffix}`, copyCatalog: true }),
    });
    assert(createdBranch.status === 200 && createdBranch.body?.id, 'Tao chi nhanh test that bai', createdBranch);
    branch = createdBranch.body;

    const switched = await request(`/api/branches/${branch.id}/switch`, {
      method: 'POST', headers: auth(demoToken), body: '{}',
    });
    assert(switched.status === 200 && switched.body?.token, 'Chuyen sang chi nhanh test that bai', switched);
    const branchToken = switched.body.token;

    const [branchInventory, suppliers] = await Promise.all([
      request('/api/inventory', { headers: auth(branchToken) }),
      request('/api/suppliers', { headers: auth(branchToken) }),
    ]);
    assert(branchInventory.status === 200 && branchInventory.body?.length > 0, 'Sao chep danh muc kho that bai', branchInventory);
    assert(suppliers.status === 200 && suppliers.body?.length > 0, 'Sao chep nha cung cap that bai', suppliers);
    const ingredient = branchInventory.body.find((item) => item.name === demoIngredient.name);
    assert(ingredient && ingredient.qty === 0, 'Chi nhanh moi khong co ton kho doc lap bang 0', ingredient);

    const purchase = await request('/api/purchase-orders', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({
        supplierId: suppliers.body[0].id,
        expectedAt: new Date(Date.now() + 86400000).toISOString(),
        note: 'Smoke purchase order',
        items: [{ inventoryId: ingredient.id, orderedQty: 5, unitCost: 100000 }],
      }),
    });
    assert(purchase.status === 201 && purchase.body?.status === 'ordered', 'Tao don mua hang that bai', purchase);
    assert(purchase.body.totalAmount === 500000, 'Tong tien don mua hang sai', purchase.body);

    const received = await request(`/api/purchase-orders/${purchase.body.id}/receive`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(received.status === 200 && received.body?.status === 'received', 'Nhan hang that bai', received);
    assert(received.body.items?.[0]?.receivedQty === 5, 'So luong nhan hang khong duoc ghi nhan', received.body);
    const duplicateReceive = await request(`/api/purchase-orders/${purchase.body.id}/receive`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(duplicateReceive.status === 409, 'Don mua hang co the nhan lap hai lan', duplicateReceive);

    const inventoryAfterReceive = await request('/api/inventory', { headers: auth(branchToken) });
    const receivedIngredient = inventoryAfterReceive.body.find((item) => item.id === ingredient.id);
    assert(receivedIngredient?.qty === 5 && receivedIngredient?.avgCost === 100000, 'Ton kho hoac gia von sau nhan hang sai', receivedIngredient);

    const stocktake = await request('/api/stocktakes', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({ note: 'Smoke stocktake', counts: [{ inventoryId: ingredient.id, countedQty: 4 }] }),
    });
    assert(stocktake.status === 201 && stocktake.body?.status === 'draft', 'Tao phieu kiem ke that bai', stocktake);
    assert(stocktake.body.items?.[0]?.variance === -1, 'Chenh lech kiem ke tinh sai', stocktake.body);
    const posted = await request(`/api/stocktakes/${stocktake.body.id}/post`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(posted.status === 200 && posted.body?.status === 'posted', 'Ghi so kiem ke that bai', posted);
    const duplicatePost = await request(`/api/stocktakes/${stocktake.body.id}/post`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(duplicatePost.status === 409, 'Phieu kiem ke co the ghi so lap', duplicatePost);

    const staleStocktake = await request('/api/stocktakes', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({ counts: [{ inventoryId: ingredient.id, countedQty: 4 }] }),
    });
    assert(staleStocktake.status === 201, 'Tao phieu kiem ke xung dot that bai', staleStocktake);
    const changedStock = await request('/api/inventory/import', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({ inventoryId: ingredient.id, qty: 1, cost: 100000, note: 'Smoke stale stocktake' }),
    });
    assert(changedStock.status === 200 && changedStock.body?.balance === 5, 'Khong tao duoc thay doi ton de test xung dot', changedStock);
    const stalePost = await request(`/api/stocktakes/${staleStocktake.body.id}/post`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(stalePost.status === 409, 'Phieu kiem ke cu van ghi de len ton moi', stalePost);
    const cancelStale = await request(`/api/stocktakes/${staleStocktake.body.id}/cancel`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(cancelStale.status === 200, 'Khong huy duoc phieu kiem ke cu', cancelStale);
    const restoreBranchStock = await request('/api/inventory/adjust', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({ inventoryId: ingredient.id, actualQty: 4, note: 'Restore after stale test' }),
    });
    assert(restoreBranchStock.status === 200 && restoreBranchStock.body?.balance === 4, 'Hoan ton chi nhanh test that bai', restoreBranchStock);

    const transfer = await request('/api/inventory/transfers', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({
        destinationStoreId: login.body.storeId,
        note: 'Smoke branch transfer',
        items: [{ inventoryId: ingredient.id, qty: 1 }],
      }),
    });
    assert(transfer.status === 201 && transfer.body?.status === 'pending', 'Tao phieu dieu chuyen that bai', transfer);
    const transferResult = await request(`/api/inventory/transfers/${transfer.body.id}/receive`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(transferResult.status === 200 && transferResult.body?.status === 'received', 'Nhan dieu chuyen that bai', transferResult);
    transferReceived = true;
    const duplicateTransfer = await request(`/api/inventory/transfers/${transfer.body.id}/receive`, {
      method: 'POST', headers: auth(branchToken), body: '{}',
    });
    assert(duplicateTransfer.status === 409, 'Phieu dieu chuyen co the nhan lap', duplicateTransfer);

    const [sourceAfterTransfer, destinationAfterTransfer, transferList] = await Promise.all([
      request('/api/inventory', { headers: auth(branchToken) }),
      request('/api/inventory', { headers: auth(demoToken) }),
      request('/api/inventory/transfers', { headers: auth(demoToken) }),
    ]);
    assert(sourceAfterTransfer.body.find((item) => item.id === ingredient.id)?.qty === 3, 'Kho nguon tru ton dieu chuyen sai', sourceAfterTransfer);
    assert(destinationAfterTransfer.body.find((item) => item.id === demoInventoryId)?.qty === demoInventoryQty + 1, 'Kho dich cong ton dieu chuyen sai', destinationAfterTransfer);
    assert(transferList.status === 200 && transferList.body.some((item) => item.id === transfer.body.id), 'Chi nhanh dich khong xem duoc phieu dieu chuyen', transferList);

    const backupVoucher = await request('/api/vouchers', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({ code: `BACKUP${suffix}`, type: 'FIXED', value: 1000, maxUses: 7, maxUsesPerCustomer: 2, isActive: true }),
    });
    assert(backupVoucher.status === 200, 'Tao voucher de test backup that bai', backupVoucher);
    const backup = await request('/api/backup/export', { headers: auth(branchToken) });
    assert(backup.status === 200 && backup.body?.store?.code === branch.code, 'Export backup chi nhanh that bai', backup);
    const changedCost = await request('/api/inventory/import', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({ inventoryId: ingredient.id, qty: 1, cost: 200000, note: 'Change cost before restore' }),
    });
    assert(changedCost.status === 200 && changedCost.body?.inventory?.avgCost === 125000, 'Khong thay doi duoc gia von de test restore', changedCost);
    const restore = await request('/api/backup/restore-catalog', {
      method: 'POST',
      headers: auth(branchToken),
      body: JSON.stringify({ backup: backup.body, confirmStoreCode: branch.code }),
    });
    assert(restore.status === 200 && restore.body?.ok, 'Khoi phuc catalog that bai', restore);
    const [restoredInventory, restoredVouchers] = await Promise.all([
      request('/api/inventory', { headers: auth(branchToken) }),
      request('/api/vouchers', { headers: auth(branchToken) }),
    ]);
    const restoredIngredient = restoredInventory.body.find((item) => item.name === ingredient.name);
    const restoredVoucher = restoredVouchers.body.find((item) => item.code === backupVoucher.body.code);
    assert(restoredIngredient?.qty === 3 && restoredIngredient?.avgCost === 100000, 'Backup khong khoi phuc dung ton kho va gia von', restoredIngredient);
    assert(restoredVoucher?.maxUses === 7 && restoredVoucher?.maxUsesPerCustomer === 2, 'Backup khong khoi phuc dung gioi han voucher', restoredVoucher);

    console.log('Supply-chain smoke tests passed.');
  } finally {
    if (demoToken && transferReceived && demoInventoryId && demoInventoryQty !== null) {
      await request('/api/inventory/adjust', {
        method: 'POST', headers: auth(demoToken),
        body: JSON.stringify({ inventoryId: demoInventoryId, actualQty: demoInventoryQty, note: 'Cleanup supply-chain smoke' }),
      }).catch(() => {});
    }
    if (demoToken && branch?.id) {
      await request(`/api/branches/${branch.id}`, { method: 'DELETE', headers: auth(demoToken) }).catch(() => {});
    }
    server.kill('SIGTERM');
    if (server.exitCode === null) await once(server, 'exit').catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
