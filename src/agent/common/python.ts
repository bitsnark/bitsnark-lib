import { execFileSync } from 'node:child_process';

export async function runPython(args: string[]): Promise<Buffer> {
    // On macOS, "System Integrety Protection" clears the DYLD_FALLBACK_LIBRARY_PATH,
    // which leaves the Python executable unable to find the secp256k1 library installed by Homebrew.
    if (!process.env.DYLD_FALLBACK_LIBRARY_PATH) {
        process.env.DYLD_FALLBACK_LIBRARY_PATH = '/opt/homebrew/lib:/usr/local/lib';
    }

    try {
        console.log(`Running python3 ${args.join(' ')}`);
        const result = execFileSync('python3', args, { cwd: './python' });
        console.log('Python done');
        return result;
    } catch (error: unknown) {
        const subprocessError = error as { status: number; stdout: Buffer; stderr: Buffer };
        const errorMessage = `Python script failed with code ${subprocessError.status}\n` +
            `stdout:\n${subprocessError.stdout.toString()}\n` +
            `stderr:\n${subprocessError.stderr.toString()}\n`
        console.error(errorMessage);
        throw new Error(errorMessage);
    }
}
