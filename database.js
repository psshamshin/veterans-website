const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function getOne(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

async function getAll(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function run(sql, params = []) {
  await pool.query(sql, params);
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      image TEXT,
      category TEXT DEFAULT 'Новости организации',
      published_at TIMESTAMP DEFAULT NOW(),
      is_published INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      event_date TEXT NOT NULL,
      location TEXT DEFAULT '',
      is_past INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS leaders (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      bio TEXT DEFAULT '',
      photo TEXT,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      category TEXT DEFAULT 'Общие',
      uploaded_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      is_read INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );
  `);

  const admin = await getOne('SELECT id FROM admins WHERE username = $1', ['admin']);
  if (!admin) {
    await run('INSERT INTO admins (username, password) VALUES ($1, $2)', ['admin', 'admin123']);
  }

  const newsCount = await getOne('SELECT COUNT(*)::int as cnt FROM news');
  if (newsCount.cnt === 0) {
    await run(
      'INSERT INTO news (title, content, excerpt, category, published_at) VALUES ($1, $2, $3, $4, $5)',
      [
        'Состоялось торжественное заседание Совета ветеранов',
        '<p>В актовом зале Администрации города состоялось торжественное заседание Совета ветеранов, посвящённое 79-й годовщине Победы в Великой Отечественной войне.</p><p>В мероприятии приняли участие ветераны Великой Отечественной войны, ветераны боевых действий, представители органов власти, общественных организаций и молодёжных объединений.</p><p>На заседании были подведены итоги работы организации за прошедший год, намечены планы на будущее, вручены грамоты и благодарственные письма наиболее активным членам организации.</p>',
        'В актовом зале Администрации города состоялось торжественное заседание Совета ветеранов, посвящённое 79-й годовщине Победы.',
        'Новости организации',
        '2024-05-09 10:00:00'
      ]
    );
    await run(
      'INSERT INTO news (title, content, excerpt, category, published_at) VALUES ($1, $2, $3, $4, $5)',
      [
        'Ветераны приняли участие в акции «Бессмертный полк»',
        '<p>Члены Совета ветеранов приняли активное участие в общероссийской военно-патриотической акции «Бессмертный полк», которая в этом году собрала тысячи участников.</p><p>С портретами своих дедов и прадедов ветераны прошли торжественным маршем по центральным улицам города.</p>',
        'Члены Совета ветеранов приняли активное участие в акции «Бессмертный полк».',
        'Новости организации',
        '2024-05-09 12:00:00'
      ]
    );
    await run(
      'INSERT INTO news (title, content, excerpt, category, published_at) VALUES ($1, $2, $3, $4, $5)',
      [
        'Оказана помощь ветеранам, нуждающимся в поддержке',
        '<p>В рамках программы социальной поддержки ветеранов организация провела акцию по оказанию помощи ветеранам, находящимся в трудной жизненной ситуации.</p><p>Волонтёры посетили на дому ветеранов, доставили продуктовые наборы. Всего в акции приняли участие более 50 волонтёров.</p>',
        'Организация провела акцию по оказанию помощи ветеранам, находящимся в трудной жизненной ситуации.',
        'Новости организации',
        '2024-04-15 09:00:00'
      ]
    );
    await run(
      'INSERT INTO news (title, content, excerpt, category, published_at) VALUES ($1, $2, $3, $4, $5)',
      [
        'Открытие новых первичных организаций в регионах',
        '<p>В нескольких регионах страны открылись новые первичные ветеранские организации, которые вошли в состав Совета ветеранов России.</p><p>Новые организации были созданы в Краснодарском крае, Свердловской области и Республике Татарстан.</p>',
        'В нескольких регионах страны открылись новые первичные ветеранские организации.',
        'Новости в регионах',
        '2024-02-28 11:00:00'
      ]
    );
    await run(
      'INSERT INTO news (title, content, excerpt, category, published_at) VALUES ($1, $2, $3, $4, $5)',
      [
        'Ветераны провели урок мужества для школьников',
        '<p>В рамках программы военно-патриотического воспитания члены Совета ветеранов провели уроки мужества в школах города.</p><p>Школьники с интересом слушали воспоминания ветеранов о военном времени.</p>',
        'Члены Совета ветеранов провели уроки мужества в школах в рамках патриотического воспитания.',
        'Новости в регионах',
        '2024-02-10 10:00:00'
      ]
    );
  }

  const leadersCount = await getOne('SELECT COUNT(*)::int as cnt FROM leaders');
  if (leadersCount.cnt === 0) {
    await run(
      'INSERT INTO leaders (name, position, bio, sort_order) VALUES ($1, $2, $3, $4)',
      ['Иванов Александр Петрович', 'Председатель Совета ветеранов', 'Родился в 1948 году. Участник боевых действий, полковник запаса. Кавалер орденов Красной Звезды. Возглавляет организацию с 2010 года.', 1]
    );
    await run(
      'INSERT INTO leaders (name, position, bio, sort_order) VALUES ($1, $2, $3, $4)',
      ['Петрова Нина Васильевна', 'Заместитель председателя', 'Родилась в 1955 году. Ветеран труда, Заслуженный работник социальной сферы. Более 30 лет посвятила социальной работе с ветеранами.', 2]
    );
    await run(
      'INSERT INTO leaders (name, position, bio, sort_order) VALUES ($1, $2, $3, $4)',
      ['Сидоров Михаил Николаевич', 'Секретарь Совета', 'Родился в 1960 году. Подполковник запаса. Ветеран боевых действий в Афганистане. Награждён медалью «За боевые заслуги».', 3]
    );
  }

  console.log('✅ База данных инициализирована');
}

module.exports = { pool, getOne, getAll, run, initDatabase };
