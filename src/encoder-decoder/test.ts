
import { randomBytes } from "node:crypto";
import { Lamport, iData } from './lamport';
import { readFromFile, writeToFile, isFileExists } from './files-utils';



const fileSize = 4; //Bytes key size = 4 * 8(each bit) * 2(0/1) * 32 (hash size) = 2048
const folder = 'my-test';


const lamport = new Lamport(folder);

let merkleRoot: Buffer;
let dataBuffer: Buffer;

// encode:
// create random data
if (!isFileExists(folder, "data.bin")) {
    merkleRoot = lamport.generateKeys(fileSize * 8).equivocationMerkleRoot;
    console.log('merkleRoot:', merkleRoot);
    const isMerkelRootOK = lamport.validateMerkleRoot(merkleRoot);
    console.log('isMerkelRootOK:', isMerkelRootOK);

    console.log('genData');
    //dataBuffer = randomBytes(fileSize);
    // make a 4 bytes buffer containing the values 0x0F
    dataBuffer = Buffer.alloc(fileSize, 0x0F);
    writeToFile(folder, "data.bin", dataBuffer, "wx");
    writeToFile(folder, "merkelRoot.bin", merkleRoot, "wx");

}
else {
    dataBuffer = readFromFile(folder, "data.bin", 0, fileSize);
    console.log('data exsits', folder);
    merkleRoot = readFromFile(folder, "merkelRoot.bin", 0, 32);
    // const isMerkelRootOK = lamportHandler.validateMerkleRoot(folder, merkleRoot);
    // console.log('merkel exsits', merkleRoot)
    // console.log('isMerkelRootOK:', isMerkelRootOK);

}


// if (!dataBaseArr) throw new Error('ERROR! dataBaseArr is empty');

//Gather chuncks of data to encode
console.log('dataBuffer', dataBuffer);
console.log('dataBuffer.length is in bytes', dataBuffer.length, '/FILE_SIZE:', fileSize);

let dataToEncode: iData[] = [];
//dataBaseArr.length
// {data: 1 Byte, startingPos: 0}

// INDEX = 0 length 1
// = 0
// * 2 * 32 * 16 = 1024


// dataToEncode.push(createiDataObject(dataBuffer, 2, 2));
// dataToEncode.push(createiDataObject(dataBuffer, 6, 3));


// dataToEncode.push(createiDataObject(dataBuffer, 12, 2));
// dataToEncode.push(createiDataObject(dataBuffer, 1000, 24));
// dataToEncode.push(createiDataObject(dataBuffer, (30 * 1024), 2));
// dataToEncode.push(createiDataObject(dataBuffer, (32 * 1024) - 10, 10));


// dataToEncode.push(createiDataObject(dataBuffer, 5, 10));
// dataToEncode.push(createiDataObject(dataBuffer, 800, 12));
// dataToEncode.push(createiDataObject(dataBuffer, 3400, 240));
// dataToEncode.push(createiDataObject(dataBuffer, (30 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (32 * 1024) - 100, 60));
// dataToEncode.push(createiDataObject(dataBuffer, (5 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (9 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (10 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (11 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (12 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (13 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (14 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (15 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (16 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (17 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (18 * 1024), 200));
// dataToEncode.push(createiDataObject(dataBuffer, (50), 1024));
// dataToEncode.push(createiDataObject(dataBuffer, (9 * 1024), 200));

// dataToEncode.push(createiDataObject(dataBuffer, (32 * 1024) - 1, 1));



// dataToEncode.push(createiDataObject(dataBuffer, (32 * 1024) - 100, 60));

// {data: 1024 bits, startingPos: 1024}
// dataToEncode.push(createiDataObject(dataBaseArr, 3 , 2));
// 2 * 3 * 32 * 16 = 3072
// 2 * 2 * 32 * 16 = 2048


// {data 1024 * 8 bits, starting point ,31 * 1024 * 8}
// 0001 0011 0000 1010 1101 0111 1100 1100 1101 0010
// 0    1    2    3    4    5    6    7    8    9
// dataBaseArrlength = 10
// 10-2 = 8
// 2
// dataToEncode.push(createiDataObject(dataBaseArr, (dataBaseArr.length) - (4 / BASE), 4 / BASE))

const encodeBuffer1 = createiDataObject(dataBuffer, 0, 1);
const _encoded1 = lamport.encodeBuffer(encodeBuffer1, 0);
console.log('encode:', encodeBuffer1, 'byte 0 (0) length 1 return:', _encoded1);


const decoded = lamport.decodeBuffer(_encoded1, 0, merkleRoot);
printObjectProps(decoded, 'DECODE');


const encodeBuffer2 = createiDataObject(dataBuffer, 2, 2);
const _encoded2 = lamport.encodeBuffer(encodeBuffer2, 16);
console.log('encode:', encodeBuffer2, 'byte 2 (16) length 2 return:', _encoded2);

const decoded2 = lamport.decodeBuffer(_encoded2, 16, merkleRoot);
printObjectProps(decoded2, 'DECODE');


const bitNo = 21;
const bitValue = getBitValue(dataBuffer, bitNo);
const _encoded3 = lamport.encodeBit(bitValue, bitNo);
console.log('encodeBit value:', bitValue, 'bit:', bitNo, 'return:', _encoded3);

const decoded3 = lamport.decodeBuffer(_encoded3, bitNo, merkleRoot);
console.log('bit13 decode:', decoded3);
// printObjectProps(decoded3, 'DECODE');

function getBitValue(data: Buffer, index: number): number {
    // return the index bit value of the buffer. the first bit in a byte is the LSB.
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return (data[byteIndex] >> bitIndex) & 1;
}

function printObjectProps(element: any, title: string, all: boolean = true) {
    console.log(`============${title}============`);

    console.log(`-------Encode Element-------`);
    Object.entries(element).forEach(([key, value]) => {
        console.log(key, value);
    });

    // else if (all || (element.isConflict !== undefined && element.isConflict || element.isDecoded == undefined && element.isDecoded === false)) {
    //     console.log(`-------Error Element-------`);
    //     Object.entries(element).forEach(([key, value]) => {
    //         if (key === 'isConflict' && value === true) console.log('!!!!!!!!!!!!!!!!!');
    //         if (key === 'isDecoded' && value === false) console.log('^^^^^^^^^^^^^^');
    //         console.log(key, value);
    //         if (key === 'isConflict' && value === true) console.log('!!!!!!!!!!!!!!!!!');
    //         if (key === 'isDecoded' && value === false) console.log('^^^^^^^^^^^^^^');
    //     });
    // }


}

function printObjectPropsArr(objArr: any[], title: string, all: boolean = true) {
    console.log(`============${title}============`);
    objArr.forEach(element => {

        if (title === 'ENCODE' || title === '_ENCODE') {
            console.log(`-------Encode Element-------`);
            Object.entries(element).forEach(([key, value]) => {
                console.log(key, value);
            });
        }

        else if (all || (element.isConflict !== undefined && element.isConflict || element.isDecoded == undefined && element.isDecoded === false)) {
            console.log(`-------Error Element-------`);
            Object.entries(element).forEach(([key, value]) => {
                if (key === 'isConflict' && value === true) console.log('!!!!!!!!!!!!!!!!!');
                if (key === 'isDecoded' && value === false) console.log('^^^^^^^^^^^^^^');
                console.log(key, value);
                if (key === 'isConflict' && value === true) console.log('!!!!!!!!!!!!!!!!!');
                if (key === 'isDecoded' && value === false) console.log('^^^^^^^^^^^^^^');
            });
        }

    });
}


// // console.log('=====DECODED=====');
// // decoded.forEach(dataelement => {
// //     Object.entries(dataelement).forEach(([key, value]) => {
// //         console.log(key, value);
// //     });
// // });



function createiDataObject(data: Buffer, index: number, length: number): Buffer {
    const dataSection = Buffer.from(data.subarray(index, index + length));
    // console.log(` dataSection: ${dataSection} index:${index} from ${data}`);
    // return {
    //     data: dataSection,
    //     index: index,
    //     unitIndex: index * 8
    // };
    console.log(` dataSection: ${dataSection} index:${index} from ${data} length:${length}`);
    return dataSection;
}


// // function createiDataObjectFromArr(dataBaseArr: RegExpMatchArray, indexInArr: number, lengthInArrItems: number): iData {
// //     const strBinary = dataBaseArr.slice(indexInArr, indexInArr + lengthInArrItems).join('');
// //     const data = BigInt(`0b${strBinary}`);
// //     console.log(` data:${data} dataLength:${lengthInArrItems * BASE} indexData:${indexInArr * BASE}`);
// //     return {
// //         data: data,
// //         indexData: indexInArr * BASE,
// //         dataLength: lengthInArrItems * BASE
// //     }

// // }



// // transform data to BigInt
// // get privayeKey from file: startingPos = 0, length = (128 / 4(BASE)) * 16(SET) * 256(ELEMENT_S)(BITS)



// // const fullBuffer = toBufferBE(fullData,)

// // const data = [{
// //     data: 1232742934792374234294573948539485735n,

// // }


// // add leadingzeros if needed



// //get 1024 chunck size of data from 3 

// // const Lamport = LamportSignature();

// // const dataBuffer = randomBytes(FILE_SIZE)
// // const hexString = dataBuffer.toString('hex');
// // let data = BigInt('0x' + hexString)

// // let binaryData = data.toString(2);
// // const regex = new RegExp(`.{1,${4}}`, 'g');
// // const datasize = binaryData.match(regex)?.length ?? 0
// // console.log(datasize)

// // Lamport.generateKeys().then((result) => useFiles(data, result));

// // function useFiles(data: BigInt, getPublicKey: Buffer) {
// //     console.log('data:', data)
// //     const pubFileSizePromise = getFileSize('./pubKey.bin');
// //     const prvFileSizePromise = getFileSize('./prvKey.bin');
// //     Promise.all([pubFileSizePromise, prvFileSizePromise]).then((result) => callSignAndVerify(result, getPublicKey))
// // }

// // function callSignAndVerify(size: any, getPublicKey: Buffer) {
// //     const signature = Lamport.sign(data);
// //     const arr = Object.values(size);
// //     const fileSize: number = typeof arr[0] === 'number' ? arr[0] : 0

// //     const publicKeyBuffer = readFromFile('pubKey.bin', fileSize, 0)
// //     console.log(`check publicKeyBuffer length: ${publicKeyBuffer.length} === fileSize: ${fileSize}`);
// //     console.log('first element :', publicKeyBuffer.subarray(0, 32));
// //     console.log('last element :', publicKeyBuffer.subarray(publicKeyBuffer.length - 32, publicKeyBuffer.length));
// //     console.log(`compare pubFromfile to return value from genKes: ${getPublicKey.compare(publicKeyBuffer)}`)
// //     let data2 = BigInt(76485678347658746793348475465743656n)
// //     const verified = Lamport.verify(data, signature, publicKeyBuffer);
// //     console.log(`verified: ${verified}`)
// // }