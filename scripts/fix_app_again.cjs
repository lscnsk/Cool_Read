const fs = require('fs');

let appTsx = fs.readFileSync('App.tsx', 'utf8');

const regex = /  const \{\n      books,\n      deletedBookIds,\n      isLoading,\n      permissionError,\n      audioBookQueue,\n      isAudioModalOpen,\n      setIsAudioModalOpen,\n      switchMode,\n      handleExternalFilePicked,\n      handleExternalFolderPicked,\n      handleAudioBookConfirm,\n      handleDeleteBook/;

appTsx = appTsx.replace(regex, "");

fs.writeFileSync('App.tsx', appTsx);
console.log("Fixed App.tsx");
