import * as fs from 'fs';
import * as path from 'path';
const BScript = require('bscript-parser');

// Check if a filename was provided as a command line argument
if (process.argv.length < 3) {
    console.error('Please provide a filename as an argument');
    process.exit(1);
}

// Get the filename from command line arguments
const filename = process.argv[2];

// Resolve the full path of the file
const filePath = path.resolve(filename);

// Read and print the file contents
const data = fs.readFileSync(filePath, 'utf8');
const obj = JSON.parse(data);
const scriptHex = obj.program;
let scriptText = BScript.rawToAsm(scriptHex, 'hex');

function pushdata(s: String): string[] {
    if (s.length % 2 != 0) throw new Error('Invalid length');
    const l = s.length / 2;
    return ['OP_PUSHDATA1', l.toString(16), '0x' + s];
}

const tokens = scriptText.split(' ').map((s: string) => s[0] == 'O' ? s : pushdata(s));
console.log(tokens.flat().join('\n'));




