const fs = require('fs');
let code = fs.readFileSync('hooks/useSettings.ts', 'utf8');

code = code.replace("console.log('Loaded settings', parsed);\\nisSettingsLoadedRef.current = true;", "isSettingsLoadedRef.current = true;");

fs.writeFileSync('hooks/useSettings.ts', code);
