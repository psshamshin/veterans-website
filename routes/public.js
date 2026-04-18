const express = require('express');
const router = express.Router();
const { getOne, getAll, run } = require('../database');

// Home page
router.get('/', (req, res) => {
  const news = getAll('SELECT * FROM news WHERE is_published = 1 ORDER BY published_at DESC LIMIT 6');
  const galleryPhotos = getAll(`SELECT id, title, image FROM news WHERE is_published = 1 AND image IS NOT NULL AND image != '' ORDER BY published_at DESC LIMIT 6`);
  const getSetting = key => { const r = getOne('SELECT value FROM settings WHERE key = ?', [key]); return r ? r.value : null; };
  const heroSlide1 = getSetting('hero_slide_1');
  const heroSlide2 = getSetting('hero_slide_2');
  const heroSlide3 = getSetting('hero_slide_3');
  res.render('index', { title: 'Главная', news, galleryPhotos, heroSlide1, heroSlide2, heroSlide3, activePage: 'home' });
});

// About
router.get('/about', (req, res) => {
  res.render('about', { title: 'О организации', activePage: 'about' });
});

// Leadership
router.get('/leadership', (req, res) => {
  const leaders = getAll('SELECT * FROM leaders ORDER BY sort_order ASC');
  res.render('leadership', { title: 'Руководящий состав', leaders, activePage: 'leadership' });
});

// News list
router.get('/news', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const category = req.query.category || null;

  let news, total;
  if (category) {
    news  = getAll('SELECT * FROM news WHERE is_published = 1 AND category = ? ORDER BY published_at DESC LIMIT ? OFFSET ?', [category, limit, offset]);
    total = getOne('SELECT COUNT(*) as cnt FROM news WHERE is_published = 1 AND category = ?', [category]).cnt;
  } else {
    news  = getAll('SELECT * FROM news WHERE is_published = 1 ORDER BY published_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    total = getOne('SELECT COUNT(*) as cnt FROM news WHERE is_published = 1').cnt;
  }

  const totalPages = Math.ceil(total / limit);
  const categories = getAll('SELECT DISTINCT category FROM news WHERE is_published = 1');

  res.render('news', { title: 'Новости', news, currentPage: page, totalPages, category, categories, activePage: 'news' });
});

// News detail
router.get('/news/:id', (req, res) => {
  const item = getOne('SELECT * FROM news WHERE id = ? AND is_published = 1', [req.params.id]);
  if (!item) return res.status(404).render('404', { title: 'Не найдено' });

  const related = getAll(
    'SELECT * FROM news WHERE is_published = 1 AND id != ? AND category = ? ORDER BY published_at DESC LIMIT 3',
    [item.id, item.category]
  );

  res.render('news-detail', { title: item.title, item, related, activePage: 'news' });
});

// Events
router.get('/events', (req, res) => {
  const upcoming = getAll('SELECT * FROM events WHERE is_past = 0 ORDER BY event_date ASC');
  const past     = getAll('SELECT * FROM events WHERE is_past = 1 ORDER BY event_date DESC');
  res.render('events', { title: 'Мероприятия', upcoming, past, activePage: 'events' });
});

// Documents
router.get('/documents', (req, res) => {
  const documents  = getAll('SELECT * FROM documents ORDER BY uploaded_at DESC');
  const categories = getAll('SELECT DISTINCT category FROM documents');
  res.render('documents', { title: 'Документы', documents, categories, activePage: 'documents' });
});

// Contacts GET
router.get('/contacts', (req, res) => {
  res.render('contacts', { title: 'Контакты', activePage: 'contacts' });
});

// Contacts POST
router.post('/contacts', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !message) {
    req.flash('error', 'Заполните обязательные поля');
    return res.redirect('/contacts');
  }
  run('INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, email || '', phone || '', subject || '', message]);
  req.flash('success', 'Ваше сообщение отправлено. Мы свяжемся с вами в ближайшее время.');
  res.redirect('/contacts');
});

// Media
router.get('/media', (req, res) => {
  res.render('media', { title: 'СМИ', activePage: 'media' });
});

// Gallery
router.get('/gallery', (req, res) => {
  const photos = getAll(`
    SELECT id, title, image, category, published_at FROM news
    WHERE is_published = 1 AND image IS NOT NULL AND image != ''
    ORDER BY published_at DESC
  `);
  res.render('gallery', { title: 'Галерея', photos, activePage: 'gallery' });
});

// Activity
router.get('/activity', (req, res) => {
  res.render('activity', { title: 'Деятельность', activePage: 'activity' });
});

// Regions
const regions = [
  { city: 'Москва',           name: 'Московский городской совет ветеранов',       address: 'ул. Новый Арбат, д. 36, Москва, 121205',                    phone: '+7 (495) 690-11-22', email: 'info@mosvet.ru',              website: 'https://mosvet.ru',           members: '18 400' },
  { city: 'Санкт-Петербург',  name: 'Совет ветеранов Санкт-Петербурга',           address: 'Невский пр., д. 176, Санкт-Петербург, 191167',               phone: '+7 (812) 274-33-55', email: 'spbvet@mail.ru',              website: 'https://spb-veterans.ru',     members: '12 700' },
  { city: 'Новосибирск',      name: 'Новосибирский областной совет ветеранов',    address: 'ул. Кирова, д. 3, Новосибирск, 630007',                      phone: '+7 (383) 222-45-67', email: 'nsk.veterans@mail.ru',        website: 'https://nsk-veterans.ru',     members: '9 100'  },
  { city: 'Екатеринбург',     name: 'Совет ветеранов Свердловской области',       address: 'ул. Малышева, д. 101, Екатеринбург, 620014',                  phone: '+7 (343) 371-22-10', email: 'ekb.vet@yandex.ru',           website: 'https://ural-veterans.ru',    members: '8 500'  },
  { city: 'Казань',           name: 'Совет ветеранов Республики Татарстан',       address: 'ул. Баумана, д. 9, Казань, 420111',                           phone: '+7 (843) 292-76-88', email: 'kzn.veterans@tatarstan.ru',   website: 'https://tatvet.ru',           members: '7 300'  },
  { city: 'Нижний Новгород',  name: 'Нижегородский областной совет ветеранов',   address: 'ул. Большая Покровская, д. 43, Нижний Новгород, 603000',      phone: '+7 (831) 431-55-90', email: 'nnvet@nnov.ru',               website: 'https://nnov-veterans.ru',    members: '6 800'  },
  { city: 'Краснодар',        name: 'Краснодарский краевой совет ветеранов',      address: 'ул. Красная, д. 28, Краснодар, 350000',                       phone: '+7 (861) 262-30-11', email: 'krd.vet@kuban.ru',            website: 'https://kuban-veterans.ru',   members: '10 200' },
  { city: 'Самара',           name: 'Совет ветеранов Самарской области',          address: 'ул. Куйбышева, д. 151, Самара, 443010',                       phone: '+7 (846) 333-12-44', email: 'samvet@samara.ru',            website: 'https://samara-veterans.ru',  members: '6 100'  },
  { city: 'Ростов-на-Дону',   name: 'Совет ветеранов Ростовской области',         address: 'пр. Соколова, д. 22, Ростов-на-Дону, 344006',                 phone: '+7 (863) 244-77-03', email: 'rostvet@donland.ru',          website: 'https://don-veterans.ru',     members: '8 900'  },
  { city: 'Красноярск',       name: 'Красноярский краевой совет ветеранов',       address: 'пр. Мира, д. 110, Красноярск, 660049',                        phone: '+7 (391) 227-60-15', email: 'krs.vet@krsk.ru',             website: 'https://krsk-veterans.ru',    members: '5 700'  },
  { city: 'Уфа',              name: 'Совет ветеранов Республики Башкортостан',    address: 'ул. Заки Валиди, д. 32, Уфа, 450008',                         phone: '+7 (347) 272-55-80', email: 'ufa.veterans@bashkortostan.ru',website: 'https://bashvet.ru',          members: '7 600'  },
  { city: 'Воронеж',          name: 'Воронежский областной совет ветеранов',      address: 'пр. Революции, д. 30, Воронеж, 394036',                       phone: '+7 (473) 255-44-19', email: 'vrn.vet@govvrn.ru',           website: 'https://vrn-veterans.ru',     members: '5 400'  },
];

router.get('/regions', (req, res) => {
  res.render('regions', { title: 'Региональные организации', regions, activePage: 'regions' });
});

module.exports = router;
