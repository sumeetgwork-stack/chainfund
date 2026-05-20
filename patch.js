const fs = require('fs');
let c = fs.readFileSync('frontend/index.html', 'utf8');
c = c.replace(/document\.getElementById\('user-initials'\)\.textContent = initials;/g, "document.getElementById('user-initials').textContent = initials;\n        document.getElementById('mobile-profile-btn').textContent = initials;");
c = c.replace(/document\.getElementById\('topbar-loggedin'\)\.style\.display = 'none';/g, "document.getElementById('topbar-loggedin').style.display = 'none';\n        document.getElementById('mobile-profile-btn').textContent = '👤';");
fs.writeFileSync('frontend/index.html', c);
