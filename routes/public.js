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
  const chairman = getOne('SELECT * FROM leaders ORDER BY sort_order ASC LIMIT 1');
  const bureau   = getAll('SELECT * FROM leaders ORDER BY sort_order ASC LIMIT -1 OFFSET 1');
  const staff    = getAll('SELECT * FROM staff ORDER BY sort_order ASC');
  const getSetting = key => { const r = getOne('SELECT value FROM settings WHERE key = ?', [key]); return r ? r.value : null; };
  const structureImage = getSetting('about_structure_image');
  res.render('about', { title: 'Об организации', activePage: 'about', chairman, bureau, staff, structureImage });
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

router.get('/regions', (req, res) => {
  const regions = getAll('SELECT * FROM regions ORDER BY sort_order ASC, city ASC');
  res.render('regions', { title: 'Региональные организации', regions, activePage: 'regions' });
});

module.exports = router;
