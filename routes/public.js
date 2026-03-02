const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// Home page
router.get('/', (req, res) => {
  const db = getDb();
  const news = db.prepare(`
    SELECT * FROM news WHERE is_published = 1
    ORDER BY published_at DESC LIMIT 6
  `).all();
  const events = db.prepare(`
    SELECT * FROM events ORDER BY is_past ASC, event_date ASC LIMIT 4
  `).all();
  res.render('index', { title: 'Главная', news, events, activePage: 'home' });
});

// About
router.get('/about', (req, res) => {
  res.render('about', { title: 'О организации', activePage: 'about' });
});

// Leadership
router.get('/leadership', (req, res) => {
  const db = getDb();
  const leaders = db.prepare('SELECT * FROM leaders ORDER BY sort_order ASC').all();
  res.render('leadership', { title: 'Руководящий состав', leaders, activePage: 'leadership' });
});

// News list
router.get('/news', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const category = req.query.category || null;

  let query = 'SELECT * FROM news WHERE is_published = 1';
  let params = [];
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const news = db.prepare(query).all(...params);

  let countQuery = 'SELECT COUNT(*) as cnt FROM news WHERE is_published = 1';
  let countParams = [];
  if (category) {
    countQuery += ' AND category = ?';
    countParams.push(category);
  }
  const total = db.prepare(countQuery).get(...countParams).cnt;
  const totalPages = Math.ceil(total / limit);

  const categories = db.prepare('SELECT DISTINCT category FROM news WHERE is_published = 1').all();

  res.render('news', {
    title: 'Новости',
    news,
    currentPage: page,
    totalPages,
    category,
    categories,
    activePage: 'news'
  });
});

// News detail
router.get('/news/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM news WHERE id = ? AND is_published = 1').get(req.params.id);
  if (!item) return res.status(404).render('404', { title: 'Не найдено' });

  const related = db.prepare(`
    SELECT * FROM news WHERE is_published = 1 AND id != ? AND category = ?
    ORDER BY published_at DESC LIMIT 3
  `).all(item.id, item.category);

  res.render('news-detail', { title: item.title, item, related, activePage: 'news' });
});

// Events
router.get('/events', (req, res) => {
  const db = getDb();
  const upcoming = db.prepare(`
    SELECT * FROM events WHERE is_past = 0 ORDER BY event_date ASC
  `).all();
  const past = db.prepare(`
    SELECT * FROM events WHERE is_past = 1 ORDER BY event_date DESC
  `).all();
  res.render('events', { title: 'Мероприятия', upcoming, past, activePage: 'events' });
});

// Documents
router.get('/documents', (req, res) => {
  const db = getDb();
  const documents = db.prepare('SELECT * FROM documents ORDER BY uploaded_at DESC').all();
  const categories = db.prepare('SELECT DISTINCT category FROM documents').all();
  res.render('documents', { title: 'Документы', documents, categories, activePage: 'documents' });
});

// Contacts
router.get('/contacts', (req, res) => {
  res.render('contacts', { title: 'Контакты', activePage: 'contacts' });
});

// Contact form submit
router.post('/contacts', (req, res) => {
  const db = getDb();
  const { name, email, phone, subject, message } = req.body;
  if (!name || !message) {
    req.flash('error', 'Заполните обязательные поля');
    return res.redirect('/contacts');
  }
  db.prepare(`
    INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)
  `).run(name, email || '', phone || '', subject || '', message);
  req.flash('success', 'Ваше сообщение отправлено. Мы свяжемся с вами в ближайшее время.');
  res.redirect('/contacts');
});

module.exports = router;
