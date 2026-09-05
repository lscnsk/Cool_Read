const fs = require('fs');

let appTsx = fs.readFileSync('App.tsx', 'utf8');

const stateBlock = `
  const [books, setBooks] = useState<Book[]>([]);
  const [deletedBookIds, setDeletedBookIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  
  const [audioBookQueue, setAudioBookQueue] = useState<{ 
      folderName: string, 
      author?: string,
      extractedCover?: string,
      generatedChapters?: Chapter[],
      files: File[], 
      allFiles: File[] 
  }[]>([]);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
`;

const targetStr = "  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);\n";
if (appTsx.indexOf(targetStr) !== -1) {
    const splitIndex = appTsx.indexOf(targetStr) + targetStr.length;
    appTsx = appTsx.substring(0, splitIndex) + stateBlock + appTsx.substring(splitIndex);
}

// Modify useLibrary arguments
const libraryStr = "  } = useLibrary({\n";
const libraryEnd = "      saveState\n  });\n";
const libraryArgs = `      isNative,
      mode,
      setMode,
      currentBook,
      setCurrentBook,
      setIsPlaying,
      bookProgressMap,
      setBookProgressMap,
      setBookMetadataMap,
      saveMetadata,
      deleteBookHistory,
      handleSelectBook,
      saveState,
      books,
      setBooks,
      deletedBookIds,
      setDeletedBookIds,
      isLoading,
      setIsLoading,
      permissionError,
      setPermissionError,
      audioBookQueue,
      setAudioBookQueue,
      isAudioModalOpen,
      setIsAudioModalOpen`;

const libIdx1 = appTsx.indexOf(libraryStr);
const libIdx2 = appTsx.indexOf(libraryEnd) + 16;
appTsx = appTsx.substring(0, libIdx1) + `  const {
      switchMode,
      handleExternalFilePicked,
      handleExternalFolderPicked,
      handleAudioBookConfirm,
      handleDeleteBook
  } = useLibrary({
${libraryArgs}
  });\n` + appTsx.substring(libIdx2);

fs.writeFileSync('App.tsx', appTsx);
console.log("Updated App.tsx");

// Now update useLibrary.ts to accept these args and not declare state
let useLib = fs.readFileSync('hooks/useLibrary.ts', 'utf8');

const useLibArgs = `    isNative: boolean;
    mode: AppMode;
    setMode: React.Dispatch<React.SetStateAction<AppMode>>;
    currentBook: Book | null;
    setCurrentBook: React.Dispatch<React.SetStateAction<Book | null>>;
    setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    bookProgressMap: Record<string, PersistedState>;
    setBookProgressMap: React.Dispatch<React.SetStateAction<Record<string, PersistedState>>>;
    setBookMetadataMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
    saveMetadata: (id: string, title: string, author: string, coverUrl?: string) => void;
    deleteBookHistory: (id: string) => Promise<void>;
    handleSelectBook: (book: Book, specificProgressMap?: Record<string, PersistedState>) => Promise<void>;
    saveState: (isClosingApp?: boolean) => Promise<PersistedState | null>;
    books: Book[];
    setBooks: React.Dispatch<React.SetStateAction<Book[]>>;
    deletedBookIds: string[];
    setDeletedBookIds: React.Dispatch<React.SetStateAction<string[]>>;
    isLoading: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    permissionError: boolean;
    setPermissionError: React.Dispatch<React.SetStateAction<boolean>>;
    audioBookQueue: { folderName: string, author?: string, extractedCover?: string, generatedChapters?: Chapter[], files: File[], allFiles: File[] }[];
    setAudioBookQueue: React.Dispatch<React.SetStateAction<{ folderName: string, author?: string, extractedCover?: string, generatedChapters?: Chapter[], files: File[], allFiles: File[] }[]>>;
    isAudioModalOpen: boolean;
    setIsAudioModalOpen: React.Dispatch<React.SetStateAction<boolean>>;`;

const libPropsStart = "interface UseLibraryProps {\n";
const libPropsEnd = "}\n\nexport function useLibrary({";
if (useLib.indexOf(libPropsStart) !== -1) {
    const idx1 = useLib.indexOf(libPropsStart) + libPropsStart.length;
    const idx2 = useLib.indexOf(libPropsEnd);
    useLib = useLib.substring(0, idx1) + useLibArgs + "\n" + useLib.substring(idx2);
}

const libFuncStart = "export function useLibrary({\n";
const libFuncEnd = "}: UseLibraryProps) {";
const libFuncArgs = `    isNative,
    mode,
    setMode,
    currentBook,
    setCurrentBook,
    setIsPlaying,
    bookProgressMap,
    setBookProgressMap,
    setBookMetadataMap,
    saveMetadata,
    deleteBookHistory,
    handleSelectBook,
    saveState,
    books,
    setBooks,
    deletedBookIds,
    setDeletedBookIds,
    isLoading,
    setIsLoading,
    permissionError,
    setPermissionError,
    audioBookQueue,
    setAudioBookQueue,
    isAudioModalOpen,
    setIsAudioModalOpen`;

if (useLib.indexOf(libFuncStart) !== -1) {
    const idx1 = useLib.indexOf(libFuncStart) + libFuncStart.length;
    const idx2 = useLib.indexOf(libFuncEnd);
    useLib = useLib.substring(0, idx1) + libFuncArgs + "\n" + useLib.substring(idx2);
}

// Remove the state declarations in useLibrary.ts
const stateStart = "    const [books, setBooks]";
const stateEnd = "    const isScanningRef = useRef<boolean>(false);\n";
if (useLib.indexOf(stateStart) !== -1) {
    const sIdx1 = useLib.indexOf(stateStart);
    const sIdx2 = useLib.indexOf(stateEnd) + stateEnd.length;
    useLib = useLib.substring(0, sIdx1) + useLib.substring(sIdx2);
}

// Also remove them from the return block of useLibrary
useLib = useLib.replace("        books,\n        setBooks,\n        deletedBookIds,\n        isLoading,\n        setIsLoading,\n        permissionError,\n        setPermissionError,\n        audioBookQueue,\n        setAudioBookQueue,\n        isAudioModalOpen,\n        setIsAudioModalOpen,\n", "");

fs.writeFileSync('hooks/useLibrary.ts', useLib);
console.log("Updated hooks/useLibrary.ts");
