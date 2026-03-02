const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database');
const { requireAdmin } = require('../middleware/auth');

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── AUTH ────────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Вход в панель администратора', layout: false });
});

router.post('/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);
  if (admin) {
    req.session.isAdmin = true;
    req.session.adminUser = admin.username;
    res.redirect('/admin');
  } else {
    req.flash('error', 'Неверный логин или пароль');
    res.redirect('/admin/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

router.get('/', requireAdmin, (req, res) => {
  const db = getDb();
  const stats = {
    newsTotal: db.prepare('SELECT COUNT(*) as cnt FROM news').get().cnt,
    newsPublished: db.prepare('SELECT COUNT(*) as cnt FROM news WHERE is_published = 1').get().cnt,
    events: db.prepare('SELECT COUNT(*) as cnt FROM events').get().cnt,
    leaders: db.prepare('SELECT COUNT(*) as cnt FROM leaders').get().cnt,
    messages: db.prepare('SELECT COUNT(*) as cnt FROM messages').get().cnt,
    unread: db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE is_read = 0').get().cnt,
  };
  const recentNews = db.prepare('SELECT * FROM news ORDER BY published_at DESC LIMIT 5').all();
  const recentMessages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 5').all();
  res.render('admin/dashboard', {
    title: 'Панель управления',
    stats, recentNews, recentMessages,
    adminUser: req.session.adminUser
  });
});

// ─── NEWS ─────────────────────────────────────────────────────────────────────

router.get('/news', requireAdmin, (req, res) => {
  const db = getDb();
  const news = db.prepare('SELECT * FROM news ORDER BY published_at DESC').all();
  res.render('admin/news-list', { title: 'Управление новостями', news });
});

router.get('/news/new', requireAdmin, (req, res) => {
  res.render('admin/news-edit', { title: 'Добавить новость', item: null });
});

router.post('/news/new', requireAdmin, upload.single('image'), (req, res) => {
  const db = getDb();
  const { title, content, excerpt, category, published_at, is_published } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare(`
    INSERT INTO news (title, content, excerpt, image, category, published_at, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, content, excerpt || '', image, category || 'Новости', published_at || new Date().toISOString(), is_published ? 1 : 0);
  req.flash('success', 'Новость добавлена');
  res.redirect('/admin/news');
});

router.get('/news/:id/edit', requireAdmin, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!item) return res.redirect('/admin/news');
  res.render('admin/news-edit', { title: 'Редактировать новость', item });
});

router.post('/news/:id/edit', requireAdmin, upload.single('image'), (req, res) => {
  const db = getDb();
  const { title, content, excerpt, category, published_at, is_published } = req.body;
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  const image = req.file ? '/uploads/' + req.file.filename : existing.image;
  db.prepare(`
    UPDATE news SET title=?, content=?, excerpt=?, image=?, category=?, published_at=?, is_published=?
    WHERE id=?
  `).run(title, content, excerpt || '', image, category || 'Новости', published_at, is_published ? 1 : 0, req.params.id);
  req.flash('success', 'Новость обновлена');
  res.redirect('/admin/news');
});

router.post('/news/:id/delete', requireAdmin, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (item && item.image) {
    const filePath = path.join(__dirname, '..', item.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  req.flash('success', 'Новость удалена');
  res.redirect('/admin/news');
});

// ─── EVENTS ──────────────────────────────────────────────────────────────────

router.get('/events', requireAdmin, (req, res) => {
  const db = getDb();
  const events = db.prepare('SELECT * FROM events ORDER BY event_date DESC').all();
  res.render('admin/events-list', { title: 'Управление мероприятиями', events });
});

router.get('/events/new', requireAdmin, (req, res) => {
  res.render('admin/events-edit', { title: 'Добавить мероприятие', item: null });
});

router.post('/events/new', requireAdmin, (req, res) => {
  const db = getDb();
  const { title, description, event_date, location, is_past } = req.body;
  db.prepare(`
    INSERT INTO events (title, description, event_date, location, is_past)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, description || '', event_date, location || '', is_past ? 1 : 0);
  req.flash('success', 'Мероприятие добавлено');
  res.redirect('/admin/events');
});

router.get('/events/:id/edit', requireAdmin, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!item) return res.redirect('/admin/events');
  res.render('admin/events-edit', { title: 'Редактировать мероприятие', item });
});

router.post('/events/:id/edit', requireAdmin, (req, res) => {
  const db = getDb();
  const { title, description, event_date, location, is_past } = req.body;
  db.prepare(`
    UPDATE events SET title=?, description=?, event_date=?, location=?, is_past=? WHERE id=?
  `).run(title, description || '', event_date, location || '', is_past ? 1 : 0, req.params.id);
  req.flash('success', 'Мероприятие обновлено');
  res.redirect('/admin/events');
});

router.post('/events/:id/delete', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  req.flash('success', 'Мероприятие удалено');
  res.redirect('/admin/events');
});

// ─── LEADERS ─────────────────────────────────────────────────────────────────

router.get('/leaders', requireAdmin, (req, res) => {
  const db = getDb();
  const leaders = db.prepare('SELECT * FROM leaders ORDER BY sort_order ASC').all();
  res.render('admin/leaders-list', { title: 'Руководящий состав', leaders });
});

router.get('/leaders/new', requireAdmin, (req, res) => {
  res.render('admin/leaders-edit', { title: 'Добавить руководителя', item: null });
});

router.post('/leaders/new', requireAdmin, upload.single('photo'), (req, res) => {
  const db = getDb();
  const { name, position, bio, sort_order } = req.body;
  const photo = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare(`
    INSERT INTO leaders (name, position, bio, photo, sort_order) VALUES (?, ?, ?, ?, ?)
  `).run(name, position, bio || '', photo, parseInt(sort_order) || 0);
  req.flash('success', 'Руководитель добавлен');
  res.redirect('/admin/leaders');
});

router.get('/leaders/:id/edit', requireAdmin, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM leaders WHERE id = ?').get(req.params.id);
  if (!item) return res.redirect('/admin/leaders');
  res.render('admin/leaders-edit', { title: 'Редактировать руководителя', item });
});

router.post('/leaders/:id/edit', requireAdmin, upload.single('photo'), (req, res) => {
  const db = getDb();
  const { name, position, bio, sort_order } = req.body;
  const existing = db.prepare('SELECT * FROM leaders WHERE id = ?').get(req.params.id);
  const photo = req.file ? '/uploads/' + req.file.filename : existing.photo;
  db.prepare(`
    UPDATE leaders SET name=?, position=?, bio=?, photo=?, sort_order=? WHERE id=?
  `).run(name, position, bio || '', photo, parseInt(sort_order) || 0, req.params.id);
  req.flash('success', 'Руководитель обновлён');
  res.redirect('/admin/leaders');
});

router.post('/leaders/:id/delete', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM leaders WHERE id = ?').run(req.params.id);
  req.flash('success', 'Руководитель удалён');
  res.redirect('/admin/leaders');
});

// ─── MESSAGES ────────────────────────────────────────────────────────────────

router.get('/messages', requireAdmin, (req, res) => {
  const db = getDb();
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
  db.prepare('UPDATE messages SET is_read = 1').run();
  res.render('admin/messages', { title: 'Обращения граждан', messages });
});

router.post('/messages/:id/delete', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  req.flash('success', 'Сообщение удалено');
  res.redirect('/admin/messages');
});

// ─── DOCUMENTS ───────────────────────────────────────────────────────────────

router.get('/documents', requireAdmin, (req, res) => {
  const db = getDb();
  const documents = db.prepare('SELECT * FROM documents ORDER BY uploaded_at DESC').all();
  res.render('admin/documents-list', { title: 'Управление документами', documents });
});

router.post('/documents/new', requireAdmin, upload.single('file'), (req, res) => {
  const db = getDb();
  const { title, category } = req.body;
  if (!req.file) {
    req.flash('error', 'Выберите файл');
    return res.redirect('/admin/documents');
  }
  db.prepare(`
    INSERT INTO documents (title, filename, category) VALUES (?, ?, ?)
  `).run(title, '/uploads/' + req.file.filename, category || 'Общие');
  req.flash('success', 'Документ добавлен');
  res.redirect('/admin/documents');
});

router.post('/documents/:id/delete', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  req.flash('success', 'Документ удалён');
  res.redirect('/admin/documents');
});

module.exports = router;
