const fs = require('fs');
let appTsx = fs.readFileSync('App.tsx', 'utf8');

const strToReplace = `    isAudioModalOpen,
      setIsAudioModalOpen
  });
    });`;

if (appTsx.indexOf(strToReplace) !== -1) {
   appTsx = appTsx.replace(strToReplace, `    isAudioModalOpen,\n      setIsAudioModalOpen\n  });`);
} else {
   appTsx = appTsx.replace("  });\n    });", "  });");
}

fs.writeFileSync('App.tsx', appTsx);
console.log("Fixed App.tsx");
