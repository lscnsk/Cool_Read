export interface MP4Chapter {
    title: string;
    startTime: number; // in seconds
    duration?: number; // in seconds
}

export async function parseM4AChapters(file: File): Promise<{ chapters: MP4Chapter[], fileDuration?: number }> {
    let chapters: MP4Chapter[] = [];
    let fileDuration: number | undefined = undefined;
    
    try {
        const moovData = await locateMoovBox(file);
        if (!moovData) {
            console.warn("Could not locate moov box");
            return { chapters: [] };
        }

        // Get overall duration from mvhd
        const mvhd = findBoxRecursive(moovData, 'mvhd');
        if (mvhd) {
            const mvView = new DataView(mvhd.buffer, mvhd.byteOffset, mvhd.byteLength);
            const mvVersion = mvView.getUint8(0);
            let mvTimescale = 1000;
            let mvDurValue = 0;
            if (mvVersion === 1) {
                mvTimescale = mvView.getUint32(20);
                const high = mvView.getUint32(24);
                const low = mvView.getUint32(28);
                mvDurValue = (high * Math.pow(2, 32)) + low;
            } else {
                mvTimescale = mvView.getUint32(12);
                mvDurValue = mvView.getUint32(16);
            }
            if (mvTimescale > 0) {
                fileDuration = mvDurValue / mvTimescale;
            }
        }
        
        // 1. Try finding 'chpl' (Nero style)
        const chplIdx = findSignatureInBytes(moovData, 'chpl');
        if (chplIdx !== -1) {
            const view = new DataView(moovData.buffer, moovData.byteOffset, moovData.byteLength);
            let chplSize = view.getUint32(chplIdx - 4);
            let headerLen = 8;
            if (chplSize === 1) {
                const high = view.getUint32(chplIdx + 4);
                const low = view.getUint32(chplIdx + 8);
                chplSize = (high * Math.pow(2, 32)) + low;
                headerLen = 16;
            }
            if (chplSize > headerLen && chplIdx - 4 + chplSize <= moovData.byteLength) {
                const chplData = moovData.slice(chplIdx - 4 + headerLen, chplIdx - 4 + chplSize);
                chapters = parseChpl(chplData);
                if (chapters && chapters.length > 0) {
                    console.log("Successfully parsed Nero chapters:", chapters.length);
                    // Add durations for Nero style
                    for (let i = 0; i < chapters.length; i++) {
                        const nextStart = chapters[i+1]?.startTime || fileDuration;
                        if (nextStart !== undefined) {
                            chapters[i].duration = Math.max(0, nextStart - chapters[i].startTime);
                        }
                    }
                    return { chapters, fileDuration };
                }
            }
        }
        
        // 2. Try finding Apple/QuickTime Chapter Track
        const traks = findBoxesRecursive(moovData, 'trak');
        let chapterTrakPayload: Uint8Array | null = null;
        
        // Try finding a sound track to look up referenced chapter track IDS
        let referencedTrackIds: number[] = [];
        for (const trak of traks) {
            const handler = getTrackHandler(trak);
            if (handler === 'soun') {
                referencedTrackIds = getChapterTrackIds(trak);
                if (referencedTrackIds.length > 0) break;
            }
        }
        
        // Find the referenced chapter track or fallback to first 'text' / 'sbtl' track
        if (referencedTrackIds.length > 0) {
            for (const trak of traks) {
                const trId = getTrackId(trak);
                if (trId !== null && referencedTrackIds.includes(trId)) {
                    chapterTrakPayload = trak;
                    break;
                }
            }
        }
        
        if (!chapterTrakPayload) {
            // Fallback: look for first text or subtitle track
            for (const trak of traks) {
                const handler = getTrackHandler(trak);
                if (handler === 'text' || handler === 'sbtl') {
                    chapterTrakPayload = trak;
                    break;
                }
            }
        }
        
        if (chapterTrakPayload) {
            // Parse timescale
            const mdhd = findBoxRecursive(chapterTrakPayload, 'mdhd');
            const timescale = mdhd ? getTrackTimescale(mdhd) : 1000;
            const tsDiv = timescale || 1000;
            
            // Parse stts (timestamps)
            const stts = findBoxRecursive(chapterTrakPayload, 'stts');
            const samples = stts ? parseSttsWithDuration(stts) : [];
            
            // Parse stsz (sizes)
            const stsz = findBoxRecursive(chapterTrakPayload, 'stsz');
            const sampleSizes = stsz ? parseStsz(stsz) : [];
            
            // Parse stco (chunk offsets)
            const stco = findBoxRecursive(chapterTrakPayload, 'stco');
            const co64 = findBoxRecursive(chapterTrakPayload, 'co64');
            let sampleOffsets: number[] = [];
            if (stco) {
                sampleOffsets = parseStco(stco, 'stco');
            } else if (co64) {
                sampleOffsets = parseStco(co64, 'co64');
            }
            
            if (sampleOffsets.length > 0 && sampleSizes.length > 0 && samples.length > 0) {
                const count = Math.min(sampleOffsets.length, sampleSizes.length, samples.length);
                const titles = await readChapterTitles(file, sampleOffsets, sampleSizes);
                
                const parsedChs: MP4Chapter[] = [];
                for (let i = 0; i < count; i++) {
                    const startTime = samples[i].startTime / tsDiv;
                    const duration = samples[i].duration / tsDiv;
                    parsedChs.push({
                        title: titles[i],
                        startTime,
                        duration
                    });
                }
                
                if (parsedChs.length > 0) {
                    console.log("Successfully parsed Apple QuickTime chapters:", parsedChs.length);
                    return { chapters: parsedChs, fileDuration };
                }
            }
        }
    } catch(e) {
        console.error("Failed parsing M4A chapters:", e);
    }
    
    return { chapters, fileDuration };
}

async function locateMoovBox(file: File): Promise<Uint8Array | null> {
    const size = file.size;
    const readSize = Math.min(size, 20 * 1024 * 1024); // Increased slightly for very complex moovs
    
    // Read first chunk
    const firstBuf = await file.slice(0, readSize).arrayBuffer();
    const firstArr = new Uint8Array(firstBuf);
    const moovIdxFirst = findSignatureInBytes(firstArr, 'moov');
    if (moovIdxFirst !== -1) {
        const view = new DataView(firstBuf);
        let moovSize = view.getUint32(moovIdxFirst - 4);
        let headerLen = 8;
        if (moovSize === 1) {
            if (moovIdxFirst + 12 <= firstArr.byteLength) {
                const high = view.getUint32(moovIdxFirst + 4);
                const low = view.getUint32(moovIdxFirst + 8);
                moovSize = (high * Math.pow(2, 32)) + low;
                headerLen = 16;
            }
        }
        
        // If we already have the full moov in the first chunk, just return it
        if (moovIdxFirst - 4 + moovSize <= firstArr.byteLength) {
            return firstArr.slice(moovIdxFirst - 4 + headerLen, moovIdxFirst - 4 + moovSize);
        }
        
        const moovStart = moovIdxFirst - 4;
        const moovSlice = file.slice(moovStart + headerLen, moovStart + moovSize);
        return new Uint8Array(await moovSlice.arrayBuffer());
    }
    
    // Read last chunk if file is larger than readSize
    if (size > readSize) {
        const lastBuf = await file.slice(size - readSize, size).arrayBuffer();
        const lastArr = new Uint8Array(lastBuf);
        const moovIdxLast = findSignatureInBytes(lastArr, 'moov');
        if (moovIdxLast !== -1) {
            const view = new DataView(lastBuf);
            let moovSize = view.getUint32(moovIdxLast - 4);
            let headerLen = 8;
            if (moovSize === 1) {
                if (moovIdxLast + 12 <= lastArr.byteLength) {
                    const high = view.getUint32(moovIdxLast + 4);
                    const low = view.getUint32(moovIdxLast + 8);
                    moovSize = (high * Math.pow(2, 32)) + low;
                    headerLen = 16;
                }
            }
            
            // If it starts in this last read bit
            const moovStartInRead = moovIdxLast - 4;
            if (moovStartInRead + moovSize <= lastArr.byteLength) {
                 return lastArr.slice(moovStartInRead + headerLen, moovStartInRead + moovSize);
            }

            const moovStart = (size - readSize) + moovIdxLast - (headerLen - 4);
            const moovSlice = file.slice(moovStart + headerLen, moovStart + moovSize);
            return new Uint8Array(await moovSlice.arrayBuffer());
        }
    }
    
    return null;
}

function findSignatureInBytes(buffer: Uint8Array, signature: string): number {
    const s0 = signature.charCodeAt(0);
    const s1 = signature.charCodeAt(1);
    const s2 = signature.charCodeAt(2);
    const s3 = signature.charCodeAt(3);
    const limit = buffer.length - 4;
    for (let i = 0; i <= limit; i++) {
        if (buffer[i] === s0 && buffer[i+1] === s1 && buffer[i+2] === s2 && buffer[i+3] === s3) {
            return i;
        }
    }
    return -1;
}

interface Mp4Box {
    type: string;
    payload: Uint8Array;
}

function parseBoxes(buffer: Uint8Array): Mp4Box[] {
    const boxes: Mp4Box[] = [];
    let offset = 0;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    
    while (offset + 8 <= buffer.byteLength) {
        let size = view.getUint32(offset);
        const type = String.fromCharCode(
            buffer[offset + 4],
            buffer[offset + 5],
            buffer[offset + 6],
            buffer[offset + 7]
        );
        
        let headerLen = 8;
        if (size === 1) {
            if (offset + 16 > buffer.byteLength) break;
            const high = view.getUint32(offset + 8);
            const low = view.getUint32(offset + 12);
            size = (high * Math.pow(2, 32)) + low;
            headerLen = 16;
        } else if (size === 0) {
            size = buffer.byteLength - offset;
        }
        
        if (size < headerLen || offset + size > buffer.byteLength) {
            break;
        }
        
        const payload = buffer.slice(offset + headerLen, offset + size);
        boxes.push({ type, payload });
        offset += size;
    }
    
    return boxes;
}

function findBoxRecursive(buffer: Uint8Array, targetType: string): Uint8Array | null {
    const boxes = parseBoxes(buffer);
    for (const box of boxes) {
        if (box.type === targetType) {
            return box.payload;
        }
        const containers = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'tref', 'udta'];
        if (containers.includes(box.type)) {
            const found = findBoxRecursive(box.payload, targetType);
            if (found) return found;
        }
    }
    return null;
}

function findBoxesRecursive(buffer: Uint8Array, targetType: string): Uint8Array[] {
    const results: Uint8Array[] = [];
    const boxes = parseBoxes(buffer);
    for (const box of boxes) {
        if (box.type === targetType) {
            results.push(box.payload);
        }
        const containers = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'tref', 'udta'];
        if (containers.includes(box.type)) {
            const found = findBoxesRecursive(box.payload, targetType);
            results.push(...found);
        }
    }
    return results;
}

function getTrackId(trakPayload: Uint8Array): number | null {
    const tkhd = findBoxRecursive(trakPayload, 'tkhd');
    if (!tkhd) return null;
    const view = new DataView(tkhd.buffer, tkhd.byteOffset, tkhd.byteLength);
    const version = view.getUint8(0);
    if (version === 1) {
        if (tkhd.byteLength < 24) return null;
        return view.getUint32(20);
    } else {
        if (tkhd.byteLength < 16) return null;
        return view.getUint32(12);
    }
}

function getTrackHandler(trakPayload: Uint8Array): string | null {
    const hdlr = findBoxRecursive(trakPayload, 'hdlr');
    if (!hdlr || hdlr.byteLength < 12) return null;
    return String.fromCharCode(hdlr[8], hdlr[9], hdlr[10], hdlr[11]);
}

function getChapterTrackIds(trakPayload: Uint8Array): number[] {
    const tref = findBoxRecursive(trakPayload, 'tref');
    if (!tref) return [];
    const chap = findBoxRecursive(tref, 'chap');
    if (!chap) return [];
    
    const ids: number[] = [];
    const view = new DataView(chap.buffer, chap.byteOffset, chap.byteLength);
    for (let i = 0; i <= chap.byteLength - 4; i += 4) {
        ids.push(view.getUint32(i));
    }
    return ids;
}

function parseStsz(stszPayload: Uint8Array): number[] {
    const sizes: number[] = [];
    if (stszPayload.byteLength < 8) return sizes;
    const view = new DataView(stszPayload.buffer, stszPayload.byteOffset, stszPayload.byteLength);
    const sampleSize = view.getUint32(4);
    const count = Math.min(view.getUint32(8), 100000);
    
    if (sampleSize > 0) {
        for (let i = 0; i < count; i++) {
            sizes.push(sampleSize);
        }
    } else {
        if (stszPayload.byteLength < 12 + count * 4) {
            // Read what we can
            const maxCount = Math.floor((stszPayload.byteLength - 12) / 4);
            for (let i = 0; i < maxCount; i++) sizes.push(view.getUint32(12 + i * 4));
            return sizes;
        }
        for (let i = 0; i < count; i++) {
            sizes.push(view.getUint32(12 + i * 4));
        }
    }
    return sizes;
}

function parseStco(stcoPayload: Uint8Array, type: string = 'stco'): number[] {
    const offsets: number[] = [];
    if (stcoPayload.byteLength < 8) return offsets;
    const view = new DataView(stcoPayload.buffer, stcoPayload.byteOffset, stcoPayload.byteLength);
    const count = Math.min(view.getUint32(4), 100000);
    
    if (type === 'stco') {
        if (stcoPayload.byteLength < 8 + count * 4) {
            const maxCount = Math.floor((stcoPayload.byteLength - 8) / 4);
            for (let i = 0; i < maxCount; i++) offsets.push(view.getUint32(8 + i * 4));
            return offsets;
        }
        for (let i = 0; i < count; i++) {
            offsets.push(view.getUint32(8 + i * 4));
        }
    } else if (type === 'co64') {
        if (stcoPayload.byteLength < 8 + count * 8) {
            const maxCount = Math.floor((stcoPayload.byteLength - 8) / 8);
            for (let i = 0; i < maxCount; i++) {
                const high = view.getUint32(8 + i * 8);
                const low = view.getUint32(8 + i * 8 + 4);
                offsets.push((high * Math.pow(2, 32)) + low);
            }
            return offsets;
        }
        for (let i = 0; i < count; i++) {
            const high = view.getUint32(8 + i * 8);
            const low = view.getUint32(8 + i * 8 + 4);
            const offset64 = (high * Math.pow(2, 32)) + low;
            offsets.push(offset64);
        }
    }
    return offsets;
}

function parseSttsWithDuration(sttsPayload: Uint8Array): { startTime: number, duration: number }[] {
    const samples: { startTime: number, duration: number }[] = [];
    if (sttsPayload.byteLength < 8) return samples;
    const view = new DataView(sttsPayload.buffer, sttsPayload.byteOffset, sttsPayload.byteLength);
    const entryCount = Math.min(view.getUint32(4), 100000);
    
    let currentTime = 0;
    for (let i = 0; i < entryCount; i++) {
        const offset = 8 + i * 8;
        if (offset + 8 > sttsPayload.byteLength) break;
        const count = Math.min(view.getUint32(offset), 100000);
        const delta = view.getUint32(offset + 4);
        for (let j = 0; j < count; j++) {
            if (samples.length > 100000) break; // Hard cap
            samples.push({ startTime: currentTime, duration: delta });
            currentTime += delta;
        }
        if (samples.length > 100000) break;
    }
    return samples;
}

function getTrackTimescale(mdhdPayload: Uint8Array): number | null {
    if (mdhdPayload.byteLength < 16) return null;
    const view = new DataView(mdhdPayload.buffer, mdhdPayload.byteOffset, mdhdPayload.byteLength);
    const version = view.getUint8(0);
    if (version === 1) {
        if (mdhdPayload.byteLength < 28) return null;
        return view.getUint32(20);
    } else {
        if (mdhdPayload.byteLength < 16) return null;
        return view.getUint32(12);
    }
}

async function readChapterTitles(file: File, offsets: number[], sizes: number[]): Promise<string[]> {
    const titles: string[] = [];
    // Hard limit to 2000 chapters max to prevent memory / UI freezing
    const count = Math.min(offsets.length, sizes.length, 2000);
    
    // If there are an insane amount of chapters, it's likely a subtitle track or something else.
    // Reading 1000 file slices sequentially takes too long, so skip title extraction for huge counts.
    const skipTitles = count > 300;

    for (let i = 0; i < count; i++) {
        const offset = offsets[i];
        const size = sizes[i];
        if (size <= 2 || skipTitles) {
            titles.push(`Chapter ${i + 1}`);
            continue;
        }
        
        try {
            const slice = file.slice(offset, offset + size);
            const buffer = await slice.arrayBuffer();
            const arr = new Uint8Array(buffer);
            
            const view = new DataView(buffer);
            const strLen = view.getUint16(0);
            let title = "";
            
            if (strLen > 0 && strLen <= size - 2) {
                const titleBytes = arr.slice(2, 2 + strLen);
                title = new TextDecoder('utf-8').decode(titleBytes).trim();
            } else {
                title = new TextDecoder('utf-8').decode(arr).trim();
            }
            
            title = title.replace(/[\x00-\x1F\x7F]/g, "");
            titles.push(title || `Chapter ${i + 1}`);
        } catch (e) {
            titles.push(`Chapter ${i + 1}`);
        }
    }
    return titles;
}

function parseChpl(buffer: Uint8Array): MP4Chapter[] {
    const chapters: MP4Chapter[] = [];
    try {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        
        let offset = 0;
        const version = view.getUint8(offset);
        offset += 4; // version (1 byte) + flags (3 bytes)

        if (offset + 1 > buffer.byteLength) return chapters;
        
        const count32 = view.getUint32(offset);
        // Sometimes count is byte instead?
        let count = count32;
        offset += 4;

        if (count > 2000) { // Safety check
             count = view.getUint8(offset - 4);
             offset -= 3;
        }

        for (let i = 0; i < count; i++) {
            if (offset >= buffer.byteLength) break;
            
            let timestampTicks = 0;
            if (version === 1) {
                if (offset + 8 > buffer.byteLength) break;
                const high = view.getUint32(offset);
                const low = view.getUint32(offset + 4);
                timestampTicks = (high * Math.pow(2, 32)) + low;
                offset += 8;
            } else {
                if (offset + 4 > buffer.byteLength) break;
                timestampTicks = view.getUint32(offset);
                offset += 4;
            }

            const startTime = timestampTicks / 10000000;

            if (offset >= buffer.byteLength) break;
            const titleLen = view.getUint8(offset);
            offset += 1;

            if (offset + titleLen > buffer.byteLength) break;
            const titleBytes = buffer.slice(offset, offset + titleLen);
            const title = new TextDecoder('utf-8').decode(titleBytes);
            offset += titleLen;

            chapters.push({ title, startTime });
        }
    } catch(e) {
        console.warn("Error parsing chpl buffer", e);
    }
    return chapters;
}

