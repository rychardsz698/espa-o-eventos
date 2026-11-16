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

// ---------- Armazenamento local em arquivo JSON ----------
// Não exige PostgreSQL nem DATABASE_URL. Em hospedagens com disco efêmero,
// os dados podem ser perdidos quando o serviço reiniciar ou for publicado novamente.
const fs = require('fs');
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'meu-espaco-data.json');
const COLLECTIONS = ['spaces', 'chats', 'bookings'];
let store = { users: [], spaces: [], chats: [], bookings: [] };
let writeQueue = Promise.resolve();

async function persistStore() {
  const snapshot = JSON.stringify(store, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.promises.writeFile(tempFile, snapshot, 'utf8');
    await fs.promises.rename(tempFile, DATA_FILE);
  });
  return writeQueue;
}

async function initStore() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  try {
    const saved = JSON.parse(await fs.promises.readFile(DATA_FILE, 'utf8'));
    store = {
      users: Array.isArray(saved.users) ? saved.users : [],
      spaces: Array.isArray(saved.spaces) ? saved.spaces : [],
      chats: Array.isArray(saved.chats) ? saved.chats : [],
      bookings: Array.isArray(saved.bookings) ? saved.bookings : [],
    };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // Dados demonstrativos são incluídos apenas na primeira inicialização.
    store.spaces = SEED_SPACES;
    store.chats = SEED_CHATS;
    store.bookings = SEED_BOOKINGS;
    await persistStore();
    console.log('Arquivo de dados criado com os dados iniciais.');
  }
}

// ---------- API ----------
const app = express();
app.use(express.json({ limit: '2mb' }));

const asyncRoute = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error('Erro na API:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erro interno do servidor.' });
  });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: 'json-file' });
});

// Retorna os dados que o site utiliza.
app.get('/api/data', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    spaces: store.spaces,
    chats: store.chats,
    bookings: store.bookings,
  });
});

// Sincroniza alterações: { upsert: [objetos], remove: [ids] }
app.post('/api/sync/:collection', asyncRoute(async (req, res) => {
  const name = req.params.collection;
  if (!COLLECTIONS.includes(name)) return res.status(404).json({ error: 'Coleção inválida.' });

  const upsert = Array.isArray(req.body.upsert) ? req.body.upsert : [];
  const remove = Array.isArray(req.body.remove) ? req.body.remove : [];
  if (upsert.length > 200 || remove.length > 200) {
    return res.status(413).json({ error: 'Lote grande demais.' });
  }
  if (upsert.some((item) => !item || typeof item.id !== 'string' || !item.id)) {
    return res.status(400).json({ error: 'Todo item precisa de um "id" em texto.' });
  }
  if (remove.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'Os identificadores para remoção devem ser textos.' });
  }

  for (const item of upsert) {
    const index = store[name].findIndex((saved) => saved.id === item.id);
    let nextItem = item;
    if (name === 'chats' && index !== -1) {
      // Preserva mensagens já salvas e acrescenta apenas mensagens novas.
      const existing = store.chats[index].messages || [];
      const known = new Set(existing.map((message) => message.mid));
      const incoming = (item.messages || []).filter((message) => message.mid && !known.has(message.mid));
      nextItem = { ...item, messages: [...existing, ...incoming] };
    }
    if (index === -1) store[name].push(nextItem);
    else store[name][index] = nextItem;
  }

  if (remove.length) {
    const ids = new Set(remove);
    store[name] = store[name].filter((item) => !ids.has(item.id));
  }

  await persistStore();
  res.json({ ok: true });
}));

// Cadastro simples, mantendo o comportamento do protótipo original (sem senha).
app.post('/api/users', asyncRoute(async (req, res) => {
  const { name, email, phone, role } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = {
    email: normalizedEmail,
    name: String(name).trim(),
    phone: phone ? String(phone).trim() : null,
    role: role === 'owner' ? 'owner' : 'client',
  };
  const index = store.users.findIndex((saved) => saved.email === normalizedEmail);
  if (index === -1) store.users.push(user);
  else store.users[index] = user;

  await persistStore();
  res.json({ ok: true });
}));

// ---------- Site estático ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initStore()
  .then(() => app.listen(PORT, () => console.log(`Meu Espaço rodando na porta ${PORT}`)))
  .catch((err) => {
    console.error('Falha ao iniciar o armazenamento local:', err);
    process.exit(1);
  });
