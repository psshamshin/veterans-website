const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'veterans.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

// Auto-clean stale lock left by abrupt process kills
const LOCK_PATH = DB_PATH + '.lock';
if (fs.existsSync(LOCK_PATH)) {
  try { fs.rmSync(LOCK_PATH, { recursive: true, force: true }); } catch (_) {}
}

let _db;

// node-sqlite3-wasm requires an array; wrap so spread args work too
function wrapStmt(stmt) {
  const toArr = args => (args.length === 1 && Array.isArray(args[0])) ? args[0] : Array.from(args);
  return {
    run(...args)  { return stmt.run(toArr(args)); },
    get(...args)  { return stmt.get(toArr(args)); },
    all(...args)  { return stmt.all(toArr(args)); },
  };
}

function getDb() {
  if (!_db) {
    const raw = new Database(DB_PATH);
    _db = {
      prepare(sql) { return wrapStmt(raw.prepare(sql)); },
      exec(sql)    { raw.exec(sql); },
    };
  }
  return _db;
}

function getOne(sql, params = []) { return getDb().prepare(sql).get(...params); }
function getAll(sql, params = []) { return getDb().prepare(sql).all(...params); }
function run(sql, params = [])    { return getDb().prepare(sql).run(...params); }

function initDatabase() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      image TEXT,
      category TEXT DEFAULT 'Новости организации',
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_published INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      event_date TEXT NOT NULL,
      location TEXT DEFAULT '',
      is_past INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS leaders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      bio TEXT DEFAULT '',
      photo TEXT,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      category TEXT DEFAULT 'Общие',
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      members TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      bio TEXT DEFAULT '',
      photo TEXT,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrate leaders: add role column if missing
  try { db.exec(`ALTER TABLE leaders ADD COLUMN role TEXT DEFAULT 'bureau'`); } catch (_) {}

  // Seed admin
  if (!getOne('SELECT id FROM admins WHERE username = ?', ['admin'])) {
    run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', 'admin123']);
  }

  // Seed news
  if (getOne('SELECT COUNT(*) as cnt FROM news').cnt === 0) {
    const ins = (title, content, excerpt, category, published_at) =>
      run('INSERT INTO news (title, content, excerpt, category, published_at) VALUES (?, ?, ?, ?, ?)',
          [title, content, excerpt, category, published_at]);

    ins(
      'Состоялось торжественное заседание Совета ветеранов',
      '<p>В актовом зале Администрации города состоялось торжественное заседание Совета ветеранов, посвящённое 79-й годовщине Победы в Великой Отечественной войне.</p><p>В мероприятии приняли участие ветераны, представители органов власти и молодёжных объединений. Вручены грамоты наиболее активным членам организации.</p>',
      'Торжественное заседание Совета ветеранов, посвящённое 79-й годовщине Победы.',
      'Новости организации', '2024-05-09 10:00:00'
    );
    ins(
      'Ветераны приняли участие в акции «Бессмертный полк»',
      '<p>Члены Совета ветеранов приняли активное участие в общероссийской акции «Бессмертный полк». С портретами своих дедов ветераны прошли торжественным маршем по центральным улицам города.</p>',
      'Члены Совета ветеранов приняли участие в акции «Бессмертный полк».',
      'Новости организации', '2024-05-09 12:00:00'
    );
    ins(
      'Оказана помощь ветеранам, нуждающимся в поддержке',
      '<p>В рамках программы социальной поддержки организация провела акцию помощи ветеранам в трудной жизненной ситуации. Более 50 волонтёров посетили свыше 100 ветеранов по всему региону.</p>',
      'Организация провела акцию помощи ветеранам в трудной жизненной ситуации.',
      'Новости организации', '2024-04-15 09:00:00'
    );
    ins(
      'Открытие новых первичных организаций в регионах',
      '<p>В Краснодарском крае, Свердловской области и Республике Татарстан открылись новые первичные ветеранские организации. Совет ветеранов России объединяет более 14 000 первичных организаций.</p>',
      'В нескольких регионах открылись новые первичные ветеранские организации.',
      'Новости в регионах', '2024-02-28 11:00:00'
    );
    ins(
      'Ветераны провели урок мужества для школьников',
      '<p>Члены Совета ветеранов провели уроки мужества в школах города. Школьники с интересом слушали воспоминания ветеранов о военном времени.</p>',
      'Члены Совета ветеранов провели уроки мужества в школах.',
      'Новости в регионах', '2024-02-10 10:00:00'
    );
  }

  // Seed leaders
  if (getOne('SELECT COUNT(*) as cnt FROM leaders').cnt === 0) {
    const ins = (name, position, bio, sort_order) =>
      run('INSERT INTO leaders (name, position, bio, sort_order) VALUES (?, ?, ?, ?)',
          [name, position, bio, sort_order]);

    ins('Иванов Александр Петрович', 'Председатель Совета ветеранов',
        'Родился в 1948 году. Участник боевых действий, полковник запаса. Кавалер орденов Красной Звезды. Возглавляет организацию с 2010 года.', 1);
    ins('Петрова Нина Васильевна', 'Заместитель председателя',
        'Родилась в 1955 году. Ветеран труда, Заслуженный работник социальной сферы. Более 30 лет посвятила социальной работе с ветеранами.', 2);
    ins('Сидоров Михаил Николаевич', 'Секретарь Совета',
        'Родился в 1960 году. Подполковник запаса. Ветеран боевых действий в Афганистане. Награждён медалью «За боевые заслуги».', 3);
  }

  // Seed regions
  if (getOne('SELECT COUNT(*) as cnt FROM regions').cnt === 0) {
    const ins = (city, name, address, phone, email, website, members, sort_order) =>
      run('INSERT INTO regions (city,name,address,phone,email,website,members,sort_order) VALUES (?,?,?,?,?,?,?,?)',
          [city, name, address, phone, email, website, members, sort_order]);
    ins('Москва','Московский городской совет ветеранов','ул. Новый Арбат, д. 36, Москва, 121205','+7 (495) 690-11-22','info@mosvet.ru','https://mosvet.ru','18 400',1);
    ins('Санкт-Петербург','Совет ветеранов Санкт-Петербурга','Невский пр., д. 176, Санкт-Петербург, 191167','+7 (812) 274-33-55','spbvet@mail.ru','https://spb-veterans.ru','12 700',2);
    ins('Новосибирск','Новосибирский областной совет ветеранов','ул. Кирова, д. 3, Новосибирск, 630007','+7 (383) 222-45-67','nsk.veterans@mail.ru','https://nsk-veterans.ru','9 100',3);
    ins('Екатеринбург','Совет ветеранов Свердловской области','ул. Малышева, д. 101, Екатеринбург, 620014','+7 (343) 371-22-10','ekb.vet@yandex.ru','https://ural-veterans.ru','8 500',4);
    ins('Казань','Совет ветеранов Республики Татарстан','ул. Баумана, д. 9, Казань, 420111','+7 (843) 292-76-88','kzn.veterans@tatarstan.ru','https://tatvet.ru','7 300',5);
    ins('Нижний Новгород','Нижегородский областной совет ветеранов','ул. Большая Покровская, д. 43, Нижний Новгород, 603000','+7 (831) 431-55-90','nnvet@nnov.ru','https://nnov-veterans.ru','6 800',6);
    ins('Краснодар','Краснодарский краевой совет ветеранов','ул. Красная, д. 28, Краснодар, 350000','+7 (861) 262-30-11','krd.vet@kuban.ru','https://kuban-veterans.ru','10 200',7);
    ins('Самара','Совет ветеранов Самарской области','ул. Куйбышева, д. 151, Самара, 443010','+7 (846) 333-12-44','samvet@samara.ru','https://samara-veterans.ru','6 100',8);
    ins('Ростов-на-Дону','Совет ветеранов Ростовской области','пр. Соколова, д. 22, Ростов-на-Дону, 344006','+7 (863) 244-77-03','rostvet@donland.ru','https://don-veterans.ru','8 900',9);
    ins('Красноярск','Красноярский краевой совет ветеранов','пр. Мира, д. 110, Красноярск, 660049','+7 (391) 227-60-15','krs.vet@krsk.ru','https://krsk-veterans.ru','5 700',10);
    ins('Уфа','Совет ветеранов Республики Башкортостан','ул. Заки Валиди, д. 32, Уфа, 450008','+7 (347) 272-55-80','ufa.veterans@bashkortostan.ru','https://bashvet.ru','7 600',11);
    ins('Воронеж','Воронежский областной совет ветеранов','пр. Революции, д. 30, Воронеж, 394036','+7 (473) 255-44-19','vrn.vet@govvrn.ru','https://vrn-veterans.ru','5 400',12);
  }

  console.log('✅ База данных инициализирована');
}

module.exports = { getDb, getOne, getAll, run, initDatabase };
