const fs = require('fs');
let appTsx = fs.readFileSync('App.tsx', 'utf8');

appTsx = appTsx.replace("  });\n  });", "  });");

fs.writeFileSync('App.tsx', appTsx);
console.log("Fixed App.tsx");
