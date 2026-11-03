// Self-test hook: tags the page only when VERIFY mode is baked in (test runs only).
try {
  if (typeof BADGE_VERIFY !== 'undefined' && BADGE_VERIFY) {
    document.documentElement.dataset.badgeVerify = PROFILE_NAME
  }
} catch (e) {}
