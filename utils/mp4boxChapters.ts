import MP4Box from 'mp4box';

export async function getChaptersFromMp4Box(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const mp4boxfile = MP4Box.createFile();
        let chapters: any[] = [];
        
        mp4boxfile.onError = (e: string) => reject(e);
        mp4boxfile.onReady = (info: any) => {
            // Unused by mp4box default behavior, but it stops processing when ready
            resolve(chapters);
        };

        // Try extracting chpl atoms
        // MP4Box allows inspecting the box tree?
        // Wait, MP4Box.js provides mp4boxfile.moov
        // Let's use a custom onParsing
    });
}
