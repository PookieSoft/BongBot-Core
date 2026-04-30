export class Database {
    constructor(filename: string);
    prepare(sql: string): { run: () => void };
    exec(sql: string): void;
    close(): void;
}
