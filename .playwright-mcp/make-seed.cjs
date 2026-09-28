const fs = require('fs')
const ls = JSON.parse(
  fs.readFileSync(
    'C:/Users/jvpro/Workspace/fintano/.playwright-mcp/prod-ls.json',
    'utf8',
  ),
)
const script = `(() => {
  const ls = ${JSON.stringify(ls)};
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.filter((k) => k && k.startsWith('uf_')).forEach((k) => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(ls)) {
    if (k.startsWith('uf_') && typeof v === 'string') localStorage.setItem(k, v);
  }
  localStorage.removeItem('uf_active_cycle_v1');
  return {
    hasCycle: !!localStorage.getItem('uf_active_cycle_v1'),
    settings: localStorage.getItem('uf_credit_card_settings_v1'),
  };
})()`
fs.writeFileSync(
  'C:/Users/jvpro/Workspace/fintano/.playwright-mcp/seed-prod.js',
  script,
)
console.log('ok', script.length)
