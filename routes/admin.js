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
  const newsPhotos = getAll('SELECT * FROM news_photos WHERE news_id = ? ORDER BY sort_order ASC, id ASC', [item.id]);
  res.render('admin/news-edit', { title: 'Редактировать новость', item, newsPhotos });
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
  const extraPhotos = getAll('SELECT * FROM news_photos WHERE news_id = ?', [req.params.id]);
  extraPhotos.forEach(p => {
    const filePath = path.join(__dirname, '..', p.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  run('DELETE FROM news_photos WHERE news_id = ?', [req.params.id]);
  run('DELETE FROM news WHERE id = ?', [req.params.id]);
  req.flash('success', 'Новость удалена');
  res.redirect('/admin/news');
});

// ─── NEWS GALLERY PHOTOS ──────────────────────────────────────────────────────

router.post('/news/:id/photos/new', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Выберите изображение');
    return res.redirect('/admin/news/' + req.params.id + '/edit');
  }
  const maxOrder = getOne('SELECT MAX(sort_order) as m FROM news_photos WHERE news_id = ?', [req.params.id]).m || 0;
  run('INSERT INTO news_photos (news_id, image, sort_order) VALUES (?, ?, ?)',
      [req.params.id, '/uploads/' + req.file.filename, maxOrder + 1]);
  req.flash('success', 'Фото добавлено');
  res.redirect('/admin/news/' + req.params.id + '/edit');
});

router.post('/news/:id/photos/:photoId/delete', requireAdmin, (req, res) => {
  const photo = getOne('SELECT * FROM news_photos WHERE id = ?', [req.params.photoId]);
  if (photo && photo.image) {
    const filePath = path.join(__dirname, '..', photo.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  run('DELETE FROM news_photos WHERE id = ?', [req.params.photoId]);
  req.flash('success', 'Фото удалено');
  res.redirect('/admin/news/' + req.params.id + '/edit');
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
  const { name, position, bio, sort_order, role } = req.body;
  const photo = req.file ? '/uploads/' + req.file.filename : null;
  run('INSERT INTO leaders (name, position, bio, photo, sort_order, role) VALUES (?, ?, ?, ?, ?, ?)',
      [name, position, bio || '', photo, parseInt(sort_order) || 0, role || 'bureau']);
  req.flash('success', 'Руководитель добавлен');
  res.redirect('/admin/leaders');
});

router.get('/leaders/:id/edit', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM leaders WHERE id = ?', [req.params.id]);
  if (!item) return res.redirect('/admin/leaders');
  res.render('admin/leaders-edit', { title: 'Редактировать руководителя', item });
});

router.post('/leaders/:id/edit', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, position, bio, sort_order, role } = req.body;
  const existing = getOne('SELECT * FROM leaders WHERE id = ?', [req.params.id]);
  const photo = req.file ? '/uploads/' + req.file.filename : existing.photo;
  run('UPDATE leaders SET name=?, position=?, bio=?, photo=?, sort_order=?, role=? WHERE id=?',
      [name, position, bio || '', photo, parseInt(sort_order) || 0, role || 'bureau', req.params.id]);
  req.flash('success', 'Руководитель обновлён');
  res.redirect('/admin/leaders');
});

router.post('/leaders/:id/delete', requireAdmin, (req, res) => {
  run('DELETE FROM leaders WHERE id = ?', [req.params.id]);
  req.flash('success', 'Руководитель удалён');
  res.redirect('/admin/leaders');
});

// ─── REGIONS ──────────────────────────────────────────────────────────────────

router.get('/regions', requireAdmin, (req, res) => {
  const regions = getAll('SELECT * FROM regions ORDER BY sort_order ASC, city ASC');
  res.render('admin/regions-list', { title: 'Региональные организации', regions });
});

router.get('/regions/new', requireAdmin, (req, res) => {
  res.render('admin/regions-edit', { title: 'Добавить регион', item: null });
});

router.post('/regions/new', requireAdmin, (req, res) => {
  const { city, name, short_name, chairman, address, phone, email, website, members, type, sort_order } = req.body;
  run('INSERT INTO regions (city,name,short_name,chairman,address,phone,email,website,members,type,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [city, name, short_name||'', chairman||'', address||'', phone||'', email||'', website||'', members||'', type||'oblast', parseInt(sort_order)||0]);
  req.flash('success', 'Регион добавлен');
  res.redirect('/admin/regions');
});

router.get('/regions/:id/edit', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM regions WHERE id = ?', [req.params.id]);
  if (!item) return res.redirect('/admin/regions');
  res.render('admin/regions-edit', { title: 'Редактировать регион', item });
});

router.post('/regions/:id/edit', requireAdmin, (req, res) => {
  const { city, name, short_name, chairman, address, phone, email, website, members, type, sort_order } = req.body;
  run('UPDATE regions SET city=?,name=?,short_name=?,chairman=?,address=?,phone=?,email=?,website=?,members=?,type=?,sort_order=? WHERE id=?',
      [city, name, short_name||'', chairman||'', address||'', phone||'', email||'', website||'', members||'', type||'oblast', parseInt(sort_order)||0, req.params.id]);
  req.flash('success', 'Регион обновлён');
  res.redirect('/admin/regions');
});

router.post('/regions/:id/delete', requireAdmin, (req, res) => {
  run('DELETE FROM regions WHERE id = ?', [req.params.id]);
  req.flash('success', 'Регион удалён');
  res.redirect('/admin/regions');
});

// ─── STAFF ────────────────────────────────────────────────────────────────────

router.get('/staff', requireAdmin, (req, res) => {
  const staff = getAll('SELECT * FROM staff ORDER BY sort_order ASC');
  res.render('admin/staff-list', { title: 'Аппарат организации', staff });
});

router.get('/staff/new', requireAdmin, (req, res) => {
  res.render('admin/staff-edit', { title: 'Добавить сотрудника', item: null });
});

router.post('/staff/new', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, position, bio, sort_order } = req.body;
  const photo = req.file ? '/uploads/' + req.file.filename : null;
  run('INSERT INTO staff (name, position, bio, photo, sort_order) VALUES (?, ?, ?, ?, ?)',
      [name, position, bio || '', photo, parseInt(sort_order) || 0]);
  req.flash('success', 'Сотрудник добавлен');
  res.redirect('/admin/staff');
});

router.get('/staff/:id/edit', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM staff WHERE id = ?', [req.params.id]);
  if (!item) return res.redirect('/admin/staff');
  res.render('admin/staff-edit', { title: 'Редактировать сотрудника', item });
});

router.post('/staff/:id/edit', requireAdmin, upload.single('photo'), (req, res) => {
  const { name, position, bio, sort_order } = req.body;
  const existing = getOne('SELECT * FROM staff WHERE id = ?', [req.params.id]);
  const photo = req.file ? '/uploads/' + req.file.filename : existing.photo;
  run('UPDATE staff SET name=?, position=?, bio=?, photo=?, sort_order=? WHERE id=?',
      [name, position, bio || '', photo, parseInt(sort_order) || 0, req.params.id]);
  req.flash('success', 'Сотрудник обновлён');
  res.redirect('/admin/staff');
});

router.post('/staff/:id/delete', requireAdmin, (req, res) => {
  run('DELETE FROM staff WHERE id = ?', [req.params.id]);
  req.flash('success', 'Сотрудник удалён');
  res.redirect('/admin/staff');
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

// ─── ДЕЯТЕЛЬНОСТЬ: КОНКУРСЫ И АКЦИИ ─────────────────────────────────────────────

const MAX_CONTEST_PHOTOS = 10;

router.get('/contests', requireAdmin, (req, res) => {
  const photos = getAll('SELECT * FROM contest_photos ORDER BY sort_order ASC, id ASC');
  res.render('admin/contests', {
    title: 'Конкурсы и акции',
    contestsTitle: getSetting('contests_title') || 'Конкурсы и акции',
    contestsText: getSetting('contests_text') || '',
    photos,
    maxPhotos: MAX_CONTEST_PHOTOS,
  });
});

router.post('/contests/text', requireAdmin, (req, res) => {
  const { title, text } = req.body;
  setSetting('contests_title', title || 'Конкурсы и акции');
  setSetting('contests_text', text || '');
  req.flash('success', 'Текст обновлён');
  res.redirect('/admin/contests');
});

router.post('/contests/photos/new', requireAdmin, upload.single('image'), (req, res) => {
  const count = getOne('SELECT COUNT(*) as cnt FROM contest_photos').cnt;
  if (count >= MAX_CONTEST_PHOTOS) {
    req.flash('error', `Можно загрузить не более ${MAX_CONTEST_PHOTOS} фотографий`);
    return res.redirect('/admin/contests');
  }
  if (!req.file) {
    req.flash('error', 'Выберите изображение');
    return res.redirect('/admin/contests');
  }
  const maxOrder = getOne('SELECT MAX(sort_order) as m FROM contest_photos').m || 0;
  run('INSERT INTO contest_photos (image, sort_order) VALUES (?, ?)', ['/uploads/' + req.file.filename, maxOrder + 1]);
  req.flash('success', 'Фото добавлено');
  res.redirect('/admin/contests');
});

router.post('/contests/photos/:id/delete', requireAdmin, (req, res) => {
  const item = getOne('SELECT * FROM contest_photos WHERE id = ?', [req.params.id]);
  if (item && item.image) {
    const filePath = path.join(__dirname, '..', item.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  run('DELETE FROM contest_photos WHERE id = ?', [req.params.id]);
  req.flash('success', 'Фото удалено');
  res.redirect('/admin/contests');
});

// ─── GAZETTE "ВЕТЕРАН" (выпуски: обложка + PDF) ────────────────────────────────

const gazetteUpload = upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'file', maxCount: 1 }]);

router.get('/gazette', requireAdmin, (req, res) => {
  const issues = getAll('SELECT * FROM gazette_issues ORDER BY created_at DESC, id DESC');
  res.render('admin/gazette-list', { title: 'Газета «Ветеран»', issues });
});

router.post('/gazette/issues/new', requireAdmin, gazetteUpload, (req, res) => {
  const { title } = req.body;
  const cover = req.files.cover ? '/uploads/' + req.files.cover[0].filename : null;
  const file = req.files.file ? '/uploads/' + req.files.file[0].filename : null;
  if (!title || !cover || !file) {
    req.flash('error', 'Укажите название, обложку и PDF-файл выпуска');
    return res.redirect('/admin/gazette');
  }
  run('INSERT INTO gazette_issues (title, cover, file) VALUES (?, ?, ?)', [title, cover, file]);
  req.flash('success', 'Выпуск добавлен');
  res.redirect('/admin/gazette');
});

router.get('/gazette/issues/:id/edit', requireAdmin, (req, res) => {
  const issue = getOne('SELECT * FROM gazette_issues WHERE id = ?', [req.params.id]);
  if (!issue) return res.redirect('/admin/gazette');
  res.render('admin/gazette-edit', { title: 'Выпуск: ' + issue.title, issue });
});

router.post('/gazette/issues/:id/edit', requireAdmin, gazetteUpload, (req, res) => {
  const { title } = req.body;
  const existing = getOne('SELECT * FROM gazette_issues WHERE id = ?', [req.params.id]);
  let cover = existing.cover;
  if (req.files.cover) {
    if (cover) { const p = path.join(__dirname, '..', cover); if (fs.existsSync(p)) fs.unlinkSync(p); }
    cover = '/uploads/' + req.files.cover[0].filename;
  }
  let file = existing.file;
  if (req.files.file) {
    if (file) { const p = path.join(__dirname, '..', file); if (fs.existsSync(p)) fs.unlinkSync(p); }
    file = '/uploads/' + req.files.file[0].filename;
  }
  run('UPDATE gazette_issues SET title=?, cover=?, file=? WHERE id=?', [title, cover, file, req.params.id]);
  req.flash('success', 'Выпуск обновлён');
  res.redirect('/admin/gazette');
});

router.post('/gazette/issues/:id/delete', requireAdmin, (req, res) => {
  const issue = getOne('SELECT * FROM gazette_issues WHERE id = ?', [req.params.id]);
  [issue && issue.cover, issue && issue.file].forEach(f => {
    if (!f) return;
    const filePath = path.join(__dirname, '..', f);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  run('DELETE FROM gazette_issues WHERE id = ?', [req.params.id]);
  req.flash('success', 'Выпуск удалён');
  res.redirect('/admin/gazette');
});

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

// ===== ДЕЯТЕЛЬНОСТЬ: ФОТО СЕКЦИЙ =====
const ACTIVITY_SECTIONS = [
  { key: 'social',      label: 'Социальная защита' },
  { key: 'patriotic',   label: 'Патриотическое воспитание' },
  { key: 'cooperation', label: 'Взаимодействие с органами власти' },
];

router.get('/activity', requireAdmin, (req, res) => {
  const photos = {};
  ACTIVITY_SECTIONS.forEach(s => { photos[s.key] = getSetting('activity_' + s.key + '_image'); });
  res.render('admin/activity', {
    title: 'Деятельность — фото',
    activePage: 'activity-admin',
    flash_success: req.flash('success'),
    flash_error: req.flash('error'),
    sections: ACTIVITY_SECTIONS,
    photos,
  });
});

router.post('/activity/:section/photo', requireAdmin, upload.single('image'), (req, res) => {
  const section = req.params.section;
  if (!ACTIVITY_SECTIONS.find(s => s.key === section)) return res.redirect('/admin/activity');
  if (!req.file) {
    req.flash('error', 'Файл не выбран');
    return res.redirect('/admin/activity');
  }
  setSetting('activity_' + section + '_image', '/uploads/' + req.file.filename);
  req.flash('success', 'Фото сохранено');
  res.redirect('/admin/activity');
});

router.post('/activity/:section/photo/delete', requireAdmin, (req, res) => {
  const section = req.params.section;
  if (!ACTIVITY_SECTIONS.find(s => s.key === section)) return res.redirect('/admin/activity');
  const current = getSetting('activity_' + section + '_image');
  if (current) {
    const fp = path.join(__dirname, '..', 'public', current.replace(/^\//, ''));
    try { fs.unlinkSync(fp); } catch (e) {}
    setSetting('activity_' + section + '_image', '');
  }
  req.flash('success', 'Фото удалено');
  res.redirect('/admin/activity');
});

// ===== ИСТОРИЯ: РУКОВОДИТЕЛИ =====
router.get('/history-leaders', requireAdmin, (req, res) => {
  const leaders = getAll('SELECT * FROM history_leaders ORDER BY sort_order ASC, id ASC');
  res.render('admin/history-leaders', {
    title: 'Руководители организации',
    activePage: 'history-leaders',
    flash_success: req.flash('success'),
    flash_error: req.flash('error'),
    leaders,
  });
});

router.post('/history-leaders/:id/photo', requireAdmin, upload.single('photo'), (req, res) => {
  const { id } = req.params;
  if (!req.file) { req.flash('error', 'Файл не выбран'); return res.redirect('/admin/history-leaders'); }
  const current = getOne('SELECT photo FROM history_leaders WHERE id = ?', [id]);
  if (current && current.photo) {
    const fp = path.join(__dirname, '..', 'public', current.photo.replace(/^\//, ''));
    try { fs.unlinkSync(fp); } catch (_) {}
  }
  run('UPDATE history_leaders SET photo = ? WHERE id = ?', ['/uploads/' + req.file.filename, id]);
  req.flash('success', 'Фото сохранено');
  res.redirect('/admin/history-leaders');
});

router.post('/history-leaders/:id/photo/delete', requireAdmin, (req, res) => {
  const { id } = req.params;
  const current = getOne('SELECT photo FROM history_leaders WHERE id = ?', [id]);
  if (current && current.photo) {
    const fp = path.join(__dirname, '..', 'public', current.photo.replace(/^\//, ''));
    try { fs.unlinkSync(fp); } catch (_) {}
    run('UPDATE history_leaders SET photo = ? WHERE id = ?', ['', id]);
  }
  req.flash('success', 'Фото удалено');
  res.redirect('/admin/history-leaders');
});

// ===== ОБ ОРГАНИЗАЦИИ: РЕДАКТИРОВАНИЕ ТЕКСТОВ =====
const ABOUT_SECTIONS = [
  { key: 'about_history',   label: 'История организации' },
  { key: 'about_structure', label: 'Структура — описание' },
  { key: 'about_congress',  label: 'Съезд — описание' },
];

router.get('/about-page', requireAdmin, (req, res) => {
  const texts = {};
  ABOUT_SECTIONS.forEach(s => { texts[s.key] = getSetting(s.key) || ''; });
  res.render('admin/about-page', {
    title: 'Об организации — тексты',
    activePage: 'about-page',
    flash_success: req.flash('success'),
    flash_error: req.flash('error'),
    sections: ABOUT_SECTIONS,
    texts,
  });
});

router.post('/about-page/:key', requireAdmin, (req, res) => {
  const { key } = req.params;
  if (!ABOUT_SECTIONS.find(s => s.key === key)) return res.redirect('/admin/about-page');
  setSetting(key, req.body.text || '');
  req.flash('success', 'Текст сохранён');
  res.redirect('/admin/about-page');
});

module.exports = router;
