import fs from 'fs';
import path from 'path';
const generatedDataDir = 'generated';
export const PRV_KEY_FILE = "prv.bin";
export const PUB_KEY_FILE = "pub.bin";
export const CACHE_FILE = "cache.bin";


export function isFileExists(folder: string, fileName: string): Boolean {
    const filePath = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
    return fs.existsSync(filePath);
}

export function createFolder(folder: string, errorIfExists: boolean = false): void {
    const folderPath = path.join(process.cwd(), `${generatedDataDir}/${folder}`);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    else if (errorIfExists) throw new Error(`Folder ${folderPath} already exists.`);
}

export function writeToFile(folder: string, fileName: string, buffer: Buffer, flag: string = 'a', encoding: BufferEncoding = 'binary'): void {
    const writeTo = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
    fs.writeFileSync(writeTo, buffer, { encoding: encoding, flag: flag });
}

export function writeToPosInFile(folder: string, fileName: string, buffer: Buffer, position: number) {
    const writeTo = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
    const fd = fs.openSync(writeTo, 'r+');
    try {
        fs.writeSync(fd, buffer, 0, buffer.length, position);
    } finally {
        fs.closeSync(fd);
    }
}

export function fillFile(folder: string, fileName: string, buffer: Buffer, flag: string = 'a', encoding: BufferEncoding = 'binary'): void {
    const writeTo = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
    fs.writeFileSync(writeTo, buffer, { encoding: encoding, flag: flag });
}

export function readFromFile(folder: string, fileName: string, chunkStart: number = 0, chunckSize: number): Buffer {
    let fd: number | undefined;
    try {
        const readFrom = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
        fd = fs.openSync(readFrom, 'r');
        const buffer = Buffer.alloc(chunckSize);
        fs.readSync(fd, buffer, 0, chunckSize, chunkStart);
        return buffer;
    }
    catch (err: any) {
        console.error('Error reading the file:', err.message);
    }
    finally {
        if (fd !== undefined) {
            fs.closeSync(fd);
        }
    }
    return Buffer.alloc(0);
}

export function readTextFile(partial: string): string {
    const readFrom = path.join(__dirname, `${partial}`);
    const data = fs.readFileSync(readFrom,
        { encoding: 'utf-8', flag: 'r' });

    return data;
}

export function getFileSizeBytes(folder: string, fileName: string): number {
    const checkFrom = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
    var stats = fs.statSync(checkFrom);
    var fileSizeInBytes = stats.size;
    return fileSizeInBytes;
}

export function findBufferInFile(folder: string, fileName: string, targetBuffer: Buffer) {
    const findIn = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
    // try {
    const fileBuffer = fs.readFileSync(findIn);
    const index = fileBuffer.indexOf(targetBuffer);
    return index;
    // } catch (err: any) {
    //     console.error('Error reading the file:', err.message);
    //     return -1;
    // }
}

export function deleteDir(folder: string) {
    const dirPath = path.join(process.cwd(), `${generatedDataDir}/${folder}`);
    if (fs.existsSync(dirPath)) fs.rmdirSync(dirPath, { recursive: true });
}

export function writeTextToFile(folder: string, fileName: string, text: string) {
    // try {
    const writeTo = path.join(process.cwd(), `${generatedDataDir}/${folder}/${fileName}`);
    fs.writeFileSync(writeTo, text, { encoding: 'utf-8', flag: 'w' });
    // } catch (err: any) { }
}

