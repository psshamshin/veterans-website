// Auto-hide flash messages after 5 seconds
document.addEventListener('DOMContentLoaded', function () {
  const alerts = document.querySelectorAll('.alert-dismissible');
  alerts.forEach(function (alert) {
    setTimeout(function () {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      if (bsAlert) bsAlert.close();
    }, 5000);
  });

  // Phone mask
  const phoneInputs = document.querySelectorAll('input[type="tel"]');
  phoneInputs.forEach(function (input) {
    input.addEventListener('input', function () {
      let val = input.value.replace(/\D/g, '');
      if (val.startsWith('8')) val = '7' + val.slice(1);
      if (val.length > 11) val = val.slice(0, 11);
      if (val.length === 0) { input.value = ''; return; }
      let formatted = '+' + val[0];
      if (val.length > 1) formatted += ' (' + val.slice(1, 4);
      if (val.length >= 4) formatted += ') ' + val.slice(4, 7);
      if (val.length >= 7) formatted += '-' + val.slice(7, 9);
      if (val.length >= 9) formatted += '-' + val.slice(9, 11);
      input.value = formatted;
    });
  });
});

// Shared photo lightbox (used by Gallery folders and "all photos" links on news pages)
let lightboxPhotos = [];
let lightboxIndex = 0;

function openLightbox(photos, startIndex, title) {
  lightboxPhotos = photos;
  lightboxIndex = startIndex || 0;
  document.getElementById('lightboxTitle').textContent = title || '';
  updateLightboxImage();
  document.getElementById('lightboxOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightboxOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function lightboxPrev() {
  lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length;
  updateLightboxImage();
}

function lightboxNext() {
  lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length;
  updateLightboxImage();
}

function updateLightboxImage() {
  document.getElementById('lightboxImg').src = lightboxPhotos[lightboxIndex];
  document.getElementById('lightboxCounter').textContent =
    lightboxPhotos.length > 1 ? (lightboxIndex + 1) + ' / ' + lightboxPhotos.length : '';
  document.querySelectorAll('.lightbox-nav').forEach(function (btn) {
    btn.style.display = lightboxPhotos.length > 1 ? '' : 'none';
  });
}

document.addEventListener('keydown', function (e) {
  const overlay = document.getElementById('lightboxOverlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lightboxPrev();
  if (e.key === 'ArrowRight') lightboxNext();
});
