const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getOne, getAll, run } = require('../database');
const { requireAdmin } = require('../middleware/auth');

// Multer — 50 MB limit
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

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admin = getOne('SELECT * FROM admins WHERE username = ? AND password = ?', [username, password]);
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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

router.get('/', requireAdmin, (req, res) => {
  const stats = {
    newsTotal:     getOne('SELECT COUNT(*) as cnt FROM news').cnt,
    newsPublished: getOne('SELECT COUNT(*) as cnt FROM news WHERE is_published = 1').cnt,
    events:        getOne('SELECT COUNT(*) as cnt FROM events').cnt,
    leaders:       getOne('SELECT COUNT(*) as cnt FROM leaders').cnt,
    messages:      getOne('SELECT COUNT(*) as cnt FROM messages').cnt,
    unread:        getOne('SELECT COUNT(*) as cnt FROM messages WHERE is_read = 0').cnt,
  };
  const recentNews     = getAll('SELECT * FROM news ORDER BY published_at DESC LIMIT 5');
  const recentMessages = getAll('SELECT * FROM messages ORDER BY created_at DESC LIMIT 5');
  res.render('admin/dashboard', { title: 'Панель управления', stats, recentNews, recentMessages, adminUser: req.session.adminUser });
});

// ─── NEWS ─────────────────────────────────────────────────────────────────────

router.get('/news', requireAdmin, (req, res) => {
  const news = getAll('SELECT * FROM news ORDER BY published_at DESC');
  res.render('admin/news-list', { title: 'Управление новостями', news });
});

router.get('/news/new', requireAdmin, (req, res) => {
  res.render('admin/news-edit', { title: 'Добавить новость', item: null });
});

router.post('/news/new', requireAdmin, upload.single('image'), (req, res) => {
  const { title, content, excerpt, category, published_at, is_published } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : null;
  run('INSERT INTO news (title, content, excerpt, image, category, published_at, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, content, excerpt || '', image, category || 'Новости организации', published_at || new Date().toISOString(), is_published ? 1 : 0]);
  req.flash('success', 'Новость добавлена');
  res.redirect('/admin/news');
});

router.get('/news/:id/edit', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM news WHERE id = ?', [req.params.id]);
  if (!item) return res.redirect('/admin/news');
  res.render('admin/news-edit', { title: 'Редактировать новость', item });
});

router.post('/news/:id/edit', requireAdmin, upload.single('image'), (req, res) => {
  const { title, content, excerpt, category, published_at, is_published } = req.body;
  const existing = getOne('SELECT * FROM news WHERE id = ?', [req.params.id]);
  const image = req.file ? '/uploads/' + req.file.filename : existing.image;
  run('UPDATE news SET title=?, content=?, excerpt=?, image=?, category=?, published_at=?, is_published=? WHERE id=?',
      [title, content, excerpt || '', image, category || 'Новости организации', published_at, is_published ? 1 : 0, req.params.id]);
  req.flash('success', 'Новость обновлена');
  res.redirect('/admin/news');
});

router.post('/news/:id/delete', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM news WHERE id = ?', [req.params.id]);
  if (item && item.image) {
    const filePath = path.join(__dirname, '..', item.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  run('DELETE FROM news WHERE id = ?', [req.params.id]);
  req.flash('success', 'Новость удалена');
  res.redirect('/admin/news');
});

// ─── EVENTS ───────────────────────────────────────────────────────────────────

router.get('/events', requireAdmin, (req, res) => {
  const events = getAll('SELECT * FROM events ORDER BY event_date DESC');
  res.render('admin/events-list', { title: 'Управление мероприятиями', events });
});

router.get('/events/new', requireAdmin, (req, res) => {
  res.render('admin/events-edit', { title: 'Добавить мероприятие', item: null });
});

router.post('/events/new', requireAdmin, (req, res) => {
  const { title, description, event_date, location, is_past } = req.body;
  run('INSERT INTO events (title, description, event_date, location, is_past) VALUES (?, ?, ?, ?, ?)',
      [title, description || '', event_date, location || '', is_past ? 1 : 0]);
  req.flash('success', 'Мероприятие добавлено');
  res.redirect('/admin/events');
});

router.get('/events/:id/edit', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM events WHERE id = ?', [req.params.id]);
  if (!item) return res.redirect('/admin/events');
  res.render('admin/events-edit', { title: 'Редактировать мероприятие', item });
});

router.post('/events/:id/edit', requireAdmin, (req, res) => {
  const { title, description, event_date, location, is_past } = req.body;
  run('UPDATE events SET title=?, description=?, event_date=?, location=?, is_past=? WHERE id=?',
      [title, description || '', event_date, location || '', is_past ? 1 : 0, req.params.id]);
  req.flash('success', 'Мероприятие обновлено');
  res.redirect('/admin/events');
});

router.post('/events/:id/delete', requireAdmin, (req, res) => {
  run('DELETE FROM events WHERE id = ?', [req.params.id]);
  req.flash('success', 'Мероприятие удалено');
  res.redirect('/admin/events');
});

// ─── LEADERS ──────────────────────────────────────────────────────────────────

router.get('/leaders', requireAdmin, (req, res) => {
  const leaders = getAll('SELECT * FROM leaders ORDER BY sort_order ASC');
  res.render('admin/leaders-list', { title: 'Руководящий состав', leaders });
});

router.get('/leaders/new', requireAdmin, (req, res) => {
  res.render('admin/leaders-edit', { title: 'Добавить руководителя', item: null });
});

router.post('/leaders/new', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, position, bio, sort_order } = req.body;
  const photo = req.file ? '/uploads/' + req.file.filename : null;
  run('INSERT INTO leaders (name, position, bio, photo, sort_order) VALUES (?, ?, ?, ?, ?)',
      [name, position, bio || '', photo, parseInt(sort_order) || 0]);
  req.flash('success', 'Руководитель добавлен');
  res.redirect('/admin/leaders');
});

router.get('/leaders/:id/edit', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM leaders WHERE id = ?', [req.params.id]);
  if (!item) return res.redirect('/admin/leaders');
  res.render('admin/leaders-edit', { title: 'Редактировать руководителя', item });
});

router.post('/leaders/:id/edit', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, position, bio, sort_order } = req.body;
  const existing = getOne('SELECT * FROM leaders WHERE id = ?', [req.params.id]);
  const photo = req.file ? '/uploads/' + req.file.filename : existing.photo;
  run('UPDATE leaders SET name=?, position=?, bio=?, photo=?, sort_order=? WHERE id=?',
      [name, position, bio || '', photo, parseInt(sort_order) || 0, req.params.id]);
  req.flash('success', 'Руководитель обновлён');
  res.redirect('/admin/leaders');
});

router.post('/leaders/:id/delete', requireAdmin, (req, res) => {
  run('DELETE FROM leaders WHERE id = ?', [req.params.id]);
  req.flash('success', 'Руководитель удалён');
  res.redirect('/admin/leaders');
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

router.get('/messages', requireAdmin, (req, res) => {
  const messages = getAll('SELECT * FROM messages ORDER BY created_at DESC');
  run('UPDATE messages SET is_read = 1');
  res.render('admin/messages', { title: 'Обращения граждан', messages });
});

router.post('/messages/:id/delete', requireAdmin, (req, res) => {
  run('DELETE FROM messages WHERE id = ?', [req.params.id]);
  req.flash('success', 'Сообщение удалено');
  res.redirect('/admin/messages');
});

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────

router.get('/documents', requireAdmin, (req, res) => {
  const documents = getAll('SELECT * FROM documents ORDER BY uploaded_at DESC');
  res.render('admin/documents-list', { title: 'Управление документами', documents });
});

router.post('/documents/new', requireAdmin, upload.single('file'), (req, res) => {
  const { title, category } = req.body;
  if (!req.file) {
    req.flash('error', 'Выберите файл');
    return res.redirect('/admin/documents');
  }
  run('INSERT INTO documents (title, filename, category) VALUES (?, ?, ?)',
      [title, '/uploads/' + req.file.filename, category || 'Общие']);
  req.flash('success', 'Документ добавлен');
  res.redirect('/admin/documents');
});

router.post('/documents/:id/delete', requireAdmin, (req, res) => {
  run('DELETE FROM documents WHERE id = ?', [req.params.id]);
  req.flash('success', 'Документ удалён');
  res.redirect('/admin/documents');
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

function getSetting(key) { const r = getOne('SELECT value FROM settings WHERE key = ?', [key]); return r ? r.value : null; }
function setSetting(key, value) {
  if (getOne('SELECT key FROM settings WHERE key = ?', [key])) {
    run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
  } else {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

router.get('/settings', requireAdmin, (req, res) => {
  res.render('admin/settings', {
    title: 'Настройки',
    currentLogo: getSetting('logo'),
    heroSlides: { hero_slide_1: getSetting('hero_slide_1'), hero_slide_2: getSetting('hero_slide_2'), hero_slide_3: getSetting('hero_slide_3') },
    structureImage: getSetting('about_structure_image'),
    adminUser: req.session.adminUser,
  });
});

router.post('/settings/logo', requireAdmin, upload.single('logo'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Выберите файл логотипа');
    return res.redirect('/admin/settings');
  }
  const logoPath = '/uploads/' + req.file.filename;
  const existing = getOne("SELECT key FROM settings WHERE key = 'logo'");
  if (existing) {
    run("UPDATE settings SET value = ? WHERE key = 'logo'", [logoPath]);
  } else {
    run("INSERT INTO settings (key, value) VALUES ('logo', ?)", [logoPath]);
  }
  req.flash('success', 'Логотип обновлён');
  res.redirect('/admin/settings');
});

router.post('/settings/logo/delete', requireAdmin, (req, res) => {
  run("DELETE FROM settings WHERE key = 'logo'");
  req.flash('success', 'Логотип удалён, восстановлен стандартный SVG');
  res.redirect('/admin/settings');
});

router.post('/settings/about-structure', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) { req.flash('error', 'Выберите файл'); return res.redirect('/admin/settings'); }
  setSetting('about_structure_image', '/uploads/' + req.file.filename);
  req.flash('success', 'Изображение структуры обновлено');
  res.redirect('/admin/settings');
});

router.post('/settings/about-structure/delete', requireAdmin, (req, res) => {
  run("DELETE FROM settings WHERE key = 'about_structure_image'");
  req.flash('success', 'Изображение удалено');
  res.redirect('/admin/settings');
});

router.post('/settings/hero/:n', requireAdmin, upload.single('slide'), (req, res) => {
  const n = parseInt(req.params.n);
  if (![1,2,3].includes(n) || !req.file) {
    req.flash('error', 'Выберите файл');
    return res.redirect('/admin/settings');
  }
  setSetting('hero_slide_' + n, '/uploads/' + req.file.filename);
  req.flash('success', 'Слайд ' + n + ' обновлён');
  res.redirect('/admin/settings');
});

router.post('/settings/hero/:n/delete', requireAdmin, (req, res) => {
  const n = parseInt(req.params.n);
  if ([1,2,3].includes(n)) run('DELETE FROM settings WHERE key = ?', ['hero_slide_' + n]);
  req.flash('success', 'Слайд удалён');
  res.redirect('/admin/settings');
});

router.post('/settings/password', requireAdmin, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const admin = getOne('SELECT * FROM admins WHERE username = ?', [req.session.adminUser]);
  if (!admin || admin.password !== current_password) {
    req.flash('error', 'Неверный текущий пароль');
    return res.redirect('/admin/settings');
  }
  if (new_password !== confirm_password) {
    req.flash('error', 'Новые пароли не совпадают');
    return res.redirect('/admin/settings');
  }
  if (new_password.length < 6) {
    req.flash('error', 'Пароль должен содержать минимум 6 символов');
    return res.redirect('/admin/settings');
  }
  run('UPDATE admins SET password = ? WHERE username = ?', [new_password, req.session.adminUser]);
  req.flash('success', 'Пароль успешно изменён');
  res.redirect('/admin/settings');
});

module.exports = router;
