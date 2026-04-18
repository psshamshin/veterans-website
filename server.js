const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const { initDatabase, getOne } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB (sync — also creates data/ and uploads/ dirs)
initDatabase();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'veterans-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Flash messages
app.use(flash());

// Global locals
app.use((req, res, next) => {
  res.locals.flash_success = req.flash('success');
  res.locals.flash_error = req.flash('error');
  res.locals.isAdmin = req.session && req.session.isAdmin;
  try {
    const logo = getOne("SELECT value FROM settings WHERE key = 'logo'");
    res.locals.siteSettings = { logo: logo ? logo.value : null };
  } catch (_) {
    res.locals.siteSettings = { logo: null };
  }
  next();
});

// Routes
app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Страница не найдена' });
});

// Multer / general error handler
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    req.flash('error', 'Файл слишком большой. Максимальный размер: 50 МБ');
    return res.redirect('back');
  }
  console.error(err);
  res.status(500).render('404', { title: 'Ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`\n✅ Сайт запущен: http://localhost:${PORT}`);
  console.log(`🔐 Панель администратора: http://localhost:${PORT}/admin`);
  console.log(`   Логин: admin | Пароль: admin123\n`);
});
