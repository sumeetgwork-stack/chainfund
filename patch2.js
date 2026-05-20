const fs = require('fs');
let c = fs.readFileSync('frontend/index.html', 'utf8');
c = c.replace(/document\.querySelectorAll\('\.nav-item'\)\.forEach\(a => a\.classList\.remove\('active'\)\);/g, "document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));\n      document.querySelectorAll('.mobile-nav-item').forEach(a => a.classList.remove('active'));");
c = c.replace(/const navEl = document\.getElementById\(`nav-\$\{name\}`\);\n\s*if \(navEl\) navEl\.classList\.add\('active'\);/g, "const navEl = document.getElementById(`nav-${name}`);\n      if (navEl) navEl.classList.add('active');\n      const mobNavEl = document.getElementById(`mob-nav-${name}`);\n      if (mobNavEl) mobNavEl.classList.add('active');");
fs.writeFileSync('frontend/index.html', c);
