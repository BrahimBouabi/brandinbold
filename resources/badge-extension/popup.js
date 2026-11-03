function fill(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}
document.getElementById('badge-name').textContent = PROFILE_DATA.name || 'Profile'
document.getElementById('badge-logo').style.background = PROFILE_DATA.color || '#8952ef'
fill('v-timezone', PROFILE_DATA.timezone || '—')
fill('v-coords', PROFILE_DATA.coords || '—')
fill('v-ip', PROFILE_DATA.ip || '—')
fill('v-name', PROFILE_DATA.name || '—')
fill('v-id', PROFILE_DATA.id || '—')
for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    navigator.clipboard.writeText(chip.textContent).then(() => {
      const old = chip.style.outline
      chip.style.outline = '2px solid #10b981'
      setTimeout(() => (chip.style.outline = old), 600)
    })
  })
}
