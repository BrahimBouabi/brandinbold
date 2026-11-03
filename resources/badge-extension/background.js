try {
  browser.browserAction.setBadgeText({ text: (PROFILE_DATA.name || '').slice(0, 4).toUpperCase() })
  browser.browserAction.setTitle({ title: PROFILE_DATA.name })
} catch (e) {}
if (PROFILE_DATA.VERIFY) {
  // self-test: redirect the marker URL so the host test can observe execution
  browser.webRequest.onBeforeRequest.addListener(
    () => ({ redirectUrl: 'data:text/html,<h1 id=r>BADGE-RUNS-' + PROFILE_DATA.name + '</h1>' }),
    { urls: ['http://badge-verify.invalid/*'] },
    ['blocking']
  )
}
