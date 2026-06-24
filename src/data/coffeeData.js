// ============================================================
// COFFEE SHOP - MOCK DATA
// ============================================================

// --- MENU ITEMS ---
export const menuItems = [
  // === CÀ PHÊ ===
  {
    id: 'cf-001',
    name: 'Espresso Đặc Biệt',
    price: 45000,
    category: 'Cà phê',
    description: 'Espresso đậm đà từ hạt Arabica cao nguyên',
    image: 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=400&q=80',
    popular: true,
    prepTime: '3 phút',
  },
  {
    id: 'cf-002',
    name: 'Cappuccino Ý',
    price: 65000,
    category: 'Cà phê',
    description: 'Cappuccino chuẩn vị với lớp foam mịn',
    image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80',
    popular: true,
    prepTime: '5 phút',
  },
  {
    id: 'cf-003',
    name: 'Cà Phê Sữa Đá',
    price: 40000,
    category: 'Cà phê',
    description: 'Cà phê phin truyền thống với sữa đặc',
    image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80',
    popular: true,
    prepTime: '8 phút',
  },
  {
    id: 'cf-004',
    name: 'Latte Caramel',
    price: 70000,
    category: 'Cà phê',
    description: 'Latte mịn mượt với caramel thơm ngọt',
    image: 'https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400&q=80',
    popular: false,
    prepTime: '5 phút',
  },
  {
    id: 'cf-005',
    name: 'Cold Brew 24h',
    price: 75000,
    category: 'Cà phê',
    description: 'Ủ lạnh 24 giờ, vị thanh mượt không gắt',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&q=80',
    popular: false,
    prepTime: '1 phút',
  },
  {
    id: 'cf-006',
    name: 'Americano Đen',
    price: 50000,
    category: 'Cà phê',
    description: 'Espresso pha loãng với nước nóng',
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&q=80',
    popular: false,
    prepTime: '3 phút',
  },

  // === TRÀ ===
  {
    id: 'tea-001',
    name: 'Trà Hoa Cúc Mật Ong',
    price: 50000,
    category: 'Trà',
    description: 'Trà hoa cúc tươi với mật ong nguyên chất',
    image: 'https://images.unsplash.com/photo-1597481499750-3e6b22637536?w=400&q=80',
    popular: true,
    prepTime: '4 phút',
  },
  {
    id: 'tea-002',
    name: 'Matcha Latte Nhật',
    price: 75000,
    category: 'Trà',
    description: 'Matcha ceremonial grade với sữa oat',
    image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&q=80',
    popular: true,
    prepTime: '5 phút',
  },
  {
    id: 'tea-003',
    name: 'Trà Đào Cam Sả',
    price: 55000,
    category: 'Trà',
    description: 'Hòa quyện đào tươi, cam và sả thơm',
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80',
    popular: false,
    prepTime: '4 phút',
  },
  {
    id: 'tea-004',
    name: 'Trà Sữa Trân Châu',
    price: 60000,
    category: 'Trà',
    description: 'Trà sữa Đài Loan với trân châu đen',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
    popular: true,
    prepTime: '6 phút',
  },
  {
    id: 'tea-005',
    name: 'Hồng Trà Lài',
    price: 45000,
    category: 'Trà',
    description: 'Hồng trà ướp hoa lài dịu nhẹ',
    image: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400&q=80',
    popular: false,
    prepTime: '3 phút',
  },

  // === BÁNH NGỌT ===
  {
    id: 'cake-001',
    name: 'Bánh Croissant Bơ',
    price: 45000,
    category: 'Bánh ngọt',
    description: 'Croissant bơ Pháp giòn tan, thơm lừng',
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80',
    popular: true,
    prepTime: '2 phút',
  },
  {
    id: 'cake-002',
    name: 'Tiramisu Cổ Điển',
    price: 85000,
    category: 'Bánh ngọt',
    description: 'Tiramisu Ý với mascarpone và espresso',
    image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&q=80',
    popular: true,
    prepTime: '2 phút',
  },
  {
    id: 'cake-003',
    name: 'Bánh Muffin Việt Quất',
    price: 40000,
    category: 'Bánh ngọt',
    description: 'Muffin xốp với việt quất tươi',
    image: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=400&q=80',
    popular: false,
    prepTime: '2 phút',
  },
  {
    id: 'cake-004',
    name: 'Cheesecake Chanh Dây',
    price: 80000,
    category: 'Bánh ngọt',
    description: 'Cheesecake New York với chanh dây nhiệt đới',
    image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400&q=80',
    popular: false,
    prepTime: '2 phút',
  },
  {
    id: 'cake-005',
    name: 'Waffle Mật Ong',
    price: 65000,
    category: 'Bánh ngọt',
    description: 'Waffle giòn với mật ong và bơ',
    image: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=400&q=80',
    popular: false,
    prepTime: '8 phút',
  },
];

// --- TABLE DATA ---
export const initialTables = [
  // Tầng trệt
  { id: 'T01', name: 'Bàn 01', zone: 'Tầng trệt', capacity: 2, status: 'available', occupiedSince: null },
  { id: 'T02', name: 'Bàn 02', zone: 'Tầng trệt', capacity: 4, status: 'occupied', occupiedSince: '08:30' },
  { id: 'T03', name: 'Bàn 03', zone: 'Tầng trệt', capacity: 4, status: 'dirty', occupiedSince: null },
  { id: 'T04', name: 'Bàn 04', zone: 'Tầng trệt', capacity: 2, status: 'available', occupiedSince: null },
  { id: 'T05', name: 'Bàn 05', zone: 'Tầng trệt', capacity: 6, status: 'occupied', occupiedSince: '09:15' },
  { id: 'T06', name: 'Bàn 06', zone: 'Tầng trệt', capacity: 4, status: 'available', occupiedSince: null },

  // Lầu 1
  { id: 'L01', name: 'Bàn L1', zone: 'Lầu 1', capacity: 2, status: 'available', occupiedSince: null },
  { id: 'L02', name: 'Bàn L2', zone: 'Lầu 1', capacity: 4, status: 'occupied', occupiedSince: '10:00' },
  { id: 'L03', name: 'Bàn L3', zone: 'Lầu 1', capacity: 4, status: 'dirty', occupiedSince: null },
  { id: 'L04', name: 'Bàn L4', zone: 'Lầu 1', capacity: 2, status: 'available', occupiedSince: null },
  { id: 'L05', name: 'Bàn L5', zone: 'Lầu 1', capacity: 8, status: 'available', occupiedSince: null },
  { id: 'L06', name: 'Bàn L6', zone: 'Lầu 1', capacity: 4, status: 'occupied', occupiedSince: '09:45' },

  // Sân vườn
  { id: 'G01', name: 'Sân 01', zone: 'Sân vườn', capacity: 4, status: 'occupied', occupiedSince: '07:30' },
  { id: 'G02', name: 'Sân 02', zone: 'Sân vườn', capacity: 4, status: 'available', occupiedSince: null },
  { id: 'G03', name: 'Sân 03', zone: 'Sân vườn', capacity: 6, status: 'dirty', occupiedSince: null },
  { id: 'G04', name: 'Sân 04', zone: 'Sân vườn', capacity: 2, status: 'available', occupiedSince: null },
  { id: 'G05', name: 'Sân 05', zone: 'Sân vườn', capacity: 4, status: 'available', occupiedSince: null },
  { id: 'G06', name: 'Sân 06', zone: 'Sân vườn', capacity: 2, status: 'occupied', occupiedSince: '11:00' },
];

// --- DASHBOARD DATA ---
export const dashboardData = {
  today: {
    revenue: 4_850_000,
    orders: 47,
    avgOrderValue: 103_191,
    customers: 63,
    target: 6_000_000,
  },
  thisWeek: {
    revenue: 28_540_000,
    orders: 298,
    growth: 12.5,
  },
  thisMonth: {
    revenue: 112_300_000,
    orders: 1204,
    growth: 8.3,
  },
  weeklyRevenue: [
    { day: 'T2', revenue: 3_200_000, orders: 32 },
    { day: 'T3', revenue: 4_100_000, orders: 41 },
    { day: 'T4', revenue: 3_800_000, orders: 38 },
    { day: 'T5', revenue: 4_900_000, orders: 49 },
    { day: 'T6', revenue: 5_600_000, orders: 56 },
    { day: 'T7', revenue: 6_200_000, orders: 62 },
    { day: 'CN', revenue: 4_850_000, orders: 47 },
  ],
  topItems: [
    { id: 'cf-003', name: 'Cà Phê Sữa Đá', sold: 156, revenue: 6_240_000, trend: 'up' },
    { id: 'cf-002', name: 'Cappuccino Ý', sold: 134, revenue: 8_710_000, trend: 'up' },
    { id: 'tea-002', name: 'Matcha Latte Nhật', sold: 112, revenue: 8_400_000, trend: 'up' },
    { id: 'cake-001', name: 'Bánh Croissant Bơ', sold: 98, revenue: 4_410_000, trend: 'stable' },
    { id: 'tea-001', name: 'Trà Hoa Cúc Mật Ong', sold: 87, revenue: 4_350_000, trend: 'down' },
  ],
  recentOrders: [
    { id: '#0047', table: 'Bàn 05', items: 3, total: 180_000, time: '11:24', status: 'completed' },
    { id: '#0046', table: 'Sân 01', items: 5, total: 325_000, time: '11:18', status: 'completed' },
    { id: '#0045', table: 'Bàn L2', items: 2, total: 130_000, time: '11:05', status: 'completed' },
    { id: '#0044', table: 'Bàn 02', items: 4, total: 260_000, time: '10:52', status: 'completed' },
    { id: '#0043', table: 'Bàn L6', items: 6, total: 410_000, time: '10:38', status: 'completed' },
    { id: '#0042', table: 'Sân 06', items: 3, total: 195_000, time: '10:21', status: 'completed' },
  ],
  shifts: [
    { id: 1, name: 'Ca sáng', staff: 'Nguyễn Thị Lan', start: '06:00', end: '14:00', orders: 24, revenue: 2_340_000 },
    { id: 2, name: 'Ca chiều', staff: 'Trần Văn Minh', start: '14:00', end: '22:00', orders: 23, revenue: 2_510_000 },
  ],
};

// --- CATEGORIES ---
export const categories = ['Tất cả', 'Cà phê', 'Trà', 'Bánh ngọt'];

// --- SUGAR & ICE OPTIONS ---
export const sugarOptions = ['100%', '75%', '50%', '25%', '0%'];
export const iceOptions = ['Nhiều đá', 'Ít đá', 'Không đá', 'Nóng'];
