import { padHex } from "../encoding/encoding";
import { spawn } from 'child_process';
import path from 'path';

// Python executable with required dependencies installed
const PYTHON_EXECUTABLE = process.env.PYTHON ?? 'python';

// This sohuld point to the "python" directory in project root
const PYTHON_ROOT_DIR = path.resolve(__dirname, '../../python');

interface PyCallSuccess {
    result: any;
}

interface PyCallError {
    error: string;
    errorType: string;
}

type PyCallResult = PyCallSuccess | PyCallError;

// TODO: this doesn't need to be exported
export async function runPythonScript(moduleName: string, inputData: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(
            PYTHON_EXECUTABLE,
            ['-m', moduleName],
            {
                cwd: PYTHON_ROOT_DIR,
            }
        );

        pythonProcess.on('error', (error) => {
            reject(error);
        });

        // Send JSON input to the Python script
        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();

        const outputParts: string[] = [];

        // Collect output from the Python script
        pythonProcess.stdout.on('data', (data) => {
            outputParts.push(data.toString());
        });

        pythonProcess.stderr.on('data', (data) => {
            // Don't reject on stderr, just log it
            console.warn(`[pystderr] ${data.toString()}`);
            //reject(`Error: ${data.toString()}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python script exited with code ${code}`));
                return;
            }

            let result: PyCallResult;
            try {
                const output = outputParts.join('');
                result = JSON.parse(output);
            } catch (error) {
                reject(new Error(`Failed to parse JSON: ${error}`));
                return;
            }

            if ('error' in result) {
                reject(new Error(`${result.errorType}: ${result.error}`));
            } else {
                resolve(result.result);
            }
        });
    });
}

export interface PresignedTransaction {
    txid: string,
    executionSignature: string
    transaction: Buffer,
}

export interface CreatePresignedTransactionParams {
    inputs: TxInput[];
    schnorrPrivateKey: bigint;
    outputValue: bigint;
    executionScript: Buffer;
    outputScriptPubKey: Buffer;
}

export interface TxInput {
    txid: string;
    vout: number;
    spentOutput: SpentOutput;
}

export interface SpentOutput {
    scriptPubKey: Buffer;
    value: bigint;
}

export async function createPresignedTransaction({
    inputs,
    schnorrPrivateKey,
    outputValue,
    executionScript,
    outputScriptPubKey,
}: CreatePresignedTransactionParams): Promise<PresignedTransaction> {
    const params = {
        inputs: inputs.map(({ txid, vout, spentOutput }) => ({
            txid,
            vout,
            spentOutput: {
                scriptPubKey: spentOutput.scriptPubKey.toString('hex'),
                value: spentOutput.value.toString(16),  // serialize bigint as hex
            },
        })),
        schnorrPrivateKey: padHex(schnorrPrivateKey.toString(16), 32),
        outputValue: outputValue.toString(16), // serialize bigint as hex
        executionScript: executionScript.toString('hex'),
        outputScriptPubKey: outputScriptPubKey.toString('hex'),
    };
    const result = await runPythonScript('bitsnark.scripts.create_presigned_transaction', params);
    return {
        ...result,
        transaction: Buffer.from(result.transaction, 'hex')
    };
}
