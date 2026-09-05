import * as mm from 'music-metadata';

async function test() {
    const buf = Buffer.alloc(100);
    buf.writeUInt32BE(20, 0); // length
    buf.write('ftyp', 4);
    buf.write('M4A ', 8);
    const blob = new Blob([buf], { type: '' });
    
    try {
        const meta = await mm.parseBlob(blob, { duration: true, includeChapters: true });
        console.log("Success");
    } catch(e) {
        console.error("Error with basic parseBlob", e);
    }
}
test();
