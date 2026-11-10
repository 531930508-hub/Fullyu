export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  city_en TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  short TEXT NOT NULL,
  address TEXT NOT NULL,
  address_en TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  open INTEGER NOT NULL DEFAULT 1,
  retail_pickup INTEGER NOT NULL DEFAULT 1,
  hours TEXT NOT NULL,
  printer_status TEXT NOT NULL DEFAULT 'online',
  channels_json TEXT NOT NULL,
  positions_json TEXT NOT NULL,
  wait_minutes INTEGER NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  kind TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category_id TEXT NOT NULL,
  series TEXT NOT NULL,
  kind TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  dose_g REAL NOT NULL,
  status TEXT NOT NULL,
  temps_json TEXT NOT NULL,
  ice INTEGER NOT NULL DEFAULT 1,
  member_eligible INTEGER NOT NULL DEFAULT 1,
  desc_zh TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  spec_zh TEXT NOT NULL DEFAULT '',
  spec_en TEXT NOT NULL DEFAULT '',
  tag_zh TEXT NOT NULL DEFAULT '',
  tag_en TEXT NOT NULL DEFAULT '',
  unit_zh TEXT NOT NULL DEFAULT '',
  unit_en TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS stock (
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  grams REAL NOT NULL DEFAULT 0,
  sold_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, product_id),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scope TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  perms_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  all_stores INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_stores (
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  PRIMARY KEY (user_id, store_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  member_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '茶客',
  phone TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  business TEXT NOT NULL,
  store_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  type TEXT NOT NULL,
  seat TEXT,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  total_cents INTEGER NOT NULL,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  pickup_code TEXT,
  pickup_store_id TEXT,
  print_status TEXT NOT NULL DEFAULT 'pending',
  parent_order_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  customer_id TEXT,
  owner_kind TEXT NOT NULL DEFAULT 'customer',
  created_by TEXT,
  payment_ref TEXT,
  payment_method TEXT,
  prepared_at INTEGER,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  delivered_at INTEGER,
  refund_pending INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  kind TEXT NOT NULL,
  series TEXT NOT NULL,
  qty INTEGER NOT NULL,
  refunded_qty INTEGER NOT NULL DEFAULT 0,
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  temp TEXT,
  ice TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS order_units (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  label TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  scanned_at INTEGER,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES order_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS finance_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL,
  settlement TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  cost_cents INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL UNIQUE,
  at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  at TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  batch_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  voided_at INTEGER,
  voided_by TEXT
);

CREATE TABLE IF NOT EXISTS losses (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  qty REAL NOT NULL,
  unit TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  reported_by TEXT,
  decided_by TEXT,
  decided_at INTEGER,
  decision_note TEXT NOT NULL DEFAULT '',
  approval_id TEXT,
  at INTEGER NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  store_id TEXT,
  order_id TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  requested_by TEXT,
  decided_by TEXT,
  comment TEXT NOT NULL DEFAULT '',
  result_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  store_id TEXT,
  order_id TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mappings (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '袋',
  factor REAL NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_finance_store_at ON finance_entries(store_id, at);
CREATE INDEX IF NOT EXISTS idx_expenses_store_at ON expenses(store_id, at);
CREATE INDEX IF NOT EXISTS idx_losses_store_at ON losses(store_id, at);
CREATE INDEX IF NOT EXISTS idx_logs_at ON logs(at);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status, created_at);
`;
