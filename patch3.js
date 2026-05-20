const fs = require('fs');
let c = fs.readFileSync('frontend/index.html', 'utf8');
c = c.replace(/const navEl = document\.getElementById\(`nav-\$\{name\}`\);\r?\n\s*if \(navEl\) navEl\.classList\.add\('active'\);/g, "const navEl = document.getElementById(`nav-${name}`);\n      if (navEl) navEl.classList.add('active');\n      const mobNavEl = document.getElementById(`mob-nav-${name}`);\n      if (mobNavEl) mobNavEl.classList.add('active');");
fs.writeFileSync('frontend/index.html', c);
