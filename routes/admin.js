const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getOne, getAll, run } = require('../database');
const { requireAdmin } = require('../middleware/auth');

// Multer setup — 50 MB limit
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
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── AUTH ─────────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Вход в панель администратора', layout: false });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await getOne('SELECT * FROM admins WHERE username = $1 AND password = $2', [username, password]);
    if (admin) {
      req.session.isAdmin = true;
      req.session.adminUser = admin.username;
      res.redirect('/admin');
    } else {
      req.flash('error', 'Неверный логин или пароль');
      res.redirect('/admin/login');
    }
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [newsTotal, newsPublished, eventsCount, leadersCount, messagesCount, unreadCount] = await Promise.all([
      getOne('SELECT COUNT(*)::int as cnt FROM news'),
      getOne('SELECT COUNT(*)::int as cnt FROM news WHERE is_published = 1'),
      getOne('SELECT COUNT(*)::int as cnt FROM events'),
      getOne('SELECT COUNT(*)::int as cnt FROM leaders'),
      getOne('SELECT COUNT(*)::int as cnt FROM messages'),
      getOne('SELECT COUNT(*)::int as cnt FROM messages WHERE is_read = 0'),
    ]);
    const stats = {
      newsTotal: newsTotal.cnt,
      newsPublished: newsPublished.cnt,
      events: eventsCount.cnt,
      leaders: leadersCount.cnt,
      messages: messagesCount.cnt,
      unread: unreadCount.cnt,
    };
    const recentNews = await getAll('SELECT * FROM news ORDER BY published_at DESC LIMIT 5');
    const recentMessages = await getAll('SELECT * FROM messages ORDER BY created_at DESC LIMIT 5');
    res.render('admin/dashboard', { title: 'Панель управления', stats, recentNews, recentMessages, adminUser: req.session.adminUser });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка сервера');
  }
});

// ─── NEWS ─────────────────────────────────────────────────────────────────────

router.get('/news', requireAdmin, async (req, res) => {
  try {
    const news = await getAll('SELECT * FROM news ORDER BY published_at DESC');
    res.render('admin/news-list', { title: 'Управление новостями', news });
  } catch (err) { console.error(err); res.status(500).send('Ошибка'); }
});

router.get('/news/new', requireAdmin, (req, res) => {
  res.render('admin/news-edit', { title: 'Добавить новость', item: null });
});

router.post('/news/new', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, content, excerpt, category, published_at, is_published } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    await run(
      'INSERT INTO news (title, content, excerpt, image, category, published_at, is_published) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [title, content, excerpt || '', image, category || 'Новости организации', published_at || new Date().toISOString(), is_published ? 1 : 0]
    );
    req.flash('success', 'Новость добавлена');
    res.redirect('/admin/news');
  } catch (err) { console.error(err); req.flash('error', 'Ошибка'); res.redirect('/admin/news'); }
});

router.get('/news/:id/edit', requireAdmin, async (req, res) => {
  try {
    const item = await getOne('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (!item) return res.redirect('/admin/news');
    res.render('admin/news-edit', { title: 'Редактировать новость', item });
  } catch (err) { console.error(err); res.redirect('/admin/news'); }
});

router.post('/news/:id/edit', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, content, excerpt, category, published_at, is_published } = req.body;
    const existing = await getOne('SELECT * FROM news WHERE id = $1', [req.params.id]);
    const image = req.file ? '/uploads/' + req.file.filename : existing.image;
    await run(
      'UPDATE news SET title=$1, content=$2, excerpt=$3, image=$4, category=$5, published_at=$6, is_published=$7 WHERE id=$8',
      [title, content, excerpt || '', image, category || 'Новости организации', published_at, is_published ? 1 : 0, req.params.id]
    );
    req.flash('success', 'Новость обновлена');
    res.redirect('/admin/news');
  } catch (err) { console.error(err); req.flash('error', 'Ошибка'); res.redirect('/admin/news'); }
});

router.post('/news/:id/delete', requireAdmin, async (req, res) => {
  try {
    const item = await getOne('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (item && item.image) {
      const filePath = path.join(__dirname, '..', item.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await run('DELETE FROM news WHERE id = $1', [req.params.id]);
    req.flash('success', 'Новость удалена');
    res.redirect('/admin/news');
  } catch (err) { console.error(err); res.redirect('/admin/news'); }
});

// ─── EVENTS ───────────────────────────────────────────────────────────────────

router.get('/events', requireAdmin, async (req, res) => {
  try {
    const events = await getAll('SELECT * FROM events ORDER BY event_date DESC');
    res.render('admin/events-list', { title: 'Управление мероприятиями', events });
  } catch (err) { console.error(err); res.status(500).send('Ошибка'); }
});

router.get('/events/new', requireAdmin, (req, res) => {
  res.render('admin/events-edit', { title: 'Добавить мероприятие', item: null });
});

router.post('/events/new', requireAdmin, async (req, res) => {
  try {
    const { title, description, event_date, location, is_past } = req.body;
    await run(
      'INSERT INTO events (title, description, event_date, location, is_past) VALUES ($1, $2, $3, $4, $5)',
      [title, description || '', event_date, location || '', is_past ? 1 : 0]
    );
    req.flash('success', 'Мероприятие добавлено');
    res.redirect('/admin/events');
  } catch (err) { console.error(err); req.flash('error', 'Ошибка'); res.redirect('/admin/events'); }
});

router.get('/events/:id/edit', requireAdmin, async (req, res) => {
  try {
    const item = await getOne('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!item) return res.redirect('/admin/events');
    res.render('admin/events-edit', { title: 'Редактировать мероприятие', item });
  } catch (err) { console.error(err); res.redirect('/admin/events'); }
});

router.post('/events/:id/edit', requireAdmin, async (req, res) => {
  try {
    const { title, description, event_date, location, is_past } = req.body;
    await run(
      'UPDATE events SET title=$1, description=$2, event_date=$3, location=$4, is_past=$5 WHERE id=$6',
      [title, description || '', event_date, location || '', is_past ? 1 : 0, req.params.id]
    );
    req.flash('success', 'Мероприятие обновлено');
    res.redirect('/admin/events');
  } catch (err) { console.error(err); req.flash('error', 'Ошибка'); res.redirect('/admin/events'); }
});

router.post('/events/:id/delete', requireAdmin, async (req, res) => {
  try {
    await run('DELETE FROM events WHERE id = $1', [req.params.id]);
    req.flash('success', 'Мероприятие удалено');
    res.redirect('/admin/events');
  } catch (err) { console.error(err); res.redirect('/admin/events'); }
});

// ─── LEADERS ──────────────────────────────────────────────────────────────────

router.get('/leaders', requireAdmin, async (req, res) => {
  try {
    const leaders = await getAll('SELECT * FROM leaders ORDER BY sort_order ASC');
    res.render('admin/leaders-list', { title: 'Руководящий состав', leaders });
  } catch (err) { console.error(err); res.status(500).send('Ошибка'); }
});

router.get('/leaders/new', requireAdmin, (req, res) => {
  res.render('admin/leaders-edit', { title: 'Добавить руководителя', item: null });
});

router.post('/leaders/new', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { name, position, bio, sort_order } = req.body;
    const photo = req.file ? '/uploads/' + req.file.filename : null;
    await run(
      'INSERT INTO leaders (name, position, bio, photo, sort_order) VALUES ($1, $2, $3, $4, $5)',
      [name, position, bio || '', photo, parseInt(sort_order) || 0]
    );
    req.flash('success', 'Руководитель добавлен');
    res.redirect('/admin/leaders');
  } catch (err) { console.error(err); req.flash('error', 'Ошибка'); res.redirect('/admin/leaders'); }
});

router.get('/leaders/:id/edit', requireAdmin, async (req, res) => {
  try {
    const item = await getOne('SELECT * FROM leaders WHERE id = $1', [req.params.id]);
    if (!item) return res.redirect('/admin/leaders');
    res.render('admin/leaders-edit', { title: 'Редактировать руководителя', item });
  } catch (err) { console.error(err); res.redirect('/admin/leaders'); }
});

router.post('/leaders/:id/edit', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const { name, position, bio, sort_order } = req.body;
    const existing = await getOne('SELECT * FROM leaders WHERE id = $1', [req.params.id]);
    const photo = req.file ? '/uploads/' + req.file.filename : existing.photo;
    await run(
      'UPDATE leaders SET name=$1, position=$2, bio=$3, photo=$4, sort_order=$5 WHERE id=$6',
      [name, position, bio || '', photo, parseInt(sort_order) || 0, req.params.id]
    );
    req.flash('success', 'Руководитель обновлён');
    res.redirect('/admin/leaders');
  } catch (err) { console.error(err); req.flash('error', 'Ошибка'); res.redirect('/admin/leaders'); }
});

router.post('/leaders/:id/delete', requireAdmin, async (req, res) => {
  try {
    await run('DELETE FROM leaders WHERE id = $1', [req.params.id]);
    req.flash('success', 'Руководитель удалён');
    res.redirect('/admin/leaders');
  } catch (err) { console.error(err); res.redirect('/admin/leaders'); }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

router.get('/messages', requireAdmin, async (req, res) => {
  try {
    const messages = await getAll('SELECT * FROM messages ORDER BY created_at DESC');
    await run('UPDATE messages SET is_read = 1');
    res.render('admin/messages', { title: 'Обращения граждан', messages });
  } catch (err) { console.error(err); res.status(500).send('Ошибка'); }
});

router.post('/messages/:id/delete', requireAdmin, async (req, res) => {
  try {
    await run('DELETE FROM messages WHERE id = $1', [req.params.id]);
    req.flash('success', 'Сообщение удалено');
    res.redirect('/admin/messages');
  } catch (err) { console.error(err); res.redirect('/admin/messages'); }
});

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────

router.get('/documents', requireAdmin, async (req, res) => {
  try {
    const documents = await getAll('SELECT * FROM documents ORDER BY uploaded_at DESC');
    res.render('admin/documents-list', { title: 'Управление документами', documents });
  } catch (err) { console.error(err); res.status(500).send('Ошибка'); }
});

router.post('/documents/new', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { title, category } = req.body;
    if (!req.file) {
      req.flash('error', 'Выберите файл');
      return res.redirect('/admin/documents');
    }
    await run(
      'INSERT INTO documents (title, filename, category) VALUES ($1, $2, $3)',
      [title, '/uploads/' + req.file.filename, category || 'Общие']
    );
    req.flash('success', 'Документ добавлен');
    res.redirect('/admin/documents');
  } catch (err) { console.error(err); req.flash('error', 'Ошибка'); res.redirect('/admin/documents'); }
});

router.post('/documents/:id/delete', requireAdmin, async (req, res) => {
  try {
    await run('DELETE FROM documents WHERE id = $1', [req.params.id]);
    req.flash('success', 'Документ удалён');
    res.redirect('/admin/documents');
  } catch (err) { console.error(err); res.redirect('/admin/documents'); }
});

module.exports = router;
