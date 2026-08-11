import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-ext-hook.mjs', pathToFileURL(import.meta.filename));
