import { padHex } from "../encoding/encoding";
import { spawn } from 'child_process';

export interface PyTransaction {
    hash: string,
    body: Buffer,
    signature: string
}

async function runPythonScript(inputData: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn('python', ['script.py']);

        // Send JSON input to the Python script
        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();

        let output = '';

        // Collect output from the Python script
        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            reject(`Error: ${data.toString()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(output);
                    resolve(result);
                } catch (error) {
                    reject(`Failed to parse JSON: ${error}`);
                }
            } else {
                reject(`Python script exited with code ${code}`);
            }
        });
    });
}

export async function pyMakeTransaction(
    transactionDesc: string,
    schnorrPrivateKey: bigint,
    scripts: Buffer[],
    controlBlocks: Buffer[],
    nextTaprootAddress: Buffer): Promise<PyTransaction> {

    const params = {
        transactionDesc,
        schnorrPrivateKey: padHex(schnorrPrivateKey.toString(16), 32),
        scripts: scripts.map(b => b.toString('hex')),
        controlBlocks: controlBlocks.map(b => b.toString('hex')),
        nextTaprootAddress: nextTaprootAddress.toString('hex')
    };
    const result = await runPythonScript(params);
    return {
        ...result,
        body: Buffer.from(result.body, 'hex')
    };
}
