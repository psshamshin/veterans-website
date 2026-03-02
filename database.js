const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'veterans.db');

// Ensure directories exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Auto-clean stale lock left by abrupt process kills
const LOCK_PATH = DB_PATH + '.lock';
if (fs.existsSync(LOCK_PATH)) {
  try { fs.rmSync(LOCK_PATH, { recursive: true, force: true }); } catch (_) {}
}

let db;

// Wrap a statement so params can be spread (better-sqlite3 style)
// node-sqlite3-wasm requires an array; better-sqlite3 uses spread args
function wrapStmt(stmt) {
  const toArr = args => (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
  return {
    run(...args) { return stmt.run(toArr(args)); },
    get(...args) { return stmt.get(toArr(args)); },
    all(...args) { return stmt.all(toArr(args)); },
  };
}

function wrapDb(rawDb) {
  return {
    prepare(sql) { return wrapStmt(rawDb.prepare(sql)); },
    exec(sql) { rawDb.exec(sql); },
    pragma() {},
  };
}

function getDb() {
  if (!db) {
    db = wrapDb(new Database(DB_PATH));
  }
  return db;
}

function initDatabase() {
  const db = getDb();

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      image TEXT,
      category TEXT DEFAULT 'Новости',
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_published INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      location TEXT,
      is_past INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leaders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      bio TEXT,
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
      email TEXT,
      phone TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
  `);

  // Seed admin
  const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!adminExists) {
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', 'admin123');
  }

  // Seed news
  const newsCount = db.prepare('SELECT COUNT(*) as cnt FROM news').get();
  if (newsCount.cnt === 0) {
    const insertNews = db.prepare(`
      INSERT INTO news (title, content, excerpt, category, published_at) VALUES (?, ?, ?, ?, ?)
    `);
    insertNews.run(
      'Состоялось торжественное заседание Совета ветеранов',
      `<p>В актовом зале Администрации города состоялось торжественное заседание Совета ветеранов, посвящённое 79-й годовщине Победы в Великой Отечественной войне.</p>
      <p>В мероприятии приняли участие ветераны Великой Отечественной войны, ветераны боевых действий, представители органов власти, общественных организаций и молодёжных объединений.</p>
      <p>На заседании были подведены итоги работы организации за прошедший год, намечены планы на будущее, вручены грамоты и благодарственные письма наиболее активным членам организации.</p>
      <p>Председатель совета в своём выступлении подчеркнул важность сохранения исторической памяти и передачи опыта молодому поколению.</p>`,
      'В актовом зале Администрации города состоялось торжественное заседание Совета ветеранов, посвящённое 79-й годовщине Победы в Великой Отечественной войне.',
      'События',
      '2024-05-09 10:00:00'
    );
    insertNews.run(
      'Ветераны приняли участие в военно-патриотической акции «Бессмертный полк»',
      `<p>Члены Совета ветеранов приняли активное участие в общероссийской военно-патриотической акции «Бессмертный полк», которая в этом году собрала тысячи участников.</p>
      <p>С портретами своих дедов и прадедов, павших и выживших в годы Великой Отечественной войны, ветераны прошли торжественным маршем по центральным улицам города.</p>
      <p>Акция «Бессмертный полк» является важной традицией, объединяющей поколения и сохраняющей память о подвиге советского народа.</p>`,
      'Члены Совета ветеранов приняли активное участие в общероссийской военно-патриотической акции «Бессмертный полк».',
      'Мероприятия',
      '2024-05-09 12:00:00'
    );
    insertNews.run(
      'Оказана помощь ветеранам, нуждающимся в поддержке',
      `<p>В рамках программы социальной поддержки ветеранов организация провела акцию по оказанию помощи ветеранам, находящимся в трудной жизненной ситуации.</p>
      <p>Волонтёры и активисты организации посетили на дому ветеранов, которые по состоянию здоровья не могут самостоятельно передвигаться, доставили продуктовые наборы и необходимые предметы первой необходимости.</p>
      <p>Всего в акции приняли участие более 50 волонтёров, которые посетили свыше 100 ветеранов по всему региону.</p>`,
      'Организация провела акцию по оказанию помощи ветеранам, находящимся в трудной жизненной ситуации.',
      'Социальная помощь',
      '2024-04-15 09:00:00'
    );
    insertNews.run(
      'Подписано соглашение о сотрудничестве с Министерством обороны',
      `<p>Совет ветеранов России подписал соглашение о сотрудничестве с Министерством обороны Российской Федерации.</p>
      <p>Документ предусматривает совместную работу по военно-патриотическому воспитанию молодёжи, поддержке ветеранов военной службы, а также участию в памятных мероприятиях.</p>
      <p>В рамках соглашения планируется проведение совместных мероприятий, организация встреч ветеранов с военнослужащими, а также реализация образовательных программ.</p>`,
      'Совет ветеранов России подписал соглашение о сотрудничестве с Министерством обороны Российской Федерации.',
      'Официально',
      '2024-03-20 14:00:00'
    );
    insertNews.run(
      'Открытие новых первичных ветеранских организаций в регионах',
      `<p>В нескольких регионах страны открылись новые первичные ветеранские организации, которые вошли в состав Совета ветеранов России.</p>
      <p>Новые организации были созданы в Краснодарском крае, Свердловской области и Республике Татарстан. В торжественной церемонии открытия приняли участие представители центрального аппарата организации.</p>
      <p>В настоящее время Совет ветеранов России объединяет более 14 000 первичных организаций по всей стране.</p>`,
      'В нескольких регионах страны открылись новые первичные ветеранские организации.',
      'Новости',
      '2024-02-28 11:00:00'
    );
    insertNews.run(
      'Ветераны провели урок мужества для школьников',
      `<p>В рамках программы военно-патриотического воспитания члены Совета ветеранов провели уроки мужества в школах города.</p>
      <p>Ветераны рассказали учащимся о подвиге советского народа в годы Великой Отечественной войны, о героизме и самопожертвовании защитников Отечества.</p>
      <p>Школьники с интересом слушали воспоминания ветеранов, задавали вопросы о военном времени, о судьбах людей, прошедших через испытания войны.</p>`,
      'Члены Совета ветеранов провели уроки мужества в школах города в рамках патриотического воспитания.',
      'Образование',
      '2024-02-10 10:00:00'
    );
  }

  // Seed events
  const eventsCount = db.prepare('SELECT COUNT(*) as cnt FROM events').get();
  if (eventsCount.cnt === 0) {
    const insertEvent = db.prepare(`
      INSERT INTO events (title, description, event_date, location, is_past) VALUES (?, ?, ?, ?, ?)
    `);
    insertEvent.run(
      'День Победы — торжественное шествие',
      'Ежегодное торжественное шествие, посвящённое Дню Победы в Великой Отечественной войне. Возложение венков к Вечному огню.',
      '2024-05-09',
      'Центральная площадь города',
      1
    );
    insertEvent.run(
      'Заседание Совета ветеранов — отчётное собрание',
      'Ежегодное отчётное собрание членов организации. Подведение итогов работы, выборы нового состава руководства.',
      '2024-06-15',
      'Дом культуры ветеранов, ул. Победы, 5',
      0
    );
    insertEvent.run(
      'Военно-спортивная игра «Зарница»',
      'Традиционная военно-спортивная игра для молодёжи при участии ветеранов организации в качестве наставников.',
      '2024-07-20',
      'Парк «Дружба»',
      0
    );
    insertEvent.run(
      'День пожилого человека',
      'Праздничное мероприятие, посвящённое Дню пожилого человека. Концертная программа, чаепитие, чествование старейших членов организации.',
      '2024-10-01',
      'Культурный центр «Ветеран»',
      0
    );
  }

  // Seed leaders
  const leadersCount = db.prepare('SELECT COUNT(*) as cnt FROM leaders').get();
  if (leadersCount.cnt === 0) {
    const insertLeader = db.prepare(`
      INSERT INTO leaders (name, position, bio, sort_order) VALUES (?, ?, ?, ?)
    `);
    insertLeader.run(
      'Иванов Александр Петрович',
      'Председатель Совета ветеранов',
      'Родился в 1948 году. Участник боевых действий, полковник запаса. Кавалер орденов Красной Звезды и «За службу Родине в Вооружённых Силах СССР» III степени. Возглавляет организацию с 2010 года. Под его руководством Совет ветеранов значительно расширил сферу деятельности и объединил тысячи ветеранов по всей стране.',
      1
    );
    insertLeader.run(
      'Петрова Нина Васильевна',
      'Заместитель председателя',
      'Родилась в 1955 году. Ветеран труда, Заслуженный работник социальной сферы. Более 30 лет посвятила социальной работе с ветеранами и пенсионерами. Курирует направление социальной поддержки членов организации.',
      2
    );
    insertLeader.run(
      'Сидоров Михаил Николаевич',
      'Секретарь Совета',
      'Родился в 1960 году. Подполковник запаса. Ветеран боевых действий в Афганистане. Награждён медалью «За боевые заслуги». Отвечает за организационную работу и взаимодействие с региональными отделениями.',
      3
    );
    insertLeader.run(
      'Козлова Татьяна Ивановна',
      'Руководитель комиссии по социальной защите',
      'Родилась в 1958 году. Ветеран труда, бывший государственный служащий. Более 20 лет работает в сфере социальной защиты ветеранов. Организует помощь нуждающимся членам организации.',
      4
    );
  }

  console.log('✅ База данных инициализирована');
}

module.exports = { getDb, initDatabase };
