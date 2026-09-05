import MP4Box from 'mp4box';

export const extractChaptersFromMP4 = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const mp4boxfile = MP4Box.createFile();
        let chapters: any[] = [];
        
        mp4boxfile.onError = function (e: any) {
            reject(e);
        };
        
        mp4boxfile.onReady = function (info: any) {
            // Chapters can be in different forms.
            // MP4Box doesn't directly expose perfectly parsed chapters string, but we can look.
            console.log("MP4Box Ready", info);
        };

        const reader = new FileReader();
        reader.onload = function(e) {
            const buffer = (e.target as any).result;
            (buffer as any).fileStart = 0;
            mp4boxfile.appendBuffer(buffer);
            mp4boxfile.flush();
            resolve(chapters);
        };
        reader.readAsArrayBuffer(file);
    });
};
