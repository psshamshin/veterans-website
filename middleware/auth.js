function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  req.flash('error', 'Необходимо войти в систему');
  res.redirect('/admin/login');
}

module.exports = { requireAdmin };
