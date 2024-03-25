'use strict';

import { Example } from './compiler/example';

const example = new Example();
try {
    example.example();
} catch (e) {
    console.error(e);
}
