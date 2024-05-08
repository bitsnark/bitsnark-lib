'use strict';

import { Example } from './groth16/example';

const example = new Example();
try {
    example.example();
} catch (e) {
    console.error(e);
}
