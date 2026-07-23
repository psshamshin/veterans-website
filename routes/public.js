const express = require('express');
const router = express.Router();
const { getOne, getAll, run } = require('../database');
const centralCouncil = require('../data/centralCouncil');
const regionGeoLabels = require('../data/regionGeoLabels');

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function highlightGeo(name, geo) {
  const idx = geo ? name.indexOf(geo) : -1;
  if (idx === -1) return escapeHtml(name);
  return escapeHtml(name.slice(0, idx)) +
    '<strong>' + escapeHtml(name.slice(idx, idx + geo.length)) + '</strong>' +
    escapeHtml(name.slice(idx + geo.length));
}

// Home page
router.get('/', (req, res) => {
  const news = getAll('SELECT * FROM news WHERE is_published = 1 ORDER BY published_at DESC');
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
  const historyLeaders = getAll('SELECT * FROM history_leaders ORDER BY sort_order ASC, id ASC');
  const aboutTexts = {
    history:               getSetting('about_history')               || '',
    structure:             getSetting('about_structure')             || '',
    congress_title:        getSetting('about_congress_title')        || '',
    congress:              getSetting('about_congress')              || '',
    central_council_title: getSetting('about_central_council_title') || '',
    central_council_text:  getSetting('about_central_council_text')  || '',
  };
  res.render('about', { title: 'Об организации', activePage: 'about', chairman, bureau, staff, structureImage, centralCouncil, historyLeaders, aboutTexts });
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
  const extraPhotos = getAll('SELECT image FROM news_photos WHERE news_id = ? ORDER BY sort_order ASC, id ASC', [item.id]);
  const allPhotos = [...(item.image ? [item.image] : []), ...extraPhotos.map(p => p.image)];

  res.render('news-detail', { title: item.title, item, related, allPhotos, activePage: 'news' });
});

// Events
router.get('/events', (req, res) => {
  const upcoming = getAll('SELECT * FROM events WHERE is_past = 0 ORDER BY event_date ASC');
  const past     = getAll('SELECT * FROM events WHERE is_past = 1 ORDER BY event_date DESC');
  res.render('events', { title: 'Мероприятия', upcoming, past, activePage: 'events' });
});

// Documents
router.get('/documents', (req, res) => {
  const documents = getAll('SELECT * FROM documents ORDER BY uploaded_at DESC');
  const allCats = [...new Set(documents.map(d => d.category))];
  const priority = ['устав', 'положени'];
  const isPriority = c => priority.some(p => c.toLowerCase().includes(p));
  const categories = [
    ...allCats.filter(c => isPriority(c)).sort(),
    ...allCats.filter(c => !isPriority(c)).sort(),
  ];
  res.render('documents', { title: 'Документы', documents, categories, activePage: 'documents' });
});

// Gazette "Ветеран" — each issue is one cover image + one downloadable PDF
router.get('/gazette', (req, res) => {
  const issues = getAll('SELECT * FROM gazette_issues ORDER BY title DESC');
  res.render('gazette', { title: 'Газета «Ветеран»', activePage: 'gazette', issues });
});

// Privacy policy
router.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Политика конфиденциальности', activePage: '' });
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

// Gallery — one "folder" per news item with at least one photo
router.get('/gallery', (req, res) => {
  const newsWithPhotos = getAll(`
    SELECT id, title, image, category, published_at FROM news
    WHERE is_published = 1 AND (
      (image IS NOT NULL AND image != '') OR
      id IN (SELECT DISTINCT news_id FROM news_photos)
    )
    ORDER BY published_at DESC
  `);
  const folders = newsWithPhotos.map(n => {
    const extra = getAll('SELECT image FROM news_photos WHERE news_id = ? ORDER BY sort_order ASC, id ASC', [n.id]);
    const photos = [...(n.image ? [n.image] : []), ...extra.map(p => p.image)];
    return {
      id: n.id, title: n.title, category: n.category, published_at: n.published_at,
      cover: photos[0], count: photos.length, photos,
    };
  });
  res.render('gallery', { title: 'Галерея', folders, activePage: 'gallery' });
});

// Activity
router.get('/activity', (req, res) => {
  const getSetting = key => { const r = getOne('SELECT value FROM settings WHERE key = ?', [key]); return r ? r.value : null; };
  const contestsTitle = getSetting('contests_title') || 'Конкурсы и акции';
  const contestsText = getSetting('contests_text') || '';
  const contestPhotos = getAll('SELECT image FROM contest_photos ORDER BY sort_order ASC, id ASC').map(p => p.image);
  const activityPhotos = {
    social:      getSetting('activity_social_image') || '',
    patriotic:   getSetting('activity_patriotic_image') || '',
    cooperation: getSetting('activity_cooperation_image') || '',
  };
  const activityTexts = {
    social_title:      getSetting('activity_social_title')      || 'Социальная защита ветеранов',
    social_text:       getSetting('activity_social_text')       || '',
    patriotic_title:   getSetting('activity_patriotic_title')   || 'Патриотическое воспитание и работа с молодёжью',
    patriotic_text:    getSetting('activity_patriotic_text')    || '',
    cooperation_title: getSetting('activity_cooperation_title') || 'Взаимодействие с органами власти',
    cooperation_text:  getSetting('activity_cooperation_text')  || '',
  };
  res.render('activity', { title: 'Деятельность', activePage: 'activity', contestsTitle, contestsText, contestPhotos, activityPhotos, activityTexts });
});

router.get('/regions', (req, res) => {
  const all = getAll('SELECT * FROM regions ORDER BY city ASC');
  all.forEach(r => { r.nameHtml = highlightGeo(r.name, regionGeoLabels[r.city]); });
  const groupDefs = [
    { key: 'federal',  label: 'Города федерального значения' },
    { key: 'republic', label: 'Республиканские организации' },
    { key: 'krai',     label: 'Краевые организации' },
    { key: 'oblast',   label: 'Областные организации' },
    { key: 'okrug',    label: 'Автономные округа и область' },
  ];
  const grouped = groupDefs
    .map(g => ({ ...g, items: all.filter(r => r.type === g.key) }))
    .filter(g => g.items.length > 0);
  res.render('regions', { title: 'Региональные организации', grouped, total: all.length, activePage: 'regions' });
});

const ACTIVITY_DETAIL_PAGES = {
  social:      'Социальная защита ветеранов',
  patriotic:   'Патриотическое воспитание и работа с молодёжью',
  cooperation: 'Взаимодействие с органами власти',
};

router.get('/activity/:section', (req, res) => {
  const key = req.params.section;
  if (!ACTIVITY_DETAIL_PAGES[key]) return res.status(404).render('404', { title: 'Не найдено' });
  const getSetting = k => { const r = getOne('SELECT value FROM settings WHERE key = ?', [k]); return r ? r.value : null; };
  const title = getSetting('activity_' + key + '_title') || ACTIVITY_DETAIL_PAGES[key];
  const blocks = getAll('SELECT * FROM activity_page_blocks WHERE section = ? ORDER BY sort_order ASC, id ASC', [key]);
  res.render('activity-detail', { title, section: key, blocks, activePage: 'activity' });
});

module.exports = router;
