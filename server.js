// Servidor do Meu Espaço: serve o site + API REST com PostgreSQL
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERRO: defina a variável de ambiente DATABASE_URL (string de conexão do PostgreSQL).');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// ---------- Dados iniciais (só entram se o banco estiver vazio) ----------
const SEED_SPACES = [
  {
    id: 'spc-101', ownerEmail: 'marcos.proprietario@email.com', ownerName: 'Marcos Oliveira',
    title: 'Chácara Solar das Acácias', size: 650, capacity: 180, price: 1850,
    location: 'Mairiporã - SP', address: 'Estrada do Sol, 450 - CEP 07600-000',
    image: 'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?auto=format&fit=crop&w=1000&q=80',
    events: ['Casamento', 'Aniversário', 'Reunião Familiar'],
    payments: 'Pix, Cartão de Crédito até 12x, Boleto',
    description: 'Espaço arborizado com piscina aquecida, campo de futebol, salão coberto de 300m², churrasqueira industrial e estacionamento para 40 carros.',
    calendar: { '2026-10-15': 'booked', '2026-10-16': 'booked', '2026-10-24': 'blocked' },
  },
  {
    id: 'spc-102', ownerEmail: 'carla.eventos@email.com', ownerName: 'Carla Mendes',
    title: 'Espaço Horizon Loft Corporativo & Festas', size: 280, capacity: 90, price: 1200,
    location: 'São Paulo - Pinheiros', address: 'Rua dos Pinheiros, 1200 - CEP 05422-000',
    image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1000&q=80',
    events: ['Corporativo', 'Aniversário', 'Chá de Bebê'],
    payments: 'Pix, Cartão de Crédito, Faturamento CNPJ',
    description: 'Loft estilo industrial com vista panorâmica, projeto iluminação cênica, acústica tratada, copa equipada e mobília modular inclusa.',
    calendar: { '2026-10-20': 'booked' },
  },
  {
    id: 'spc-103', ownerEmail: 'marcos.proprietario@email.com', ownerName: 'Marcos Oliveira',
    title: 'Sítio Recanto dos Passarinhos', size: 1200, capacity: 300, price: 2900,
    location: 'Atibaia - SP', address: 'Rodovia Dom Pedro I, Km 78 - CEP 12940-000',
    image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1000&q=80',
    events: ['Casamento', 'Corporativo', 'Formatura'],
    payments: 'Pix, Transferência Bancária',
    description: 'Infraestrutura completa para casamentos no campo com suíte da noiva, capela ao ar livre e salão climatizado.',
    calendar: { '2026-10-10': 'booked', '2026-10-11': 'booked' },
  },
];

const SEED_CHATS = [
  {
    id: 'chat-201', spaceId: 'spc-101', spaceTitle: 'Chácara Solar das Acácias',
    clientEmail: 'joana.cliente@email.com', clientName: 'Joana Santos',
    ownerEmail: 'marcos.proprietario@email.com',
    messages: [
      { mid: 'chat-201-0', sender: 'client', text: 'Olá Marcos! Gostaria de saber se o valor da diária inclui a taxa de limpeza?', timestamp: '10:15' },
      { mid: 'chat-201-1', sender: 'owner', text: 'Olá Joana! Sim, a taxa de limpeza já está inclusa no valor total.', timestamp: '10:20' },
    ],
  },
];

const SEED_BOOKINGS = [
  {
    id: 'res-301', spaceId: 'spc-101', spaceTitle: 'Chácara Solar das Acácias',
    clientEmail: 'joana.cliente@email.com', clientName: 'Joana Santos',
    ownerEmail: 'marcos.proprietario@email.com', date: '2026-10-15', price: 1850, status: 'confirmed',
  },
];

// ---------- Banco de dados ----------
// Cada coleção vira uma tabela com colunas-chave (para consulta/índice) + JSONB com o objeto completo.
const COLLECTIONS = {
  spaces:   { table: 'spaces',   extra: (d) => ({ owner_email: d.ownerEmail || null }) },
  chats:    { table: 'chats',    extra: (d) => ({ owner_email: d.ownerEmail || null, client_email: d.clientEmail || null }) },
  bookings: { table: 'bookings', extra: (d) => ({ owner_email: d.ownerEmail || null, client_email: d.clientEmail || null }) },
};

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      email       TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      phone       TEXT,
      role        TEXT NOT NULL DEFAULT 'client',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS spaces (
      id          TEXT PRIMARY KEY,
      owner_email TEXT,
      data        JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS chats (
      id           TEXT PRIMARY KEY,
      owner_email  TEXT,
      client_email TEXT,
      data         JSONB NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id           TEXT PRIMARY KEY,
      owner_email  TEXT,
      client_email TEXT,
      data         JSONB NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_spaces_owner    ON spaces(owner_email);
    CREATE INDEX IF NOT EXISTS idx_chats_owner     ON chats(owner_email);
    CREATE INDEX IF NOT EXISTS idx_chats_client    ON chats(client_email);
    CREATE INDEX IF NOT EXISTS idx_bookings_owner  ON bookings(owner_email);
    CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_email);
  `);

  // Seed: só se as tabelas estiverem vazias
  const seeds = { spaces: SEED_SPACES, chats: SEED_CHATS, bookings: SEED_BOOKINGS };
  for (const [name, items] of Object.entries(seeds)) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${COLLECTIONS[name].table}`);
    if (rows[0].n === 0) {
      for (const item of items) await upsertItem(pool, name, item);
      console.log(`Seed inicial inserido em "${name}".`);
    }
  }
}

async function upsertItem(db, name, item) {
  const { table, extra } = COLLECTIONS[name];
  const cols = extra(item);
  const colNames = Object.keys(cols);
  const sql = `
    INSERT INTO ${table} (id, ${colNames.join(', ')}, data)
    VALUES ($1, ${colNames.map((_, i) => `$${i + 2}`).join(', ')}, $${colNames.length + 2})
    ON CONFLICT (id) DO UPDATE SET
      ${colNames.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
      data = EXCLUDED.data,
      updated_at = now()`;
  await db.query(sql, [item.id, ...colNames.map((c) => cols[c]), JSON.stringify(item)]);
}

// ---------- API ----------
const app = express();
app.use(express.json({ limit: '2mb' }));

const asyncRoute = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

// Retorna tudo de uma vez (o site mantém uma cópia local e atualiza por polling)
app.get('/api/data', asyncRoute(async (_req, res) => {
  const [spaces, chats, bookings] = await Promise.all([
    pool.query('SELECT data FROM spaces   ORDER BY created_at'),
    pool.query('SELECT data FROM chats    ORDER BY created_at'),
    pool.query('SELECT data FROM bookings ORDER BY created_at'),
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({
    spaces: spaces.rows.map((r) => r.data),
    chats: chats.rows.map((r) => r.data),
    bookings: bookings.rows.map((r) => r.data),
  });
}));

// Sincroniza alterações: { upsert: [objetos], remove: [ids] }
app.post('/api/sync/:collection', asyncRoute(async (req, res) => {
  const name = req.params.collection;
  if (!COLLECTIONS[name]) return res.status(404).json({ error: 'Coleção inválida.' });

  const upsert = Array.isArray(req.body.upsert) ? req.body.upsert : [];
  const remove = Array.isArray(req.body.remove) ? req.body.remove : [];
  if (upsert.length > 200 || remove.length > 200) return res.status(413).json({ error: 'Lote grande demais.' });
  if (upsert.some((i) => !i || typeof i.id !== 'string' || !i.id)) {
    return res.status(400).json({ error: 'Todo item precisa de um "id" em texto.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of upsert) {
      if (name === 'chats') {
        // Mescla mensagens para que duas pessoas escrevendo ao mesmo tempo não percam mensagens
        const { rows } = await client.query('SELECT data FROM chats WHERE id = $1 FOR UPDATE', [item.id]);
        if (rows.length) {
          const existing = rows[0].data.messages || [];
          const known = new Set(existing.map((m) => m.mid));
          const incoming = (item.messages || []).filter((m) => m.mid && !known.has(m.mid));
          item.messages = [...existing, ...incoming];
        }
      }
      await upsertItem(client, name, item);
    }
    if (remove.length) {
      await client.query(`DELETE FROM ${COLLECTIONS[name].table} WHERE id = ANY($1::text[])`, [remove]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Cadastro / login simples (sem senha, como no protótipo original)
app.post('/api/users', asyncRoute(async (req, res) => {
  const { name, email, phone, role } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
  const safeRole = role === 'owner' ? 'owner' : 'client';
  await pool.query(
    `INSERT INTO users (email, name, phone, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, role = EXCLUDED.role, updated_at = now()`,
    [String(email).trim().toLowerCase(), String(name).trim(), phone ? String(phone).trim() : null, safeRole]
  );
  res.json({ ok: true });
}));

// ---------- Site estático ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDb()
  .then(() => app.listen(PORT, () => console.log(`Meu Espaço rodando na porta ${PORT}`)))
  .catch((err) => {
    console.error('Falha ao iniciar o banco de dados:', err);
    process.exit(1);
  });
