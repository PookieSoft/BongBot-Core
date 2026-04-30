import path from 'path';
import fs from 'fs';

/**
 * Picks a random regular file from the given directory and invokes the
 * callback with its basename. Subdirectories and other non-file entries are
 * transparently skipped (the function retries until it finds a real file or
 * the directory is exhausted).
 *
 * Follows Node's standard error-first callback convention.
 *
 * @param dir      Absolute or relative path to the directory to read.
 * @param callback Invoked with `(err, file)`. `file` is `undefined` if the
 *                 directory contains no regular files.
 *
 * @example
 * ```ts
 * import getRandomFile from 'bongbot-core';
 * getRandomFile('./dist/responses', (err, file) => {
 *   if (err) throw err;
 *   console.log('chose', file);
 * });
 * ```
 */
export default function getRandomFile(dir: string, callback: (err: Error | null, file?: string) => void) {
    fs.readdir(dir, (err, files) => {
        if (err) return callback(err);
        checkRandom();

        function checkRandom() {
            if (!files.length) {
                // callback with an empty string to indicate there are no files
                return callback(null, undefined);
            }
            const randomIndex = Math.floor(Math.random() * files.length);
            const file = files[randomIndex];
            fs.stat(path.join(dir, file), (err, stats) => {
                if (err) return callback(err);
                if (stats.isFile()) {
                    return callback(null, file);
                }
                // remove this file from the array because for some reason it's not a file
                files.splice(randomIndex, 1);
                // try another random one
                checkRandom();
            });
        }
    });
}
